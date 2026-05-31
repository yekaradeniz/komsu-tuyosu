// Mood → Unsplash arama terimi havuzu (her seferinde rastgele birini seçer)
const MOOD_KEYWORDS = {
  'mihrap': [
    'mosque interior mihrab', 'mosque arch', 'masjid mihrab',
    'sultan ahmed mosque interior', 'hagia sophia interior',
    'mosque niche arch', 'islamic mihrab ornament',
    'mosque golden dome interior', 'masjid ceiling dome',
    'mosque pillar arch', 'ottoman mosque interior detail'
  ],
  'tefekkür': [
    'mosque prayer', 'mosque silence', 'mosque morning light',
    'medina mosque', 'masjid nabawi', 'mosque sunlight',
    'prayer beads tesbih',
    'mosque empty hall light', 'mosque window light rays',
    'islamic prayer atmosphere', 'mosque peaceful interior',
    'mosque dawn light', 'mosque soft light columns'
  ],
  'ic-dunya': [
    'islamic architecture', 'mosque dome', 'mosque interior',
    'samarkand registan', 'bukhara mosque',
    'blue mosque istanbul', 'hagia sophia', 'suleymaniye',
    'sheikh zayed mosque', 'iznik tile', 'persian mosque',
    'turkish mosque interior', 'cordoba mosque',
    'mosque geometric pattern', 'islamic tilework',
    'mosque muqarnas ceiling', 'ottoman mosque tile',
    'mosque arabesque detail', 'masjid dome ceiling',
    'istanbul mosque interior', 'mosque courtyard fountain',
    'umayyad mosque damascus', 'masjid al aqsa interior',
    'mosque stalactite ceiling', 'kairouan mosque',
    'mosque gold calligraphy', 'mosque blue tile wall'
  ],
  'halvet': [
    'mosque empty quiet', 'mosque solitude', 'islamic monastery',
    'sufi spiritual', 'mosque meditation',
    'mosque corridor empty', 'mosque silent hall',
    'mosque stone archway',
    'mosque dim light corner', 'masjid empty prayer hall'
  ],
  'divan': [
    'islamic calligraphy', 'arabic manuscript', 'quran writing',
    'ottoman calligraphy', 'arabic art', 'islamic illumination tezhip',
    'ottoman manuscript illumination', 'arabic calligraphy gold',
    'quran pages detail', 'islamic geometric art',
    'mosque inscription calligraphy', 'arabic script wall'
  ],
};

const FALLBACK_KEYWORDS = [
  'mosque interior',
  'islamic architecture',
  'samarkand mosque',
  'persian mosque',
  'turkish mosque',
  'islamic calligraphy',
  'mosque dome ceiling',
  'ottoman mosque',
  'mosque minaret',
  'masjid interior light'
];

/**
 * Unsplash API'den şiirin mood'larına göre rastgele bir portre fotoğrafı çeker.
 * @param {string[]} moods - şiirin mood etiketleri
 * @param {string} accessKey - Unsplash API access key
 * @param {Set<string>} recentlyUsed - son kullanılan Unsplash foto ID'leri (tekrar önleme)
 * @param {number} maxAttempts
 * @returns {Promise<{id, url, moods}>}
 */
export async function fetchUnsplashPhoto(moods, accessKey, recentlyUsed = new Set(), maxAttempts = 5) {
  // Mood'lardan keyword havuzu çıkar (her mood için birden fazla aday var)
  const moodPool = moods.flatMap(m => MOOD_KEYWORDS[m] ?? []);
  const pool = moodPool.length > 0 ? moodPool : FALLBACK_KEYWORDS;

  // Tek bir keyword icin foto ceker. Hata olursa null doner (fail-soft).
  async function tryFetch(keyword) {
    try {
      const url = new URL('https://api.unsplash.com/photos/random');
      url.searchParams.set('query', keyword);
      url.searchParams.set('orientation', 'portrait');
      url.searchParams.set('client_id', accessKey);
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn(`  Unsplash "${keyword}" basarisiz (${res.status}: ${body.errors?.[0] ?? res.statusText}), siradaki keyword denenecek.`);
        return null;
      }
      const data = await res.json();
      return {
        id: `unsplash-${data.id}`,
        url: `${data.urls.raw}&w=1200&q=85&fit=crop&crop=entropy`,
        description: data.description ?? data.alt_description ?? 'aciklama yok',
        rawId: data.id
      };
    } catch (e) {
      console.warn(`  Unsplash "${keyword}" cagrisinda hata: ${e.message}, siradaki keyword denenecek.`);
      return null;
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const keyword = pool[Math.floor(Math.random() * pool.length)];
    const photo = await tryFetch(keyword);
    if (!photo) continue;

    if (recentlyUsed.has(photo.id)) {
      console.log(`  Unsplash ${photo.rawId} son kullanılanlarda, tekrar deneniyor...`);
      continue;
    }

    console.log(`  Unsplash foto: ${photo.rawId} (${photo.description})`);
    return { id: photo.id, url: photo.url, moods };
  }

  // Mood havuzu tukendi/coktu. FALLBACK'lerle sirayla bir daha dene
  // (genel "mosque interior" gibi terimler Unsplash'te neredeyse hep sonuc verir).
  console.warn(`Mood havuzu ile foto bulunamadi (${maxAttempts} deneme), FALLBACK_KEYWORDS deneniyor...`);
  for (const keyword of FALLBACK_KEYWORDS) {
    const photo = await tryFetch(keyword);
    if (!photo) continue;
    if (recentlyUsed.has(photo.id)) continue;
    console.log(`  Unsplash foto (fallback "${keyword}"): ${photo.rawId} (${photo.description})`);
    return { id: photo.id, url: photo.url, moods };
  }

  throw new Error(`Unsplash: ${maxAttempts} mood denemesi + ${FALLBACK_KEYWORDS.length} fallback denemesi sonrasi foto bulunamadi.`);
}
