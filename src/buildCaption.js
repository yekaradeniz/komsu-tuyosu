// YouTube spam koruma algoritmasi ayni caption'i tekrarlayan hesaplari
// flag eder. Bu yuzden her gun verse'in ilk satiri + rotating hashtag seti
// uretiyoruz. Tum captionlar farkli. Kanal adi (komsu tuyosu) marka olmadigi
// icin hashtag/intro olarak KULLANILMAZ; konu odakli hashtagler kullanilir.

import { nicheHashtags, isNiche } from './nicheSeo.js';

const CORE_TAGS = ['#evipuçları', '#pratikbilgi'];

const ROTATION_POOL = [
  '#temizlik', '#evtüyoları', '#mutfaktüyoları', '#evdüzeni',
  '#pratikçözüm', '#evbakımı', '#organizasyon', '#çamaşır',
  '#tasarruf', '#leketemizliği', '#yaşamhilesi', '#püfnoktası',
  '#dekorasyon', '#mutfak', '#temizlikipuçları', '#evişleri',
  '#hayatkurtaran', '#evhali', '#pratikbilgiler', '#evhanımı',
  '#shorts', '#nasılyapılır', '#evdekorasyonu', '#tüyo'
];

const ROTATION_COUNT = 4;

// Nis videolarinda 'Denediniz mi?' ya da 'Bugunun tuyosu' anlamsiz duruyor:
// ahtapot videosunda denenecek bir sey yok.
const NIS_INTRO_VARIANTS = [
  v => `${v}`,
  v => `${v}\n\nSen biliyor muydun?`,
  v => `${v}\n\nCevap videoda.`,
  v => `Bunu biliyor muydun?\n\n${v}`,
  v => `${v}\n\nDuymuş muydun?`,
  v => `Bugünün bilgisi:\n\n${v}`
];

const INTRO_VARIANTS = [
  v => `${v}`,
  v => `${v}\n\nSen biliyor muydun?`,
  v => `${v}\n\nDenediniz mi?`,
  v => `${v}\n\nDetaylar videoda.`,
  v => `Bunu biliyor muydun?\n\n${v}`,
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

function pickIntro(verse, seed, niche) {
  const firstLine = verse.split('\n')[0].trim();
  const set = niche ? NIS_INTRO_VARIANTS : INTRO_VARIANTS;
  return set[seed % set.length](firstLine);
}

export function buildCaption(entry, dateStr) {
  if (!entry || typeof entry.verse !== 'string' || entry.verse.trim() === '') {
    throw new Error(`buildCaption: entry.verse eksik veya gecersiz (id: ${entry?.id ?? 'unknown'})`);
  }
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`buildCaption: dateStr gecersiz format (beklenen YYYY-MM-DD, alindi: ${dateStr})`);
  }

  const seed = dateSeed(dateStr);
  const intro = pickIntro(entry.verse, seed, isNiche(entry) ? entry.niche : null);
  const explanation = (entry.explanation || '').trim();

  // Nis testi videolari ev hashtaglerini almaz. Karinca videosunda
  // '#leketemizligi' cikmasi izleyiciye de algoritmaya da yanlis sinyal.
  const { core, pool } = isNiche(entry)
    ? nicheHashtags(entry.niche)
    : { core: CORE_TAGS, pool: ROTATION_POOL };
  const rotated = seededShuffle(pool, seed).slice(0, ROTATION_COUNT);
  const tags = [...core, ...rotated];

  // Format: Soru + bos satir + Cevap + bos satir + hashtagler
  // YouTube description ve Instagram caption icin ayni metin
  const parts = [intro];
  if (explanation) parts.push('', explanation);
  parts.push('', tags.join(' '));

  return parts.join('\n');
}

// test edilebilirlik icin
export const _internal = { dateSeed, seededShuffle, pickIntro, CORE_TAGS, ROTATION_POOL, INTRO_VARIANTS, NIS_INTRO_VARIANTS };
