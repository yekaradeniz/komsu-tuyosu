import { readFileSync } from 'node:fs';
import { renderNamed, pexelsFallbackFor } from './seoTemplate.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickPhoto } from './pickPhoto.js';
import { pickValidatedPhoto, isPhotoSpiritual } from './checkPhoto.js';
import { fetchUnsplashPhoto } from './fetchUnsplashPhoto.js';
import { fetchPexelsCandidates, fetchPexelsCandidatesByQueries, roundRobinByQuery } from './fetchPexelsVideo.js';
import { validateVideoFrames } from './checkVideoFrames.js';
import { renderToPng, renderExplanationToPng } from './render.js';
import { renderReel, downloadVideo, pickAudioByIndex, listAudioTracks } from './renderReel.js';
import { renderReelV2 } from './renderReelV2.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readState, writeState } from './state.js';
import { generateVoice, getAudioDuration, readAlignment } from './generateVoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// NIS TESTI: 13:00 slotu farkli bir icerik havuzundan (nis-testi.json) cekiyor.
// CONTENT_FILE/STATE_FILE env'i verilmezse normal ev tuyosu akisi calisir.
const CONTENT_FILE = process.env.CONTENT_FILE || 'komsu-tuyosu.json';
const STATE_FILE = process.env.STATE_FILE || 'log.json';
const content = JSON.parse(readFileSync(join(ROOT, 'content', CONTENT_FILE), 'utf-8'));
console.log(`Icerik havuzu: ${CONTENT_FILE} | state: ${STATE_FILE}`);
const photos = JSON.parse(readFileSync(join(ROOT, 'content', 'photos.json'), 'utf-8'));
const statePath = join(ROOT, 'output', STATE_FILE);
const state = readState(statePath);
const today = new Date().toISOString().slice(0, 10);
const launchDate = state.launchDate ?? today;

// Önceki post başarısız olduysa (postId null) aynı girişi tekrar kullan.
// Sadece BUGÜNKÜ post için geçerli - önceki günün bekleyeni varsa yeni içeriğe geç.
const pendingRetry = state.lastPost && !state.lastPost.postId && state.lastPost.verseId
  && state.lastPost.date === today;
let entry;
if (pendingRetry) {
  entry = content.find(e => e.id === state.lastPost.verseId);
  if (!entry) throw new Error(`Retry: entry ${state.lastPost.verseId} bulunamadi`);

  // Retry'da HER ZAMAN yeniden render edilir; eski medya tekrar KULLANILMAZ.
  // Boylece icerik nedeniyle (or. kadin goruntusu) elle silinen bir post
  // asla ayni medyayla geri gelmez. Birkac ekstra API cagrisi onemsiz.
  console.log(`Yeniden deneniyor: ${entry.id} - yeni medya render ediliyor (eski medya kullanilmaz)`);
} else {
  const postedSet = new Set(state.postedVerseIds);
  const unposted = content.filter(e => !postedSet.has(e.id));
  if (unposted.length === 0) {
    throw new Error(`Tum icerik paylasildi: ${CONTENT_FILE} bitti.`);
  }
  entry = unposted[0];

  // SAFETY: Sira basindaki misranin verse VE explanation alanlari dolu olmali.
  // Boş icerikle paylasim yapilmasin - workflow durur, kullanici manuel doldursun.
  const hasVerse = entry.verse && entry.verse.trim().length > 0;
  const hasExplanation = entry.explanation && entry.explanation.trim().length > 0;
  if (!hasVerse || !hasExplanation) {
    const missing = [];
    if (!hasVerse) missing.push('verse');
    if (!hasExplanation) missing.push('explanation (mânâ)');
    throw new Error(
      `${entry.id} icin eksik alan(lar): ${missing.join(', ')}. ` +
      `content/${CONTENT_FILE}'a doldurun, sonra workflow'u tekrar tetikleyin. ` +
      `Post atilmadi (sira korunuyor).`
    );
  }
}

// Tip alternasyonu: normalde bir öncekinin tersi (carousel <-> reel).
// İkisinin de varsayılanı açık; kapatmak için ortam değişkeni 'false' verilir.
// REELS_ENABLED=false  ortam değişkeni → sadece carousel atılır
// CAROUSEL_ENABLED=false ortam değişkeni → sadece reel atılır. Varsayılan açık: longform-weekly ve
// longform-malzeme iş akışları bu bayrağı ayarlamıyor ve carousel'e güveniyor. Yerel render komutu
// eskiden .env'deki değeri artık açıkça veriyor: CAROUSEL_ENABLED=false.
const REELS_ENABLED    = process.env.REELS_ENABLED    !== 'false';
const CAROUSEL_ENABLED = process.env.CAROUSEL_ENABLED !== 'false';

const lastType = state.lastPost?.type
  ?? (state.lastPost?.carousel === true ? 'carousel'
      : state.lastPost?.carousel === false ? 'reel'
      : null);

let nextType;
if (pendingRetry) {
  nextType = lastType ?? 'reel';
} else if (!REELS_ENABLED) {
  nextType = 'carousel';
} else if (!CAROUSEL_ENABLED) {
  nextType = 'reel';
} else {
  nextType = lastType === 'reel' ? 'carousel' : 'reel';
}
console.log(`Bu post tipi: ${nextType} (önceki: ${lastType ?? 'yok'}, reels: ${REELS_ENABLED ? 'açık' : 'kapalı'}, carousel: ${CAROUSEL_ENABLED ? 'açık' : 'kapalı'})`);

const recentPhotos = state.recentPhotos ?? [];

if (nextType === 'reel') {
  // ---------- REEL ----------
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) throw new Error('PEXELS_API_KEY tanımlı değil; reel oluşturulamaz');

  const geminiKey = process.env.GEMINI_API_KEY;
  const usedVideoIds = new Set(state.usedVideoIds ?? []);

  // Komsu Tuyosu: entry.pexelsQuery varsa soru-baginli arama; yoksa mood fallback.
  // MODERASYON: her aday Gemini frame kontrolunden gecer (suggestive/glamour/erotik REJECT,
  // normal ev isi YES). Reddedilenler usedVideoIds'e eklenir (asagida), bir daha denenmez.
  // V2 FORMAT (entry.format === 'v2'): kelime senkron altyazi + birden cok klip.
  // Kisa kesitler kullanildigi icin 6 saniyelik kaynak yeter; V1 tek klibi butun
  // video boyunca gosterdigi icin en az 22 saniye ister (DURATION_RANGES).
  const isV2 = entry.format === 'v2' && Array.isArray(entry.pexelsQuery) && entry.pexelsQuery.length > 0;
  const WANT_CLIPS = isV2 ? 4 : 1;
  const fetched = Array.isArray(entry.pexelsQuery) && entry.pexelsQuery.length > 0
    ? await fetchPexelsCandidatesByQueries(entry.pexelsQuery, pexelsKey, usedVideoIds, {
        fallbackQueries: pexelsFallbackFor(entry),   // nis videosu ev goruntusune dusmesin
        ...(isV2 ? { durationRanges: [{ min: 6, max: 60 }, { min: 5, max: 120 }], minCandidates: 12, nearestHeight: 1920 } : {})
      })
    : await fetchPexelsCandidates(entry.moods, pexelsKey, usedVideoIds);
  const candidates = isV2 ? roundRobinByQuery(fetched, entry.pexelsQuery) : fetched;
  console.log(`${candidates.length} Pexels aday (excl. ${usedVideoIds.size}), Gemini moderasyonundan gececek...`);

  const tmpDir = mkdtempSync(join(tmpdir(), 'pexels-'));
  let chosen = null;
  let chosenPath = null;
  const approved = [];           // [{ c, path }] - V1'de tek, V2'de en fazla WANT_CLIPS
  const rejectedIds = [];

  try {
    // Adaylari sirayla dene: indir, Gemini frame moderasyonu, onaylananlari kullan.
    // UST SINIR: moderasyon bozulursa yuzlerce aday denenip render timeout'a giriyor
    // (Zihin'de 5 Ags 2026'da yasandi: Gemini bos yanit -> her aday "reddedildi").
    const MAX_TRY = 15;
    const tryCount = Math.min(candidates.length, MAX_TRY);
    const approvedQueries = new Set();
    const tried = new Set();
    let tries = 0;
    // 1. tur: her sorgudan en fazla bir klip (goruntu cesitliligi). 2. tur: eksik
    // kaldiysa ayni sorgudan ikinci klip de olur.
    for (const onePerQuery of [true, false]) {
      for (const c of candidates) {
        if (approved.length >= WANT_CLIPS || tries >= tryCount) break;
        if (tried.has(c.id) || (onePerQuery && approvedQueries.has(c.query))) continue;
        tried.add(c.id);
        tries++;
        const localPath = join(tmpDir, `cand-${tries}.mp4`);
        console.log(`[${tries}/${tryCount}] ${c.id} (query: "${c.query}") indiriliyor...`);
        await downloadVideo(c.url, localPath);
        const mod = await validateVideoFrames(localPath, c.duration, geminiKey, 2);
        if (mod.approved) {
          console.log(`✓ ${c.id} moderasyondan gecti`);
          approved.push({ c, path: localPath });
          approvedQueries.add(c.query);
        } else {
          console.log(`✗ ${c.id} reddedildi: ${mod.reason}`);
          rejectedIds.push(c.id);
          try { rmSync(localPath, { force: true }); } catch {}
        }
      }
    }
    if (approved.length === 0) {
      throw new Error(`Denenen ${tries} adayin hicbiri moderasyondan gecemedi (toplam ${candidates.length} aday). Moderasyon bozuk olabilir - Gemini yanitlarini kontrol edin.`);
    }
    chosen = approved[0].c;
    chosenPath = approved[0].path;
    if (isV2) console.log(`V2: ${approved.length}/${WANT_CLIPS} klip onayli (${tries} deneme)`);

    // Müzik rotation: state.audioIndex'i kullan, audio/ klasörü doluysa sırayla seç
    const tracks = listAudioTracks();
    const audioIdx = state.audioIndex ?? 0;
    const audioPath = tracks.length > 0 ? pickAudioByIndex(audioIdx) : null;
    if (audioPath) console.log(`Müzik #${(audioIdx % tracks.length) + 1}/${tracks.length}: ${audioPath.split('/').pop()}`);

    // ElevenLabs ile soru + cevap sesi uret (env varlarsa). Cache: output/audio-cache/
    // Soru ve cevap suresi okuma sureleri kadar dinamik olur (renderReel hesaplar).
    // Key yoksa graceful fallback: voicePath null -> renderReel sabit sure ile devam eder.
    let voicePath = null;
    let voiceDuration = 0;
    let manaVoicePath = null;
    let manaVoiceDuration = 0;
    let ctaVoicePath = null;
    let ctaVoiceDuration = 0;
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;
    if (elevenKey && elevenVoiceId) {
      const voiceCacheDir = join(ROOT, 'output', 'audio-cache');
      try {
        console.log('Soru sesi (ElevenLabs, speed 1.1)...');
        // SORU icin speed 1.1: 0.9 cok yavas geliyordu, hafif hizlandirildi (kullanici karari).
        // CEVAP speed 1.2 kullanir (asagida).
        voicePath = await generateVoice({
          text: entry.verse,
          voiceId: elevenVoiceId,
          apiKey: elevenKey,
          cacheDir: voiceCacheDir,
          settings: { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 1.1 },
          withTimestamps: isV2     // V2 altyazisi kelime zamanlamasi ister
        });
        voiceDuration = await getAudioDuration(voicePath);
        console.log(`  Soru voice: ${voiceDuration.toFixed(1)}sn`);

        if (entry.explanation && entry.explanation.trim()) {
          console.log('Cevap sesi (ElevenLabs, speed 1.2)...');
          // CEVAP icin speed 1.2: video suresini kisaltir, completion rate artar (icerik aynidir).
          manaVoicePath = await generateVoice({
            text: entry.explanation,
            voiceId: elevenVoiceId,
            apiKey: elevenKey,
            cacheDir: voiceCacheDir,
            settings: { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 1.2 },
            withTimestamps: isV2
          });
          manaVoiceDuration = await getAudioDuration(manaVoicePath);
          console.log(`  Cevap voice: ${manaVoiceDuration.toFixed(1)}sn`);
        }
        // ABONE OL kartinin seslendirmesi. Metin profile gore template'ten gelir,
        // her video icin ayni oldugu icin cache'ten okunur (tek seferlik kota).
        try {
          const ctaText = renderNamed(entry, 'voiceCta');
          console.log(`CTA sesi (ElevenLabs): "${ctaText}"`);
          ctaVoicePath = await generateVoice({
            text: ctaText,
            voiceId: elevenVoiceId,
            apiKey: elevenKey,
            cacheDir: voiceCacheDir,
            // speed 1.15: CTA kisa bir cumle, hafif hizli okunca kart suresi kisaliyor
            //  ve video 22sn bandini asmiyor. Soru/cevap hizina DOKUNULMADI.
            settings: { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 1.15 }
          });
          ctaVoiceDuration = await getAudioDuration(ctaVoicePath);
          console.log(`  CTA voice: ${ctaVoiceDuration.toFixed(1)}sn`);
        } catch (e) {
          // CTA sesi zorunlu degil: basarisiz olursa kart sessiz gosterilir.
          console.warn(`CTA sesi uretilemedi, kart sessiz gidecek: ${e.message}`);
          ctaVoicePath = null;
          ctaVoiceDuration = 0;
        }
      } catch (e) {
        console.warn(`ElevenLabs basarisiz, sesli devre disi (sabit sure fallback): ${e.message}`);
        voicePath = null;
        manaVoicePath = null;
      }
    } else {
      console.log('ELEVENLABS env yok, reel sessiz + sabit sure ile gidecek.');
    }

    const outVideo = join(ROOT, 'output', `${today}.mp4`);
    // V2 iki sesi ve zamanlamalarini ister. Ses uretilemediyse (ElevenLabs hatasi)
    // V1'e duser: o gun video yine cikar, sadece eski bicimde.
    const v2Ready = isV2 && voicePath && manaVoicePath;
    if (isV2 && !v2Ready) console.warn('V2 icin ses yok, bu video V1 bicimiyle uretilecek.');
    if (v2Ready) {
      await renderReelV2({
        hook: entry.hook || entry.concept,
        clips: approved.map(({ c, path }) => ({ path, duration: c.duration })),
        audioPath,
        voicePath,
        voiceDuration,
        voiceAlignment: readAlignment(voicePath),
        manaVoicePath,
        manaVoiceDuration,
        manaAlignment: readAlignment(manaVoicePath),
        ctaVoicePath,
        ctaVoiceDuration,
        ctaKicker: renderNamed(entry, 'ctaCardKicker'),
        ctaSub: renderNamed(entry, 'ctaCardSub'),
        outPath: outVideo
      });
    } else await renderReel({
      verse: entry.verse,
      explanation: entry.explanation || '',
      videoPath: chosenPath,
      audioPath,
      voicePath,
      voiceDuration,
      manaVoicePath,
      manaVoiceDuration,
      ctaVoicePath,
      ctaVoiceDuration,
      ctaKicker: renderNamed(entry, 'ctaCardKicker'),
      ctaSub: renderNamed(entry, 'ctaCardSub'),
      outPath: outVideo
    });
    console.log(`Reel hazir: ${outVideo}`);

    // Reddedilen adaylar da kalıcı blacklist'e gidiyor (tekrar denenmesin)
    const approvedIds = approved.map(({ c }) => c.id);
    const newUsedIds = [
      ...(state.usedVideoIds ?? []).filter(id => !approvedIds.includes(id)),
      ...rejectedIds.filter(id => !(state.usedVideoIds ?? []).includes(id)),
      ...approvedIds
    ];

    writeState(statePath, {
      ...state,
      launchDate,
      lastPost: {
        date: today,
        verseId: entry.id,
        photoId: chosen.id,
        postId: null,
        type: 'reel',
        carousel: false
      },
      recentPhotos: [...recentPhotos.filter(id => id !== chosen.id), chosen.id].slice(-14),
      usedVideoIds: newUsedIds,
      audioIndex: tracks.length > 0 ? (audioIdx + 1) % tracks.length : (state.audioIndex ?? 0),
      postedVerseIds: [...state.postedVerseIds.filter(id => id !== entry.id), entry.id]
    });
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
} else {
  // ---------- CAROUSEL (mevcut akış) ----------
  const geminiKey = process.env.GEMINI_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const recentlyUsed = new Set(recentPhotos);

  let photo;
  if (unsplashKey) {
    console.log('Unsplash API ile dinamik fotoğraf çekiliyor...');
    let approved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      photo = await fetchUnsplashPhoto(entry.moods, unsplashKey, recentlyUsed);
      if (geminiKey) {
        const result = await isPhotoSpiritual(photo.url, geminiKey);
        if (result.approved) {
          console.log(`Unsplash foto onaylandı: ${photo.id}`);
          approved = true;
          break;
        } else {
          console.log(`Reddedildi (${result.reason}), tekrar deneniyor...`);
          recentlyUsed.add(photo.id);
        }
      } else {
        approved = true;
        break;
      }
    }
    if (!approved) console.warn('5 denemede onay alınamadı, son fotoğraf kullanılıyor.');
  } else if (geminiKey) {
    photo = await pickValidatedPhoto({
      photos,
      verseMoods: entry.moods,
      recentlyUsed,
      apiKey: geminiKey,
      maxAttempts: photos.length
    });
  } else {
    photo = pickPhoto(photos, entry.moods, recentlyUsed);
  }

  const slide1 = join(ROOT, 'output', `${today}-1.png`);
  await renderToPng({
    verse: entry.verse,
    original: null,
    source: 'Komşu Tüyosu',
    photoUrl: photo.url
  }, slide1);
  console.log(`Slide 1: ${slide1}`);

  const hasExplanation = entry.explanation && entry.explanation.trim().length > 0;
  if (hasExplanation) {
    const slide2 = join(ROOT, 'output', `${today}-2.png`);
    await renderExplanationToPng({ explanation: entry.explanation, photoUrl: photo.url }, slide2);
    console.log(`Slide 2: ${slide2}`);
  }

  writeState(statePath, {
    ...state,
    launchDate,
    lastPost: {
      date: today,
      verseId: entry.id,
      photoId: photo.id,
      postId: null,
      type: 'carousel',
      carousel: hasExplanation
    },
    recentPhotos: [...recentPhotos.filter(id => id !== photo.id), photo.id].slice(-14),
    usedVideoIds: state.usedVideoIds ?? [],
    postedVerseIds: [...state.postedVerseIds.filter(id => id !== entry.id), entry.id]
  });
}

console.log(`  Gün ${entry.day} / ${content.length} - ${entry.id}`);
