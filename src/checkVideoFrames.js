import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isImageBufferSpiritual } from './checkPhoto.js';

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}\n${stderr.slice(-1500)}`)));
    proc.on('error', reject);
  });
}

/**
 * Videodan eşit aralıklarla 5 kare çıkarır.
 * @returns {Promise<string[]>} - PNG kare dosyalarının yolları
 */
async function extractFrames(videoPath, durationSec, count = 4) {
  const tmp = mkdtempSync(join(tmpdir(), 'frames-'));
  // Eşit aralıklarla böl: 3 frame için %25, %50, %75
  const positions = Array.from({ length: count }, (_, i) => durationSec * ((i + 1) / (count + 1)));

  const framePaths = [];
  for (let i = 0; i < positions.length; i++) {
    const out = join(tmp, `frame-${i}.png`);
    await ffmpeg([
      '-y', '-ss', positions[i].toFixed(2), '-i', videoPath,
      '-frames:v', '1', '-q:v', '2', out
    ]);
    framePaths.push(out);
  }
  return { tmpDir: tmp, framePaths };
}

async function checkFrame(framePath, geminiKey) {
  const buf = readFileSync(framePath);
  return await isImageBufferSpiritual(buf, 'image/png', geminiKey);
}

/**
 * Pexels videosundan 5 kare çıkarıp her birini Gemini moderasyonundan geçirir.
 * Tüm kareler onay alırsa video uygundur.
 *
 * @param {string} videoPath - lokal MP4 yolu
 * @param {number} durationSec - videonun toplam süresi
 * @param {string} geminiKey
 * @returns {Promise<{approved: boolean, reason?: string}>}
 */
export async function validateVideoFrames(videoPath, durationSec, geminiKey, frameCount = 6) {
  if (!geminiKey) return { approved: true, reason: 'no-gemini-key-skipped' };

  const { tmpDir, framePaths } = await extractFrames(videoPath, durationSec, frameCount);
  try {
    for (let i = 0; i < framePaths.length; i++) {
      const result = await checkFrame(framePaths[i], geminiKey);
      if (!result.approved) {
        if (result.reason === 'quota-exceeded-skipped') {
          console.log(`Kare ${i + 1}/${frameCount} quota aşıldı, atlanıyor.`);
          continue;
        }
        return { approved: false, reason: `kare ${i + 1}/${frameCount} reddedildi: ${result.reason}` };
      }
      console.log(`Kare ${i + 1}/${frameCount} onayli`);
    }
    return { approved: true };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
