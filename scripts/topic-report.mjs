/**
 * KONU TESTI RAPORU - hangi konu daha cok izleniyor/abone getiriyor?
 *
 * Yayinlanan videolari icerikteki "topic" alanina baglar, konu bazinda
 * ortalama izlenme cikarir. Test bitince hangi konuya agirlik verecegimizi
 * tahminle degil sayiyla belirler.
 *
 * Kullanim: node scripts/topic-report.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-tuyosu.json'), 'utf-8'));

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
if (!AT) { console.error('token alinamadi'); process.exit(1); }
const H = { Authorization: `Bearer ${AT}` };
const get = async (u) => (await fetch(u, { headers: H })).json();

const norm = s => (s || '').toLocaleLowerCase('tr-TR').replace(/[.,;:!?'"…]/g, '').replace(/\s+/g, ' ').trim();
function findEntry(title) {
  const t = norm(String(title).replace(/\s*#shorts\s*$/i, '').split('|')[0].replace(/\.\.\.\s*$/, ''));
  if (t.length < 15) return null;
  return content.find(e => {
    const v = norm(e.verse);
    return v.startsWith(t.slice(0, Math.min(t.length, 60))) || t.startsWith(v.slice(0, 45));
  });
}
function durSec(iso) { const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || []; return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0); }

const ch = await get('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&mine=true');
if (!ch.items) { console.error('kanal okunamadi (kota?)'); process.exit(1); }
const up = ch.items[0].contentDetails.relatedPlaylists.uploads;
let ids = [], pt = '';
do {
  const r = await get(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50&pageToken=${pt}`);
  if (!r.items) break;
  ids.push(...r.items.map(i => i.contentDetails.videoId)); pt = r.nextPageToken || '';
} while (pt);

const rows = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await get('https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=' + ids.slice(i, i + 50).join(','));
  for (const v of (r.items || [])) {
    if (durSec(v.contentDetails.duration) >= 100) continue;   // long-form haric
    const e = findEntry(v.snippet.title);
    rows.push({
      views: parseInt(v.statistics.viewCount || '0', 10),
      likes: parseInt(v.statistics.likeCount || '0', 10),
      date: (v.snippet.publishedAt || '').slice(0, 10),
      topic: e?.topic || (e?.moods?.[0]) || '(eslesmedi)',
      title: v.snippet.title.slice(0, 40)
    });
  }
}

const g = {};
for (const r of rows) (g[r.topic] ||= []).push(r);
const stat = Object.entries(g)
  .map(([k, arr]) => ({
    topic: k, n: arr.length,
    avg: Math.round(arr.reduce((a, b) => a + b.views, 0) / arr.length),
    like: (arr.reduce((a, b) => a + b.likes, 0) / Math.max(arr.reduce((a, b) => a + b.views, 0), 1) * 100).toFixed(2)
  }))
  .filter(x => x.n >= 2)
  .sort((a, b) => b.avg - a.avg);

console.log(`KONU TESTI RAPORU | ${rows.length} Shorts | kanal aboneleri: ${ch.items[0].statistics.subscriberCount}\n`);
console.log('  konu                 video   ort izlenme   begeni%');
for (const s of stat) {
  const bar = '#'.repeat(Math.min(Math.round(s.avg / 60), 30));
  console.log(`  ${s.topic.padEnd(20)} ${String(s.n).padStart(3)}   ${String(s.avg).padStart(8)}      ${s.like.padStart(5)}  ${bar}`);
}
const tested = stat.filter(s => s.n >= 3);
if (tested.length > 1) {
  console.log(`\n  EN IYI: ${tested[0].topic} (${tested[0].avg}) | EN ZAYIF: ${tested[tested.length - 1].topic} (${tested[tested.length - 1].avg})`);
  console.log(`  Fark: ${(tested[0].avg / Math.max(tested[tested.length - 1].avg, 1)).toFixed(1)}x`);
}
