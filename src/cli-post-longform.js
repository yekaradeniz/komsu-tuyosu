/**
 * Long-form videoyu YouTube'a yukler (render-longform-komsu.js'ten sonra calisir).
 * Seri-aware: --series weekly|malzeme (varsayilan weekly).
 * - <series>-meta.json'dan o bolumun bilgisini okur
 * - DINAMIK SEO (buildSeo) ile baslik/aciklama/etiket uretir, video + kapak yukler
 * - seri playlist'i varsa videoyu ekler
 * - basariliysa <series>-state.json index'ini bir bolum ilerletir
 *
 * Idempotent guvenlik: upload basarisizsa state ilerlemez -> sonraki tetikte ayni bolum
 * tekrar denenir (sira atlanmaz).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { uploadLongform } from './uploadLongform.js';
import { buildSeo } from './seoMeta.js';
import { getSeries } from './series.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'output');

const rawArgs = process.argv.slice(2);
const sIdx = rawArgs.indexOf('--series');
const series = getSeries(sIdx >= 0 ? rawArgs[sIdx + 1] : 'weekly');

const META_PATH = join(OUT_DIR, series.metaName);
const STATE_PATH = join(OUT_DIR, series.stateFile);
const THUMB_PATH = join(OUT_DIR, series.thumbName);

if (!existsSync(META_PATH)) { console.error(`Meta yok (${series.metaName}) - once render calistirin`); process.exit(1); }
const meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
const data = JSON.parse(readFileSync(join(ROOT, 'content', series.contentFile), 'utf-8'));
const step = series.mode === 'episodes' ? 1 : (data.perWeek || 5);

const videoPath = meta.videoPath || join(OUT_DIR, series.outName);
if (!existsSync(videoPath)) { console.error(`Video yok: ${videoPath}`); process.exit(1); }
const thumbnailPath = existsSync(THUMB_PATH) ? THUMB_PATH : null;
if (!thumbnailPath) console.warn(`Kapak (${series.thumbName}) yok - kapaksiz yuklenecek`);

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
for (const [n, v] of Object.entries({ YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN })) {
  if (!v) { console.error('Env eksik:', n); process.exit(1); }
}

// DINAMIK SEO: o bolumun item'larindan baslik + aciklama (zaman damgali) + etiket
const { title, description, tags } = buildSeo({ items: meta.items });

console.log(`[${series.name}] upload BOLUM ${meta.episodeNo} - "${title}"`);

const res = await uploadLongform({
  videoPath, thumbnailPath, title, description, tags,
  playlistId: series.playlistId || null,
  clientId: YOUTUBE_CLIENT_ID, clientSecret: YOUTUBE_CLIENT_SECRET, refreshToken: YOUTUBE_REFRESH_TOKEN
});

console.log(`✓ Yuklendi: ${res.url}`);
console.log(`  kapak: ${res.thumbnailSet ? 'set edildi' : 'set EDILEMEDI'} | playlist: ${res.playlistAdded ? 'eklendi' : (series.playlistId ? 'EKLENEMEDI' : 'yok')}`);

// State ilerlet (sadece basarili upload sonrasi)
const nextIndex = (meta.index || 0) + step;
const today = new Date().toISOString().slice(0, 10);
writeFileSync(STATE_PATH, JSON.stringify({
  index: nextIndex,
  lastPost: { date: today, episodeNo: meta.episodeNo, fromIndex: meta.index, videoId: res.videoId, url: res.url }
}, null, 2));
console.log(`State ilerletildi: bir sonraki bolum index ${nextIndex}`);
