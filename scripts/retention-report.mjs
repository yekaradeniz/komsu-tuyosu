// Izleyici tutma raporu (YouTube Analytics API): videolar NEREDE birakiliyor?
// Her nis testi videosu icin: izlenme, engagedViews (kaydirmayip kalanlar),
// ortalama izlenme orani ve tutma egrisi (audienceWatchRatio, 0..1 zaman orani).
// Sonda butun videolarin medyan egrisi ve format bazinda (entry.format) ozet.
//
// Kullanim: node scripts/retention-report.mjs [sonNVideo]   (varsayilan hepsi)
//           node scripts/retention-report.mjs 30 --json     (ham veri, stdout)
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAST_N = Number(process.argv[2]) || 0;
const AS_JSON = process.argv.includes('--json');
const iso = (d) => d.toISOString().slice(0, 10);

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token alinamadi: ' + (j.error || 'bilinmeyen hata'));
  return j.access_token;
}

// videoId -> icerik kaydi haritasi state dosyasinin commit gecmisinden cikar (tahmin yok).
function history(stateFile) {
  const commits = execSync(`git log --format=%H -- output/${stateFile}`, { cwd: ROOT })
    .toString().trim().split('\n').filter(Boolean);
  const out = new Map();
  for (const c of commits) {
    let lp;
    try {
      lp = JSON.parse(execSync(`git show ${c}:output/${stateFile}`, { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }).toString()).lastPost;
    } catch { continue; }
    if (!lp?.postId || lp.postId === 'None' || !lp.date) continue;
    if (!out.has(lp.postId)) out.set(lp.postId, { videoId: lp.postId, verseId: lp.verseId, date: lp.date });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function report(token, params) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.search = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.rows || [];
}

const median = (arr) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Egriden t (0..1) noktasindaki tutma oranini oku (en yakin ornek).
const at = (curve, t) => {
  if (!curve.length) return null;
  let best = curve[0];
  for (const p of curve) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
  return best[1];
};

const token = await accessToken();
const content = JSON.parse(readFileSync(join(ROOT, 'content', 'nis-testi.json'), 'utf-8'));
const byId = new Map(content.map((e) => [e.id, e]));
let videos = history('nis-log.json');
if (LAST_N) videos = videos.slice(-LAST_N);
const endDate = iso(new Date());

const POINTS = [0.02, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 0.99];
const rows = [];
for (const v of videos) {
  const e = byId.get(v.verseId) || {};
  try {
    const [m] = await report(token, {
      startDate: v.date, endDate,
      metrics: 'views,engagedViews,averageViewPercentage,averageViewDuration,subscribersGained,likes,shares',
      filters: `video==${v.videoId}`,
    });
    const curve = await report(token, {
      startDate: v.date, endDate,
      metrics: 'audienceWatchRatio',
      dimensions: 'elapsedVideoTimeRatio',
      filters: `video==${v.videoId}`,
    });
    if (!m) continue;
    const [views, engaged, avgPct, avgDur, subs, likes, shares] = m;
    rows.push({
      ...v, niche: e.niche, format: e.format || 'v1', concept: e.concept,
      views, engaged, stay: views ? engaged / views : 0, avgPct, avgDur, subs, likes, shares, curve,
    });
  } catch (err) {
    console.error(`${v.videoId}: ${err.message}`);
  }
}

if (AS_JSON) {
  console.log(JSON.stringify(rows));
  process.exit(0);
}

const pct = (x) => (x == null ? '   -' : String(Math.round(x * 100)).padStart(4));
console.log('videoId      tarih       nis          fmt  izl   kalan%  ort%  ' + POINTS.map((p) => `t${Math.round(p * 100)}`.padStart(4)).join(' '));
for (const r of rows) {
  console.log(
    `${r.videoId}  ${r.date}  ${(r.niche || '-').padEnd(11)}  ${r.format.padEnd(3)} ${String(r.views).padStart(5)}  ${pct(r.stay)}  ${String(Math.round(r.avgPct)).padStart(4)}  ` +
    POINTS.map((p) => pct(at(r.curve, p))).join(' ')
  );
}

function summary(label, set) {
  if (!set.length) return;
  const views = set.reduce((a, r) => a + r.views, 0);
  const subs = set.reduce((a, r) => a + r.subs, 0);
  console.log(
    `${label.padEnd(10)} n=${String(set.length).padStart(3)} | medyan izlenme ${median(set.map((r) => r.views))}` +
    ` | medyan kalan %${Math.round(median(set.map((r) => r.stay)) * 100)}` +
    ` | medyan izlenme orani %${median(set.map((r) => r.avgPct)).toFixed(1)}` +
    ` | 1000 izlenmede abone ${views ? (subs / views * 1000).toFixed(2) : '-'}` +
    `\n           medyan egri: ` + POINTS.map((p) => `t${Math.round(p * 100)}=${pct(median(set.map((r) => at(r.curve, p)).filter((x) => x != null))).trim()}`).join(' ')
  );
}

console.log('\n=== OZET (kalan% = engagedViews / views; egri = audienceWatchRatio x100) ===');
summary('HEPSI', rows);
for (const f of [...new Set(rows.map((r) => r.format))].sort()) summary(`fmt ${f}`, rows.filter((r) => r.format === f));
