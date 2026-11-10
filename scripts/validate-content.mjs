/**
 * ICERIK SAGLIK KONTROLU - gelecekte ayni sorunlara dusmemek icin.
 *
 * Olculen kurallar (2026-08-20 veri + arastirma):
 *  - Video 20 saniyeyi gecmemeli: 0-20sn ort 1331 izlenme, 20-25sn 540, 25-30sn 459.
 *  - Baslik ortadan kesilmemeli: baslik verse'in ILK CUMLESI, o yuzden ilk cumle
 *    88 karakteri gecmemeli.
 *  - Verse 2 tam cumle olmali (kisa/kesik hook kotu duruyor, cok uzun video sisiriyor).
 *
 * Kullanim:
 *   node scripts/validate-content.mjs            # rapor (exit 0)
 *   node scripts/validate-content.mjs --strict   # ihlal varsa exit 1
 *   node scripts/validate-content.mjs --next 1   # sadece siradaki N icerik (CI icin)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CONTENT = process.env.CONTENT_FILE || (existsSync(join(ROOT, 'content', 'komsu-tuyosu.json'))
  ? 'komsu-tuyosu.json' : 'beyin-oyunlari.json');

// KALIBRE EDILDI (20 Ags 2026, gercek ses dosyalari + render olcumu):
// 100ch verse = 7.2sn, 161ch cevap = 11.0sn -> ~14.2 karakter/saniye.
// Ayni videonun gercek suresi 21.8sn oldu -> sabit sahne payi 3.6sn.
// (Once 16 CPS / 3.25sn varsayilmisti, tahminler ~2sn iyimser cikiyordu.)
const CPS = 14.2;
const OVERHEAD = 3.6;

const LIM = {
  verseMin: 85, verseMax: 120,
  firstSentenceMax: 88,      // baslik bu cumleden uretiliyor
  explMin: 120, explMax: 190,
  videoMaxSec: 22
};

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const nextIdx = args.indexOf('--next');
const nextN = nextIdx >= 0 ? parseInt(args[nextIdx + 1] || '1', 10) : null;

const content = JSON.parse(readFileSync(join(ROOT, 'content', CONTENT), 'utf-8'));
const logPath = join(ROOT, 'output', process.env.STATE_FILE || 'log.json');
const posted = existsSync(logPath)
  ? new Set((JSON.parse(readFileSync(logPath, 'utf-8')).postedVerseIds) || [])
  : new Set();

let pool = content.filter(e => !posted.has(e.id));
if (nextN) pool = pool.slice(0, nextN);

const issues = [];
for (const e of pool) {
  const v = (e.verse || '').trim();
  const x = (e.explanation || '').trim();
  const first = (v.split('\n')[0] || '').trim();
  const m = first.match(/^(.{15,95}?[.?!])(\s|$)/);
  const firstSentence = m ? m[1] : first;
  // V2 olcumu (2026-11-10, nt-102): 250 karakter = 18.9sn gercek video. Soru-cevap
  // arasi bosluk ve kapanis fade'i kalktigi icin sabit pay 3.6 yerine 1.3sn.
  const sec = (v.length + x.length) / CPS + (e.format === 'v2' ? 1.3 : OVERHEAD);
  const add = (msg) => issues.push({ id: e.id, msg });

  if (!v) add('verse BOS');
  if (!x) add('explanation BOS');
  if (v.length > LIM.verseMax) add(`verse cok uzun (${v.length}ch > ${LIM.verseMax})`);
  if (v.length && v.length < LIM.verseMin) add(`verse cok kisa (${v.length}ch < ${LIM.verseMin})`);
  if (firstSentence.length > LIM.firstSentenceMax) add(`ilk cumle ${firstSentence.length}ch > ${LIM.firstSentenceMax} - BASLIK KESILIR`);
  if (x.length > LIM.explMax) add(`cevap cok uzun (${x.length}ch > ${LIM.explMax})`);
  if (x.length && x.length < LIM.explMin) add(`cevap cok kisa (${x.length}ch < ${LIM.explMin})`);
  if (sec > LIM.videoMaxSec) add(`video ~${sec.toFixed(1)}sn > ${LIM.videoMaxSec}sn (retention riski)`);
  // V2 format: ilk karedeki kanca basligi ve goruntu kesitleri icin 4 sorgu sart.
  if (e.format === 'v2') {
    const h = (e.hook || '').trim();
    if (!h) add('v2: hook BOS (ilk karedeki kanca basligi)');
    else if (h.length < 10 || h.length > 34) add(`v2: hook ${h.length}ch, 10-34 arasi olmali (3 satira sigmali)`);
    if (!Array.isArray(e.pexelsQuery) || e.pexelsQuery.length < 4) add('v2: en az 4 pexelsQuery gerekli (her kesit ayri goruntu)');
  }
  if (v && !/[.?!]$/.test(v)) add('verse noktalama ile bitmiyor');
  if (x && !/[.?!]$/.test(x)) add('cevap noktalama ile bitmiyor');
  // Sadece GERCEKTEN bozuk yazimlar: "gibi"/"neden" dogru Turkce kelimeler, onlari sayma.
  const bozuk = v.match(/\b(cok|icin|sey|nasil|guzel|kucuk|buyuk|deger|ogren|dusun|gunluk|surekli|calis)\b/g);
  if (bozuk) add(`Turkce karakter bozuk: ${[...new Set(bozuk)].join(', ')}`);
}

const byId = {};
for (const i of issues) (byId[i.id] ||= []).push(i.msg);
const ids = Object.keys(byId);

console.log(`Icerik kontrolu: ${CONTENT} | incelenen ${pool.length} kayit`);
if (!ids.length) {
  console.log('✓ Sorun yok, tum kurallar saglaniyor.');
  process.exit(0);
}
console.log(`⚠ ${ids.length} kayitta sorun:`);
for (const id of ids.slice(0, 25)) console.log(`  ${id}: ${byId[id].join(' | ')}`);
if (ids.length > 25) console.log(`  ... ve ${ids.length - 25} kayit daha`);
const sec = pool.map(e => ((e.verse || '').length + (e.explanation || '').length) / CPS + OVERHEAD);
console.log(`\nTahmini sure: ort ${(sec.reduce((a, b) => a + b, 0) / sec.length).toFixed(1)}sn | 20sn alti: ${sec.filter(s => s <= 20).length}/${sec.length}`);
process.exit(strict ? 1 : 0);
