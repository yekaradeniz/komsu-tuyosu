import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'template');
const AUDIO_DIR = join(__dirname, '..', 'audio-komsu-tuyosu');

/**
 * audio/ klasöründeki MP3'leri sıralı olarak listeler.
 * Index'e göre rotation yapılır - aynı sıra her zaman aynı parçayı seçer.
 */
export function listAudioTracks() {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR)
    .filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f))
    .sort()
    .map(f => join(AUDIO_DIR, f));
}

export function pickAudioByIndex(index) {
  const tracks = listAudioTracks();
  if (tracks.length === 0) return null;
  return tracks[index % tracks.length];
}

function calcVerseFontSize(verse) {
  // Hero stil: uppercase Anton + kirmizi band, HTML icindeki JS auto-shrink
  return 110;
}

function calcExplanationFontSize(_explanation) {
  // Inter 700, HTML icindeki JS auto-shrink
  return 51;
}

function fillTemplate(name, vars) {
  let html = readFileSync(join(TEMPLATE_DIR, name), 'utf-8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
  }
  return html;
}

async function renderHtmlToPng(html, outPath, browser) {
  // 2x render (Retina): viewport 1080x1920 ama deviceScaleFactor 2 => screenshot 2160x3840 px.
  // ffmpeg lanczos ile 1080x1920'ye geri olcekler. Sonuc: text kenarlari super keskin.
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const buf = await page.screenshot({ type: 'png', omitBackground: true });
  writeFileSync(outPath, buf);
  await page.close();
  await context.close();
}

export async function downloadVideo(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Video indirilemedi: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exit ${code}\n${stderr.slice(-2000)}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Reel oluşturur: 3 overlay (gradient + verse + mana) + Pexels video → MP4.
 * Toplam ~21 saniye, dikey 1080x1920.
 *
 * @param {object} opts
 * @param {string} opts.verse
 * @param {string} opts.explanation
 * @param {string} [opts.videoUrl] - Pexels video URL (videoPath verilmediyse indirilir)
 * @param {string} [opts.videoPath] - lokal MP4 yolu (zaten indirilmiş)
 * @param {string} [opts.audioPath] - opsiyonel arka plan müziği (mp3/m4a/wav). Verilmezse sessiz.
 * @param {string} [opts.voicePath] - opsiyonel insan/AI sesi (beyit periyodu boyunca). Verilirse:
 *   - verse suresi otomatik olarak voiceDuration + 2sn olur (1sn lead + voice + 1sn trail)
 *   - voice tam ses, audioPath (background) ise %25 volume mix edilir
 * @param {number} [opts.voiceDuration] - voicePath suresi (saniye). voicePath varsa zorunlu.
 * @param {string} [opts.manaVoicePath] - opsiyonel mana sesi (mana periyodu boyunca). Verilirse:
 *   - mana suresi otomatik olarak manaVoiceDuration + 2sn olur
 *   - background music %25 volume devam eder
 * @param {number} [opts.manaVoiceDuration] - manaVoicePath suresi (saniye). manaVoicePath varsa zorunlu.
 * @param {string} opts.outPath - çıkış MP4 yolu
 */

// Kaynak videonun suresini saniye olarak doner (ffmpeg stderr'inden).
function getVideoDuration(path) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(ffmpegPath, ['-i', path], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (!m) return reject(new Error('sure okunamadi'));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
    proc.on('error', reject);
  });
}

export async function renderReel({ verse, explanation, videoUrl, videoPath, audioPath, voicePath, voiceDuration, manaVoicePath, manaVoiceDuration, ctaVoicePath, ctaVoiceDuration, ctaKicker, ctaSub, outPath }) {
  const tmp = mkdtempSync(join(tmpdir(), 'reel-'));
  const browser = await chromium.launch();
  try {
    // 1) Overlay PNG'leri render et
    const gradientHtml = fillTemplate('reel-gradient.html', {});
    const verseHtml = fillTemplate('reel-verse-text.html', {
      verse,
      verseFontSize: `${calcVerseFontSize(verse)}px`
    });
    const manaHtml = fillTemplate('reel-mana-text.html', {
      explanation,
      explanationFontSize: `${calcExplanationFontSize(explanation)}px`
    });

    // ABONE CTA karti: cevap bitince 2.2sn gorunur. Kanalin abone donusumu cok
    // zayifti (1000 izlenmede 0.66 abone); video hicbir cagri yapmadan bitiyordu.
    // Kart metni profile gore degisir: nis videosunda "ev tuyosu" yazmasi yanlis.
    const ctaHtml = fillTemplate('reel-cta.html', {
      KICKER: ctaKicker || 'İşine yaradıysa',
      SUB: ctaSub || 'Her gün yeni bir ev tüyosu',
    });

    const gradientPng = join(tmp, 'gradient.png');
    const versePng = join(tmp, 'verse.png');
    const manaPng = join(tmp, 'mana.png');
    const ctaPng = join(tmp, 'cta.png');
    await renderHtmlToPng(gradientHtml, gradientPng, browser);
    await renderHtmlToPng(verseHtml, versePng, browser);
    await renderHtmlToPng(manaHtml, manaPng, browser);
    await renderHtmlToPng(ctaHtml, ctaPng, browser);
    console.log('Overlay PNGleri hazir (CTA dahil)');

    // 2) Pexels videosunu indir (gerekirse)
    let actualVideoPath = videoPath;
    if (!actualVideoPath) {
      actualVideoPath = join(tmp, 'bg.mp4');
      await downloadVideo(videoUrl, actualVideoPath);
      console.log('Pexels video indirildi');
    }

    // B-ROLL BASLANGICI: stok videolarin ilk saniyeleri genelde duragan olur
    // (kamera stabilize, sahne kuruluyor). Arastirma: Shorts'u en hareketli
    // b-roll ile ac. Kaynagin %20'sinden basla, kisa kaynakta 0'da kal.
    let brollSkip = 0;
    try {
      const srcDur = await getVideoDuration(actualVideoPath);
      if (srcDur > 8) brollSkip = Math.min(Math.round(srcDur * 0.2), 6);
    } catch (e) { brollSkip = 0; console.warn(`B-roll suresi okunamadi (${e.message}), bastan baslanacak`); }
    if (brollSkip) console.log(`B-roll ${brollSkip}sn ileriden basliyor (duragan giris atlandi)`);

    // 3) FFmpeg ile compose et
    // DINAMIK SURE PLANI:
    //   verseLen = voiceDuration + 2 (1sn lead + voice + 1sn trail). Voice yoksa 12sn sabit.
    //   manaLen = lead + manaVoiceDuration + fade. Mana voice yoksa 18sn sabit.
    //   transitionLen = 0 (gecis boslugu kaldirildi - sikilastirildi)
    //   Soru sesi bitince cevap sesi baslayana kadar ~1.4sn (1 trailing + 0 gecis + 0.4 lead)
    //   Cevap sesi bitince video 0.5sn'de fade olup kapanir (FADE_DUR)
    const hasVoice = !!voicePath && existsSync(voicePath) && voiceDuration > 0;
    const hasManaVoice = !!manaVoicePath && existsSync(manaVoicePath) && manaVoiceDuration > 0;
    const verseLen = hasVoice ? Math.round(voiceDuration + 1) : 12;
    const transitionLen = 0;
    const MANA_LEAD = 0.25;     // cevap belirdikten sonra ses baslayana kadarki bekleme
    const FADE_DUR = 0.5;      // kapanis fade suresi (yarim saniye - kullanici karari)
    const manaOffset = verseLen + transitionLen;

    // Cevap gorunur kalma suresi: sesli ise lead + ses + kapanis fade'i; sessizse 18sn.
    const manaLen = hasManaVoice ? (MANA_LEAD + manaVoiceDuration + FADE_DUR) : 18;

    // CTA (abone) karti: cevap karti TAMAMEN kaybolduktan sonra belirir (ust uste
    // binmesin), video onunla kapanir. manaOffset + manaLen = cevabin fade'i bitisi.
    // Seslendirme varsa kart sesi kapsayacak kadar durur: lead + ses + kapanis fade'i.
    const hasCtaVoice = !!ctaVoicePath && existsSync(ctaVoicePath) && ctaVoiceDuration > 0;
    const CTA_LEAD = 0.15;   // kart belirdikten sonra ses baslayana kadarki bekleme
    const CTA_LEN = hasCtaVoice ? (CTA_LEAD + ctaVoiceDuration + FADE_DUR) : 1.5;
    // CTA cevap karti TAMAMEN kaybolduktan sonra baslar. Capraz gecis denendi:
    // yarim saniye kazandiriyor ama iki metin ust uste binip okunmaz oluyor.
    const ctaStart = manaOffset + manaLen;
    // Kapanis fade'i CTA'nin son yarim saniyesinde.
    const finalFadeStart = ctaStart + CTA_LEN - FADE_DUR;
    const totalLen = ctaStart + CTA_LEN;

    // Verse fade-out: son 1sn icinde
    const verseFadeOutStart = verseLen - 1.5;
    // Mana kendi fade-out'u global kapanis fade'i ile ayni anda baslar (icerikle birlikte kapanir)
    const manaFadeOutStart = manaLen - FADE_DUR;

    // 2x render PNG'leri (2160x3840) lanczos ile 1080x1920'ye dusururuz - text keskinlesir
    const filterComplex =
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];` +
      `[1:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS[grad];` +
      `[2:v]scale=1080:1920:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${verseFadeOutStart}:d=1:alpha=1,setpts=PTS-STARTPTS[vtxt];` +
      `[3:v]scale=1080:1920:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${manaFadeOutStart}:d=${FADE_DUR}:alpha=1,setpts=PTS+${manaOffset}/TB[mtxt];` +
      `[4:v]scale=1080:1920:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.45:alpha=1,setpts=PTS+${ctaStart}/TB[ctxt];` +
      // eof_action=pass SART: overlay, input'u bitince son karesini SONSUZA TEKRAR eder.
      // Cevap kartinin fade'i tam input sonunda bittigi icin soluk bir metin ekranda
      // kaliyordu (CTA'nin arkasinda hayalet yazi). pass ile input bitince overlay durur.
      `[bg][grad]overlay=0:0[bg2];` +
      `[bg2][vtxt]overlay=0:0:eof_action=pass[tmp];` +
      `[tmp][mtxt]overlay=0:0:eof_action=pass[tmp2];` +
      `[tmp2][ctxt]overlay=0:0:eof_action=pass,fade=t=out:st=${finalFadeStart}:d=${FADE_DUR}[outv]`;

    const args = [
      '-y',
      '-ss', String(brollSkip),
      '-stream_loop', '-1', '-i', actualVideoPath,
      '-loop', '1', '-t', String(totalLen), '-i', gradientPng,
      '-loop', '1', '-t', String(verseLen), '-i', versePng,
      '-loop', '1', '-t', String(manaLen), '-i', manaPng,
      '-loop', '1', '-t', String(CTA_LEN), '-i', ctaPng      // [4] abone CTA karti
    ];

    // SES KURGUSU
    // Inputlar sirayla eklenir, index sabit yazilmaz: CTA sesi araya girince
    // [5][6][7] gibi sabit numaralar kayiyordu.
    const hasMusic = !!audioPath && existsSync(audioPath);
    let nextAudioIdx = 5;                       // [0..4] gorsel inputlari
    const iVoice = hasVoice ? nextAudioIdx++ : -1;
    const iMana = hasManaVoice ? nextAudioIdx++ : -1;
    const iCta = hasCtaVoice ? nextAudioIdx++ : -1;
    const iMusic = hasMusic ? nextAudioIdx++ : -1;

    if (hasVoice) args.push('-i', voicePath);
    if (hasManaVoice) args.push('-i', manaVoicePath);
    if (hasCtaVoice) args.push('-i', ctaVoicePath);
    if (hasMusic) args.push('-stream_loop', '-1', '-i', audioPath);

    const manaVoiceStartMs = Math.round((verseLen + transitionLen + MANA_LEAD) * 1000);
    const ctaVoiceStartMs = Math.round((ctaStart + CTA_LEAD) * 1000);
    const voiceFadeOutStart = hasVoice ? voiceDuration - 0.5 : 0;
    const manaVoiceFadeOutStart = hasManaVoice ? manaVoiceDuration - 0.5 : 0;

    const chains = [];
    const voiceLabels = [];
    if (hasVoice) {
      // adelay 150ms: eskiden 1000ms idi, video bir saniye sessiz basliyordu.
      chains.push(`[${iVoice}:a]volume=1.0,afade=t=out:st=${voiceFadeOutStart}:d=0.7,adelay=150|150[vvoice]`);
      voiceLabels.push('[vvoice]');
    }
    if (hasManaVoice) {
      chains.push(`[${iMana}:a]volume=1.0,afade=t=out:st=${manaVoiceFadeOutStart}:d=0.7,adelay=${manaVoiceStartMs}|${manaVoiceStartMs}[mvoice]`);
      voiceLabels.push('[mvoice]');
    }
    if (hasCtaVoice) {
      chains.push(`[${iCta}:a]volume=1.0,adelay=${ctaVoiceStartMs}|${ctaVoiceStartMs}[cvoice]`);
      voiceLabels.push('[cvoice]');
    }

    let outaLabel = null;
    if (voiceLabels.length && hasMusic) {
      chains.push(voiceLabels.length > 1
        ? `${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:duration=longest:dropout_transition=0:normalize=0[allvoice]`
        : `${voiceLabels[0]}anull[allvoice]`);
      chains.push('[allvoice]asplit=2[voice_out][voice_key_raw]');
      // apad SART. sidechaincompress iki inputtan da frame bekler; sidechain
      // (konusma) bitince muzigi de kesiyordu. Konusma CTA'dan once bittigi icin
      // videonun son 2 saniyesi tamamen sessiz cikiyordu (olculdu: 21.8sn'lik
      // videoda t=19.8'den sonra sinyal yok). Sessizlikle totalLen'e kadar doldur.
      chains.push(`[voice_key_raw]apad=whole_dur=${totalLen}[voice_key]`);
      // Muzigi loudnorm ile ayni seviyeye getir (parca farki giderilir), sonra
      // konusma varken sidechaincompress ile otomatik kis (ducking). Sabit volume yok.
      chains.push(`[${iMusic}:a]loudnorm=I=-28:TP=-3:LRA=11,afade=t=in:st=0:d=1,afade=t=out:st=${finalFadeStart}:d=1[bgraw]`);
      chains.push('[bgraw][voice_key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[bgduck]');
      chains.push('[voice_out][bgduck]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[outa]');
      outaLabel = '[outa]';
      console.log(`Ses: konusma ${voiceLabels.length} parca + muzik (ducking), toplam ${totalLen.toFixed(1)}sn`);
    } else if (voiceLabels.length) {
      chains.push(voiceLabels.length > 1
        ? `${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:duration=longest:dropout_transition=0:normalize=0[outa]`
        : `${voiceLabels[0]}anull[outa]`);
      outaLabel = '[outa]';
      console.log(`Ses: konusma ${voiceLabels.length} parca (muzik yok)`);
    } else if (hasMusic) {
      // Konusma yoksa muzik ana ses, kisilmaz.
      chains.push(`[${iMusic}:a]afade=t=in:st=0:d=1,afade=t=out:st=${finalFadeStart}:d=1,volume=0.85[outa]`);
      outaLabel = '[outa]';
      console.log('Ses: sadece muzik');
    }

    if (outaLabel) {
      args.push(
        '-filter_complex', filterComplex + ';' + chains.join(';'),
        '-map', '[outv]', '-map', outaLabel,
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'
      );
    } else {
      args.push('-filter_complex', filterComplex, '-map', '[outv]', '-an');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'slower',
      '-crf', '14',
      '-profile:v', 'high', '-level', '4.2',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-maxrate', '20M', '-bufsize', '40M',
      '-movflags', '+faststart',
      '-t', String(totalLen),
      outPath
    );

    await ffmpeg(args);
    console.log(`Reel video hazir: ${outPath}`);
  } finally {
    await browser.close();
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
