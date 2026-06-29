import { readFileSync, statSync } from 'node:fs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const THUMB_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`YouTube token yenileme basarisiz: ${JSON.stringify(data)}`);
  return data.access_token;
}

/**
 * Long-form (yatay, Shorts DEGIL) video yukler + kapak (thumbnail) set eder + (varsa) playlist'e ekler.
 * @returns {Promise<{videoId, url, thumbnailSet, playlistAdded}>}
 */
export async function uploadLongform({ videoPath, thumbnailPath, title, description, tags, playlistId, clientId, clientSecret, refreshToken }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });

  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description,
      tags: tags || ['ev ipuçları', 'pratik bilgi', 'temizlik', 'ev düzeni', 'pratik ev tüyoları'],
      categoryId: '26',   // Howto & Style
      defaultLanguage: 'tr',
      defaultAudioLanguage: 'tr'
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
  };

  const fileSize = statSync(videoPath).size;
  const videoBuffer = readFileSync(videoPath);

  // 1) Resumable upload oturumu
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
  if (!initRes.ok) throw new Error(`Upload init basarisiz (${initRes.status}): ${await initRes.text()}`);
  const uploadUri = initRes.headers.get('location');
  if (!uploadUri) throw new Error('Upload URI alinamadi (Location header yok)');

  // 2) Video yukle
  const uploadRes = await fetch(uploadUri, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(fileSize) },
    body: videoBuffer
  });
  if (!uploadRes.ok) throw new Error(`Video upload basarisiz (${uploadRes.status}): ${await uploadRes.text()}`);
  const result = await uploadRes.json();
  const videoId = result.id;
  if (!videoId) throw new Error(`Upload sonucu beklenmedi: ${JSON.stringify(result)}`);

  // 3) Kapak set et (opsiyonel - youtube.upload scope ile genelde calisir; hata video'yu bozmaz)
  let thumbnailSet = false;
  if (thumbnailPath) {
    try {
      const img = readFileSync(thumbnailPath);
      const thumbRes = await fetch(`${THUMB_URL}?videoId=${videoId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
        body: img
      });
      if (thumbRes.ok) { thumbnailSet = true; }
      else { console.warn(`Kapak set edilemedi (${thumbRes.status}): ${(await thumbRes.text()).slice(0, 200)}`); }
    } catch (e) { console.warn(`Kapak set hatasi: ${e.message}`); }
  }

  // 4) Playlist'e ekle (opsiyonel)
  let playlistAdded = false;
  if (playlistId) {
    try {
      const plRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } }
        })
      });
      if (plRes.ok) { playlistAdded = true; }
      else { console.warn(`Playlist'e eklenemedi (${plRes.status}): ${(await plRes.text()).slice(0, 200)}`); }
    } catch (e) { console.warn(`Playlist ekleme hatasi: ${e.message}`); }
  }

  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}`, thumbnailSet, playlistAdded };
}
