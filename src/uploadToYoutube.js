import { readFileSync, statSync } from 'node:fs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/**
 * Refresh token kullanarak yeni bir access token alir.
 */
async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`YouTube token yenileme basarisiz: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Baslik: verse'in ILK TAM CUMLESI + (varsa) konu etiketi + #Shorts.
 *
 * Onemli: verse'ler artik 90-140 karakter (2 tam cumle). Eskiden ilk 87 karakter
 * kesilip '...' ekleniyordu, bu da "...bam..." gibi ORTADAN KESIK basliklar
 * uretiyordu. Artik ilk cumle sinirindan (. ? !) kesiyoruz - baslik hep tam.
 */
function buildTitle(verse, concept) {
  const firstLine = (String(verse).split('\n').find(l => l.trim().length > 0) ?? '').trim();

  // Ilk cumle sinirini bul (nokta/soru/unlem + bosluk). Kisaltma yerine tam cumle.
  const m = firstLine.match(/^(.{15,95}?[.?!])(\s|$)/);
  let base = m ? m[1].trim() : firstLine;
  // Hala uzunsa kelime sinirindan kes (ortadan kesme yok)
  if (base.length > 95) {
    base = base.slice(0, 92).replace(/\s+\S*$/, '') + '...';
  }

  // Konu (concept) baslikta zaten yoksa ve yer varsa ekle: aranabilir terim one cikar.
  if (concept && concept.trim()) {
    const c = concept.trim();
    const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[^0-9a-zçğıöşü ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm(base).includes(norm(c)) && base.length + c.length + 3 <= 88) {
      base = `${base} | ${c}`;
    }
  }
  const withTag = `${base} #Shorts`;
  return withTag.length <= 100 ? withTag : base.slice(0, 100);
}

/**
 * Instagram caption'ini YouTube description'a donusturur (#Shorts ekler).
 */
// Tiklanabilir linkler. sub_confirmation=1: link tiklandiginda abone onay
// penceresi acilir (tek tikla abone) - duz kanal linkinden cok daha etkili.
const SUB_LINK = 'https://www.youtube.com/@komsutuyosu?sub_confirmation=1';
const PL_HAFTANIN = 'https://www.youtube.com/playlist?list=PLynH0txiEqh26QdVivze5z7xUNmUMgFPP';
const PL_MALZEME = 'https://www.youtube.com/playlist?list=PLynH0txiEqh3-w7UG-tVtSAWuehnTYR8G';

function buildDescription(caption) {
  // Shorts -> abone CTA (tek tik link) + long-form yonlendirme (gercek linkler)
  return `${caption}\n\n` +
    `🔔 Her gün yeni bir pratik ev tüyosu: ${SUB_LINK}\n\n` +
    `▶ Daha detaylı uzun videolar:\n` +
    `• Bu Haftanın Tüyoları: ${PL_HAFTANIN}\n` +
    `• Malzeme Serisi (sirke, karbonat, limon...): ${PL_MALZEME}\n\n#Shorts`;
}

/**
 * Resumable upload ile YouTube'a video yukler.
 * @param {object} opts
 * @param {string} opts.videoPath  - lokal MP4 dosyasi
 * @param {string} opts.verse      - misra metni (baslik icin)
 * @param {string} opts.caption    - Instagram caption (description icin)
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string} opts.refreshToken
 * @returns {Promise<{videoId: string, url: string}>}
 */
// Mood -> Turkce etiket (Shorts etiketlerini o gunun konusuna gore dinamiklestirir)
const MOOD_TAGS = {
  cleaning: ['temizlik', 'temizlik ipuçları'],
  kitchen: ['mutfak', 'mutfak tüyoları'],
  laundry: ['çamaşır', 'çamaşır ipuçları'],
  organizing: ['ev düzeni', 'organizasyon'],
  cozy: ['ev bakımı', 'ev dekorasyonu']
};
export function buildTags(moods, concept) {
  const base = ['ev ipuçları', 'pratik bilgi', 'pratik bilgiler', 'yaşam hileleri', 'ev tüyoları', 'püf noktası', 'shorts'];
  const dyn = (moods || []).flatMap(m => MOOD_TAGS[m] || []);
  // O gunun konusu (concept) en spesifik tag; ayni mood'daki yuzlerce Short'u ayristirir.
  const conceptTags = concept && concept.trim() ? [concept.trim().toLocaleLowerCase('tr-TR')] : [];
  // Kanal adi (komsu tuyosu) etiket olarak KULLANILMIYOR (marka degil)
  return [...new Set([...conceptTags, ...dyn, ...base])].slice(0, 15);
}

export async function uploadToYoutube({ videoPath, verse, caption, concept, moods, playlistId, firstComment, clientId, clientSecret, refreshToken }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });

  const title = buildTitle(verse, concept);
  const description = buildDescription(caption);

  const metadata = {
    snippet: {
      title,
      description,
      tags: buildTags(moods, concept),
      categoryId: '26',   // Howto & Style
      defaultLanguage: 'tr',
      defaultAudioLanguage: 'tr'
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false
    }
  };

  const fileSize = statSync(videoPath).size;
  const videoBuffer = readFileSync(videoPath);

  // 1) Resumable upload oturumu ac
  const initRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(fileSize)
    },
    body: JSON.stringify(metadata)
  });

  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`YouTube upload init basarisiz (${initRes.status}): ${body}`);
  }

  const uploadUri = initRes.headers.get('location');
  if (!uploadUri) {
    throw new Error('YouTube upload URI alinamadi (Location header yok)');
  }

  // 2) Videoyu yukle
  const uploadRes = await fetch(uploadUri, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize)
    },
    body: videoBuffer
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`YouTube video upload basarisiz (${uploadRes.status}): ${body}`);
  }

  const result = await uploadRes.json();
  const videoId = result.id;
  if (!videoId) {
    throw new Error(`YouTube upload sonucu beklenmedi: ${JSON.stringify(result)}`);
  }

  // 3) Playlist'e ekle (opsiyonel - hata upload'i bozmaz)
  if (playlistId) {
    try {
      const plRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } })
      });
      if (!plRes.ok) console.warn(`Shorts playlist'e eklenemedi (${plRes.status})`);
    } catch (e) { console.warn(`Shorts playlist ekleme hatasi: ${e.message}`); }
  }

  // 4) Otomatik ilk yorum (etkilesim + abone CTA).
  // Bos yorum kutusu insanlari yazmaktan cekindirir; ilk yorum soru sorunca
  // yanit gelme olasiligi artar, yorum sinyali de dagitimi besler.
  if (firstComment) {
    try {
      const cRes = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: { videoId, topLevelComment: { snippet: { textOriginal: firstComment } } }
        })
      });
      if (cRes.ok) console.log('Ilk yorum atildi');
      else console.warn(`Ilk yorum atilamadi (${cRes.status}): ${(await cRes.text()).slice(0, 160)}`);
    } catch (e) { console.warn(`Ilk yorum hatasi: ${e.message}`); }
  }

  return {
    videoId,
    url: `https://www.youtube.com/shorts/${videoId}`
  };
}
