// Mood → Pexels arama terimi (Komşu Tüyosu / ev-yaşam temalı)
// MARKA KURALI: her videoda KADIN (ev kadını / ev işi yapan kadın) olmali, erkek gelmesin.
// Bu yuzden tum sorgular "woman" / "housewife" odakli.
const MOOD_QUERIES = {
  'cleaning': [
    'woman cleaning home', 'woman wiping counter', 'housewife cleaning', 'woman mopping floor',
    'woman cleaning kitchen', 'woman scrubbing surface', 'woman cleaning bathroom', 'housewife housework',
    'woman washing dishes', 'woman cleaning house'
  ],
  'kitchen': [
    'woman in kitchen', 'housewife cooking', 'woman kitchen counter', 'woman preparing food',
    'woman organizing kitchen', 'woman kitchen utensils', 'woman cooking home', 'housewife kitchen'
  ],
  'laundry': [
    'woman doing laundry', 'woman folding clothes', 'housewife laundry', 'woman hanging laundry',
    'woman folding towels', 'woman laundry room', 'woman washing clothes'
  ],
  'organizing': [
    'woman organizing home', 'woman tidying closet', 'housewife organizing', 'woman decluttering',
    'woman folding clothes wardrobe', 'woman organizing drawer', 'woman arranging home'
  ],
  'cozy': [
    'woman cozy home', 'woman home interior', 'housewife living room', 'woman relaxing home',
    'woman morning home', 'woman home plants', 'woman comfortable home'
  ]
};

const FALLBACK_QUERIES = [
  'woman cleaning home', 'housewife housework', 'woman in kitchen', 'woman doing laundry',
  'woman tidying home', 'woman organizing home', 'housewife cleaning', 'woman cooking home',
  'woman home interior', 'woman cleaning house', 'housewife kitchen', 'woman household chores'
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
