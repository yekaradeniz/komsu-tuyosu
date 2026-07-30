// Eski Shorts videolarinin aciklama + etiketini yeniler (marka temizligi + dinamik).
// Baslik degismez. Her videoyu basligindan komsu-tuyosu.json icerigine eslestirir.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCaption } from '../src/buildCaption.js';
import { buildTags } from '../src/uploadToYoutube.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-tuyosu.json'), 'utf-8'));

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${AT}` };

const clean = t => t.replace(/\s*#shorts\s*$/i, '').trim();
// Noktalama-duyarsiz normalize (eski videolar virgullu basliklarla yuklenmis olabilir)
const norm = s => (s || '').toLocaleLowerCase('tr-TR').replace(/[.,;:!?'"…]/g, '').replace(/\s+/g, ' ').trim();
function findEntry(title) {
  const tc = norm(clean(title).replace(/\.\.\.$/, ''));
  return content.find(e => {
    const v = norm(e.verse);
    return v === tc || v.startsWith(tc) || (tc.length > 20 && tc.startsWith(v.slice(0, 45)));
  });
}
function durSec(iso) { const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || []; return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0); }

// tum videolar
const up = (await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: H })).json()).items[0].contentDetails.relatedPlaylists.uploads;
let ids = [], pt = '';
do {
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50&pageToken=${pt}`, { headers: H })).json();
  ids.push(...r.items.map(i => i.contentDetails.videoId)); pt = r.nextPageToken || '';
} while (pt);

const vids = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.slice(i, i + 50).join(',')}`, { headers: H })).json();
  vids.push(...r.items);
}

let updated = 0, skipped = 0, nomatch = 0;
for (const v of vids) {
  const dur = durSec(v.contentDetails.duration);
  if (dur >= 100) { skipped++; continue; }  // long-form'lari atla (ayri SEO)
  const entry = findEntry(v.snippet.title);
  if (!entry) { nomatch++; console.log(`? eslesmedi: ${v.snippet.title.slice(0, 50)}`); continue; }
  const date = (v.snippet.publishedAt || '2026-06-01').slice(0, 10);
  const caption = buildCaption(entry, date);
  // Tiklanabilir abone linki (?sub_confirmation=1 = tek tikla abone) + playlist URL'leri.
  // Eski videolarda sadece playlist ADI yaziyordu, link yoktu -> tiklanamiyordu.
  const SUB = 'https://www.youtube.com/@komsutuyosu?sub_confirmation=1';
  const PL_H = 'https://www.youtube.com/playlist?list=PLynH0txiEqh26QdVivze5z7xUNmUMgFPP';
  const PL_M = 'https://www.youtube.com/playlist?list=PLynH0txiEqh3-w7UG-tVtSAWuehnTYR8G';
  const description = `${caption}\n\n` +
    `🔔 Her gün yeni bir pratik ev tüyosu: ${SUB}\n\n` +
    `▶ Daha detaylı uzun videolar:\n` +
    `• Bu Haftanın Tüyoları: ${PL_H}\n` +
    `• Malzeme Serisi (sirke, karbonat, limon...): ${PL_M}\n\n#Shorts`;
  const tags = buildTags(entry.moods);
  const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: v.id, snippet: { title: v.snippet.title, description, tags, categoryId: '26', defaultLanguage: 'tr', defaultAudioLanguage: 'tr' } })
  });
  if (res.ok) { updated++; console.log(`✓ ${v.snippet.title.slice(0, 45)}`); }
  else { console.log(`✗ (${res.status}) ${v.snippet.title.slice(0, 40)}: ${(await res.text()).slice(0, 120)}`); }
}
console.log(`\nGuncellendi: ${updated} | Atlanan (long-form): ${skipped} | Eslesmedi: ${nomatch}`);
