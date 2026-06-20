/**
 * Komşu Tüyosu - Long-form yatay video (1920x1080).
 * Intro YOK. Akis:
 *   1. Baslik karti (videoTitle) - kisa sesli giris, ~card suresi
 *   2. 1sn bekleme
 *   3. Her item icin: SORU karti (oku) -> 1sn gecis -> CEVAP karti (oku) -> tail
 *   4. Son item'dan sonra 3sn net, 1.5sn fade out (video + ses)
 *
 * Her sey Komsu'ya ait: ElevenLabs sesi, Pexels LANDSCAPE ev videolari,
 * audio-komsu-tuyosu muzikleri, turuncu "lf-komsu-*" temasi.
 *
 * Arka plan: yeterince landscape klip alinir, uc uca eklenir (LOOP YOK).
 * Muzik: audio-komsu-tuyosu parcalari sirayla uc uca (LOOP YOK).
 *
 * Kullanim:
 *   node src/render-longform-komsu.js            # tum item'lar
 *   node src/render-longform-komsu.js --items 2  # ilk 2 item (hizli test)
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, statSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { fetchPexelsCandidatesByQueries } from './fetchPexelsVideo.js';
import { generateVoice, getAudioDuration } from './generateVoice.js';
import { downloadVideo } from './renderReel.js';
import { validateVideoFrames } from './checkVideoFrames.js';

// ---------- Path & env ----------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'template');
const AUDIO_DIR = join(ROOT, 'audio-komsu-tuyosu');
const OUT_DIR = join(ROOT, 'output');

const ffmpegPath = (await import('ffmpeg-static')).default;
const FFMPEG = process.env.FFMPEG_PATH || ffmpegPath || 'ffmpeg';

const PEXELS_KEY  = process.env.PEXELS_API_KEY;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const ELEVEN_KEY  = process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID;
for (const [n, v] of Object.entries({ PEXELS_KEY, ELEVEN_KEY, ELEVEN_VOICE })) {
  if (!v) { console.error('Env eksik:', n); process.exit(1); }
}

// ---------- CLI ----------
//   (varsayilan)        : state'teki siradaki haftalik 5'liyi render eder
//   --week N            : N. haftayi render eder (1-tabanli)  [index=(N-1)*perWeek]
//   --index I           : havuzda I. tuyodan baslayarak perWeek tane
//   --items N           : sadece test - secilen gruptan ilk N tuyo
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--items');
const itemsLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
const weekIdx = args.indexOf('--week');
const idxIdx = args.indexOf('--index');

// ---------- Data ----------
const data = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-longform.json'), 'utf-8'));
const videoTitle = data.videoTitle;
const introQuery = data.introQuery && data.introQuery.length ? data.introQuery : ['clean tidy home interior'];
const perWeek = data.perWeek || 5;
const pool = (data.content || data.items || []).filter(u => u.question && u.question.trim() && u.answer && u.answer.trim());
if (pool.length === 0) { console.error('Long-form icerik havuzu bos (content)'); process.exit(1); }

// Haftalik index: CLI override yoksa state dosyasindan oku
const STATE_PATH = join(OUT_DIR, 'longform-state.json');
let stateIndex = 0;
if (existsSync(STATE_PATH)) {
  try { stateIndex = JSON.parse(readFileSync(STATE_PATH, 'utf-8')).index || 0; } catch {}
}
let startIndex = stateIndex;
if (weekIdx >= 0) startIndex = (parseInt(args[weekIdx + 1], 10) - 1) * perWeek;
else if (idxIdx >= 0) startIndex = parseInt(args[idxIdx + 1], 10);

if (startIndex >= pool.length) {
  console.error(`Long-form havuzu bitti (index ${startIndex} >= ${pool.length}). Yeni icerik ekleyin.`);
  process.exit(1);
}
let items = pool.slice(startIndex, startIndex + perWeek);
if (itemsLimit) items = items.slice(0, itemsLimit);
if (items.length === 0) { console.error('Secilen grupta tuyo yok'); process.exit(1); }
const weekNo = Math.floor(startIndex / perWeek) + 1;
console.log(`Long-form HAFTA ${weekNo} (index ${startIndex}): "${videoTitle}" - ${items.length} tuyo (${items.map(i=>i.id).join(', ')})`);

// ---------- Helpers ----------
function ffmpeg(a) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-1500)}`)));
    proc.on('error', reject);
  });
}

function fillTemplate(name, vars) {
  let html = readFileSync(join(TEMPLATE_DIR, name), 'utf-8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
  }
  return html;
}

async function renderHtmlToPng(html, outPath, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 600));
  const buf = await page.screenshot({ type: 'png', omitBackground: true });
  writeFileSync(outPath, buf);
  await page.close();
  await ctx.close();
}

function listMusicTracks() {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR)
    .filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f))
    .sort()
    .map(f => join(AUDIO_DIR, f));
}

// ---------- Timing ----------
const CARD_LEAD = 0.8;
const CARD_TAIL = 1.4;
const PAUSE_AFTER_CARD = 1.0;
const Q_LEAD = 0.8;
const Q_TAIL = 1.0;
const A_LEAD = 0.6;
const A_TAIL = 1.6;
const ITEM_GAP = 1.0;
const FINAL_HOLD = 3.0;
const FADE_OUT = 1.5;
const MUSIC_VOL = 0.16;  // onceki 0.20'den %20 kisik

// Soru ve cevap ayni tempo: 1.1x
const Q_SETTINGS = { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 1.1 };
const A_SETTINGS = { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed: 1.1 };

// ---------- Main ----------
const tmp = mkdtempSync(join(tmpdir(), 'lfk-'));
console.log('Tmp:', tmp);

try {
  const cacheDir = join(OUT_DIR, 'audio-cache');
  console.log('\n=== Sesler (ElevenLabs, Komsu sesi) ===');

  // Baslik karti sesi: video basligini oku
  const cardText = `${videoTitle}.`;
  const cardVoicePath = await generateVoice({ text: cardText, voiceId: ELEVEN_VOICE, apiKey: ELEVEN_KEY, cacheDir, settings: Q_SETTINGS });
  const cardVoiceDur = await getAudioDuration(cardVoicePath);
  console.log(`Kart sesi: ${cardVoiceDur.toFixed(1)}sn`);

  const itemAudios = [];
  for (let i = 0; i < items.length; i++) {
    console.log(`Tuyo ${i+1}/${items.length}: soru + cevap sesi`);
    const qPath = await generateVoice({ text: items[i].question, voiceId: ELEVEN_VOICE, apiKey: ELEVEN_KEY, cacheDir, settings: Q_SETTINGS });
    const qDur = await getAudioDuration(qPath);
    const aPath = await generateVoice({ text: items[i].answer, voiceId: ELEVEN_VOICE, apiKey: ELEVEN_KEY, cacheDir, settings: A_SETTINGS });
    const aDur = await getAudioDuration(aPath);
    itemAudios.push({ qPath, qDur, aPath, aDur });
    console.log(`  soru ${qDur.toFixed(1)}sn, cevap ${aDur.toFixed(1)}sn`);
  }

  // Toplam sure
  const cardDur = CARD_LEAD + cardVoiceDur + CARD_TAIL;
  let bodyDur = cardDur + PAUSE_AFTER_CARD;
  for (const a of itemAudios) {
    bodyDur += Q_LEAD + a.qDur + Q_TAIL + ITEM_GAP + A_LEAD + a.aDur + A_TAIL;
  }
  bodyDur += FINAL_HOLD;
  const bodyDurWithFade = bodyDur + FADE_OUT;
  console.log(`\nToplam video: ${bodyDurWithFade.toFixed(1)}sn (${(bodyDurWithFade/60).toFixed(1)} dk)`);

  // ---- SAHNE-BAZLI arka plan: intro + her tuyo KENDI konusuyla ilgili video ----
  // Her sahnenin suresi = o sahnedeki overlay/ses akisinin suresi. Sahneler uc uca
  // eklenince toplam = bodyDurWithFade olur (overlay zamanlamasi degismez).
  const introSceneDur = cardDur + PAUSE_AFTER_CARD;
  const itemSceneDurs = itemAudios.map(a => Q_LEAD + a.qDur + Q_TAIL + ITEM_GAP + A_LEAD + a.aDur + A_TAIL);
  itemSceneDurs[itemSceneDurs.length - 1] += FINAL_HOLD + FADE_OUT;  // son sahne final hold + fade'i tasir
  const scenes = [
    { key: 'intro', dur: introSceneDur, query: introQuery, label: 'Intro' },
    ...items.map((it, i) => ({ key: `item${i}`, dur: itemSceneDurs[i], query: it.pexelsQuery, label: it.title }))
  ];

  console.log('\n=== Sahne videolari (her tuyo kendi konusu) ===');
  const vidDir = join(tmp, 'pex');
  mkdirSync(vidDir, { recursive: true });
  const usedIds = new Set();
  const sceneSegments = [];

  for (const scene of scenes) {
    console.log(`\n[${scene.key}] "${scene.label}" (${scene.dur.toFixed(1)}sn) - video araniyor...`);
    // Once konuya OZEL query (fallback kapali), bulunamazsa genel ev sahnesine dus
    let cands = [];
    try {
      cands = await fetchPexelsCandidatesByQueries(scene.query, PEXELS_KEY, usedIds, {
        orientation: 'landscape', minCandidates: 8, includeFallback: false,
        durationRanges: [ { min: 6, max: 120 } ]
      });
    } catch (e) { console.log(`  ozel arama bos: ${e.message}`); }
    if (cands.length === 0) {
      console.log('  -> genel ev sahnesine dusuluyor (fallback)');
      cands = await fetchPexelsCandidatesByQueries(scene.query, PEXELS_KEY, usedIds, {
        orientation: 'landscape', minCandidates: 6, includeFallback: true,
        durationRanges: [ { min: 6, max: 120 } ]
      });
    }
    let pick = null;
    for (const c of cands) {
      const lp = join(vidDir, `${scene.key}.mp4`);
      console.log(`  aday ${c.id} (${c.duration}sn, "${c.query}") indiriliyor...`);
      try { await downloadVideo(c.url, lp); } catch (e) { console.log(`    indir hatasi: ${e.message}`); continue; }
      if (GEMINI_KEY) {
        let r;
        try {
          r = await validateVideoFrames(lp, c.duration, GEMINI_KEY, 2);
        } catch (e) {
          console.log(`    ⚠ moderasyon hatasi (${String(e.message || '').slice(0, 70)}), bu aday atlaniyor`);
          continue;
        }
        if (!r.approved) { console.log(`    ✗ moderasyon: ${r.reason}`); continue; }
      }
      pick = { path: lp, id: c.id }; usedIds.add(c.id);
      console.log(`    ✓ secildi`);
      break;
    }
    if (!pick) throw new Error(`Sahne "${scene.label}" icin uygun video bulunamadi`);

    // Segment: videoyu sahne suresine getir (kisa ise loop, scale/crop 1920x1080/30fps)
    const seg = join(vidDir, `seg-${scene.key}.mp4`);
    await ffmpeg(['-y', '-stream_loop', '-1', '-i', pick.path, '-t', scene.dur.toFixed(3),
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,format=yuv420p',
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', seg]);
    sceneSegments.push(seg);
  }

  // Sahne segmentlerini uc uca ekle -> bg.mp4 (hepsi ayni codec/boyut/fps, concat filter temiz)
  console.log('\n=== Sahne videolari birlestiriliyor ===');
  const bgPath = join(tmp, 'bg.mp4');
  const concatArgs = ['-y'];
  for (const s of sceneSegments) concatArgs.push('-i', s);
  const fcParts = sceneSegments.map((_, i) => `[${i}:v]setsar=1,fps=30,format=yuv420p[v${i}]`);
  const concatInputs = sceneSegments.map((_, i) => `[v${i}]`).join('');
  const fcStr = fcParts.join(';') + `;${concatInputs}concat=n=${sceneSegments.length}:v=1:a=0[outv]`;
  concatArgs.push('-filter_complex', fcStr, '-map', '[outv]', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
    '-t', String(bodyDurWithFade), bgPath);
  await ffmpeg(concatArgs);
  console.log('bg.mp4 hazir (sahne-bazli)');

  // Muzik (sequential, loop yok)
  console.log('\n=== Muzik (Komsu, sequential) ===');
  const tracks = listMusicTracks();
  if (tracks.length === 0) throw new Error(`Muzik bulunamadi: ${AUDIO_DIR}`);
  const musicList = [];
  let musicDur = 0, tIdx = 0;
  while (musicDur < bodyDurWithFade) {
    const t = tracks[tIdx % tracks.length];
    musicList.push(t);
    musicDur += await getAudioDuration(t);
    tIdx++;
  }
  console.log(`${musicList.length} parca, ${musicDur.toFixed(0)}sn`);
  const musicConcat = musicList.map(m => `file '${m.replace(/'/g, "'\\''")}'`).join('\n');
  writeFileSync(join(tmp, 'music.txt'), musicConcat);
  const musicPath = join(tmp, 'music.aac');
  await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'music.txt'),
    '-t', String(bodyDurWithFade), '-c:a', 'aac', '-b:a', '192k', musicPath]);

  // Overlay PNG'leri
  console.log('\n=== Overlay PNGleri ===');
  const browser = await chromium.launch();
  const gradientPng = join(tmp, 'gradient.png');
  const cardPng = join(tmp, 'card.png');
  const itemPngs = [];
  try {
    await renderHtmlToPng(fillTemplate('lf-komsu-gradient.html', {}), gradientPng, browser);
    await renderHtmlToPng(
      fillTemplate('lf-komsu-card.html', { title: videoTitle, total: items.length, titleFontSize: '96px' }),
      cardPng, browser);
    for (let i = 0; i < items.length; i++) {
      const qPng = join(tmp, `q-${i}.png`);
      const aPng = join(tmp, `a-${i}.png`);
      await renderHtmlToPng(
        fillTemplate('lf-komsu-question.html', { num: i + 1, title: items[i].title, question: items[i].question, questionFontSize: '56px' }),
        qPng, browser);
      await renderHtmlToPng(
        fillTemplate('lf-komsu-answer.html', { title: items[i].title, answer: items[i].answer, answerFontSize: '40px' }),
        aPng, browser);
      itemPngs.push({ qPng, aPng });
      console.log(`  tuyo ${i+1} PNG'leri hazir`);
    }
  } finally {
    await browser.close();
  }

  // Compose (zamanli overlay + sesler + muzik)
  console.log('\n=== Compose ===');
  let t = 0;
  const cardEnd = cardDur;
  const cardAudioStart = CARD_LEAD;
  t = cardEnd + PAUSE_AFTER_CARD;
  const sched = [];
  for (let i = 0; i < items.length; i++) {
    const qOverlayStart = t;
    const qAudioStart = t + Q_LEAD;
    const qOverlayEnd = qAudioStart + itemAudios[i].qDur + Q_TAIL;
    const aOverlayStart = qOverlayEnd + ITEM_GAP;
    const aAudioStart = aOverlayStart + A_LEAD;
    const aOverlayEnd = aAudioStart + itemAudios[i].aDur + A_TAIL;
    sched.push({ qOverlayStart, qOverlayEnd, qAudioStart, aOverlayStart, aOverlayEnd, aAudioStart });
    t = aOverlayEnd;
  }
  const finalFadeStart = t + FINAL_HOLD;
  const bodyTotalLen = finalFadeStart + FADE_OUT;

  // Inputlar: 0=bg, 1=gradient, 2=card, 3=music, 4=cardVoice, 5+=item sesleri (q,a), sonra PNG'ler (q,a)
  const a2 = ['-y',
    '-i', bgPath,
    '-loop', '1', '-t', String(bodyTotalLen), '-i', gradientPng,
    '-loop', '1', '-t', String(cardEnd + 1), '-i', cardPng,
    '-i', musicPath,
    '-i', cardVoicePath];
  const voiceBase = 5;
  for (let i = 0; i < items.length; i++) a2.push('-i', itemAudios[i].qPath, '-i', itemAudios[i].aPath);
  const pngBase = voiceBase + items.length * 2;
  for (let i = 0; i < items.length; i++) {
    const qLen = sched[i].qOverlayEnd - sched[i].qOverlayStart + 1;
    const aLen = sched[i].aOverlayEnd - sched[i].aOverlayStart + 1;
    a2.push('-loop', '1', '-t', String(qLen), '-i', itemPngs[i].qPng);
    a2.push('-loop', '1', '-t', String(aLen), '-i', itemPngs[i].aPng);
  }

  const FIN = 0.6, FOUT = 0.8;
  const f = [];
  f.push(`[0:v]tpad=stop_mode=clone:stop_duration=${(bodyTotalLen + 2).toFixed(2)},trim=duration=${bodyTotalLen.toFixed(2)},setpts=PTS-STARTPTS[bg]`);
  f.push(`[1:v]scale=1920:1080:flags=lanczos,setpts=PTS-STARTPTS[grad]`);
  f.push(`[2:v]scale=1920:1080:flags=lanczos,format=rgba,fade=t=in:st=0:d=${FIN}:alpha=1,fade=t=out:st=${(cardEnd - FOUT).toFixed(2)}:d=${FOUT}:alpha=1,setpts=PTS-STARTPTS[card]`);

  const overlayLabels = [];
  for (let i = 0; i < items.length; i++) {
    const qIdx = pngBase + i * 2;
    const aIdx = qIdx + 1;
    const qLen = sched[i].qOverlayEnd - sched[i].qOverlayStart;
    const aLen = sched[i].aOverlayEnd - sched[i].aOverlayStart;
    f.push(`[${qIdx}:v]scale=1920:1080:flags=lanczos,format=rgba,fade=t=in:st=0:d=${FIN}:alpha=1,fade=t=out:st=${(qLen - FOUT).toFixed(2)}:d=${FOUT}:alpha=1,setpts=PTS+${sched[i].qOverlayStart.toFixed(2)}/TB[q${i}]`);
    f.push(`[${aIdx}:v]scale=1920:1080:flags=lanczos,format=rgba,fade=t=in:st=0:d=${FIN}:alpha=1,fade=t=out:st=${(aLen - FOUT).toFixed(2)}:d=${FOUT}:alpha=1,setpts=PTS+${sched[i].aOverlayStart.toFixed(2)}/TB[a${i}]`);
    overlayLabels.push(`[q${i}]`, `[a${i}]`);
  }

  f.push(`[bg][grad]overlay=0:0[v1]`);
  f.push(`[v1][card]overlay=0:0[v2]`);
  let last = '[v2]', vi = 3;
  for (const lab of overlayLabels) { f.push(`${last}${lab}overlay=0:0[v${vi}]`); last = `[v${vi}]`; vi++; }
  f.push(`${last}fade=t=out:st=${finalFadeStart.toFixed(2)}:d=${FADE_OUT}[outv]`);

  // Audio
  const aLabels = [];
  f.push(`[3:a]volume=${MUSIC_VOL},afade=t=in:st=0:d=1,afade=t=out:st=${finalFadeStart.toFixed(2)}:d=${FADE_OUT}[mus]`);
  aLabels.push('[mus]');
  const cardDelay = Math.round(cardAudioStart * 1000);
  f.push(`[4:a]volume=1.0,afade=t=out:st=${(cardVoiceDur - 0.3).toFixed(2)}:d=0.4,adelay=${cardDelay}|${cardDelay}[cv]`);
  aLabels.push('[cv]');
  for (let i = 0; i < items.length; i++) {
    const qIdx = voiceBase + i * 2;
    const aIdx = qIdx + 1;
    const qDelay = Math.round(sched[i].qAudioStart * 1000);
    const aDelay = Math.round(sched[i].aAudioStart * 1000);
    f.push(`[${qIdx}:a]volume=1.0,afade=t=out:st=${(itemAudios[i].qDur - 0.3).toFixed(2)}:d=0.4,adelay=${qDelay}|${qDelay}[qv${i}]`);
    f.push(`[${aIdx}:a]volume=1.0,afade=t=out:st=${(itemAudios[i].aDur - 0.3).toFixed(2)}:d=0.4,adelay=${aDelay}|${aDelay}[av${i}]`);
    aLabels.push(`[qv${i}]`, `[av${i}]`);
  }
  f.push(`${aLabels.join('')}amix=inputs=${aLabels.length}:duration=longest:dropout_transition=0:normalize=0[outa]`);

  const fcFile = join(tmp, 'fc.txt');
  writeFileSync(fcFile, f.join(';'));

  const finalOut = join(OUT_DIR, 'komsu-longform.mp4');
  // preset veryfast + maxrate/bufsize KALDIRILDI: GitHub runner (2 vCPU) medium preset'te
  // 30dk timeout'a takiliyordu. veryfast 4-6x hizli, 1080p'de kalite farki minimal.
  a2.push('-filter_complex_script', fcFile, '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-t', String(bodyTotalLen), finalOut);
  await ffmpeg(a2);

  // Meta: bu haftanin secilen tuyolari + ciktilar -> kapak ve upload bunu kullanir
  const metaPath = join(OUT_DIR, 'komsu-longform-meta.json');
  writeFileSync(metaPath, JSON.stringify({
    index: startIndex,
    weekNo,
    videoTitle,
    thumbTop: data.thumbTop || 'Bu Haftanın',
    thumbBig: data.thumbBig || '<span class="hl">5</span> Pratik Tüyosu',
    // start = tuyonun video icindeki baslangic saniyesi (YouTube bolum/chapter icin)
    items: items.map((it, i) => ({ id: it.id, keyword: it.keyword || it.title, title: it.title, start: Math.round(sched[i].qOverlayStart) })),
    videoPath: finalOut,
    durationSec: Math.round(bodyTotalLen)
  }, null, 2));

  const sz = (statSync(finalOut).size / (1024*1024)).toFixed(1);
  console.log(`\n✓ HAZIR: ${finalOut}`);
  console.log(`Boyut: ${sz} MB, sure: ${bodyTotalLen.toFixed(1)}sn (${(bodyTotalLen/60).toFixed(1)} dk)`);
  console.log(`Meta: ${metaPath}`);

} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
