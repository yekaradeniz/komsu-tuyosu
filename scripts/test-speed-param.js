// ElevenLabs voice_settings.speed parametresi destekleniyor mu test et.
// CEVAP metnini speed=1.15 ile uret, sure ve hizi olc.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAudioDuration } from '../src/generateVoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'output', 'audio-test');
mkdirSync(OUT, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;

const text = '"Seyirci etkisi" - "başkası yardım eder" düşüncesi sorumluluğu dağıtır. Tek başına olan kişi %85 ihtimalle yardım ederken, kalabalıktayken bu oran %30\'a düşer.';

async function makeVoice(speed, fname) {
  const settings = { stability: 0.5, similarity_boost: 0.95, style: 0, use_speaker_boost: true, speed };
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(OUT, fname);
  writeFileSync(path, buf);
  return path;
}

const words = text.split(/\s+/).filter(Boolean).length;
const chars = text.length;

for (const speed of [1.0, 1.1, 1.15, 1.2]) {
  try {
    const path = await makeVoice(speed, `speed-${speed}.mp3`);
    const dur = await getAudioDuration(path);
    const wpm = (words / dur) * 60;
    console.log(`speed=${speed}: ${dur.toFixed(2)}sn, ${wpm.toFixed(1)} wpm, ${(chars/dur).toFixed(1)} cps`);
  } catch (e) {
    console.error(`speed=${speed}: HATA - ${e.message}`);
  }
}
