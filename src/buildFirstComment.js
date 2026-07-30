/**
 * Her Shorts'a atilacak ILK YORUM metnini uretir.
 *
 * Neden: bos yorum kutusu insanlari yazmaktan cekindirir. Kanal hesabindan
 * gelen, SORU soran bir ilk yorum hem yanit gelme olasiligini artirir hem de
 * yorum sinyali dagitimi besler. Ayrica abone CTA'sini yoruma tasiyip
 * aciklamadan bagimsiz bir temas noktasi yaratir.
 *
 * Spam gorunmemesi icin: tarih tabanli rotasyon (her gun farkli sablon) +
 * o gunun konusuna (keyword/mood) gore degisen soru.
 */

// Mood -> o gunun konu alani (yorumda dogal gecsin)
const MOOD_ALAN = {
  cleaning: 'temizlik',
  kitchen: 'mutfak',
  laundry: 'çamaşır',
  organizing: 'düzen',
  cozy: 'ev'
};

const SORULAR = [
  (alan) => `Bu tüyoyu daha önce denediniz mi? ${cap(alan)} konusunda sizin bildiğiniz bir püf noktası varsa yorumlarda paylaşın.`,
  (alan) => `Sizde işe yarıyor mu? ${cap(alan)} için en çok hangi konuda tüyo istersiniz?`,
  (alan) => `Bunu bilenler var mıydı aranızda? ${cap(alan)} tarafında merak ettiğiniz bir şey olursa yazın, videosunu çekelim.`,
  (alan) => `Sizin evde bu nasıl yapılıyor? ${cap(alan)} ile ilgili kendi yönteminizi yorumlarda görmek isterim.`,
  (alan) => `Denediyseniz sonucu yazar mısınız? ${cap(alan)} konusunda başka hangi tüyoyu duymak istersiniz?`,
  (alan) => `Bunu ilk kez mi duydunuz? ${cap(alan)} için sizin vazgeçmediğiniz bir pratik yöntem var mı?`
];

// sub_confirmation=1: tiklandiginda abone onay penceresi acilir (tek tikla abone)
const SUB_LINK = 'https://www.youtube.com/@komsutuyosu?sub_confirmation=1';

const CTA = [
  `Her gün yeni bir pratik ev tüyosu için abone olun: ${SUB_LINK}`,
  `Böyle tüyoları kaçırmamak için abone olun, her gün yeni bir tane var: ${SUB_LINK}`,
  `Her gün bir tüyo paylaşıyoruz, abone olup takipte kalın: ${SUB_LINK}`,
  `Yeni tüyolar için abone olmayı unutmayın: ${SUB_LINK}`
];

function cap(s) {
  return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;
}

function dateSeed(dateStr) {
  return String(dateStr).split('-').reduce((acc, n) => acc * 31 + parseInt(n, 10), 0);
}

/**
 * @param {object} entry  - icerik entry'si (moods kullanilir)
 * @param {string} dateStr - YYYY-MM-DD (rotasyon icin)
 * @returns {string} yorum metni
 */
export function buildFirstComment(entry, dateStr) {
  const seed = dateSeed(dateStr);
  const moods = (entry && entry.moods) || [];
  const alan = MOOD_ALAN[moods[0]] || 'ev işleri';
  const soru = SORULAR[seed % SORULAR.length](alan);
  const cta = CTA[seed % CTA.length];
  return `${soru}\n\n${cta}`;
}

export const _internal = { SORULAR, CTA, MOOD_ALAN };
