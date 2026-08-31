/**
 * TURKCE KARAKTER DENETIMI - tum icerik dosyalarini tarar.
 *
 * Neden: AI ile uretilen/duzenlenen metinlerde Turkce karakterler bazen ASCII'ye
 * dusuyor ("camasir", "yumusatici", "degil"). Bu videoda gorunuyor ve okunmaz hale
 * getiriyor. 20 Ags 2026'da komsu-longform.json'da 15 kayit bu sekilde yayina gitti.
 *
 * Iki kontrol var:
 * 1) UZUN METIN: 80+ karakterlik Turkce cumlede en az bir Turkce karakter (cgiosu)
 *    BULUNMALI. Kelime listesine dayali kontrol yanlis alarm veriyordu ("kokusu",
 *    "kirli" dogru kelimeler).
 * 2) KISA ALAN (concept gibi): kisa alanda uzunluk kurali calismaz ("Kar neden beyaz"
 *    dogru ama hic Turkce karakteri yok). Bunun yerine ayni kaydin uzun alanlariyla
 *    karsilastirilir: kelimenin ASCII hali uzun metinde geciyor ama yazimi farkliysa
 *    (concept "Sogan", verse "Soğan") kisa alan bozuktur. concept alani YouTube
 *    basligina ve etiketine gidiyor, orada bozuk gorunuyor.
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
// _ ile baslayan alanlar gelistirici notu (_readme, _note): videoda gorunmez.
const SKIP_KEY = /^_|pexels|query|url|^id$|photo|thumb|mood|source/i;
const MIN_LEN = 80;

const ASCII_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
// Turkce'ye ozel kucultme: JS toLowerCase() 'I' harfini 'i' yapar, Turkce'de 'i' olmali.
const trLower = (w) => w.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
const toAscii = (w) => trLower(w).replace(/[çğıöşü]/g, (c) => ASCII_MAP[c]);
const words = (t) => t.match(/[\p{L}]+/gu) || [];

// Kisa alan (concept) ile ayni kaydin uzun alanlarini karsilastirir.
// Ayni kelimenin ASCII hali eslesip yazimi farkliysa kisa alan bozulmus demektir.
function shortFieldIssues(entry, shortKeys = ['concept', 'material', 'title']) {
  const longText = ['verse', 'explanation', 'caption', 'text', 'question', 'answer']
    .map((k) => entry?.[k]).filter((v) => typeof v === 'string').join(' ');
  if (!longText) return [];
  const ref = new Map();
  for (const w of words(longText)) if (!ref.has(toAscii(w))) ref.set(toAscii(w), w);
  const out = [];
  for (const key of shortKeys) {
    const val = entry?.[key];
    if (typeof val !== 'string' || !val) continue;
    for (const w of words(val)) {
      const proper = ref.get(toAscii(w));
      // Sadece tek yon: kisa alan ASCII'ye dusmus, uzun metin dogru yazilmis.
      // Ters yon yanlis alarm veriyor ("ise" bagaci ile "ise" ASCII'de ayni).
      if (proper && !TR.test(w) && TR.test(proper) && trLower(proper) !== trLower(w)) {
        out.push(`${key}: "${w}" -> metinde "${proper}" yaziliyor`);
      }
    }
  }
  return out;
}

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
  // Kisa alan kontrolu: kayit listesi olan dosyalarda concept vb.
  const entries = Array.isArray(data) ? data : (Array.isArray(data?.videos) ? data.videos : []);
  for (const e of entries) {
    for (const msg of shortFieldIssues(e)) bad.push([e.id || e.material || '?', msg]);
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
