/**
 * Kanal anahtar kelimelerini ve aciklamasini gunceller.
 * Mevcut brandingSettings korunur, sadece keywords + description degisir.
 *
 * Neden: kanal ayarlari tamamen ev odakliydi. Nis testi videolari (hayvan,
 * uzay, deniz...) yayinlanirken kanal YouTube'a "ben ev kanaliyim" diyordu.
 * Ev kelimeleri KORUNUYOR (long-form ev serileri devam ediyor), yanina
 * konu bagimsiz bilgi kelimeleri eklendi.
 *
 * Kullanim: node scripts/update-channel-seo.mjs [--dry]
 */
const DRY = process.argv.includes('--dry');
const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;

const KEYWORDS = [
  // Ev (mevcut kimlik, long-form seriler bunun uzerine kurulu)
  'ev ipuçları', 'pratik bilgiler', 'temizlik ipuçları', 'ev temizliği', 'mutfak tüyoları',
  'ev düzeni', 'çamaşır ipuçları', 'leke çıkarma', 'ev bakımı', 'yaşam hileleri',
  'püf noktası', 'tasarruf ipuçları', 'pratik çözümler', 'ev işleri', 'ev hanımı',
  // Konu bagimsiz (nis testi + genel bilgi videolari)
  'ilginç bilgiler', 'biliyor muydun', 'genel kültür', 'bilgi videoları', 'kısa bilgi',
  'şaşırtıcı gerçekler', 'merak edilenler', 'nasıl yapılır', 'günlük yaşam',
];

const DESCRIPTION = `Komşu Tüyosu'na hoş geldin. Burası hem evini daha kolay çekip çevirmeni sağlayan pratik bilgilerin, hem de günlük hayatta karşına çıkan şeylerin arkasındaki gerçeklerin paylaşıldığı yer.

Her gün kısa bir video: temizlikten mutfağa, çamaşırdan ev düzenine, tasarruftan leke çıkarmaya kadar gerçekten işe yarayan ipuçları. Pahalı ürünlere ya da karmaşık yöntemlere gerek yok, çoğu zaman evinde zaten olan şeylerle.

"Biliyor muydun?" serisinde ise tek soru, net cevap: hayvanlardan uzaya, denizden mühendisliğe, merak ettiğin ama sormaya fırsat bulamadığın şeyler.

Haftada üç uzun video da var: haftanın tüyoları ve malzeme serisi (sirke, karbonat, limon ve evindeki diğer basit malzemeler).

"Bunu neden daha önce bilmiyordum" dedirten bilgiler için abone ol ve bildirimleri aç. Sen de bildiğin bir şey varsa yorumlarda paylaş, komşuluk böyle bir şey.`;

const kwString = KEYWORDS.map((k) => `"${k}"`).join(' ');
if (kwString.length > 500) { console.error(`keywords ${kwString.length} karakter, limit 500`); process.exit(1); }

const tr = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET,
    refresh_token: YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token',
  }),
});
const AT = (await tr.json()).access_token;
if (!AT) { console.error('token alinamadi'); process.exit(1); }
const H = { Authorization: `Bearer ${AT}` };

const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true', { headers: H })).json();
const item = ch.items[0];
const bs = item.brandingSettings;
console.log('--- ONCE ---');
console.log('keywords:', bs.channel.keywords);
console.log(`aciklama: ${bs.channel.description.length} karakter`);
console.log('\n--- SONRA ---');
console.log('keywords:', kwString, `(${kwString.length}/500)`);
console.log(`aciklama: ${DESCRIPTION.length} karakter`);
if (DRY) { console.log('\n(DRY RUN, yazilmadi)'); process.exit(0); }

bs.channel.keywords = kwString;
bs.channel.description = DESCRIPTION;
const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
  method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: item.id, brandingSettings: bs }),
});
console.log('\nHTTP', res.status, res.ok ? '✓ kanal guncellendi' : (await res.text()).slice(0, 400));
