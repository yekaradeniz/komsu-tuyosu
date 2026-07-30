/**
 * Long-form video icin DINAMIK SEO metadata uretir (baslik, aciklama, etiketler).
 * Tamamen o haftanin tuyolarindan turetilir - sabit/jenerik degil.
 *
 * @param {object} o
 * @param {Array<{id,title,keyword,start?}>} o.items  - o haftanin tuyolari (start = sn, opsiyonel chapter)
 * @returns {{title:string, description:string, tags:string[]}}
 */
export function buildSeo({ items, material, videoTitle }) {
  const N = items.length;
  const keywords = items.map(i => i.keyword).filter(Boolean);
  const titles = items.map(i => i.title).filter(Boolean);

  // --- Baslik: TIKLAMA (CTR) odakli. Kucuk kanalda izlenme aramadan degil akis/onerilen'den
  //     gelir; baslik anahtar kelime listesi degil, merak/fayda kancasi olmali.
  //     malzeme: icerikteki el yazimi videoTitle (orn "Limonun 5 Mucize Ev Kullanimi") onceliklidir.
  //     weekly: havuzdan dinamik dilim; her bolum farkli gorunsun diye merak cercevesi rotasyonu. ---
  let title;
  if (material) {
    title = (videoTitle && videoTitle.trim())
      ? videoTitle.trim()
      : `Evde ${material}: Bilmediğiniz ${N} Pratik Kullanım`;
    if (title.length > 100) title = `Evde ${material}: ${N} Pratik Kullanım`;
  } else {
    const frames = [
      `Hayatınızı Kolaylaştıracak ${N} Pratik Ev Tüyosu`,
      `Çoğu Kişinin Bilmediği ${N} Pratik Ev Tüyosu`,
      `Keşke Daha Önce Bilseydim Dediğiniz ${N} Ev Tüyosu`,
      `Evde İşinizi Kolaylaştıran ${N} Akıllı Ev Tüyosu`,
    ];
    const seed = keywords.reduce((a, k) => a + k.length, keywords.length);
    const frame = frames[seed % frames.length];
    title = `${frame}: ${keywords.slice(0, 2).join(', ')} ve Dahası`;
    if (title.length > 100) title = frame;
  }

  // --- Bolumler (chapters) - start varsa, YouTube kurallarina uygun ---
  const chapters = buildChapters(items);

  // --- Aciklama (ilk satir SEO icin kritik) ---
  const kwLower = keywords.map(k => k.toLocaleLowerCase('tr-TR')).join(', ');
  const bullets = titles.map(t => `▸ ${t}`).join('\n');
  const intro = material
    ? `Evde ${material} ne işe yarar? İşte ${material} ile yapabileceğin ${N} pratik ve etkili uygulama: ${kwLower}. Pahalı ürünlere gerek yok, evindeki basit malzemeyle büyük kolaylık!`
    : `Evdeki işleri kolaylaştıran ${N} pratik ev tüyosu: ${kwLower}. Pahalı ürünlere gerek yok, evindeki basit malzemelerle büyük kolaylık. Her hafta yeni pratik ev bilgileri!`;
  // sub_confirmation=1: tiklandiginda abone onay penceresi acilir (tek tikla abone)
  const SUB_LINK = 'https://www.youtube.com/@komsutuyosu?sub_confirmation=1';
  const PL_SHORTS = 'https://www.youtube.com/playlist?list=PLynH0txiEqh30D7_OctvEaSRpsZR2SCD2';
  const description =
    `${intro}\n\n` +
    `📋 Bu videoda öğrenecekleriniz:\n${bullets}\n\n` +
    chapters +
    `🔔 Her hafta yeni pratik ev tüyoları için abone ol: ${SUB_LINK}\n` +
    `⚡ Kısa ipuçları (Shorts) oynatma listesi: ${PL_SHORTS}\n\n` +
    buildHashtags(keywords, material);

  // --- Etiketler (dinamik + sabit kanal etiketleri) ---
  const baseTags = [
    'ev tüyoları', 'pratik bilgi', 'ev temizliği', 'pratik ev tüyoları', 'püf noktası',
    'ev düzeni', 'yaşam hileleri', 'pratik bilgiler', 'temizlik ipuçları', 'ev ipuçları'
  ];
  const dynTags = [];
  // Malzeme serisinde malzemenin kendisi videonun en guclu arama terimi; tag'lere de koy.
  if (material) {
    const m = material.toLocaleLowerCase('tr-TR');
    dynTags.push(m, `evde ${m}`, `${m} kullanımı`);
  }
  for (const k of keywords) {
    const kl = k.toLocaleLowerCase('tr-TR');
    dynTags.push(kl, `${kl} temizliği`, `${kl} ipucu`);
  }
  // YouTube etiket limiti ~500 karakter toplam; benzersizlestir + makul kes
  const tags = dedupeCap([...dynTags, ...baseTags], 30, 480);

  return { title, description, tags };
}

function buildHashtags(keywords, material) {
  const matTag = material ? ['#' + slug(material)] : [];
  const fixed = ['#evtüyoları', '#pratikbilgi', '#evipuçları'];
  const dyn = keywords.map(k => '#' + slug(k));
  const extra = ['#evtemizliği', '#evdüzeni', '#yaşamhileleri'];
  return dedupe([...matTag, ...fixed, ...dyn, ...extra]).slice(0, 13).join(' ');
}

function slug(s) {
  return String(s).toLocaleLowerCase('tr-TR').replace(/[^0-9a-zçğıöşü]/g, '');
}

function joinTr(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' ve ' + arr[arr.length - 1];
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/**
 * YouTube bolum (chapter) bloku uretir.
 * YouTube kurallari: ilk bolum 00:00 olmali, en az 3 bolum, her segment >= 10sn.
 * Intro genelde <10sn oldugu icin ayri "00:00 Giris" bolumu ilk segment'i bozuyordu
 * (chapters tamamen devre disi kaliyordu). Onun yerine ilk item'i 00:00'a sabitliyoruz
 * ve 10sn'den yakin item'lari atlayip kurali garantiliyoruz.
 */
function buildChapters(items) {
  if (!items || !items.length || !items.every(i => typeof i.start === 'number')) return '';
  const pts = items.map((it, i) => ({ t: i === 0 ? 0 : Math.round(it.start), label: it.title }));
  const valid = [];
  for (const p of pts) {
    if (!valid.length) { valid.push(p); continue; }
    if (p.t - valid[valid.length - 1].t >= 10) valid.push(p);
  }
  if (valid.length < 3) return '';
  const lines = valid.map(p => `${fmt(p.t)} ${p.label}`);
  return `⏱️ Bölümler:\n${lines.join('\n')}\n\n`;
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function dedupeCap(arr, maxCount, maxChars) {
  const out = [];
  let chars = 0;
  for (const t of dedupe(arr)) {
    if (out.length >= maxCount) break;
    if (chars + t.length + 1 > maxChars) continue;
    out.push(t); chars += t.length + 1;
  }
  return out;
}
