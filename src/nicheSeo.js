/**
 * NIS BAZLI SEO - nis testi videolari icin etiket ve hashtag.
 *
 * Neden: kanalin varsayilan etiketleri ev icerigine gore ayarli
 * ('ev ipuclari', '#leketemizligi'). Nis testi videolari bu etiketlerle
 * yuklenince ahtapot videosuna '#leketemizligi' hashtag'i gidiyordu.
 * Bu hem YouTube'a celiskili sinyal veriyor hem alakasiz metadata
 * politikasina giriyor. Her nis kendi konusundan etiket alir.
 */

const NICHE_SEO = {
  hayvan:      { tags: ['hayvanlar', 'ilginç hayvanlar', 'hayvan davranışları', 'doğa'],
                 hashtags: ['#hayvanlar', '#doğa', '#ilginçhayvanlar', '#hayvangerçekleri', '#vahşiyaşam'] },
  para:        { tags: ['tasarruf', 'para biriktirme', 'bütçe', 'finansal ipuçları'],
                 hashtags: ['#tasarruf', '#parabiriktirme', '#bütçe', '#finans', '#paraipuçları'] },
  vucut:       { tags: ['insan vücudu', 'sağlık bilgisi', 'biyoloji', 'vücut gerçekleri'],
                 hashtags: ['#insanvücudu', '#sağlık', '#biyoloji', '#vücut', '#sağlıkbilgisi'] },
  uzay:        { tags: ['uzay', 'astronomi', 'evren', 'gökbilim'],
                 hashtags: ['#uzay', '#astronomi', '#evren', '#gökbilim', '#uzaygerçekleri'] },
  tarih:       { tags: ['tarih', 'tarihi bilgiler', 'tarih gerçekleri', 'geçmiş'],
                 hashtags: ['#tarih', '#tarihibilgiler', '#geçmiş', '#tarihgerçekleri', '#kültür'] },
  iliski:      { tags: ['ilişkiler', 'insan davranışı', 'iletişim', 'sosyal psikoloji'],
                 hashtags: ['#ilişkiler', '#insandavranışı', '#iletişim', '#psikoloji', '#sosyalilişkiler'] },
  deniz:       { tags: ['okyanus', 'denizler', 'sualtı dünyası', 'deniz gerçekleri'],
                 hashtags: ['#okyanus', '#deniz', '#sualtı', '#denizgerçekleri', '#doğa'] },
  yemek:       { tags: ['mutfak bilimi', 'yemek püf noktaları', 'gıda bilgisi', 'mutfak'],
                 hashtags: ['#mutfakbilimi', '#yemek', '#gıda', '#mutfak', '#yemekipuçları'] },
  doga:        { tags: ['doğa olayları', 'hava durumu', 'doğa bilimi', 'meteoroloji'],
                 hashtags: ['#doğaolayları', '#hava', '#doğa', '#meteoroloji', '#bilim'] },
  teknoloji:   { tags: ['teknoloji', 'telefon ipuçları', 'dijital dünya', 'teknoloji bilgisi'],
                 hashtags: ['#teknoloji', '#telefonipuçları', '#dijital', '#teknolojibilgisi', '#akıllıtelefon'] },
  dunya:       { tags: ['coğrafya', 'ülkeler', 'dünya gerçekleri', 'gezi bilgisi'],
                 hashtags: ['#coğrafya', '#ülkeler', '#dünya', '#gezi', '#dünyagerçekleri'] },
  muhendislik: { tags: ['mühendislik', 'nasıl çalışır', 'yapılar', 'teknik bilgi'],
                 hashtags: ['#mühendislik', '#nasılçalışır', '#yapılar', '#teknik', '#bilim'] },
};

// Nisten bagimsiz, her nis videosunda gecerli.
const GENERIC_TAGS = ['ilginç bilgiler', 'biliyor muydun', 'bilgi', 'shorts'];
const GENERIC_HASHTAGS = ['#biliyormuydun', '#ilginçbilgiler'];

export function isNiche(entry) {
  return Boolean(entry?.niche && NICHE_SEO[entry.niche]);
}

export function nicheTags(niche) {
  const n = NICHE_SEO[niche];
  return n ? [...n.tags, ...GENERIC_TAGS] : [...GENERIC_TAGS];
}

export function nicheHashtags(niche) {
  const n = NICHE_SEO[niche];
  return { core: [...GENERIC_HASHTAGS], pool: n ? [...n.hashtags] : [] };
}

export const _internal = { NICHE_SEO, GENERIC_TAGS, GENERIC_HASHTAGS };
