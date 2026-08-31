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

// Nis testi videolari icin ayri set: 'ev tuyosu' ifadesi karinca ya da uzay
// videosunda izleyiciye alakasiz geliyor, yorum da video da uyumsuz duruyor.
const NIS_ALAN = {
  hayvan: 'hayvanlar', para: 'tasarruf', vucut: 'insan vücudu', uzay: 'uzay',
  tarih: 'tarih', iliski: 'ilişkiler', deniz: 'denizler', yemek: 'mutfak',
  doga: 'doğa', teknoloji: 'teknoloji', dunya: 'dünya', muhendislik: 'mühendislik',
};

const NIS_SORULAR = [
  (alan) => `Bunu biliyor muydunuz? ${cap(alan)} hakkında merak ettiğiniz bir şey varsa yazın, videosunu yapalım.`,
  (alan) => `Sizce bu doğru mu? ${cap(alan)} konusunda başka hangi konuyu duymak istersiniz?`,
  (alan) => `Bunu ilk kez mi duydunuz? ${cap(alan)} ile ilgili bildiğiniz ilginç bir bilgi varsa yorumlarda paylaşın.`,
  (alan) => `Bu sizi de şaşırttı mı? ${cap(alan)} tarafında öğrenmek istediğiniz bir konu var mı?`,
  (alan) => `Duymuş muydunuz? ${cap(alan)} hakkında sizin bildiğiniz bir bilgiyi yorumlarda görmek isterim.`,
  (alan) => `Bunu bilen var mıydı? ${cap(alan)} ile ilgili hangi soruyu cevaplamamızı istersiniz?`,
];

const NIS_CTA = [
  `Her gün yeni bir ilginç bilgi için abone olun: ${SUB_LINK}`,
  `Böyle bilgileri kaçırmamak için abone olun, her gün yeni bir tane var: ${SUB_LINK}`,
  `Her gün bir bilgi paylaşıyoruz, abone olup takipte kalın: ${SUB_LINK}`,
  `Yeni bilgiler için abone olmayı unutmayın: ${SUB_LINK}`,
];

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
  const niche = entry && entry.niche;
  if (niche) {
    const alan = NIS_ALAN[niche] || 'bu konu';
    return `${NIS_SORULAR[seed % NIS_SORULAR.length](alan)}\n\n${NIS_CTA[seed % NIS_CTA.length]}`;
  }
  const moods = (entry && entry.moods) || [];
  const alan = MOOD_ALAN[moods[0]] || 'ev işleri';
  const soru = SORULAR[seed % SORULAR.length](alan);
  const cta = CTA[seed % CTA.length];
  return `${soru}\n\n${cta}`;
}

export const _internal = { SORULAR, CTA, MOOD_ALAN, NIS_SORULAR, NIS_CTA, NIS_ALAN };
