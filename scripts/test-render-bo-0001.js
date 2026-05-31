// Pexels API olmadan lokal test render.
// 33sn koyu lacivert + sutil noise gradient mp4 olusturur,
// uzerine bo-0001 verse + explanation overlay'i ekler, music yoksa sessiz.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { renderReel } from '../src/renderReel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const content = JSON.parse(readFileSync(join(ROOT, 'content', 'beyin-oyunlari.json'), 'utf-8'));
const entry = content[0]; // bo-0001 Schadenfreude

const bgPath = join(ROOT, 'output', '_bg-test.mp4');
const outPath = join(ROOT, 'output', 'bo-0001-test.mp4');

// 33sn 1080x1920 koyu lacivert gradient mp4 olustur (ffmpeg lavfi color + noise)
function makeBackground() {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=0x0a1633:s=1080x1920:d=33:r=30',
      '-vf', 'noise=alls=8:allf=t+u,vignette=PI/4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      bgPath
    ];
    const proc = spawn(ffmpegStatic, args, { stdio: 'inherit' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

console.log('1) Arka plan video olusturuluyor...');
await makeBackground();
console.log('2) Reel render ediliyor (text overlay + arka plan)...');
await renderReel({
  verse: entry.verse,
  explanation: entry.explanation,
  videoPath: bgPath,
  audioPath: null,
  outPath
});
console.log(`\n✓ Test reel hazir: ${outPath}`);
