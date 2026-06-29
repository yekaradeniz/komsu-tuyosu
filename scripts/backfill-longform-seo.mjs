/**
 * Yayinlanmis long-form videolarin SEO metadata'sini guncel buildSeo mantigiyla yeniden uretir
 * ve YouTube'a yazar (videos.update part=snippet). Video DOSYASINA dokunmaz, sadece metin/SEO.
 *
 * Neyi duzeltir:
 *  - Bolumler (chapters): eski "00:00 Giris" + ilk item 6-7sn => YouTube <10sn kurali nedeniyle
 *    tum bolumleri kapatiyordu. Yeni buildSeo ilk item'i 00:00'a sabitleyip gecerli bolum uretir.
 *  - Eksik defaultLanguage/defaultAudioLanguage='tr'
 *  - (malzeme) malzeme adinin tag'lerde olmamasi
 *  - Marka adi tag/hashtag temizligi (kanaldan kanala)
 *
 * Chapter zaman damgalari yalnizca CANLI aciklamada kalici (meta.json uzerine yaziliyor),
 * o yuzden her videonun mevcut aciklamasindan start'lari parse edip yeni SEO'ya enjekte ediyoruz.
 *
 * Kullanim:
 *   node --env-file=.env scripts/backfill-longform-seo.mjs          # dry-run (sadece gosterir)
 *   node --env-file=.env scripts/backfill-longform-seo.mjs --apply  # gercekten gunceller
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERIES, getSeries, resolveEpisode } from '../src/series.js';
import { buildSeo } from '../src/seoMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
for (const [n, v] of Object.entries({ YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN })) {
  if (!v) { console.error('Env eksik:', n); process.exit(1); }
}

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token'
    })
  });
  const d = await r.json();
  if (!d.access_token) { console.error('token alinamadi', d); process.exit(1); }
  return d.access_token;
}

const api = (access, url) => fetch(url, { headers: { Authorization: `Bearer ${access}` } }).then(r => r.json());

function isoToSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// Canli aciklamadaki "⏱️ Bölümler:" blokundan zaman damgalarini cikar (Giris dahil hepsi, sirayla).
function parseChapterStarts(desc) {
  const block = /⏱️ Bölümler:\n([\s\S]*?)(\n\n|$)/.exec(desc || '');
  if (!block) return null;
  const lines = block[1].split('\n').map(l => {
    const m = /^(\d{1,2}):(\d{2})\s+(.+)$/.exec(l.trim());
    return m ? { t: (+m[1]) * 60 + (+m[2]), label: m[3] } : null;
  }).filter(Boolean);
  return lines.length ? lines : null;
}

// Canli aciklamadaki "▸ <baslik>" madde imlerini cikar (baslik degisse de stabil eslestirme).
function parseBullets(desc) {
  return (desc || '').split('\n').filter(l => l.trim().startsWith('▸')).map(l => l.replace(/^\s*▸\s*/, '').trim());
}

// SEO uret: Komsu {items,material,videoTitle} / Zihin {concept,videoTitle,items}
function makeSeo(ep, items) {
  return ep.concept
    ? buildSeo({ concept: ep.concept, videoTitle: ep.videoTitle, items })
    : buildSeo({ items, material: ep.material || null, videoTitle: ep.videoTitle });
}

const access = await token();

// 1) Kanalin tum yuklemelerini cek
const ch = await api(access, 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true');
const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
if (!uploads) { console.error('uploads playlist bulunamadi', JSON.stringify(ch).slice(0, 300)); process.exit(1); }

let ids = [];
let pageToken = '';
do {
  const pl = await api(access, `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&pageToken=${pageToken}`);
  ids.push(...(pl.items || []).map(i => i.contentDetails.videoId));
  pageToken = pl.nextPageToken || '';
} while (pageToken);

// 2) Video detaylarini cek, long-form'lari (>65sn) filtrele
const live = [];
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50).join(',');
  const vids = await api(access, `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch}`);
  for (const v of vids.items || []) {
    const dur = isoToSec(v.contentDetails.duration);
    if (dur > 65) live.push({ id: v.id, title: v.snippet.title, description: v.snippet.description, categoryId: v.snippet.categoryId, durationSec: dur });
  }
}
console.log(`Long-form canli video sayisi: ${live.length}`);

// 3) Beklenen bolumleri uret (her seri icin sirayla), baslikla eslesir
const expected = [];
for (const sName of Object.keys(SERIES)) {
  const series = getSeries(sName);
  const data = JSON.parse(readFileSync(join(ROOT, 'content', series.contentFile), 'utf-8'));
  const step = series.mode === 'episodes' ? 1 : (data.perWeek || 5);
  for (let i = 0; ; i++) {
    const ep = resolveEpisode(series, data, i * step);
    if (!ep) break;
    const items = ep.items.map(it => ({ id: it.id, title: it.title, keyword: it.keyword }));
    const seo = makeSeo(ep, items);
    expected.push({ series: series.name, epNo: ep.episodeNo, ep, items, title: seo.title });
  }
}

// 4) Eslestir + guncelle
const updates = [];
for (const v of live) {
  const liveItems = parseBullets(v.description);
  const match =
    (liveItems.length && expected.find(e => norm(e.items.map(i => i.title).join('|')) === norm(liveItems.join('|'))))
    || expected.find(e => norm(e.title) === norm(v.title));
  if (!match) { console.log(`\n[ESLESMEDI] ${v.id} "${v.title}" (manuel bakilmali)`); continue; }

  const starts = parseChapterStarts(v.description);
  // Eski blok: [Giris, item1..itemN] => item start'lari Giris'ten sonrakiler
  let itemsWithStart = match.items;
  if (starts && starts.length === match.items.length + 1) {
    itemsWithStart = match.items.map((it, idx) => ({ ...it, start: starts[idx + 1].t }));
  } else if (starts && starts.length === match.items.length) {
    itemsWithStart = match.items.map((it, idx) => ({ ...it, start: starts[idx].t }));
  } else {
    console.log(`\n[UYARI] ${v.id} "${v.title}" chapter sayisi eslesmedi (parsed=${starts?.length}, items=${match.items.length}); chapters'siz guncellenecek`);
  }

  const seo = makeSeo(match.ep, itemsWithStart);
  const hasChapters = /⏱️ Bölümler:/.test(seo.description);
  updates.push({ id: v.id, categoryId: v.categoryId, series: match.series, epNo: match.epNo, oldTitle: v.title, seo, hasChapters });
}

console.log(`\nEslesen + guncellenecek: ${updates.length}/${live.length}\n${'='.repeat(60)}`);
for (const u of updates) {
  console.log(`\n● ${u.series} ep${u.epNo}  ${u.id}  (cat ${u.categoryId})  chapters:${u.hasChapters ? 'VAR' : 'YOK'}`);
  console.log(`  TITLE: ${u.seo.title}`);
  const chap = (/⏱️ Bölümler:\n([\s\S]*?)\n\n/.exec(u.seo.description) || [])[1];
  if (chap) console.log('  CHAPTERS:\n' + chap.split('\n').map(l => '    ' + l).join('\n'));
  console.log('  TAGS: ' + u.seo.tags.join(', '));
  if (/—/.test(u.seo.title + u.seo.description + u.seo.tags.join())) console.log('  !!! EM DASH TESPIT EDILDI');
}

if (!APPLY) {
  console.log(`\n(DRY-RUN. Gercekten yazmak icin --apply ekleyin.)`);
  process.exit(0);
}

console.log(`\n--apply: ${updates.length} video guncelleniyor...`);
for (const u of updates) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: u.id,
      snippet: {
        title: u.seo.title.slice(0, 100),
        description: u.seo.description,
        tags: u.seo.tags,
        categoryId: u.categoryId,
        defaultLanguage: 'tr',
        defaultAudioLanguage: 'tr'
      }
    })
  });
  const body = await res.text();
  console.log(`${res.ok ? '✓' : '✗ ' + res.status} ${u.series} ep${u.epNo} ${u.id}${res.ok ? '' : ' :: ' + body.slice(0, 200)}`);
}
console.log('Bitti.');
