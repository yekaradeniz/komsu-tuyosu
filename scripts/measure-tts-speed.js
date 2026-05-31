// Soru ve Cevap sesini ElevenLabs ile uret, suresini ve WPM'ini olc.
// Amac: kullanicinin "soru hizli, cevap yavas" iddiasini sayilarla dogrula.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateVoice, getAudioDuration } from '../src/generateVoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE = join(ROOT, 'output', 'audio-cache');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
if (!apiKey || !voiceId) { console.error('ENV eksik'); process.exit(1); }

const content = JSON.parse(readFileSync(join(ROOT, 'content', 'beyin-oyunlari.json'), 'utf-8'));
const id = process.argv[2] || 'bo-0005';
const entry = content.find(e => e.id === id);
if (!entry) { console.error('entry yok'); process.exit(1); }

const targets = [
  { label: 'SORU', text: entry.verse },
  { label: 'CEVAP', text: entry.explanation }
];

console.log(`\n=== ${id} ${entry.concept} ===\n`);

for (const t of targets) {
  const path = await generateVoice({ text: t.text, voiceId, apiKey, cacheDir: CACHE });
  const dur = await getAudioDuration(path);
  const words = t.text.split(/\s+/).filter(Boolean).length;
  const chars = t.text.length;
  const wpm = (words / dur) * 60;
  const cps = chars / dur; // karakter/saniye
  console.log(`${t.label}:`);
  console.log(`  Metin: ${t.text.length} char, ${words} kelime`);
  console.log(`  Sure: ${dur.toFixed(2)} sn`);
  console.log(`  Hiz: ${wpm.toFixed(1)} kelime/dakika`);
  console.log(`  Hiz: ${cps.toFixed(1)} karakter/saniye`);
  console.log();
}
