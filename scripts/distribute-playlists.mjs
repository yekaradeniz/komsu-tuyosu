// Mevcut kanal videolarini sureye/baslige gore playlistlere dagitir (tek seferlik).
const PL = {
  HAFTANIN: 'PLynH0txiEqh26QdVivze5z7xUNmUMgFPP',  // Bu Haftanin Tuyolari (Cumartesi long-form)
  SHORTS: 'PLynH0txiEqh30D7_OctvEaSRpsZR2SCD2',    // Pratik Ev Ipuclari (Shorts)
  MALZEME: 'PLynH0txiEqh3-w7UG-tVtSAWuehnTYR8G'    // Malzeme Serisi (zaten dolu)
};

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  return (await r.json()).access_token;
}
const AT = await token();
const H = { Authorization: `Bearer ${AT}` };

function durSec(iso) {
  const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
}

// uploads playlist
const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: H })).json();
const uploads = ch.items[0].contentDetails.relatedPlaylists.uploads;

// tum video ID'leri (pagination)
let ids = [], pageToken = '';
do {
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&pageToken=${pageToken}`, { headers: H })).json();
  ids.push(...r.items.map(i => i.contentDetails.videoId));
  pageToken = r.nextPageToken || '';
} while (pageToken);

// detay (duration + title), 50'serli
const vids = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.slice(i, i + 50).join(',')}`, { headers: H })).json();
  vids.push(...r.items.map(v => ({ id: v.id, title: v.snippet.title, dur: durSec(v.contentDetails.duration) })));
}
console.log(`Toplam ${vids.length} video`);

// mevcut playlist iceriklerini cek (duplicate onleme)
async function plVideoIds(plId) {
  const set = new Set(); let pt = '';
  do {
    const r = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${plId}&maxResults=50&pageToken=${pt}`, { headers: H })).json();
    (r.items || []).forEach(i => set.add(i.contentDetails.videoId));
    pt = r.nextPageToken || '';
  } while (pt);
  return set;
}
const inHaftanin = await plVideoIds(PL.HAFTANIN);
const inShorts = await plVideoIds(PL.SHORTS);
const inMalzeme = await plVideoIds(PL.MALZEME);

async function add(plId, videoId) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId: plId, resourceId: { kind: 'youtube#video', videoId } } })
  });
  return r.ok;
}

let nS = 0, nH = 0, skip = 0;
for (const v of vids) {
  const isLong = v.dur >= 100;
  const isMalzeme = /^evde\s/i.test(v.title) || inMalzeme.has(v.id);   // malzeme serisi -> kendi playlistinde, dokunma
  let target = null, where = '';
  if (isMalzeme) { skip++; continue; }
  if (isLong) { target = PL.HAFTANIN; where = 'HAFTANIN'; if (inHaftanin.has(v.id)) { skip++; continue; } }
  else { target = PL.SHORTS; where = 'SHORTS'; if (inShorts.has(v.id)) { skip++; continue; } }
  const ok = await add(target, v.id);
  if (ok) { if (where === 'SHORTS') nS++; else nH++; }
  console.log(`${ok ? '✓' : '✗'} [${where}] ${v.dur}sn ${v.title.slice(0, 50)}`);
}
console.log(`\nEklendi -> Shorts: ${nS}, Haftanin: ${nH} | Atlanan (malzeme/zaten ekli): ${skip}`);
