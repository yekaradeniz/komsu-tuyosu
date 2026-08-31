/**
 * Yayinlanmis nis testi videolarinin SEO'sunu duzeltir.
 *
 * Sorun: nis videolari kanalin ev sablonuyla yuklendi. Ahtapot videosunda
 * '#leketemizligi' hashtag'i, 'ev ipuclari' etiketi, 'Howto & Style'
 * kategorisi ve 'Pratik Ev Ipuclari' playlisti vardi. Hem YouTube'a celiskili
 * sinyal veriyor hem izleyiciye alakasiz goruyordu.
 *
 * Duzeltilen: etiketler, hashtag satiri, aciklamadaki abone/playlist bloku,
 * kategori (26 -> 27 Education), playlist uyeligi.
 *
 * Kullanim: node scripts/fix-niche-seo.mjs [--dry]
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCaption } from '../src/buildCaption.js';
import { buildDescription, buildTags } from '../src/uploadToYoutube.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const EV_PLAYLIST = 'PLynH0txiEqh30D7_OctvEaSRpsZR2SCD2';
const NIS_PLAYLIST = process.env.NICHE_PLAYLIST_ID || 'PLSGgmX77Qg94';

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET,
    refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token',
  }),
});
const TOKEN = (await tr.json()).access_token;
if (!TOKEN) { console.error('token alinamadi'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// videoId -> {verseId, date} haritasi state commit gecmisinden. Baslik tahmini
// yanlis eslesme uretiyor, commit kaydi kesin.
const map = new Map();
for (const c of execSync('git log --format=%H -- output/nis-log.json', { cwd: ROOT }).toString().trim().split('\n')) {
  let lp;
  try { lp = JSON.parse(execSync(`git show ${c}:output/nis-log.json`, { cwd: ROOT, stdio: ['pipe','pipe','ignore'] }).toString()).lastPost; }
  catch { continue; }
  if (lp?.postId && lp.postId !== 'None' && !map.has(lp.postId)) map.set(lp.postId, { verseId: lp.verseId, date: lp.date });
}
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'nis-testi.json'), 'utf-8'));
const byId = new Map(content.map((e) => [e.id, e]));

console.log(`${map.size} yayinlanmis nis videosu bulundu.${DRY ? ' (DRY RUN)' : ''}\n`);

for (const [videoId, { verseId, date }] of map) {
  const entry = byId.get(verseId);
  if (!entry) { console.log(`${videoId}: ${verseId} icerikte yok, atlandi`); continue; }

  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`, { headers: H });
  const item = (await r.json()).items?.[0];
  if (!item) { console.log(`${videoId}: video okunamadi`); continue; }

  const snip = item.snippet;
  const desc = buildDescription(buildCaption(entry, date), entry.niche);
  const tags = buildTags(entry.moods, entry.concept, entry.niche);
  console.log(`${videoId} [${entry.niche}] ${snip.title.slice(0, 45)}`);
  console.log(`   kategori ${snip.categoryId} -> 27 | etiket ${snip.tags?.length ?? 0} -> ${tags.length}`);
  console.log(`   hashtag: ${desc.split('\n').find((l) => l.startsWith('#'))}`);

  if (DRY) continue;

  const up = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT', headers: H,
    body: JSON.stringify({ id: videoId, snippet: {
      title: snip.title, description: desc, tags,
      categoryId: '27', defaultLanguage: 'tr',
    } }),
  });
  if (!up.ok) { console.log(`   ! guncelleme hatasi: ${(await up.text()).slice(0, 160)}`); continue; }

  // Ev playlistinden cikar
  const pl = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=id,snippet&playlistId=${EV_PLAYLIST}&videoId=${videoId}&maxResults=5`, { headers: H });
  for (const it of (await pl.json()).items || []) {
    await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${it.id}`, { method: 'DELETE', headers: H });
  }
  // Nis playlistine ekle
  const add = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST', headers: H,
    body: JSON.stringify({ snippet: { playlistId: NIS_PLAYLIST, resourceId: { kind: 'youtube#video', videoId } } }),
  });
  console.log(`   guncellendi, playlist tasindi${add.ok ? '' : ' (playlist ekleme hatasi)'}`);
}
