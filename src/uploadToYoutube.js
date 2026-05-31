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
 * Verse'in ilk satirini baslik olarak duzenler (max 90 karakter + ' #Shorts').
 */
function buildTitle(verse) {
  const firstLine = (String(verse).split('\n').find(l => l.trim().length > 0) ?? '').trim();
  const base = firstLine.length > 90 ? firstLine.slice(0, 87) + '...' : firstLine;
  return `${base} #Shorts`;
}

/**
 * Instagram caption'ini YouTube description'a donusturur (#Shorts ekler).
 */
function buildDescription(caption) {
  return `${caption}\n\n#Shorts`;
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
export async function uploadToYoutube({ videoPath, verse, caption, clientId, clientSecret, refreshToken }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });

  const title = buildTitle(verse);
  const description = buildDescription(caption);

  const metadata = {
    snippet: {
      title,
      description,
      tags: ['ev ipuçları', 'komşu tüyosu', 'pratik bilgi', 'temizlik ipuçları', 'mutfak tüyoları', 'ev düzeni', 'organizasyon', 'yaşam hileleri', 'tasarruf', 'shorts'],
      categoryId: '26'   // Howto & Style
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

  return {
    videoId,
    url: `https://www.youtube.com/shorts/${videoId}`
  };
}
