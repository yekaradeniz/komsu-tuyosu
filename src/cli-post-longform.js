/**
 * Long-form videoyu YouTube'a yukler (render-longform-komsu.js'ten sonra calisir).
 * - output/komsu-longform-meta.json'dan o haftanin bilgisini okur
 * - video + kapak yukler (uploadLongform)
 * - basariliysa output/longform-state.json'daki haftalik index'i ilerletir
 *
 * Idempotent guvenlik: upload basarisizsa state ilerlemez -> sonraki tetikte
 * ayni hafta tekrar denenir (sira atlanmaz).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { uploadLongform } from './uploadLongform.js';
import { buildSeo } from './seoMeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'output');

const META_PATH = join(OUT_DIR, 'komsu-longform-meta.json');
const STATE_PATH = join(OUT_DIR, 'longform-state.json');
const THUMB_PATH = join(OUT_DIR, 'komsu-thumb.png');

if (!existsSync(META_PATH)) { console.error('Meta yok - once render calistirin'); process.exit(1); }
const meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
const data = JSON.parse(readFileSync(join(ROOT, 'content', 'komsu-longform.json'), 'utf-8'));
const perWeek = data.perWeek || 5;

const videoPath = meta.videoPath || join(OUT_DIR, 'komsu-longform.mp4');
if (!existsSync(videoPath)) { console.error(`Video yok: ${videoPath}`); process.exit(1); }
const thumbnailPath = existsSync(THUMB_PATH) ? THUMB_PATH : null;
if (!thumbnailPath) console.warn('Kapak (komsu-thumb.png) yok - kapaksiz yuklenecek');

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
for (const [n, v] of Object.entries({ YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN })) {
  if (!v) { console.error('Env eksik:', n); process.exit(1); }
}

// DINAMIK SEO: baslik + aciklama (zaman damgali bolumler) + etiketler, o haftanin tuyolarindan
const { title, description, tags } = buildSeo({ items: meta.items });

console.log(`Long-form upload: HAFTA ${meta.weekNo} - "${title}"`);
console.log(`Tuyolar: ${meta.items.map(i => i.id).join(', ')}`);

const res = await uploadLongform({
  videoPath, thumbnailPath, title, description, tags,
  clientId: YOUTUBE_CLIENT_ID, clientSecret: YOUTUBE_CLIENT_SECRET, refreshToken: YOUTUBE_REFRESH_TOKEN
});

console.log(`✓ Yuklendi: ${res.url} (kapak: ${res.thumbnailSet ? 'set edildi' : 'set EDILEMEDI - elle ekle'})`);

// State ilerlet (sadece basarili upload sonrasi)
const nextIndex = (meta.index || 0) + perWeek;
const today = new Date().toISOString().slice(0, 10);
writeFileSync(STATE_PATH, JSON.stringify({
  index: nextIndex,
  lastPost: { date: today, weekNo: meta.weekNo, fromIndex: meta.index, videoId: res.videoId, url: res.url }
}, null, 2));
console.log(`State ilerletildi: bir sonraki hafta index ${nextIndex} (hafta ${Math.floor(nextIndex / perWeek) + 1})`);
