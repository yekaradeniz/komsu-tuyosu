// Long-form videolarin SEO'sunu KESIN videoId->bolum haritasiyla yeniler.
// (Baslik tahminiyle eslestirme yanlis sonuc veriyordu: haftalik videonun
// basligindaki "Bal"/"Patates" kelimesi malzeme sanilip yanlis metadata yazildi.)
// Harita git gecmisindeki state commit'lerinden cikarildi - %100 kesin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSeo } from '../src/seoMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// episodeNo (1-tabanli) -> videoId
const MALZEME = {
  1: 'lD___jtpjOw', 2: 'XzCKtqx9QqM', 3: 'b0Tjtmzm2HY', 4: 'iP_mMeLFmwc',
  5: 'ys6RGr8KjRc', 6: 't2jexurXepo', 7: '4RlrTn9mNxw', 8: 'TyUXoqOvcdI',
  9: 'IMcTK4_bEwo', 10: 'GlxNJYtbwT4', 11: 'YJx_7iavPA4', 12: 'bldAFAnc1bs'
};
const WEEKLY = {
  1: 'qzcM6-rDvak', 2: '3L3x9rmCOhg', 3: 'G9Fx5im5B7o',
  4: '2jkSytRKqSM', 5: 'X0u_DoMHh1g', 6: '4SBK9mWlKTY'
};

const weekly = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-longform.json'), 'utf-8'));
const malzeme = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-malzeme.json'), 'utf-8'));
const perWeek = weekly.perWeek || 5;
const pool = (weekly.content || []).filter(u => u.question && u.answer);

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${AT}`, 'Content-Type': 'application/json' };

async function push(videoId, items, material, label) {
  const { title, description, tags } = buildSeo({ items, material });
  const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ id: videoId, snippet: { title, description, tags, categoryId: '26', defaultLanguage: 'tr', defaultAudioLanguage: 'tr' } })
  });
  if (res.ok) console.log(`✓ ${label} -> ${title.slice(0, 60)}`);
  else console.log(`✗ ${label} (${res.status}): ${(await res.text()).slice(0, 140)}`);
  return res.ok;
}

let ok = 0;
// Malzeme serisi
for (const [ep, vid] of Object.entries(MALZEME)) {
  const v = malzeme.videos[Number(ep) - 1];
  if (!v) { console.log(`! malzeme bolum ${ep} havuzda yok`); continue; }
  const items = v.items.map(it => ({ id: it.id, title: it.title, keyword: it.keyword }));
  if (await push(vid, items, v.material, `malzeme#${ep} ${v.material}`)) ok++;
}
// Haftalik seri
for (const [ep, vid] of Object.entries(WEEKLY)) {
  const start = (Number(ep) - 1) * perWeek;
  const items = pool.slice(start, start + perWeek).map(it => ({ id: it.id, title: it.title, keyword: it.keyword }));
  if (!items.length) { console.log(`! haftalik ${ep} bos`); continue; }
  if (await push(vid, items, null, `haftalik#${ep}`)) ok++;
}
console.log(`\nDuzeltildi: ${ok}/${Object.keys(MALZEME).length + Object.keys(WEEKLY).length}`);
