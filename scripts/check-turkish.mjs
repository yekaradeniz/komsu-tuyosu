/**
 * TURKCE KARAKTER DENETIMI - tum icerik dosyalarini tarar.
 *
 * Neden: AI ile uretilen/duzenlenen metinlerde Turkce karakterler bazen ASCII'ye
 * dusuyor ("camasir", "yumusatici", "degil"). Bu videoda gorunuyor ve okunmaz hale
 * getiriyor. 20 Ags 2026'da komsu-longform.json'da 15 kayit bu sekilde yayina gitti.
 *
 * Yontem: uzun bir Turkce metinde en az bir Turkce karakter (cgiosu) BULUNMALI.
 * 80+ karakterlik Turkce cumlede hic yoksa metin bozuktur. Kelime listesine dayali
 * kontrol yanlis alarm veriyordu ("kokusu", "kirli" dogru kelimeler).
 *
 * Kullanim: node scripts/check-turkish.mjs [--strict]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'content');
const TR = /[çğıöşüÇĞİÖŞÜ]/;
const SKIP_KEY = /pexels|query|url|^id$|photo|thumb|mood|source/i;
const MIN_LEN = 80;

function* walk(o, path = '') {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) yield* walk(o[i], `${path}[${i}]`); }
  else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) yield* walk(v, path ? `${path}.${k}` : k); }
  else if (typeof o === 'string') yield [path, o];
}

let total = 0;
for (const f of readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  let data;
  try { data = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
  const bad = [];
  for (const [p, t] of walk(data)) {
    if (t.length < MIN_LEN) continue;
    const leaf = p.split('.').pop().replace(/\[\d+\]/g, '');
    if (SKIP_KEY.test(leaf)) continue;
    if (!TR.test(t)) bad.push([p, t.slice(0, 70)]);
  }
  if (bad.length) {
    total += bad.length;
    console.log(`✗ ${basename(f)}: ${bad.length} alanda TURKCE KARAKTER YOK`);
    for (const [p, t] of bad.slice(0, 5)) console.log(`    ${p}: ${t}...`);
    if (bad.length > 5) console.log(`    ... ve ${bad.length - 5} alan daha`);
  } else {
    console.log(`✓ ${basename(f)}: temiz`);
  }
}
console.log(total ? `\n⚠ TOPLAM ${total} bozuk alan` : '\n✓ Tum icerik dosyalari temiz');
process.exit(total && process.argv.includes('--strict') ? 1 : 0);
