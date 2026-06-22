// Kanal brandingSettings gunceller: varsayilan dil + tanitim videosu (trailer).
// Mevcut ayarlari (keywords vb.) KORUR, sadece bu iki alani ekler.
// Kullanim: node scripts/update-channel.mjs <trailerVideoId>
const trailer = process.argv[2];
const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;

const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const AT = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${AT}` };

// mevcut branding'i cek
const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true', { headers: H })).json();
const item = ch.items[0];
const bs = item.brandingSettings;
bs.channel = bs.channel || {};
bs.channel.defaultLanguage = 'tr';
if (trailer) bs.channel.unsubscribedTrailer = trailer;

const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
  method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: item.id, brandingSettings: bs })
});
const body = await res.text();
console.log('HTTP', res.status);
if (res.ok) console.log('✓ Kanal guncellendi: defaultLanguage=tr' + (trailer ? `, trailer=${trailer}` : ''));
else console.log('✗', body.slice(0, 400));
