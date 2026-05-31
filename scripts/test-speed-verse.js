// SORU metni icin speed parametrelerini test et (yavaslatmak icin).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAudioDuration } from '../src/generateVoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'output', 'audio-test');
mkdirSync(OUT, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;

const text = 'Kalabalıkta neden birine yardım edilmez?';

async function makeVoice(speed, fname) {
  const settings = { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed };
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0,200)}`);
  const path = join(OUT, fname);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

const words = text.split(/\s+/).filter(Boolean).length;
const chars = text.length;

console.log(`Metin: "${text}" (${chars} char, ${words} kelime)\n`);

for (const speed of [0.8, 0.85, 0.9, 0.95, 1.0]) {
  try {
    const path = await makeVoice(speed, `verse-speed-${speed}.mp3`);
    const dur = await getAudioDuration(path);
    const wpm = (words / dur) * 60;
    console.log(`speed=${speed}: ${dur.toFixed(2)}sn, ${wpm.toFixed(1)} wpm  →  ${path}`);
  } catch (e) {
    console.error(`speed=${speed}: ${e.message}`);
  }
}
