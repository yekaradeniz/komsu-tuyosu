# Komşu Tüyosu - Yeni Kanal Tasarımı

Tarih: 2026-05-31
Durum: Tasarım onaylandı, kuruluma hazır

## Vizyon

`benden-iceri` (Salih Baba) sisteminin teknik altyapısını kullanarak üçüncü kanal: **Komşu Tüyosu**.

Hedef: Geniş kitle, hızlı büyüme, yüksek paylaşım/kaydetme oranı. Ev ve gündelik yaşam ipuçları.

Stratejik temel: AI/otomasyon içerik, kitlenin eleştirel filtresiyle ters orantılı çalışır. Finans/sağlık gibi otorite gerektiren alanlarda izleyici yapaylığı reddeder; duygu, merak, fayda odaklı alanlarda kimse "bu AI mı" diye sormaz. Ev ipuçları tam da bu güvenli bölgede: içerik faydalı ve gerçek olduğu sürece kaynağı sorgulanmaz.

YouTube kanalı kuruldu (yekaradeniz@gmail.com Brand Account).

## Önceki Kanallardan Farklılıklar

| | Salih Baba | Zihnin Sırları | Komşu Tüyosu |
|---|---|---|---|
| Niş | Tasavvuf şiiri | Davranış psikolojisi | Ev/yaşam ipuçları |
| Format | Beyit + Mânâ | Soru + Cevap | Hook + İpucu + Neden |
| Kitle | İslami, 30+ | Genel, 18-35 | Ev yöneten herkes, 25-55, kadın ağırlıklı |
| Görsel | Cami, altın, sıcak | Modern, koyu, soğuk | Sıcak, ferah, temiz |
| Müzik | Ney, makam | Cinematic, ambient | Hafif, pozitif, gündelik |
| Font | Cormorant (serif) | Modern sans | Yuvarlak dostane sans (Poppins/Nunito) |
| Marka rengi | #d9c79a (altın) | Mor/cyan/koyu | Hardal sarısı/turuncu + krem (ya da naneli yeşil) |
| Marka sesi | Derin, bilge | Yargısız, açıklayıcı | Samimi komşu ablası, "sana özel" |
| Etiket | "MÂNÂ" / "SALİH BABA" | "CEVAP" | "TÜYO" / "KOMŞU TÜYOSU" |

## Marka Sesi

İsmin kendisi marka sesini veriyor: samimi bir komşu ablası/teyzesi. "Bak komşu, sana bir şey söyleyeyim..." gibi içten açılışlar. "Senden biri sana özel paylaşıyor" hissi. Bu, AI seslendirmeyi bile insani ve sıcak gösterir, AI görünmezliği stratejisine doğrudan hizmet eder.

## Format - Algoritma Stratejisi

Self-contained içerik (Salih Baba ve Zihnin Sırları ile aynı prensip). Cevap/fayda video içinde, caption'a kaçmaz.

### Zamanlama planı (~20-30 sn reel)
- 0-3sn: Hook (merak veya tasarruf) - "Pahalı temizleyici alma..." / "Yatağını hemen toplama..."
- 4-20sn: İpucu (net, uygulanabilir)
- 20-28sn: Kısa "neden"i (mekanizma/fayda)
- 28-30sn: Outro/kanal etiketi

### En güçlü içerik açısı: sezgilere aykırı ipuçları
"Uyanınca yatağını hemen toplama, çünkü akarlar..." gibi counter-intuitive hook'lar merak yaratır, completion rate yükseltir.

## İçerik Kuralları

1. **Karakter:** Hook kısa (~40-60 char), ipucu + neden orta uzunluk (240-300 char civarı, Salih Baba mana sınırı ile uyumlu).
2. **DOĞRULUK ZORUNLU:** Her ipucu gerçek ve test edilmiş olmalı. Ev efsaneleri yasak (örnek: sirke mermer/doğal taşa zarar verir, her yüzeye önerilmez; bu tür nüanslar atlanmaz).
3. **Tehlikeli/yanlış öneri yok:** Sağlık iddiası, hatalı kimyasal karışım önerisi (çamaşır suyu + sirke gibi) kesinlikle yok.
4. **Format:** Hook + ipucu + kısa neden.
5. **Ton:** Samimi, sıcak, "sana özel paylaşıyorum."
6. **Kategoriler:** Temizlik, mutfak, çamaşır, organizasyon, koku/leke, tasarruf, banyo, küçük ev bakımı.

## Tech Setup Yol Haritası

### 1. Yeni Brand Account (TAMAMLANDI)
- YouTube'da "Komşu Tüyosu" kanalı kuruldu.

### 2. Yeni OAuth refresh token
- console.cloud.google.com mevcut proje
- Auth URL aç, Komşu Tüyosu Brand Account seç, code al, token exchange, refresh_token

### 3. Yeni Instagram hesabı (opsiyonel, ikinci aşama)
- Business/Creator hesap, Facebook Page bağlama, Graph API token

### 4. Yeni repo
- `komsu-tuyosu` adlı GitHub repo
- benden-iceri kodunu klonla/temizle
- Secrets:
  - `YOUTUBE_CLIENT_ID` (mevcut)
  - `YOUTUBE_CLIENT_SECRET` (mevcut)
  - `YOUTUBE_REFRESH_TOKEN` (YENİ)
  - `PEXELS_API_KEY` (mevcut)
  - `ELEVENLABS_API_KEY` (seslendirme için, mevcut sistemde kullanılıyor)
  - `GEMINI_API_KEY` (mevcut, gerekirse içerik/metin için)
  - (Instagram aşamasında: `IG_USER_ID`, `IG_ACCESS_TOKEN`)

### 5. Visual template değişiklikleri
- `template/reel-verse-text.html` -> hook template
- `template/reel-mana-text.html` -> ipucu template
- Renk: altın -> hardal sarısı/turuncu + krem (ya da naneli yeşil)
- Font: Cormorant -> Poppins/Nunito/Quicksand
- Etiket: "MÂNÂ" -> "TÜYO"

### 6. Pexels query güncelleme
- `src/fetchPexelsVideo.js` MOOD_QUERIES değişir
- Cami terimleri -> "cleaning", "kitchen", "home interior", "laundry", "organizing", "bathroom", "cozy home" vb.

### 7. Müzik değişikliği
- `audio/` klasörü değişir
- Ney/makam -> hafif/pozitif/gündelik (YouTube Audio Library veya Pexels music)

### 8. Content JSON formatı
Mevcut alan adları korunur ki kod aynı çalışsın (verse, explanation). Sadece anlam değişir.
```json
{
  "id": "kt-0001",
  "day": 1,
  "verse": "Pahalı cam temizleyici alma, mutfaktaki şu şey daha iyi temizliyor",
  "explanation": "Bir bardak suya iki kaşık beyaz sirke... (ipucu + neden)",
  "source": "Komşu Tüyosu",
  "moods": ["cleaning", "kitchen"],
  "category": "temizlik"
}
```

### 9. Caption stratejisi
- Hook'u tekrarla (1 cümle)
- Hashtag: #evtüyoları #pratikbilgi #temizlik #evipuçları #komşutüyosu
- Engagement CTA: "Sen biliyor muydun?" / "Dene, sonra anlat"

## İlk İçerik

İlk 30 doğrulanmış ipucu hazırlanacak (her biri doğruluk filtresinden geçirilmiş). Kategori dağılımı: temizlik, mutfak, çamaşır, organizasyon, koku/leke, tasarruf.

## Yayın Planı

- Saat: Her gün 09:15 (GMT+3)
- Platform: Önce YouTube, sonra Instagram. TikTok ikinci aşama (mevcut altyapıda yok).
- Maliyet: $0/ay (mevcut sistem gibi)

## Salih Baba ve Zihnin Sırları sistemleri paralel çalışmaya devam eder, dokunulmaz.
```
