/**
 * Icerik dosyalarindaki nisleri seo-templates.json ile senkronlar.
 *
 * Yeni bir nis eklendiginde SEO zaten otomatik calisir (icerikten turetme),
 * ama turetilmis etiketler cekimli kelimeler icerebiliyor. Bu script eksik
 * nisleri template'e YAZAR, boylece:
 *   1. Etiketler kalicilasir (her calistirmada degismez, gecmis videolarla tutarli)
 *   2. Insan istedigi zaman duzeltir, kod degismez
 *
 * Kullanim:
 *   node scripts/sync-niches.mjs            # eksikleri template'e ekle
 *   node scripts/sync-niches.mjs --check    # eksik varsa exit 1 (CI icin)
 *   node scripts/sync-niches.mjs --dry      # ne eklenecegini goster, yazma
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nicheDefinition, loadTemplates, _resetCache } from '../src/seoTemplate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'content');
const TPL_PATH = join(DIR, process.env.SEO_TEMPLATE_FILE || 'seo-templates.json');
const CHECK = process.argv.includes('--check');
const DRY = process.argv.includes('--dry');

const tpl = loadTemplates();
// Nis alani olan profili bul (match.hasField).
const [profileName, profile] = Object.entries(tpl.profiles).find(([, p]) => p.match?.hasField) || [];
if (!profile) { console.error('nis profili yok, yapacak is yok'); process.exit(0); }
const field = profile.match.hasField;

// Tum icerik dosyalarindaki nisleri topla, her nis icin ornek kayitlar.
const byNiche = new Map();
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json') && x !== 'seo-templates.json')) {
  let data;
  try { data = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
  const list = Array.isArray(data) ? data : (Array.isArray(data?.videos) ? data.videos : []);
  for (const e of list) {
    const key = e?.[field];
    if (!key) continue;
    if (!byNiche.has(key)) byNiche.set(key, []);
    byNiche.get(key).push(e);
  }
}

const known = new Set(Object.keys(profile.niches || {}));
const missing = [...byNiche.keys()].filter((k) => !known.has(k));

console.log(`${byNiche.size} nis bulundu, ${known.size} tanimli, ${missing.length} eksik.`);
if (!missing.length) { console.log('✓ Template guncel.'); process.exit(0); }

// Eksik nisler icin ornek kayitlardan ortak etiket/hashtag turet.
const additions = {};
for (const key of missing) {
  const samples = byNiche.get(key);
  const tagCount = new Map();
  const hashCount = new Map();
  let topic = '';
  for (const e of samples) {
    const def = nicheDefinition(e);
    if (!def) continue;
    if (!topic) topic = def.topic || '';
    for (const t of def.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    for (const h of def.hashtags || []) hashCount.set(h, (hashCount.get(h) || 0) + 1);
  }
  // Nisin BUTUNUNDE sik gecen kelimeler tek videonunkinden iyi etiket olur.
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([k]) => k);
  additions[key] = {
    topic: samples[0]?.nicheLabel || topic || key,
    tags: top(tagCount, 4),
    hashtags: top(hashCount, 5),
    _auto: `${samples.length} kayittan turetildi, elle duzeltilebilir`,
  };
  console.log(`+ ${key}: topic="${additions[key].topic}" tags=[${additions[key].tags.join(', ')}]`);
}

if (CHECK) { console.error(`\n✗ ${missing.length} nis template'te tanimli degil. 'node scripts/sync-niches.mjs' calistir.`); process.exit(1); }
if (DRY) { console.log('\n(DRY RUN, yazilmadi)'); process.exit(0); }

const raw = JSON.parse(readFileSync(TPL_PATH, 'utf-8'));
raw.profiles[profileName].niches = { ...raw.profiles[profileName].niches, ...additions };
writeFileSync(TPL_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
_resetCache();
console.log(`\n✓ ${missing.length} nis template'e eklendi: ${TPL_PATH.replace(ROOT + '/', '')}`);
