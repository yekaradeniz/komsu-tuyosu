/**
 * ElevenLabs Text-to-Speech entegrasyonu.
 *
 * Idempotent: ayni metin icin bir kez API'ye gider, sonra cache'den okur.
 * Cache: output/audio-cache/<sha1-of-text>.mp3
 *
 * Boylece beyit tekrar render edilse bile (retry vs.) tekrar API'ye gitmez.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

// Zihnimizin Sirlari TTS ayarlari.
// Default speed 1.0 (cevap icin): cevapta noktalama yogun, dogal tempoda okunur.
// SORU icin cli-render'da speed 0.9 verilir (noktalama az oldugu icin 1.0'da cok hizli).
const DEFAULT_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.95,
  style: 0,
  use_speaker_boost: true,
  speed: 1.0
};

function cacheKey(text, voiceId, settings) {
  const hash = createHash('sha1')
    .update(text + '|' + voiceId + '|' + JSON.stringify(settings))
    .digest('hex')
    .slice(0, 16);
  return hash;
}

/**
 * Beyit/metin icin ElevenLabs sesi uretir. Cache varsa ondan okur.
 * @param {object} opts
 * @param {string} opts.text         - Seslendirilecek metin
 * @param {string} opts.voiceId      - ElevenLabs voice ID
 * @param {string} opts.apiKey       - ElevenLabs API key
 * @param {string} opts.cacheDir     - Cache klasoru (yoksa olusturulur)
 * @param {object} [opts.settings]   - voice_settings override (default Salih Baba ayarlari)
 * @param {string} [opts.model]      - Model ID (default eleven_multilingual_v2)
 * @returns {Promise<string>} - MP3 dosyasinin lokal yolu
 */
export async function generateVoice({ text, voiceId, apiKey, cacheDir, settings = DEFAULT_SETTINGS, model = DEFAULT_MODEL }) {
  if (!text || !text.trim()) throw new Error('generateVoice: text bos');
  if (!voiceId) throw new Error('generateVoice: voiceId yok');
  if (!apiKey) throw new Error('generateVoice: apiKey yok');

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  const key = cacheKey(text, voiceId, settings);
  const outPath = join(cacheDir, `${key}.mp3`);

  if (existsSync(outPath)) {
    console.log(`  Voice cache hit: ${key}.mp3`);
    return outPath;
  }

  console.log(`  Voice cache miss: ElevenLabs API'ye request (${text.length} char)...`);
  const res = await fetch(`${API_BASE}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: settings
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API basarisiz (${res.status}): ${body.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(`  Voice uretildi: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  return outPath;
}

/**
 * MP3 dosyasinin saniye cinsinden suresini olcer.
 * ffprobe veya ffmpeg kullanir (ikisi de yoksa MP3 frame analizi ile fallback).
 */
export async function getAudioDuration(mp3Path) {
  // Once ffprobe dene (en hassas)
  try {
    const dur = await runProbe('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path]);
    const sec = parseFloat(dur);
    if (Number.isFinite(sec) && sec > 0) return sec;
  } catch {}

  // ffprobe yoksa, ffmpeg-static yanindaki ffprobe'u dene
  try {
    const { default: ffmpegPath } = await import('ffmpeg-static');
    const ffprobePath = ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
    if (existsSync(ffprobePath)) {
      const dur = await runProbe(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path]);
      const sec = parseFloat(dur);
      if (Number.isFinite(sec) && sec > 0) return sec;
    }
  } catch {}

  // ffmpeg ile stderr'dan parse et (en duzgun fallback)
  const ffmpegCmd = process.env.FFMPEG_PATH || 'ffmpeg';
  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegCmd, ['-i', mp3Path, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', () => {
        const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (m) resolve(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
        else reject(new Error('Sure parse edilemedi'));
      });
      proc.on('error', reject);
    });
  } catch (e) {
    console.warn(`Audio sure olcumu basarisiz: ${e.message}, varsayilan 14sn`);
    return 14;
  }
}

function runProbe(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`exit ${code}`)));
    proc.on('error', reject);
  });
}
