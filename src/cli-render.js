import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickPhoto } from './pickPhoto.js';
import { pickValidatedPhoto, isPhotoSpiritual } from './checkPhoto.js';
import { fetchUnsplashPhoto } from './fetchUnsplashPhoto.js';
import { fetchPexelsCandidates, fetchPexelsCandidatesByQueries } from './fetchPexelsVideo.js';
import { validateVideoFrames } from './checkVideoFrames.js';
import { renderToPng, renderExplanationToPng } from './render.js';
import { renderReel, downloadVideo, pickAudioByIndex, listAudioTracks } from './renderReel.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readState, writeState } from './state.js';
import { generateVoice, getAudioDuration } from './generateVoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const content = JSON.parse(readFileSync(join(ROOT, 'content', 'beyin-oyunlari.json'), 'utf-8'));
const photos = JSON.parse(readFileSync(join(ROOT, 'content', 'photos.json'), 'utf-8'));
const statePath = join(ROOT, 'output', 'log.json');
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
    throw new Error(`Tüm uygun günler paylaşıldı. beyin-oyunlari.json bitti.`);
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
      `content/beyin-oyunlari.json'a doldurun, sonra workflow'u tekrar tetikleyin. ` +
      `Post atilmadi (sira korunuyor).`
    );
  }
}

// Tip alternasyonu: normalde bir öncekinin tersi (carousel <-> reel).
// REELS_ENABLED=false   → sadece carousel atılır
// CAROUSEL_ENABLED=false → sadece reel atılır (carousel kodu silinmedi, geri açmak için bu satırı kaldır)
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

  const usedVideoIds = new Set(state.usedVideoIds ?? []);

  // Zihnimizin Sirlari: entry.pexelsQuery varsa soru-baginli arama; yoksa mood fallback.
  // Moderasyon (validateVideoFrames) BYPASS: Salih Baba'daki kadin/imaj filtresi
  // burada gerekli degil, her gorsel kullanilabilir (kullanici karari).
  const candidates = Array.isArray(entry.pexelsQuery) && entry.pexelsQuery.length > 0
    ? await fetchPexelsCandidatesByQueries(entry.pexelsQuery, pexelsKey, usedVideoIds)
    : await fetchPexelsCandidates(entry.moods, pexelsKey, usedVideoIds);
  console.log(`${candidates.length} Pexels aday bulundu (query-based: ${!!entry.pexelsQuery})`);

  const tmpDir = mkdtempSync(join(tmpdir(), 'pexels-'));
  let chosen = null;
  let chosenPath = null;
  const rejectedIds = [];

  try {
    // Ilk adayi direkt al, moderasyon yok
    const c = candidates[0];
    const localPath = join(tmpDir, `cand-0.mp4`);
    console.log(`[1/${candidates.length}] ${c.id} (query: "${c.query}") indiriliyor...`);
    await downloadVideo(c.url, localPath);
    chosen = c;
    chosenPath = localPath;

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
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;
    if (elevenKey && elevenVoiceId) {
      const voiceCacheDir = join(ROOT, 'output', 'audio-cache');
      try {
        console.log('Soru sesi (ElevenLabs)...');
        // SORU icin speed 0.9: noktalama az oldugu icin default 1.0'da cok hizli okunuyor.
        // CEVAP default 1.0 kullanir (noktalama yogun, dogal tempo).
        voicePath = await generateVoice({
          text: entry.verse,
          voiceId: elevenVoiceId,
          apiKey: elevenKey,
          cacheDir: voiceCacheDir,
          settings: { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 0.9 }
        });
        voiceDuration = await getAudioDuration(voicePath);
        console.log(`  Soru voice: ${voiceDuration.toFixed(1)}sn`);

        if (entry.explanation && entry.explanation.trim()) {
          console.log('Cevap sesi (ElevenLabs)...');
          manaVoicePath = await generateVoice({
            text: entry.explanation,
            voiceId: elevenVoiceId,
            apiKey: elevenKey,
            cacheDir: voiceCacheDir
          });
          manaVoiceDuration = await getAudioDuration(manaVoicePath);
          console.log(`  Cevap voice: ${manaVoiceDuration.toFixed(1)}sn`);
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
    await renderReel({
      verse: entry.verse,
      explanation: entry.explanation || '',
      videoPath: chosenPath,
      audioPath,
      voicePath,
      voiceDuration,
      manaVoicePath,
      manaVoiceDuration,
      outPath: outVideo
    });
    console.log(`Reel hazir: ${outVideo}`);

    // Reddedilen adaylar da kalıcı blacklist'e gidiyor (tekrar denenmesin)
    const newUsedIds = [
      ...(state.usedVideoIds ?? []).filter(id => id !== chosen.id),
      ...rejectedIds.filter(id => !(state.usedVideoIds ?? []).includes(id)),
      chosen.id
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
    source: 'Zihnimizin Sırları',
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
