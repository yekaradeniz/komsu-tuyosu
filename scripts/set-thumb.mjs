// Tek seferlik: bir videoya kapak set eder (yeni force-ssl refresh token testi).
// Kullanim: node scripts/set-thumb.mjs <videoId> <pngPath>
import { readFileSync } from 'node:fs';
const [, , videoId, pngPath] = process.argv;
const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;

const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET,
    refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token'
  })
});
const td = await tr.json();
if (!td.access_token) { console.error('Access token alinamadi:', td); process.exit(1); }

const img = readFileSync(pngPath);
const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${td.access_token}`, 'Content-Type': 'image/png' },
  body: img
});
const body = await res.text();
console.log('HTTP', res.status);
console.log(res.ok ? '✓ KAPAK SET EDILDI (force-ssl calisiyor)' : '✗ Basarisiz: ' + body.slice(0, 400));
