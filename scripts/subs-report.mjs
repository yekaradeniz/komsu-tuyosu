// Video basina abone/retention raporu (YouTube Analytics API).
// Nis testi (nis-log.json) ile normal Shorts (log.json) akisini karsilastirir.
// Her video ayni uzunlukta pencerede olculur, yoksa eski videolar avantajli cikar.
//
// Kullanim: node scripts/subs-report.mjs [pencereGunu]   (varsayilan 3)
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOW_DAYS = Number(process.argv[2] || 3);

// Analytics verisi 2 gune kadar gecikebilir, bu yuzden son gunu disarida birak.
const LAG_DAYS = 2;
const today = new Date();
const maxDate = new Date(today.getTime() - LAG_DAYS * 864e5);
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
  if (!j.access_token) throw new Error('token alinamadi: ' + JSON.stringify(j));
  return j.access_token;
}

// State dosyasinin commit gecmisinden videoId -> yayin tarihi haritasi cikarir.
// Tahmin yok: her satir o gun gercekten post edilen videonun kaydi.
function historyFrom(stateFile) {
  const commits = execSync(`git log --format=%H -- output/${stateFile}`, { cwd: ROOT })
    .toString().trim().split('\n').filter(Boolean);
  const out = new Map();
  for (const c of commits) {
    let raw;
    try { raw = execSync(`git show ${c}:output/${stateFile}`, { cwd: ROOT, stdio: ['pipe','pipe','ignore'] }).toString(); }
    catch { continue; }
    let lp;
    try { lp = JSON.parse(raw).lastPost; } catch { continue; }
    if (!lp?.postId || lp.postId === 'None' || !lp.date) continue;
    if (!out.has(lp.postId)) out.set(lp.postId, { videoId: lp.postId, verseId: lp.verseId, date: lp.date });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function statsFor(token, video, startDate, endDate) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.search = new URLSearchParams({
    ids: 'channel==MINE',
    startDate, endDate,
    metrics: 'views,subscribersGained,subscribersLost,averageViewPercentage,averageViewDuration,estimatedMinutesWatched',
    filters: `video==${video}`,
  });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (j.error) throw new Error(`${video}: ${j.error.message}`);
  const row = j.rows?.[0];
  if (!row) return null;
  const [views, gained, lost, avgPct, avgDur, mins] = row;
  return { views, gained, lost, net: gained - lost, avgPct, avgDur, mins };
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function summarize(label, rows) {
  const full = rows.filter((r) => r.stats && r.complete);
  if (!full.length) return { label, n: 0 };
  const sum = (f) => full.reduce((a, r) => a + f(r.stats), 0);
  const views = sum((s) => s.views);
  const net = sum((s) => s.net);
  return {
    label,
    n: full.length,
    views,
    net,
    medViews: median(full.map((r) => r.stats.views)),
    // Asil metrik: 1000 izlenme basina net abone. Izlenme farkini notrler.
    subsPer1k: views ? +(net / views * 1000).toFixed(2) : 0,
    // Medyan: Shorts loop'lari %300+ izlenme orani uretiyor, ortalama bunlarla bozuluyor.
    medPct: +median(full.map((r) => r.stats.avgPct)).toFixed(1),
    medDur: +median(full.map((r) => r.stats.avgDur)).toFixed(1),
    withSub: full.filter((r) => r.stats.net > 0).length,
  };
}

function printSummary(s) {
  if (!s.n) { console.log(`${s.label}: veri yok`); return; }
  console.log(
    `${s.label.padEnd(14)} ${String(s.n).padStart(2)} video | medyan izlenme ${String(s.medViews).padStart(4)}` +
    ` | net abone ${String(s.net).padStart(2)} | 1000 izlenmede ${String(s.subsPer1k).padStart(4)}` +
    ` | abone getiren ${s.withSub}/${s.n} | medyan izlenme orani %${s.medPct} (${s.medDur}sn)`
  );
}

const token = await accessToken();
const nicheContent = JSON.parse(readFileSync(join(ROOT, 'content', 'nis-testi.json'), 'utf-8'));
const nicheList = Array.isArray(nicheContent) ? nicheContent : nicheContent.entries;
const nicheOf = new Map(nicheList.map((e) => [e.id, e.niche]));

const groups = [
  { label: 'Nis testi', state: 'nis-log.json', niche: true },
  { label: 'Normal Komsu', state: 'log.json', niche: false },
];

const all = [];
for (const g of groups) {
  const hist = historyFrom(g.state).filter((h) => h.date >= '2026-08-10');
  for (const h of hist) {
    const start = h.date;
    const wanted = new Date(new Date(start).getTime() + (WINDOW_DAYS - 1) * 864e5);
    const complete = wanted <= maxDate;
    const end = iso(complete ? wanted : maxDate);
    let stats = null;
    try { stats = await statsFor(token, h.videoId, start, end); }
    catch (e) { console.error('  !', e.message); }
    all.push({ ...h, group: g.label, niche: g.niche ? nicheOf.get(h.verseId) : null, stats, complete });
  }
}

console.log(`\nPencere: yayin gunu + ${WINDOW_DAYS - 1} gun. Analytics ${LAG_DAYS} gun gecikmeli, son tarih ${iso(maxDate)}.\n`);
console.log('video        tarih       grup          nis        izlenme  netAbone  /1k    %izl  sn');
console.log('-'.repeat(92));
for (const r of all) {
  const s = r.stats;
  const per1k = s && s.views ? (s.net / s.views * 1000).toFixed(2) : '-';
  console.log(
    r.videoId.padEnd(12),
    r.date.padEnd(11),
    r.group.padEnd(13),
    (r.niche || '-').padEnd(10),
    String(s?.views ?? '-').padStart(7),
    String(s?.net ?? '-').padStart(9),
    String(per1k).padStart(6),
    String(s?.avgPct ?? '-').padStart(6),
    String(s?.avgDur ?? '-').padStart(4),
    r.complete ? '' : '(pencere dolmadi)'
  );
}

console.log('\n=== TUM DONEM ===');
groups.map((g) => summarize(g.label, all.filter((r) => r.group === g.label))).forEach(printSummary);

// Dead-air/sure duzeltmesi 2026-08-21'de girdi. Ondan onceki normal videolar farkli
// bir uretim hattindan geliyor, nis testiyle ayni kefeye konamaz.
const nicheStart = all.filter((r) => r.group === 'Nis testi').map((r) => r.date).sort()[0];
console.log(`\n=== ESLESEN DONEM (${nicheStart} sonrasi, ayni uretim hatti) ===`);
groups.map((g) => summarize(g.label, all.filter((r) => r.group === g.label && r.date >= nicheStart))).forEach(printSummary);

const byNiche = {};
for (const r of all.filter((r) => r.niche && r.stats && r.complete)) {
  (byNiche[r.niche] ||= []).push(r);
}
if (Object.keys(byNiche).length) {
  console.log('\n=== NIS KIRILIMI ===');
  for (const [niche, rows] of Object.entries(byNiche).sort((a, b) => b[1].length - a[1].length)) {
    printSummary(summarize(niche, rows));
  }
}

const done = all.filter((r) => r.stats && r.complete).length;
console.log(`\nOlculen ${done} video. Kalan ${all.length - done} videonun ${WINDOW_DAYS} gunluk penceresi dolmadi.`);
