// YouTube spam koruma algoritmasi ayni caption'i tekrarlayan hesaplari
// flag eder. Bu yuzden her gun verse'in ilk satiri + rotating hashtag seti
// uretiyoruz. Tum captionlar farkli ama brand kimligi (#komşutüyosu,
// #evipuçları gibi core taglar) korunuyor.

const CORE_TAGS = ['#komşutüyosu', '#evipuçları', '#pratikbilgi'];

const ROTATION_POOL = [
  '#temizlik', '#evtüyoları', '#mutfaktüyoları', '#evdüzeni',
  '#pratikçözüm', '#evbakımı', '#organizasyon', '#çamaşır',
  '#tasarruf', '#leketemizliği', '#yaşamhilesi', '#püfnoktası',
  '#dekorasyon', '#mutfak', '#temizlikipuçları', '#evişleri',
  '#hayatkurtaran', '#evhali', '#pratikbilgiler', '#evhanımı',
  '#shorts', '#nasılyapılır', '#evdekorasyonu', '#tüyo'
];

const ROTATION_COUNT = 4;

const INTRO_VARIANTS = [
  v => `${v}`,
  v => `${v}\n\nSen biliyor muydun?`,
  v => `Komşu tüyosu:\n${v}`,
  v => `${v}\n\nDetaylar videoda.`,
  v => `Komşu Tüyosu | ${v}`,
  v => `Bugünün tüyosu:\n\n${v}`
];

function dateSeed(dateStr) {
  return dateStr.split('-').reduce((acc, n) => acc * 31 + parseInt(n, 10), 0);
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

function pickIntro(verse, seed) {
  const firstLine = verse.split('\n')[0].trim();
  const idx = seed % INTRO_VARIANTS.length;
  return INTRO_VARIANTS[idx](firstLine);
}

export function buildCaption(entry, dateStr) {
  if (!entry || typeof entry.verse !== 'string' || entry.verse.trim() === '') {
    throw new Error(`buildCaption: entry.verse eksik veya gecersiz (id: ${entry?.id ?? 'unknown'})`);
  }
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`buildCaption: dateStr gecersiz format (beklenen YYYY-MM-DD, alindi: ${dateStr})`);
  }

  const seed = dateSeed(dateStr);
  const intro = pickIntro(entry.verse, seed);
  const explanation = (entry.explanation || '').trim();

  const rotated = seededShuffle(ROTATION_POOL, seed).slice(0, ROTATION_COUNT);
  const tags = [...CORE_TAGS, ...rotated];

  // Format: Soru + bos satir + Cevap + bos satir + hashtagler
  // YouTube description ve Instagram caption icin ayni metin
  const parts = [intro];
  if (explanation) parts.push('', explanation);
  parts.push('', tags.join(' '));

  return parts.join('\n');
}

// test edilebilirlik icin
export const _internal = { dateSeed, seededShuffle, pickIntro, CORE_TAGS, ROTATION_POOL, INTRO_VARIANTS };
