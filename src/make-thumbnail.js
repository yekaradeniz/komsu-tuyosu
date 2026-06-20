/**
 * Komşu long-form video icin YouTube kapagi (1280x720) uretir.
 * Tamamen otomasyon dostu: arka plani videodan bir kare alir (Pexels'e gerek yok),
 * uzerine "tum videoyu anlatan" metni (baslik + N tuyo) HTML/Playwright ile basar.
 *
 * Kullanim:
 *   node src/make-thumbnail.js                         # output/komsu-longform-01.mp4 -> output/komsu-thumb.png
 *   node src/make-thumbnail.js <video.mp4> <out.png>
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'template');
const OUT_DIR = join(ROOT, 'output');

const ffmpegPath = (await import('ffmpeg-static')).default;
const FFMPEG = process.env.FFMPEG_PATH || ffmpegPath || 'ffmpeg';

const args = process.argv.slice(2);
// Meta varsa o haftanin secilmis tuyolarini + videosunu kullan (render yazar)
const META_PATH = join(OUT_DIR, 'komsu-longform-meta.json');
const meta = existsSync(META_PATH) ? JSON.parse(readFileSync(META_PATH, 'utf-8')) : null;
const videoPath = args[0] || (meta && meta.videoPath) || join(OUT_DIR, 'komsu-longform.mp4');
const outPath = args[1] || join(OUT_DIR, 'komsu-thumb.png');

function ffmpeg(a) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-800)}`)));
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

const data = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-longform.json'), 'utf-8'));
// Kapak listesi: meta varsa o haftanin 5 tuyosu, yoksa havuzun ilk perWeek tanesi
const perWeek = data.perWeek || 5;
const listItems = meta && meta.items && meta.items.length
  ? meta.items
  : (data.content || data.items || []).filter(u => u.question && u.answer).slice(0, perWeek);
const N = listItems.length;

const topLine = (meta && meta.thumbTop) || data.thumbTop || 'Bu Haftanın';
const bigLine = (meta && meta.thumbBig) || data.thumbBig || `<span class="hl">${N}</span> Pratik Tüyosu`;
const chips = listItems
  .map(it => `<span class="chip"><span class="tick">✓</span>${it.keyword || it.title}</span>`)
  .join('');

const tmp = mkdtempSync(join(tmpdir(), 'thumb-'));
try {
  // 1) Videodan arka plan karesi (intro/temiz ev sahnesi - 5. saniye)
  const framePng = join(tmp, 'frame.png');
  await ffmpeg(['-y', '-ss', '5', '-i', videoPath, '-frames:v', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', framePng]);
  const bgDataUri = 'data:image/png;base64,' + readFileSync(framePng).toString('base64');

  // 2) HTML doldur + render
  const html = fillTemplate('lf-komsu-thumb.html', { bgImage: bgDataUri, topLine, bigLine, chips });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 500));
    const buf = await page.screenshot({ type: 'png' });
    // 2x render -> 1280x720'e indir (keskinlik), JPEG'e yakin boyut icin png yeter (<2MB YouTube limiti)
    writeFileSync(join(tmp, 'thumb-2x.png'), buf);
    await page.close(); await ctx.close();
  } finally {
    await browser.close();
  }
  // 3) 2x PNG'yi 1280x720'e olcekle + kalite
  await ffmpeg(['-y', '-i', join(tmp, 'thumb-2x.png'),
    '-vf', 'scale=1280:720:flags=lanczos', '-frames:v', '1', outPath]);

  console.log(`✓ Kapak hazir: ${outPath}`);
} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
