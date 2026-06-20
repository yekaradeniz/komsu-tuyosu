/**
 * Mevcut bir long-form videonun SEO metadata'sini gunceller (baslik/aciklama/etiket).
 * Kullanim: node scripts/update-video-seo.mjs <videoId> [weekNo]
 *   weekNo verilmezse 1 (havuzun ilk 5'i) kabul edilir.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSeo } from '../src/seoMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const [, , videoId, weekArg] = process.argv;
if (!videoId) { console.error('Kullanim: node scripts/update-video-seo.mjs <videoId> [weekNo]'); process.exit(1); }
const weekNo = parseInt(weekArg || '1', 10);

const data = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-longform.json'), 'utf-8'));
const perWeek = data.perWeek || 5;
const start = (weekNo - 1) * perWeek;
const items = (data.content || []).slice(start, start + perWeek)
  .map(it => ({ id: it.id, title: it.title, keyword: it.keyword }));
if (items.length === 0) { console.error('Bu haftada tuyo yok'); process.exit(1); }

const { title, description, tags } = buildSeo({ items });

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

const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${td.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: videoId,
    snippet: { title, description, tags, categoryId: '26', defaultLanguage: 'tr', defaultAudioLanguage: 'tr' }
  })
});
const body = await res.text();
console.log('HTTP', res.status);
if (res.ok) {
  console.log('✓ SEO guncellendi');
  console.log('\nBASLIK:', title);
  console.log('\nACIKLAMA:\n' + description);
  console.log('\nETIKETLER:', tags.join(', '));
} else {
  console.log('✗ Basarisiz:', body.slice(0, 500));
}
