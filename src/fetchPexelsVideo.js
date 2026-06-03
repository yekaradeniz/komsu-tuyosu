// EROTIK/UYGUNSUZ ICERIK FILTRESI: Pexels bazen alakasiz glamour/sensual "woman"
// videolari donduruyor (or. "woman-drinking-milk"). Pexels VIDEO API tag vermiyor (bos)
// ama video.url slug aciklayici. Slug'da su kelimelerden biri varsa o video ATLANIR.
// 1) Gercekten erotik kelimeler (slug'da gecerse video atlanir). Masum kelime YOK.
const BLOCKED_URL_WORDS = [
  'sensual', 'seductive', 'seduce', 'seductively', 'sexy', 'erotic', 'sexual',
  'lingerie', 'bikini', 'underwear', 'nude', 'naked', 'topless', 'panties', 'thong',
  'cleavage', 'glamour', 'boudoir', 'twerk', 'provocative', 'striptease',
  'swimsuit', 'swimwear', 'wet-tshirt'
];

// 2) Sensual/glamour icerik ureten fotografcilar - bunlarin TUM videolari elenir.
// (Ron Lach "woman-drinking-milk" gibi MASUM slug'la sensual cekim yapiyor; kelime
// filtresi yakalayamaz, ama ceken kisi bellidir.) Yeni problemli cikan ceken oldukca
// buraya kucuk harfle ekle.
const BLOCKED_USERS = [
  'ron lach'
];

export function isCleanVideo(video) {
  const u = (video.url || '').toLowerCase();
  if (BLOCKED_URL_WORDS.some((w) => u.includes(w))) return false;
  const author = ((video.user && video.user.name) || '').toLowerCase().trim();
  if (BLOCKED_USERS.includes(author)) return false;
  return true;
}

// Mood → Pexels arama terimi (Komşu Tüyosu / ev-yaşam temalı)
// MARKA KURALI: her videoda KADIN (ev kadını / ev işi yapan kadın) olmali, erkek gelmesin.
// Bu yuzden tum sorgular "woman" / "housewife" odakli.
// DENGELI: cogu arama EYLEM/NESNE odakli (suggestive/glamour gelme riskini dusurur);
// her mood'da sadece 1-2 "woman/housewife" var (ev kadini temasi korunur ama zorunlu degil).
const MOOD_QUERIES = {
  'cleaning': [
    'cleaning kitchen counter', 'wiping table surface', 'mopping floor', 'scrubbing sink',
    'spray bottle cleaning', 'hands cleaning surface', 'vacuuming carpet', 'tidying living room',
    'woman cleaning home', 'housewife cleaning'
  ],
  'kitchen': [
    'kitchen counter clean', 'cutting vegetables board', 'cooking pan stove', 'kitchen utensils',
    'pouring into bowl', 'organizing kitchen shelf', 'woman in kitchen', 'housewife cooking'
  ],
  'laundry': [
    'folding laundry', 'washing machine close up', 'hanging clothes line', 'folding towels',
    'laundry basket clothes', 'loading washing machine', 'woman doing laundry'
  ],
  'organizing': [
    'organizing drawer', 'tidy closet shelves', 'storage boxes home', 'decluttering shelf',
    'folding clothes wardrobe', 'arranging pantry', 'woman organizing home'
  ],
  'cozy': [
    'cozy living room', 'bright home interior', 'home plants decor', 'morning sunlight room',
    'clean tidy bedroom', 'home decoration', 'woman relaxing home'
  ]
};

const FALLBACK_QUERIES = [
  'clean modern home', 'kitchen counter clean', 'cleaning home', 'folding laundry',
  'tidy living room', 'home organization', 'household chores', 'organizing shelf',
  'wiping surface', 'bright home interior', 'mopping floor', 'cleaning supplies'
];

// Süre aralıkları sıralı olarak denenecek - sıkıdan gevşeğe.
// Video render'ımız 33 saniye, en az 34 saniyelik kaynak ideal (loop atlama olmasın).
const DURATION_RANGES = [
  { min: 34, max: 60 },
  { min: 34, max: 90 },
  { min: 28, max: 90 },
  { min: 22, max: 120 }
];

async function searchPage(apiKey, query) {
  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('per_page', '15');

  const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
  if (!res.ok) {
    console.warn(`Pexels arama "${query}" başarısız: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.videos ?? [];
}

function pickBestFile(video) {
  // Portrait video (height > width), minimum 1080p. En yuksek cozunurluk tercih edilir
  // (ffmpeg lanczos ile 1080x1920'ye downscale yapacak - text/detay daha keskin gorunur).
  const files = (video.video_files ?? [])
    .filter(f => f.height > f.width && f.height >= 1080)
    .sort((a, b) => b.height - a.height);
  return files[0];
}

/**
 * Pexels API'den mood'a uygun aday video listesi getirir (sıkı süreden gevşeğe).
 * Caller bu adayları sırayla deneyip hangisi moderasyondan geçerse onu kullanır.
 *
 * @param {string[]} moods
 * @param {string} apiKey
 * @param {Set<string>} usedVideoIds
 * @returns {Promise<Array<{id, url, duration, query}>>}
 */
export async function fetchPexelsCandidates(moods, apiKey, usedVideoIds = new Set()) {
  if (!apiKey) throw new Error('PEXELS_API_KEY tanımlı değil');

  const moodQueries = moods.flatMap(m => MOOD_QUERIES[m] ?? []);
  const queries = [...new Set([...moodQueries, ...FALLBACK_QUERIES])];

  const cache = new Map();
  const candidates = [];
  const seenIds = new Set();

  for (const range of DURATION_RANGES) {
    for (const query of queries) {
      let videos = cache.get(query);
      if (!videos) {
        videos = await searchPage(apiKey, query);
        cache.set(query, videos);
      }

      for (const video of videos) {
        if (video.duration < range.min || video.duration > range.max) continue;
        const fullId = `pexels-${video.id}`;
        if (usedVideoIds.has(fullId)) continue;
        if (seenIds.has(fullId)) continue;
        if (!isCleanVideo(video)) continue;
        const best = pickBestFile(video);
        if (!best) continue;
        seenIds.add(fullId);
        candidates.push({
          id: fullId,
          url: best.link,
          duration: video.duration,
          query,
          width: best.width,
          height: best.height,
          range: `${range.min}-${range.max}`
        });
      }
    }
    if (candidates.length >= 5) break; // 5 aday yeterli; reddedilirse bir sonraki çekime geçer
    console.log(`Süre aralığı ${range.min}-${range.max}sn ile ${candidates.length} aday, gerekirse genişletiliyor...`);
  }

  if (candidates.length === 0) {
    throw new Error(`Pexels'te uygun yeni video bulunamadı (mood: ${moods.join(', ')}, kullanılmış: ${usedVideoIds.size})`);
  }
  return candidates;
}

/**
 * Geri uyumluluk için: ilk adayı dön (eski kullanım).
 */
export async function fetchPexelsVideo(moods, apiKey, usedVideoIds = new Set()) {
  const list = await fetchPexelsCandidates(moods, apiKey, usedVideoIds);
  return list[0];
}

/**
 * Soru-bagini bilen query listesi ile aday cek. MOOD_QUERIES yerine
 * entry.pexelsQuery dogrudan kullanilir. FALLBACK_QUERIES son care olarak
 * eklenir (Pexels'te 0 sonuc gelirse dark/cinematic videoya duser).
 *
 * @param {string[]} queries  - entry.pexelsQuery (4-6 keyword)
 * @param {string} apiKey
 * @param {Set<string>} usedVideoIds
 * @returns {Promise<Array<{id, url, duration, query}>>}
 */
export async function fetchPexelsCandidatesByQueries(queries, apiKey, usedVideoIds = new Set()) {
  if (!apiKey) throw new Error('PEXELS_API_KEY tanımlı değil');
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('queries array bos veya gecersiz');
  }

  const allQueries = [...new Set([...queries, ...FALLBACK_QUERIES])];
  const cache = new Map();
  const candidates = [];
  const seenIds = new Set();

  for (const range of DURATION_RANGES) {
    for (const query of allQueries) {
      let videos = cache.get(query);
      if (!videos) {
        videos = await searchPage(apiKey, query);
        cache.set(query, videos);
      }

      for (const video of videos) {
        if (video.duration < range.min || video.duration > range.max) continue;
        const fullId = `pexels-${video.id}`;
        if (usedVideoIds.has(fullId)) continue;
        if (seenIds.has(fullId)) continue;
        if (!isCleanVideo(video)) continue;
        const best = pickBestFile(video);
        if (!best) continue;
        seenIds.add(fullId);
        candidates.push({
          id: fullId,
          url: best.link,
          duration: video.duration,
          query,
          width: best.width,
          height: best.height,
          range: `${range.min}-${range.max}`
        });
      }
    }
    if (candidates.length >= 5) break;
  }

  if (candidates.length === 0) {
    throw new Error(`Pexels'te uygun yeni video yok (queries: ${queries.join(', ')}, kullanilmis: ${usedVideoIds.size})`);
  }
  return candidates;
}
