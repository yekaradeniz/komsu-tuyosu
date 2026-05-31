# Zihnimizin Sirlari - YouTube Setup (Manuel Adimlar)

Bu doc, kanal lansman oncesi yapilmasi gereken 3 manuel adimi anlatir:
A) YouTube Brand Account
B) OAuth refresh token
C) GitHub Secrets

Toplam ~30 dk.

---

## A. YouTube Brand Account Olusturma (5 dk)

1. yekaradeniz@gmail.com ile https://studio.youtube.com aciniz.
2. Sag ust profil ikonuna basin -> "Hesabini degistir" -> "Yeni kanal olustur" / "Hesaplarini yonet".
3. "Yeni kanal olustur" -> Marka hesabi ekle.
4. Kanal adi: **Zihnimizin Sirlari**.
5. Olusturduktan sonra kanal sayfasinda: profil resmi (sade beyin simgesi olabilir), banner (sonra), aciklama:
   > Bilim temelli psikoloji ve davranis kavramlari, kisa video formatinda. Schadenfreude, Dunning-Kruger, Halo Effect ve daha fazlasi.
6. Kanal handle: `@zihniminsirlari` (mevcutsa `@zihnimizin.sirlari`).

---

## B. OAuth Refresh Token Alma (15 dk)

Bu adim YouTube'a otomatik upload yapabilmek icin.

### B.1 Google Cloud Console
1. https://console.cloud.google.com -> ust solda proje secici -> mevcut "Daily Quran" projesini sec
   (yenisini kurmak yerine mevcut proje uzerine yeni Client ID acilabilir, kotalar paylasilir).
2. Sol menu -> APIs & Services -> Credentials.
3. "Create Credentials" -> "OAuth Client ID" -> Application type: **Desktop app**.
4. Name: `Zihnimizin Sirlari Uploader`. Olustur.
5. Acilan dialogda Client ID ve Client Secret'i not al (asagida lazim).

### B.2 OAuth Consent Screen kontrolu
- Mevcut "Daily Quran" projesinde consent screen zaten External + Testing modunda olmali.
- Test users listesine `yekaradeniz@gmail.com` zaten ekli olmali. Degilse ekle.

### B.3 Authorization URL acma
Asagidaki URL'yi tarayicida ac (CLIENT_ID'yi yukaridakiyle degistir):

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=consent
```

- Onemli: `redirect_uri=urn:ietf:wg:oauth:2.0:oob` (out-of-band, manual code copy).
- Eger bu redirect reddedilirse OAuth Client'i editleyip "Authorized redirect URIs" listesine `http://localhost` ve `urn:ietf:wg:oauth:2.0:oob` ekle.

### B.4 Brand Account secimi (KRITIK)
Google sayfasi acildiginda "Hangi hesapla devam etmek istersiniz?" sorar.
- yekaradeniz@gmail.com sec.
- **Sonraki ekranda "Hangi kanal?" diye sorar - mutlaka "Zihnimizin Sirlari" Brand Account'unu sec, kisisel kanalini DEGIL.**
- Yanlis sec edersen token kisisel kanalina upload yapar. Bu durumda OAuth iptal et, baska Brand Account ile tekrar dene.

### B.5 Code -> refresh_token degisimi
Onay sonrasi sana bir authorization code verilir (4/0Ab... seklinde). Onu kopyala, asagidaki curl ile token'a cevir:

```bash
CODE="buraya_yapistir"
CLIENT_ID="..."
CLIENT_SECRET="..."

curl -X POST https://oauth2.googleapis.com/token \
  -d "code=$CODE" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code"
```

Yanitta `refresh_token` field'i olacak. Bunu kaydet (bir defa goruluyor).

---

## C. GitHub Secrets (5 dk)

https://github.com/yekaradeniz/zihnimizin-sirlari/settings/secrets/actions adresinde "New repository secret":

| Secret name | Deger |
|---|---|
| `YOUTUBE_CLIENT_ID` | B.1 Client ID |
| `YOUTUBE_CLIENT_SECRET` | B.1 Client Secret |
| `YOUTUBE_REFRESH_TOKEN` | B.5 refresh_token |
| `PEXELS_API_KEY` | InstaTasavvuf'taki ayni key, kopyala |
| `GEMINI_API_KEY` | InstaTasavvuf'taki ayni key, kopyala (opsiyonel; yoksa video moderasyon atlanir) |

PEXELS_API_KEY ve GEMINI_API_KEY benden-iceri repo'sundan kopyalanabilir:
`gh secret list -R yekaradeniz/benden-iceri` (sen erisimliysen) veya
benden-iceri Settings -> Secrets sayfasindan al.

---

## D. Ilk Test Run (5 dk)

1. https://github.com/yekaradeniz/zihnimizin-sirlari/actions/workflows/daily.yml
2. Sag ust "Run workflow" -> Branch: main -> Run.
3. ~5-8 dk sonra run yesil olmali. Output: hem mp4 commit'lenir hem YouTube'a upload edilir.
4. https://studio.youtube.com -> kanal -> son video. Public.

---

## E. Cron Onayi

Workflow `cron: '30 9 * * *'` UTC. TR'de 12:30. Yarin 12:30'da otomatik post atilir.

Salih Baba 19:00'da, Zihnimizin Sirlari 12:30'da. Catismaz.

---

## F. Lansman Sonrasi Liste (Sonraki Sprint)

- [ ] Kanal banner (Photoshop/Canva ile koyu lacivert + "Zihnimizin Sirlari" yazi)
- [ ] Profil resmi (beyin/maske/figur)
- [ ] 70 yeni icerik (Gemini ile toplu uretim)
- [ ] Pinned video (kanal tanitimi)
- [ ] About sayfasi (mail, dis baglantilar)
