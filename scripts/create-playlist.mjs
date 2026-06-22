// YouTube playlist olusturur. Kullanim: node scripts/create-playlist.mjs "Baslik" "Aciklama"
const [, , title, description = ''] = process.argv;
if (!title) { console.error('Kullanim: node scripts/create-playlist.mjs "Baslik" ["Aciklama"]'); process.exit(1); }

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET,
    refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token'
  })
});
const td = await tr.json();
if (!td.access_token) { console.error('token alinamadi', td); process.exit(1); }

const res = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
  method: 'POST',
  headers: { Authorization: `Bearer ${td.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus: 'public' } })
});
const body = await res.json();
if (!res.ok) { console.error('HATA', res.status, JSON.stringify(body).slice(0, 400)); process.exit(1); }
console.log('PLAYLIST_ID:', body.id);
console.log('URL: https://www.youtube.com/playlist?list=' + body.id);
