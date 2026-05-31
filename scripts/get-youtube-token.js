// Lokal OAuth dance: Google'a yonlendirir, redirect'i yakalar, refresh_token doner.
// Kullanim:
//   1) Google Cloud Console'da OAuth Client ID olustur (Web application)
//   2) "Authorized redirect URIs" listesine ekle: http://localhost:8765/callback
//   3) Bu scripti calistir:
//        node scripts/get-youtube-token.js CLIENT_ID CLIENT_SECRET
//   4) Acilan tarayicida Brand Account "Zihnimizin Sirlari" sec
//   5) refresh_token terminale yazilir, GitHub Secrets'a koy

import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const [,, clientId, clientSecret] = process.argv;
if (!clientId || !clientSecret) {
  console.error('Kullanim: node scripts/get-youtube-token.js CLIENT_ID CLIENT_SECRET');
  process.exit(1);
}

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end('Not found');
    return;
  }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
       .end(`<h1>OAuth hata: ${err}</h1>`);
    console.error(`OAuth iptal/hata: ${err}`);
    server.close();
    return;
  }
  if (!code) {
    res.writeHead(400).end('code yok');
    return;
  }

  console.log('\nCode alindi, token icin Google\'a istek atiliyor...');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.refresh_token) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
       .end(`<h1>Token alinamadi</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
    console.error('Token alinamadi:', tokenData);
    server.close();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
     .end('<h1 style="font-family:sans-serif">✓ Basarili! Bu pencereyi kapatabilirsin.</h1>');

  console.log('\n=================================================================');
  console.log('REFRESH TOKEN (kopyala, GitHub Secrets > YOUTUBE_REFRESH_TOKEN):');
  console.log('=================================================================');
  console.log(tokenData.refresh_token);
  console.log('=================================================================\n');

  server.close();
});

server.listen(PORT, () => {
  console.log(`Lokal server: http://localhost:${PORT}`);
  console.log('\nTarayici aciliyor... acilmazsa su URL\'yi manuel ac:');
  console.log(authUrl.toString());
  console.log('\nKritik: acilan Google sayfasinda "Brand Account" sec ekraninda');
  console.log('mutlaka "Zihnimizin Sirlari" hesabini sec (kisisel kanal DEGIL).\n');

  // Mac'te otomatik ac
  exec(`open "${authUrl.toString()}"`);
});
