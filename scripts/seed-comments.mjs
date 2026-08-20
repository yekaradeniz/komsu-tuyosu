// En cok izlenen Shorts'lara ILK YORUM atar (etkilesim + tek tikla abone linki).
// Zaten kanal yorumu olan videoyu ATLAR (tekrar yorum atmaz).
// Kullanim: node scripts/seed-comments.mjs [limit]   (varsayilan 20)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFirstComment } from '../src/buildFirstComment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LIMIT = parseInt(process.argv[2] || '12', 10);
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-tuyosu.json'), 'utf-8'));

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${AT}` };
const get = async (u) => (await fetch(u, { headers: H })).json();

const norm = s => (s || '').toLocaleLowerCase('tr-TR').replace(/[.,;:!?'"…]/g, '').replace(/\s+/g, ' ').trim();
const clean = t => t.replace(/\s*#shorts\s*$/i, '').trim();
function findEntry(title) {
  const tc = norm(clean(title).replace(/\|.*$/, '').replace(/\.\.\.$/, ''));
  return content.find(e => {
    const v = norm(e.verse);
    return v === tc || v.startsWith(tc) || (tc.length > 20 && tc.startsWith(v.slice(0, 45)));
  });
}
function durSec(iso) { const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || []; return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0); }

const ch = await get('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true');
if (!ch.items) { console.log('kanal okunamadi (kota olabilir), atlaniyor'); process.exit(0); }
const up = ch.items[0].contentDetails.relatedPlaylists.uploads;
let ids = [], pt = '';
do {
  const r = await get(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50&pageToken=${pt}`);
  ids.push(...r.items.map(i => i.contentDetails.videoId)); pt = r.nextPageToken || '';
} while (pt);

const vids = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await get('https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=' + ids.slice(i, i + 50).join(','));
  vids.push(...r.items.map(v => ({
    id: v.id, title: v.snippet.title, date: (v.snippet.publishedAt || '').slice(0, 10),
    views: parseInt(v.statistics.viewCount || '0', 10),
    comments: parseInt(v.statistics.commentCount || '0', 10),
    dur: durSec(v.contentDetails.duration)
  })));
}
// Sadece Shorts, yorumu olmayanlar, en cok izlenenden az izlenene
const targets = vids.filter(v => v.dur < 100 && v.comments === 0).sort((a, b) => b.views - a.views).slice(0, LIMIT);
console.log(`Hedef: ${targets.length} video (yorumsuz Shorts, en cok izlenen ${LIMIT})`);

let ok = 0, miss = 0, fail = 0;
for (const v of targets) {
  const entry = findEntry(v.title);
  if (!entry) { miss++; console.log(`? eslesmedi: ${v.title.slice(0, 45)}`); continue; }
  const text = buildFirstComment(entry, v.date || '2026-06-01');
  const res = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId: v.id, topLevelComment: { snippet: { textOriginal: text } } } })
  });
  if (res.ok) { ok++; console.log(`✓ ${v.views} izl | ${v.title.slice(0, 42)}`); }
  else {
    const t = await res.text(); fail++;
    if (res.status === 403 && t.includes('quota')) { console.log('kota doldu, kalan yarin devam edecek'); break; }
    console.log(`✗ (${res.status}) ${v.title.slice(0, 35)}`);
  }
}
console.log(`\nYorum atildi: ${ok} | eslesmedi: ${miss} | hata: ${fail}`);
