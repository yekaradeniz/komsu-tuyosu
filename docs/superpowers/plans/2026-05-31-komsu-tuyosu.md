# Komşu Tüyosu Kanal Kurulumu - Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Zihnin Sırları" (`/Users/yunusemrekaradeniz/Desktop/BeyinOyunlari`, repo `zihnimizin-sirlari`) otomasyonunu birebir klonlayıp "Komşu Tüyosu" adlı ev/yaşam ipuçları kanalına dönüştürmek; her gün 09:15 TR'de otomatik reel üretip YouTube'a (sonra Instagram'a) atan, $0/ay maliyetli bir sistem kurmak.

**Architecture:** Mevcut Zihnin Sırları sistemi yeni bir klasöre (`/Users/yunusemrekaradeniz/Desktop/KomsuTuyosu`) kopyalanır, git geçmişi ve eski state/output temizlenir, kanal-spesifik tüm yerler (marka adı, hashtag, Pexels query'leri, renkler, müzik, etiketler, YouTube tag'leri, schedule) Komşu Tüyosu'na göre uyarlanır. İçerik şeması aynı kalır (`verse`=hook/soru, `explanation`=ipucu+neden). Yeni GitHub repo + yeni YouTube OAuth token + secrets ile canlıya alınır.

**Tech Stack:** Node.js 20+, Playwright (Chromium render), ffmpeg-static, ElevenLabs TTS, Pexels video API, YouTube Data API v3, GitHub Actions (cron + workflow_dispatch).

**Kaynak repo:** `/Users/yunusemrekaradeniz/Desktop/BeyinOyunlari`
**Hedef klasör:** `/Users/yunusemrekaradeniz/Desktop/KomsuTuyosu`

**Görsel kimlik kararı (varsayılan):** Sıcak hardal-turuncu `#E08A2B` band + beyaz metin (mevcut kırmızı `#c62828` yerine). Alternatif: naneli yeşil `#3FA37A`. Task 9'da iki varyant render edilip kullanıcı onayına sunulur.

**İçerik kuralı (kritik):** Her ipucu gerçek ve test edilmiş olmalı. Tehlikeli karışım (çamaşır suyu + sirke vb.), yanlış efsane (sirke her yüzeye uygun değil), sağlık iddiası YASAK.

---

## Task 0: Repo'yu klonla ve temizle

**Files:**
- Create: `/Users/yunusemrekaradeniz/Desktop/KomsuTuyosu/` (tüm proje)

- [ ] **Step 1: Kaynağı kopyala (node_modules, .git, output, eski içerik hariç)**

```bash
rsync -av --exclude='node_modules' --exclude='.git' --exclude='output' \
  --exclude='content/beyin-oyunlari.json' --exclude='content/backlog-20-bekleyen.json' \
  --exclude='audio-beyinoyunlari' \
  /Users/yunusemrekaradeniz/Desktop/BeyinOyunlari/ \
  /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu/
```

- [ ] **Step 2: Yeni git repo başlat ve boş output klasörü oluştur**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
git init
mkdir -p output
echo '{}' > output/log.json
```

- [ ] **Step 3: package.json adını güncelle**

`package.json` içinde `"name": "benden-iceri"` → `"name": "komsu-tuyosu"`, `"description"` → `"Daily ev/yaşam ipuçları, automated to YouTube"`.

- [ ] **Step 4: Bağımlılıkları kur ve mevcut testlerin geçtiğini doğrula**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
npm install
npx playwright install chromium
npm test
```
Expected: Testler PASS (kanal-spesifik string testi varsa kırılabilir, Task 2'de düzeltilecek; not al).

- [ ] **Step 5: İlk commit**

```bash
git add -A
git commit -m "chore: Zihnin Sirlari kodundan Komsu Tuyosu iskeleti"
```

---

## Task 1: İçerik dosyası - ilk 30 ev ipucu

**Files:**
- Create: `KomsuTuyosu/content/komsu-tuyosu.json`
- Modify: `KomsuTuyosu/src/cli-render.js:19` (content dosya adı)

İçerik şeması Zihnin Sırları ile birebir aynı. Her entry:
```json
{
  "id": "kt-0001",
  "day": 1,
  "concept": "Sirke ile cam temizliği",
  "verse": "Pahalı cam temizleyici alma, mutfaktaki şu şey çok daha iyi parlatıyor",
  "explanation": "Bir su bardağı suya iki yemek kaşığı beyaz sirke ekle, mikrofiber bezle sil. Sirke kireç ve yağ kalıntısını çözer, iz bırakmadan parlatır. Not: doğal taş ve mermer yüzeylerde kullanma, sirke bu yüzeyleri aşındırır.",
  "moods": ["cleaning", "kitchen"],
  "pexelsQuery": ["cleaning window", "wiping glass", "spray bottle cleaning"],
  "caption": "Sen biliyor muydun?"
}
```

- [ ] **Step 1: 30 doğrulanmış ipucu yaz**

`content/komsu-tuyosu.json` oluştur. 30 entry, kategori dağılımı: temizlik (8), mutfak (7), çamaşır (5), organizasyon (4), koku/leke (4), tasarruf (2). Her `verse` bir merak/tasarruf hook'u, her `explanation` net ipucu + kısa "neden" + gerekiyorsa güvenlik notu. Sezgilere aykırı olanları öne koy (örn. "yatağını hemen toplama").

- [ ] **Step 2: Her ipucunun doğruluğunu gözden geçir**

Listeyi tek tek tara: tehlikeli karışım yok, yanlış efsane yok, her ipucu test edilmiş/gerçek. Şüpheli olanı çıkar veya düzelt.

- [ ] **Step 3: cli-render.js'i yeni içerik dosyasına yönlendir**

`src/cli-render.js:19` civarındaki `content/beyin-oyunlari.json` referansını `content/komsu-tuyosu.json` yap.

- [ ] **Step 4: JSON geçerliliğini doğrula**

```bash
node -e "const d=require('./content/komsu-tuyosu.json'); console.log('entry sayisi:', d.length); d.forEach(e=>{if(!e.id||!e.verse||!e.explanation)throw new Error('eksik alan: '+e.id)}); console.log('OK')"
```
Expected: "entry sayisi: 30" ve "OK"

- [ ] **Step 5: Commit**

```bash
git add content/komsu-tuyosu.json src/cli-render.js
git commit -m "feat: ilk 30 ev ipucu icerigi + content dosya yolu"
```

---

## Task 2: Marka adı referansları

**Files:**
- Modify: `KomsuTuyosu/src/cli-render.js:252`
- Modify: `KomsuTuyosu/template/reel-mana-text.html:81`
- Modify: `KomsuTuyosu/.github/workflows/daily.yml:1`

- [ ] **Step 1: cli-render.js source alanını değiştir**

`src/cli-render.js:252`: `source: 'Zihnimizin Sırları'` → `source: 'Komşu Tüyosu'`

- [ ] **Step 2: Template footer'ını değiştir**

`template/reel-mana-text.html:81`: `<div class="footer">Zihnimizin Sırları</div>` → `<div class="footer">Komşu Tüyosu</div>`

- [ ] **Step 3: Workflow adını değiştir**

`.github/workflows/daily.yml:1`: `name: Daily Post - Zihnimizin Sirlari` → `name: Daily Post - Komsu Tuyosu`

- [ ] **Step 4: Kalan "Zihnimizin"/"beyin" referanslarını ara**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
grep -rin "zihnim\|zihnin\|beyin\|psikoloji" src/ template/ .github/ --include="*.js" --include="*.html" --include="*.yml"
```
Expected: Sadece Task 3-4'te ele alınacak buildCaption.js / uploadToYoutube.js satırları kalmalı. Başka çıkarsa düzelt.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: marka adi Komsu Tuyosu olarak guncellendi"
```

---

## Task 3: Caption + hashtag

**Files:**
- Modify: `KomsuTuyosu/src/buildCaption.js:6,8-16,20-27`

- [ ] **Step 1: CORE_TAGS değiştir**

`src/buildCaption.js:6`:
```javascript
const CORE_TAGS = ['#komşutüyosu', '#evipuçları', '#pratikbilgi'];
```

- [ ] **Step 2: ROTATION_POOL değiştir**

`src/buildCaption.js:8-16` içindeki psikoloji hashtag'lerini ev temasıyla değiştir:
```javascript
const ROTATION_POOL = [
  '#temizlik', '#evtüyoları', '#mutfaktüyoları', '#evdüzeni',
  '#pratikçözüm', '#evhanımı', '#organizasyon', '#çamaşır',
  '#tasarruf', '#leketemizliği', '#evbakımı', '#yaşamhilesi'
];
```

- [ ] **Step 3: INTRO_VARIANTS değiştir**

`src/buildCaption.js:20-27`:
```javascript
const INTRO_VARIANTS = [
  v => `${v}`,
  v => `${v}\n\nSen biliyor muydun?`,
  v => `Komşu Tüyosu | ${v}`,
];
```

- [ ] **Step 4: Caption üretimini test et**

```bash
node -e "import('./src/buildCaption.js').then(m=>console.log(m.buildCaption({verse:'Test hook',caption:'Sen biliyor muydun?'},'2026-06-01')))"
```
Expected: Komşu Tüyosu hashtag'leri içeren, psikoloji terimi içermeyen bir caption.

- [ ] **Step 5: Commit**

```bash
git add src/buildCaption.js
git commit -m "feat: caption ve hashtag ev temasina uyarlandi"
```

---

## Task 4: YouTube tag'leri

**Files:**
- Modify: `KomsuTuyosu/src/uploadToYoutube.js:64`

- [ ] **Step 1: tags array'ini değiştir**

`src/uploadToYoutube.js:64`:
```javascript
tags: ['ev ipuçları', 'komşu tüyosu', 'pratik bilgi', 'temizlik ipuçları', 'mutfak tüyoları', 'ev düzeni', 'organizasyon', 'yaşam hileleri', 'tasarruf', 'shorts'],
```

- [ ] **Step 2: Dosyada başka psikoloji referansı kalmadığını doğrula**

```bash
grep -in "psikoloji\|zihnim" src/uploadToYoutube.js
```
Expected: Çıktı yok.

- [ ] **Step 3: Commit**

```bash
git add src/uploadToYoutube.js
git commit -m "feat: YouTube tag'leri ev temasina uyarlandi"
```

---

## Task 5: Video etiketi (Cevap → İpucu)

**Files:**
- Modify: `KomsuTuyosu/template/reel-mana-text.html:77`

- [ ] **Step 1: header metnini değiştir**

`template/reel-mana-text.html:77`: `<div class="header">Cevap</div>` → `<div class="header">İPUCU</div>`

- [ ] **Step 2: Commit**

```bash
git add template/reel-mana-text.html
git commit -m "feat: video etiketi Cevap -> IPUCU"
```

---

## Task 6: Görsel kimlik - renk

**Files:**
- Modify: `KomsuTuyosu/template/reel-verse-text.html:33`
- Modify: `KomsuTuyosu/template/reel-mana-text.html:29,69`

- [ ] **Step 1: Hook (soru) band rengini değiştir**

`template/reel-verse-text.html:33`: `background-color: #c62828` → `background-color: #E08A2B`

- [ ] **Step 2: İpucu (cevap) band renklerini değiştir**

`template/reel-mana-text.html:29` ve `:69`: `background-color: #c62828` → `background-color: #E08A2B` (her iki satır)

- [ ] **Step 3: Renk tutarlılığını doğrula**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
grep -rn "#c62828\|#E08A2B" template/
```
Expected: `#c62828` hiç kalmamalı; üç adet `#E08A2B` olmalı.

- [ ] **Step 4: Commit**

```bash
git add template/
git commit -m "feat: marka rengi sicak hardal-turuncu (#E08A2B)"
```

---

## Task 7: Pexels arama query'leri (ev/yaşam teması)

**Files:**
- Modify: `KomsuTuyosu/src/fetchPexelsVideo.js:2-64`

- [ ] **Step 1: MOOD_QUERIES'i ev temasına çevir**

`src/fetchPexelsVideo.js:2-52` arasındaki `MOOD_QUERIES`'i değiştir:
```javascript
const MOOD_QUERIES = {
  'cleaning': [
    'cleaning home', 'wiping surface', 'spray bottle cleaning', 'mopping floor',
    'cleaning kitchen counter', 'scrubbing', 'microfiber cloth wiping',
    'cleaning bathroom', 'washing dishes', 'tidy home'
  ],
  'kitchen': [
    'modern kitchen', 'kitchen counter', 'cooking ingredients', 'kitchen organizing',
    'food preparation', 'kitchen utensils', 'refrigerator food', 'pantry organization'
  ],
  'laundry': [
    'laundry machine', 'folding clothes', 'washing machine close up', 'hanging laundry',
    'clean towels', 'laundry basket', 'fabric softener'
  ],
  'organizing': [
    'home organization', 'storage boxes', 'tidy closet', 'decluttering',
    'shelf organizing', 'drawer organization', 'minimal home interior'
  ],
  'cozy': [
    'cozy living room', 'warm home interior', 'home plants', 'comfortable home',
    'morning sunlight room', 'clean bedroom', 'home decoration'
  ],
};
```

- [ ] **Step 2: FALLBACK_QUERIES'i ev temasına çevir**

`src/fetchPexelsVideo.js:54-64` arasındaki `FALLBACK_QUERIES`'i değiştir:
```javascript
const FALLBACK_QUERIES = [
  'clean modern home', 'home interior', 'kitchen counter', 'cleaning home',
  'tidy living room', 'home organization', 'cozy home', 'household chores',
  'home plants', 'bright clean room'
];
```

- [ ] **Step 3: content moods ile MOOD_QUERIES anahtarlarının uyuştuğunu doğrula**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
node -e "const d=require('./content/komsu-tuyosu.json'); const keys=['cleaning','kitchen','laundry','organizing','cozy']; const bad=[...new Set(d.flatMap(e=>e.moods||[]))].filter(m=>!keys.includes(m)); console.log(bad.length?('eslesmeyen mood: '+bad):'tum moodlar eslesiyor')"
```
Expected: "tum moodlar eslesiyor" (değilse Task 1 içeriğindeki moods'ları bu beş anahtara hizala).

- [ ] **Step 4: Commit**

```bash
git add src/fetchPexelsVideo.js
git commit -m "feat: Pexels query'leri ev/yasam temasina uyarlandi"
```

---

## Task 8: Müzik

**Files:**
- Create: `KomsuTuyosu/audio-komsu-tuyosu/` (mp3 dosyaları)
- Modify: `KomsuTuyosu/src/renderReel.js:10`

- [ ] **Step 1: Yeni audio klasörü oluştur**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
mkdir -p audio-komsu-tuyosu
```

- [ ] **Step 2: Hafif/pozitif/gündelik müzikler ekle**

3-6 adet telifsiz, hafif, pozitif arka plan müziği (YouTube Audio Library veya Pexels music) `audio-komsu-tuyosu/` içine `.mp3` olarak ekle. Ney/cinematic DEĞİL. (Bu adım kullanıcı tarafından dosya indirilerek yapılır.)

- [ ] **Step 3: renderReel.js audio path'ini güncelle**

`src/renderReel.js:10`: `const AUDIO_DIR = join(__dirname, '..', 'audio-beyinoyunlari');` → `const AUDIO_DIR = join(__dirname, '..', 'audio-komsu-tuyosu');`

- [ ] **Step 4: Audio klasöründe en az bir mp3 olduğunu doğrula**

```bash
ls audio-komsu-tuyosu/*.mp3 | wc -l
```
Expected: En az 1.

- [ ] **Step 5: Commit**

```bash
git add audio-komsu-tuyosu/ src/renderReel.js
git commit -m "feat: ev temasi muzik klasoru + renderReel audio path"
```

---

## Task 9: Yerel test render + görsel onay

**Files:**
- (geçici) `KomsuTuyosu/output/*.mp4`

- [ ] **Step 1: Env değişkenlerini ayarla**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
export PEXELS_API_KEY=<mevcut anahtar>
export ELEVENLABS_API_KEY=<mevcut anahtar>
export ELEVENLABS_VOICE_ID=<sıcak Türkçe kadın sesi voice id>
export REELS_ENABLED=true
export CAROUSEL_ENABLED=false
```

- [ ] **Step 2: Bir reel render et**

```bash
npm run render
```
Expected: `output/YYYY-MM-DD.mp4` oluşur, hata yok.

- [ ] **Step 3: Çıktıyı aç ve kullanıcıya göster**

```bash
open output/*.mp4
```
Kullanıcı onayı al: renk (#E08A2B), font, seslendirme tonu/hızı, müzik seviyesi uygun mu? Hook → ipucu geçişi akıcı mı?

- [ ] **Step 4: (Gerekirse) yeşil varyantı da render edip karşılaştır**

Renk onaylanmazsa `#E08A2B` yerine `#3FA37A` (naneli yeşil) ile template'leri geçici değiştirip tekrar render et, iki çıktıyı yan yana göster, kullanıcı seçsin. Seçilen rengi template'lere kalıcı yaz.

- [ ] **Step 5: Onay sonrası ayarları sabitle ve commit**

Seslendirme hızı (`src/cli-render.js:143` soru, `:154` cevap) veya voice id ayarı değiştiyse uygula.
```bash
git add -A
git commit -m "tweak: test render sonrasi renk/ses/font ayarlari"
```

---

## Task 10: Yayın saati (09:15 TR)

**Files:**
- Modify: `KomsuTuyosu/.github/workflows/daily.yml:7`

- [ ] **Step 1: Cron'u 09:15 TR'ye ayarla**

09:15 TR (GMT+3) = 06:15 UTC. `.github/workflows/daily.yml:7`:
```yaml
- cron: '15 6 * * *'  # 06:15 UTC = 09:15 TR
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/daily.yml
git commit -m "chore: yayin saati 09:15 TR (06:15 UTC)"
```

---

## Task 11: YouTube kanalı + OAuth refresh token

**Files:**
- (yerel) `.env` veya kullanıcı notu (token)

Bu task büyük ölçüde manuel; kullanıcı adımları gerçekleştirir, sen rehberlik edersin. "Komşu Tüyosu" YouTube kanalı zaten kurulu.

- [ ] **Step 1: Google Cloud OAuth client kontrolü**

`console.cloud.google.com` mevcut projede (Zihnin Sırları için kullanılan) OAuth 2.0 Client ID'nin var olduğunu doğrula. Aynı client kullanılabilir; sadece Komşu Tüyosu Brand Account için yeni refresh_token alınacak.

- [ ] **Step 2: Auth URL ile Komşu Tüyosu için yetki ver**

Auth URL'i aç, Komşu Tüyosu Brand Account'unu seç, `youtube.upload` scope'unu onayla, authorization code'u al. (Zihnin Sırları kurulumunda kullanılan script/adımların aynısı.)

- [ ] **Step 3: Code'u refresh_token ile değiştir**

Token exchange yap, dönen `refresh_token`'ı güvenli kaydet (bu Komşu Tüyosu kanalına özel olacak).

- [ ] **Step 4: Yerelde tek video upload testi (opsiyonel ama önerilir)**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
export YOUTUBE_CLIENT_ID=<...> YOUTUBE_CLIENT_SECRET=<...> YOUTUBE_REFRESH_TOKEN=<yeni token>
npm run post
```
Expected: Video Komşu Tüyosu kanalına unlisted/yüklendi, YouTube'da kontrol et. (İstenirse test videosunu sil.)

---

## Task 12: GitHub repo + secrets

**Files:**
- GitHub repo: `yekaradeniz/komsu-tuyosu`

- [ ] **Step 1: GitHub repo oluştur ve push et**

```bash
cd /Users/yunusemrekaradeniz/Desktop/KomsuTuyosu
gh repo create komsu-tuyosu --public --source=. --push
```
(Public: Actions free quota sınırsız + raw URL erişimi açık, mevcut kanallardaki gibi.)

- [ ] **Step 2: Secrets ekle**

GitHub repo → Settings → Secrets and variables → Actions. Ekle:
- `PEXELS_API_KEY` (mevcut, Zihnin Sırları'ndan kopyala)
- `ELEVENLABS_API_KEY` (mevcut)
- `ELEVENLABS_VOICE_ID` (Komşu Tüyosu için seçilen ses)
- `YOUTUBE_CLIENT_ID` (mevcut)
- `YOUTUBE_CLIENT_SECRET` (mevcut)
- `YOUTUBE_REFRESH_TOKEN` (Task 11'de alınan YENİ token)
- `GEMINI_API_KEY` (mevcut, carousel kapalı olsa da workflow referansı için)

```bash
gh secret set PEXELS_API_KEY --body "<deger>" --repo yekaradeniz/komsu-tuyosu
# diğerleri aynı şekilde
```

- [ ] **Step 3: Secret listesini doğrula**

```bash
gh secret list --repo yekaradeniz/komsu-tuyosu
```
Expected: Yukarıdaki 7 secret görünür.

---

## Task 13: İlk canlı test ve devreye alma

- [ ] **Step 1: Workflow'u manuel tetikle**

GitHub repo → Actions → "Daily Post - Komsu Tuyosu" → Run workflow (workflow_dispatch).

- [ ] **Step 2: Çalışmayı izle**

Actions log'unda render → commit → post adımlarının başarılı olduğunu doğrula. `output/YYYY-MM-DD.mp4` repo'ya commit edilmeli, log'da "✓ Posted ..." görünmeli.

- [ ] **Step 3: YouTube'da videoyu kontrol et**

Komşu Tüyosu kanalında video yayınlandı mı, başlık/açıklama/tag'ler doğru mu, görsel ve ses kalitesi iyi mi?

- [ ] **Step 4: Sorun yoksa otomatik akışı onayla**

Cron kurulu (06:15 UTC / 09:15 TR). Sistem her gün otomatik çalışacak. İlk birkaç günü izle.

- [ ] **Step 5: (İkinci aşama) Instagram ekleme - opsiyonel**

İleride: yeni Instagram Business hesabı + Facebook Page + Graph API token, `IG_USER_ID` ve `IG_ACCESS_TOKEN` secret'ları, workflow'da Instagram post adımını aç. Bu plana dahil değil, ayrı bir iş.

---

## Notlar

- Zihnin Sırları (`BeyinOyunlari`) ve Salih Baba (`InstaTasavvuf`) sistemleri paralel çalışmaya devam eder, hiçbirine dokunulmaz.
- TikTok mevcut altyapıda yok; ikinci aşama işi.
- Maliyet: $0/ay (GitHub Actions free quota + mevcut API anahtarları).
