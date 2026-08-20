// Eski Shorts basliklarini duzeltir: ortadan kesik basliklar ("...") yerine
// ILK TAM CUMLE. Aciklama/etiketler korunur (sadece title degisir).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-tuyosu.json'), 'utf-8'));

function buildTitle(verse, concept) {
  const firstLine = (String(verse).split('\n').find(l => l.trim().length > 0) ?? '').trim();
  const m = firstLine.match(/^(.{15,95}?[.?!])(\s|$)/);
  let base = m ? m[1].trim() : firstLine;
  if (base.length > 95) base = base.slice(0, 92).replace(/\s+\S*$/, '') + '...';
  if (concept && concept.trim()) {
    const c = concept.trim();
    const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[^0-9a-zçğıöşü ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm(base).includes(norm(c)) && base.length + c.length + 3 <= 88) base = `${base} | ${c}`;
  }
  const withTag = `${base} #Shorts`;
  return withTag.length <= 100 ? withTag : base.slice(0, 100);
}

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
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

const ch = await get('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true');
const up = ch.items[0].contentDetails.relatedPlaylists.uploads;
let ids = [], pt = '';
do {
  const r = await get(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50&pageToken=${pt}`);
  ids.push(...r.items.map(i => i.contentDetails.videoId)); pt = r.nextPageToken || '';
} while (pt);
const vids = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await get('https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=' + ids.slice(i, i + 50).join(','));
  vids.push(...r.items);
}

let ok = 0, same = 0, skip = 0, miss = 0;
for (const v of vids) {
  if (durSec(v.contentDetails.duration) >= 100) { skip++; continue; }
  const entry = findEntry(v.snippet.title);
  if (!entry) { miss++; console.log(`? eslesmedi: ${v.snippet.title.slice(0, 50)}`); continue; }
  const nt = buildTitle(entry.verse, entry.concept);
  if (nt === v.snippet.title) { same++; continue; }
  const sn = v.snippet;
  const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: v.id, snippet: {
      title: nt, description: sn.description, tags: sn.tags || [],
      categoryId: sn.categoryId || '26', defaultLanguage: 'tr', defaultAudioLanguage: 'tr'
    } })
  });
  if (res.ok) { ok++; console.log(`✓ ${nt.slice(0, 68)}`); }
  else console.log(`✗ (${res.status}) ${(await res.text()).slice(0, 100)}`);
}
console.log(`\nGuncellendi: ${ok} | zaten dogru: ${same} | long-form atlandi: ${skip} | eslesmedi: ${miss}`);
