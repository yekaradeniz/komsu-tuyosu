/**
 * Long-form video icin DINAMIK SEO metadata uretir (baslik, aciklama, etiketler).
 * Tamamen o haftanin tuyolarindan turetilir - sabit/jenerik degil.
 *
 * @param {object} o
 * @param {Array<{id,title,keyword,start?}>} o.items  - o haftanin tuyolari (start = sn, opsiyonel chapter)
 * @returns {{title:string, description:string, tags:string[]}}
 */
export function buildSeo({ items, material }) {
  const N = items.length;
  const keywords = items.map(i => i.keyword).filter(Boolean);
  const titles = items.map(i => i.title).filter(Boolean);

  // --- Baslik (max ~100 char): net + aranabilir, konulari listeler (marka adi YOK) ---
  const kwList = joinTr(keywords);
  let title;
  if (material) {
    // Malzeme serisi: malzeme adi on planda
    title = `Evde ${material}: ${N} Pratik Kullanım (${joinTr(keywords.slice(0, 3))})`;
    if (title.length > 100) title = `Evde ${material} Kullanmanın ${N} Pratik Yolu`;
    if (title.length > 100) title = `Evde ${material}: ${N} Pratik Kullanım`;
  } else {
    title = `${N} Pratik Ev Tüyosu: ${kwList}`;
    if (title.length > 100) title = `${N} Pratik Ev Tüyosu: ${joinTr(keywords.slice(0, 3))} ve Dahası`;
    if (title.length > 100) title = `${N} Pratik Ev Tüyosu`;
  }

  // --- Bolumler (chapters) - start varsa, YouTube kurallarina uygun ---
  const chapters = buildChapters(items);

  // --- Aciklama (ilk satir SEO icin kritik) ---
  const kwLower = keywords.map(k => k.toLocaleLowerCase('tr-TR')).join(', ');
  const bullets = titles.map(t => `▸ ${t}`).join('\n');
  const intro = material
    ? `Evde ${material} ne işe yarar? İşte ${material} ile yapabileceğin ${N} pratik ve etkili uygulama: ${kwLower}. Pahalı ürünlere gerek yok, evindeki basit malzemeyle büyük kolaylık!`
    : `Evdeki işleri kolaylaştıran ${N} pratik ev tüyosu: ${kwLower}. Pahalı ürünlere gerek yok, evindeki basit malzemelerle büyük kolaylık. Her hafta yeni pratik ev bilgileri!`;
  const description =
    `${intro}\n\n` +
    `📋 Bu videoda öğrenecekleriniz:\n${bullets}\n\n` +
    chapters +
    `🏠 Her hafta yeni pratik ev tüyoları için kanala abone ol ve bildirimleri aç.\n\n` +
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
