/**
 * SEO TEMPLATE MOTORU
 *
 * Butun SEO metinleri, etiketleri ve seri ayarlari content/seo-templates.json
 * icinde. Bu dosya sadece motor: profil secer, sablon doldurur, etiket uretir.
 *
 * Amac: yeni bir nis ya da yeni bir seri test ederken KOD DEGISMESIN.
 *  - Yeni nis: icerik dosyasina 'niche' alanli kayit ekle, baska hicbir sey yapma.
 *    Template'te tanimi yoksa etiket ve hashtag icerikten otomatik turetilir.
 *  - Kaliteyi yukseltmek istersen template'e nis tanimi ekle, override eder.
 *  - Yeni seri/kanal: profiles altina profil ekle, match kuralini yaz.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_FILE = process.env.SEO_TEMPLATE_FILE || 'seo-templates.json';

let cache = null;
export function loadTemplates() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'content', TEMPLATE_FILE), 'utf-8'));
  return cache;
}
export function _resetCache() { cache = null; }

/** Kayda uyan profili secer. match.hasField oncelikli, match.default fallback. */
export function resolveProfile(entry, tpl = loadTemplates()) {
  const profiles = Object.entries(tpl.profiles);
  for (const [name, p] of profiles) {
    const f = p.match?.hasField;
    if (f && entry?.[f]) return { name, ...p };
  }
  const def = profiles.find(([, p]) => p.match?.default);
  if (!def) throw new Error('seo-templates: default profil tanimli degil');
  return { name: def[0], ...def[1] };
}

const TR_LOWER = (s) => String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
const TR_UPPER_FIRST = (s) => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);

/**
 * Icerikten anahtar kelime turetir. Tanimsiz nisler icin kullanilir, boylece
 * yeni nis eklendiginde etiketler bos kalmaz.
 * Kelimeler oldugu gibi alinir: Turkce'de govde ayirma (ek kirpma) yanlis
 * kelimeler uretiyor ("karincanin" -> "karinca" guvenli degil, "yagmurluk"
 * -> "yagmur" degil). Frekans ve uzunluk yeterli sinyal veriyor.
 */
export function deriveKeywords(entry, tpl = loadTemplates()) {
  const cfg = tpl.autoDerive || {};
  const stop = new Set((cfg.stopwords || []).map(TR_LOWER));
  const minLen = cfg.minWordLength || 5;
  const text = [entry?.concept, entry?.verse, entry?.explanation].filter(Boolean).join(' ');
  const bad = cfg.badSuffixes || [];
  const freq = new Map();
  for (const raw of text.match(/[\p{L}]+/gu) || []) {
    const w = TR_LOWER(raw);
    if (w.length < minLen || stop.has(w)) continue;
    // Cekimli kelime etiket olmaz: '#yasayabiliyor', '#govdesindeki' kotu duruyor.
    if (bad.some((suf) => w.endsWith(suf) && w.length > suf.length + 2)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  // Once concept kelimeleri (konuyu en iyi anlatan), sonra frekans, sonra uzunluk.
  const conceptWords = new Set((entry?.concept || '').match(/[\p{L}]+/gu)?.map(TR_LOWER) || []);
  return [...freq.entries()]
    .sort((a, b) => (conceptWords.has(b[0]) - conceptWords.has(a[0])) || (b[1] - a[1]) || (b[0].length - a[0].length))
    .map(([w]) => w);
}

/** Nis tanimi: template'te varsa o, yoksa icerikten turetilmis otomatik tanim. */
export function nicheDefinition(entry, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const key = entry?.niche;
  const defined = key && profile.niches?.[key];
  if (defined) return { ...defined, source: 'template' };
  if (!profile.autoDerive) return null;
  const words = deriveKeywords(entry, tpl);
  const cfg = tpl.autoDerive || {};
  // Konu adi: icerikte nicheLabel varsa o, yoksa concept'in ilk kelimesi.
  // Nis anahtari ASCII yazildigi icin ('bocek') dogrudan metne konulmaz.
  // Concept'in ILK kelimesi (metin sirasi): 'Hamambocegi dayanikliligi' -> 'hamambocegi'.
  // Siralama frekansa gore yapilirsa uzun olan one geciyor ve konu bozuluyor.
  const conceptWords = deriveKeywords({ concept: entry?.concept }, tpl);
  const conceptOrder = ((entry?.concept || '').match(/[\p{L}]+/gu) || []).map(TR_LOWER);
  const conceptFirst = conceptOrder.find((w) => conceptWords.includes(w));
  return {
    topic: entry?.nicheLabel || conceptFirst || words[0] || String(key || ''),
    tags: words.slice(0, cfg.maxTags || 4),
    hashtags: words.slice(0, cfg.maxHashtags || 4).map((w) => `#${w.replace(/\s+/g, '')}`),
    source: 'auto',
  };
}

/** YouTube etiketleri. Sira: konu (concept) > nis/mood > profil tabani. */
export function buildTagsFor(entry, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const out = [];
  if (entry?.concept?.trim()) out.push(TR_LOWER(entry.concept.trim()));
  const def = nicheDefinition(entry, tpl);
  if (def) out.push(...(def.tags || []));
  else for (const m of entry?.moods || []) out.push(...(profile.moodTags?.[m] || []));
  out.push(...(profile.baseTags || []));
  return [...new Set(out)].slice(0, 15);
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildHashtagsFor(entry, seed, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const def = nicheDefinition(entry, tpl);
  const pool = def ? (def.hashtags || []) : (profile.hashtagPool || []);
  const n = profile.hashtagCount ?? 4;
  return [...(profile.hashtagCore || []), ...seededShuffle(pool, seed).slice(0, n)];
}

/** {degisken} ve {playlist.ad} yer tutucularini doldurur. */
export function render(str, vars, tpl = loadTemplates()) {
  return String(str).replace(/\{([\w.]+)\}/g, (m, key) => {
    if (key.startsWith('playlist.')) {
      const id = tpl.playlists?.[key.slice(9)];
      return id ? `https://www.youtube.com/playlist?list=${id}` : m;
    }
    return key in vars ? vars[key] : m;
  });
}

/** Sablon degiskenleri: kanal + profil + kaydin konusu. */
export function templateVars(entry, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const def = nicheDefinition(entry, tpl);
  const topic = def?.topic
    || profile.moodTopics?.[(entry?.moods || [])[0]]
    || profile.defaultTopic
    || '';
  return {
    subLink: tpl.channel?.subLink || '',
    handle: tpl.channel?.handle || '',
    subjectWord: profile.subjectWord || '',
    topic,
    Topic: TR_UPPER_FIRST(topic),
  };
}

/** Tarihten tureyen deterministik tohum (ayni gun ayni rotasyon). */
export function dateSeed(dateStr) {
  return String(dateStr).split('-').reduce((acc, n) => acc * 31 + parseInt(n, 10), 0);
}

/** Sablon listesinden tohuma gore secip doldurur. */
export function pickTemplate(entry, listName, seed, extraVars = {}, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const list = profile.templates?.[listName];
  if (!Array.isArray(list) || !list.length) throw new Error(`seo-templates: ${profile.name}.templates.${listName} bos`);
  const vars = { ...templateVars(entry, tpl), ...extraVars };
  return render(list[seed % list.length], vars, tpl);
}

export function renderNamed(entry, name, extraVars = {}, tpl = loadTemplates()) {
  const profile = resolveProfile(entry, tpl);
  const str = profile.templates?.[name];
  if (typeof str !== 'string') throw new Error(`seo-templates: ${profile.name}.templates.${name} yok`);
  return render(str, { ...templateVars(entry, tpl), ...extraVars }, tpl);
}

export function profileFor(entry, tpl = loadTemplates()) {
  const p = resolveProfile(entry, tpl);
  return {
    name: p.name,
    categoryId: p.categoryId,
    playlistId: tpl.playlists?.[p.playlist] || null,
  };
}

export const _internal = { seededShuffle, TR_LOWER, TR_UPPER_FIRST };
