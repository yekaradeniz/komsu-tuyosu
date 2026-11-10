/**
 * V2 REEL FORMATI (2026-11-10). content kaydinda "format": "v2" olanlar bununla uretilir.
 *
 * Olcum (99 nis videosu, YouTube Analytics, scripts/retention-report.mjs):
 *   - Izleyicinin %62'si ilk anda kaydiriyor (medyan engagedViews / views = %38).
 *   - Kalanlarin ucte biri 5-8. saniyede cikiyor: soru karti kaybolup 165
 *     karakterlik duragan paragraf belirdigi an (medyan egri t25=95 -> t40=65).
 *   - Sondaki karta yalnizca %20-28 ulasiyor.
 *
 * V1'den farklar:
 *   1. Ilk karede kisa kanca basligi (entry.hook), fade yok.
 *   2. Duragan soru ve paragraf kartlari yerine konusmayla senkron, kelime
 *      vurgulu altyazi (ElevenLabs karakter zamanlamasi).
 *   3. Tek stok video yerine yaklasik 3 saniyede bir degisen birden cok klip.
 *   4. Soru ile cevap arasindaki bosluk 1.5 saniyeden 0.2 saniyeye indi.
 *   5. Kapanista siyaha kararma yok: video dongude ilk kareye temiz baglanir.
 * Ses hizi ve tonu V1 ile ayni (kullanici karari, dokunulmadi).
 */
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { fillTemplate, renderHtmlToPng, ffmpeg } from './renderReel.js';
import { wordsFromAlignment, chunkWords, captionFrames, concatScript, planSegments } from './captions.js';

const VOICE_START = 0.15;   // ilk kelime neredeyse aninda (sessiz acilis izleyici kaybettiriyor)
const GAP = 0.2;            // soru bitisi ile cevap baslangici arasi
const CTA_GAP = 0.25;       // cevap bitisi ile abone karti arasi
const CTA_LEAD = 0.15;
const CTA_TAIL = 0.25;
const CAPTION_Y = 960;      // altyazi seridinin videodaki ust kenari
const CAPTION_H = 420;

const speechEnd = (alignment, fallback) => {
  const ends = alignment?.character_end_times_seconds;
  return ends?.length ? Math.min(fallback, ends[ends.length - 1] + 0.1) : fallback;
};

/** Altyazi karelerini tek sayfada cizer; her kare seffaf bir serit PNG'si. */
async function renderCaptionPngs(frames, dir, browser) {
  const context = await browser.newContext({ viewport: { width: 1080, height: CAPTION_H }, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await page.setContent(fillTemplate('reel-caption.html', {}), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const shot = async (texts, active, file) => {
      await page.evaluate(([t, a]) => window.setCaption(t, a), [texts, active]);
      writeFileSync(file, await page.screenshot({ type: 'png', omitBackground: true }));
    };
    const blank = join(dir, 'cap-blank.png');
    await shot([], -1, blank);
    const out = [];
    for (let i = 0; i < frames.length; i++) {
      const file = join(dir, `cap-${String(i).padStart(3, '0')}.png`);
      await shot(frames[i].texts, frames[i].active, file);
      out.push({ file, start: frames[i].start, end: frames[i].end });
    }
    return { blank, files: out };
  } finally {
    await context.close();
  }
}

/**
 * @param {object} o
 * @param {string} o.hook                     - ekrandaki kisa kanca basligi
 * @param {Array<{path: string, duration: number}>} o.clips - moderasyondan gecmis klipler (en az 1)
 * @param {string} o.voicePath                - soru sesi
 * @param {number} o.voiceDuration
 * @param {object} o.voiceAlignment           - ElevenLabs karakter zamanlamasi
 * @param {string} o.manaVoicePath            - cevap sesi
 * @param {number} o.manaVoiceDuration
 * @param {object} o.manaAlignment
 * @param {string} [o.ctaVoicePath]
 * @param {number} [o.ctaVoiceDuration]
 * @param {string} [o.audioPath]              - arka plan muzigi
 * @param {string} o.outPath
 * @returns {Promise<{totalLen: number, segments: number, captionFrames: number}>}
 */
export async function renderReelV2(o) {
  if (!o.hook?.trim()) throw new Error('renderReelV2: hook bos');
  if (!o.clips?.length) throw new Error('renderReelV2: klip yok');
  for (const k of ['voicePath', 'manaVoicePath']) {
    if (!o[k] || !existsSync(o[k])) throw new Error(`renderReelV2: ${k} yok`);
  }

  // ZAMAN PLANI
  const verseEnd = VOICE_START + speechEnd(o.voiceAlignment, o.voiceDuration);
  const manaStart = verseEnd + GAP;
  const manaEnd = manaStart + speechEnd(o.manaAlignment, o.manaVoiceDuration);
  const hasCtaVoice = !!o.ctaVoicePath && existsSync(o.ctaVoicePath) && o.ctaVoiceDuration > 0;
  const ctaStart = manaEnd + CTA_GAP;
  const ctaLen = hasCtaVoice ? CTA_LEAD + o.ctaVoiceDuration + CTA_TAIL : 1.2;
  const totalLen = ctaStart + ctaLen;

  const frames = [
    ...captionFrames(chunkWords(wordsFromAlignment(o.voiceAlignment)), VOICE_START),
    ...captionFrames(chunkWords(wordsFromAlignment(o.manaAlignment)), manaStart),
  ].filter((f) => f.start < ctaStart).map((f) => ({ ...f, end: Math.min(f.end, ctaStart) }));
  if (!frames.length) throw new Error('renderReelV2: altyazi karesi uretilemedi (zamanlama bos)');

  const segs = planSegments(o.clips, totalLen);

  const tmp = mkdtempSync(join(tmpdir(), 'reel-'));
  let browser = null;
  try {
    // launch try'in ICINDE: tarayici acilamazsa gecici klasor geride kalmasin
    // (2026-11-10'da olculdu: Chromium kurulu degilken bir bos klasor kaldi).
    // PLAYWRIGHT_CHANNEL=chrome: Chromium indirmeden kurulu Chrome ile yerel deneme.
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
    const badgePng = join(tmp, 'badge.png');
    const hookPng = join(tmp, 'hook.png');
    const ctaPng = join(tmp, 'cta.png');
    await renderHtmlToPng(fillTemplate('reel-gradient.html', {}), badgePng, browser);
    await renderHtmlToPng(fillTemplate('reel-hook.html', { hook: o.hook.trim() }), hookPng, browser);
    await renderHtmlToPng(fillTemplate('reel-cta.html', {
      KICKER: o.ctaKicker || 'İşine yaradıysa',
      SUB: o.ctaSub || 'Her gün yeni bir bilgi',
    }), ctaPng, browser);
    const caps = await renderCaptionPngs(frames, tmp, browser);
    const capList = join(tmp, 'captions.ffconcat');
    writeFileSync(capList, concatScript(caps.files, totalLen, caps.blank));
    console.log(`V2 overlay hazir: ${frames.length} altyazi karesi, ${segs.length} goruntu kesiti, ${totalLen.toFixed(1)}sn`);

    // GIRISLER: [0..K-1] klip kesitleri, sonra rozet, kanca, altyazi, CTA, sesler.
    const args = ['-y'];
    for (const s of segs) {
      args.push('-ss', String(s.offset), '-stream_loop', '-1', '-t', String(s.len + 0.5), '-i', s.path);
    }
    const K = segs.length;
    args.push(
      '-loop', '1', '-t', String(totalLen), '-i', badgePng,     // [K]
      '-loop', '1', '-t', String(ctaStart), '-i', hookPng,      // [K+1]
      '-f', 'concat', '-safe', '0', '-i', capList,              // [K+2]
      '-loop', '1', '-t', String(ctaLen), '-i', ctaPng          // [K+3]
    );
    let next = K + 4;
    const iVoice = next++;
    const iMana = next++;
    const iCta = hasCtaVoice ? next++ : -1;
    const hasMusic = !!o.audioPath && existsSync(o.audioPath);
    const iMusic = hasMusic ? next++ : -1;
    args.push('-i', o.voicePath, '-i', o.manaVoicePath);
    if (hasCtaVoice) args.push('-i', o.ctaVoicePath);
    if (hasMusic) args.push('-stream_loop', '-1', '-i', o.audioPath);

    const v = [];
    segs.forEach((s, i) => v.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,` +
      `trim=duration=${s.len},setpts=PTS-STARTPTS[s${i}]`));
    v.push(`${segs.map((_, i) => `[s${i}]`).join('')}concat=n=${K}:v=1:a=0[bg]`);
    v.push(`[${K}:v]scale=1080:1920:flags=lanczos[badge]`);
    // Kanca ilk kareden gorunur (fade-in yok), abone kartindan hemen once solar.
    v.push(`[${K + 1}:v]scale=1080:1920:flags=lanczos,format=rgba,fade=t=out:st=${(ctaStart - 0.2).toFixed(3)}:d=0.2:alpha=1[hook]`);
    v.push(`[${K + 2}:v]fps=30,scale=1080:${CAPTION_H}:flags=lanczos,format=rgba[cap]`);
    v.push(`[${K + 3}:v]scale=1080:1920:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.2:alpha=1,setpts=PTS+${ctaStart.toFixed(3)}/TB[cta]`);
    // eof_action=pass: overlay, girisi bitince son karesini sonsuza tekrar eder (hayalet yazi).
    v.push('[bg][badge]overlay=0:0[v1]');
    v.push('[v1][hook]overlay=0:0:eof_action=pass[v2]');
    v.push(`[v2][cap]overlay=0:${CAPTION_Y}:eof_action=pass[v3]`);
    v.push('[v3][cta]overlay=0:0:eof_action=pass[outv]');

    const ms = (sec) => Math.round(sec * 1000);
    const a = [];
    const voices = ['[vq]', '[va]'];
    a.push(`[${iVoice}:a]adelay=${ms(VOICE_START)}|${ms(VOICE_START)}[vq]`);
    a.push(`[${iMana}:a]adelay=${ms(manaStart)}|${ms(manaStart)}[va]`);
    if (hasCtaVoice) {
      a.push(`[${iCta}:a]adelay=${ms(ctaStart + CTA_LEAD)}|${ms(ctaStart + CTA_LEAD)}[vc]`);
      voices.push('[vc]');
    }
    const mix = `${voices.join('')}amix=inputs=${voices.length}:duration=longest:dropout_transition=0:normalize=0`;
    if (hasMusic) {
      a.push(`${mix}[allvoice]`);
      a.push('[allvoice]asplit=2[voice_out][voice_key_raw]');
      // apad SART: sidechain (konusma) bitince sidechaincompress muzigi de kesiyor.
      a.push(`[voice_key_raw]apad=whole_dur=${totalLen}[voice_key]`);
      a.push(`[${iMusic}:a]loudnorm=I=-28:TP=-3:LRA=11,afade=t=in:st=0:d=0.3,afade=t=out:st=${(totalLen - 0.4).toFixed(3)}:d=0.4[bgraw]`);
      a.push('[bgraw][voice_key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[bgduck]');
      a.push('[voice_out][bgduck]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[outa]');
    } else {
      a.push(`${mix}[outa]`);
    }

    args.push(
      '-filter_complex', [...v, ...a].join(';'),
      '-map', '[outv]', '-map', '[outa]',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-c:v', 'libx264', '-preset', 'slower', '-crf', '14',
      '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', '30',
      '-maxrate', '20M', '-bufsize', '40M', '-movflags', '+faststart',
      '-t', String(totalLen),
      o.outPath
    );
    await ffmpeg(args);
    console.log(`V2 reel hazir: ${o.outPath}`);
    return { totalLen, segments: K, captionFrames: frames.length };
  } finally {
    try { await browser?.close(); } catch {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
