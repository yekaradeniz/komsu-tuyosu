/**
 * Long-form seri tanimlari. Iki seri ayni pipeline'i (render/kapak/SEO/upload) paylasir,
 * sadece icerik secimi + dosya isimleri + kapak basligi farklidir.
 *
 *  weekly  : "Bu Haftanin 5 Pratik Tuyosu" - 305 tuyo havuzundan sirayla 5'erli (Cumartesi)
 *  malzeme : "Evde X Kullanmanin 5 Yolu"   - 52 malzemeden sirayla 1 video (Pazartesi)
 */
export const SERIES = {
  weekly: {
    name: 'weekly',
    contentFile: 'komsu-longform.json',
    stateFile: 'longform-state.json',
    outName: 'komsu-longform.mp4',
    metaName: 'komsu-longform-meta.json',
    thumbName: 'komsu-thumb.png',
    thumbTemplate: 'lf-komsu-thumb.html',
    mode: 'pool',          // content[] havuzdan perWeek'lik dilim
    playlistId: 'PLynH0txiEqh26QdVivze5z7xUNmUMgFPP'  // "Bu Haftanın Tüyoları"
  },
  malzeme: {
    name: 'malzeme',
    contentFile: 'komsu-malzeme.json',
    stateFile: 'malzeme-state.json',
    outName: 'komsu-malzeme.mp4',
    metaName: 'komsu-malzeme-meta.json',
    thumbName: 'komsu-malzeme-thumb.png',
    thumbTemplate: 'lf-komsu-thumb-malzeme.html',   // malzeme adi on planda
    mode: 'episodes',      // videos[] dizisinden tek bolum (index)
    playlistId: 'PLynH0txiEqh3-w7UG-tVtSAWuehnTYR8G'  // "Malzeme Serisi" (PLAYLIST_ID_MALZEME env override eder)
  }
};

export function getSeries(name) {
  const s = SERIES[name || 'weekly'];
  if (!s) throw new Error(`Bilinmeyen seri: ${name}. Gecerli: ${Object.keys(SERIES).join(', ')}`);
  // playlist env override (CI secret'tan gelebilir)
  if (s.name === 'malzeme' && process.env.PLAYLIST_ID_MALZEME) {
    return { ...s, playlistId: process.env.PLAYLIST_ID_MALZEME };
  }
  return s;
}

/**
 * State'teki index'e gore o bolumun item'larini + video meta'sini cozer.
 * Her iki seri de ayni cikti seklini doner: { items, videoTitle, introQuery, thumbTop, thumbBig, index, episodeNo }
 */
export function resolveEpisode(series, data, startIndex) {
  if (series.mode === 'episodes') {
    // malzeme: videos[index] = tek bolum (icinde 5 item hazir)
    const episodes = (data.videos || []).filter(v => v.items && v.items.length);
    if (startIndex >= episodes.length) return null;
    const ep = episodes[startIndex];
    return {
      items: ep.items,
      videoTitle: ep.videoTitle || `Evde ${ep.material} Kullanmanın 5 Yolu`,
      introQuery: ep.introQuery && ep.introQuery.length ? ep.introQuery : ['clean tidy home interior'],
      material: ep.material,                                    // kapakta on planda
      thumbTop: `Evde ${ep.material}`,
      thumbBig: `<span class="hl">${ep.items.length}</span> Kullanımı`,
      index: startIndex,
      episodeNo: startIndex + 1,
      step: 1
    };
  }
  // pool (weekly): content[] havuzdan perWeek'lik dilim
  const perWeek = data.perWeek || 5;
  const pool = (data.content || data.items || []).filter(u => u.question && u.answer);
  if (startIndex >= pool.length) return null;
  const items = pool.slice(startIndex, startIndex + perWeek);
  return {
    items,
    videoTitle: data.videoTitle || 'Bu Haftanın 5 Pratik Ev Tüyosu',
    introQuery: data.introQuery && data.introQuery.length ? data.introQuery : ['clean tidy home interior'],
    thumbTop: data.thumbTop || 'Bu Haftanın',
    thumbBig: data.thumbBig || `<span class="hl">${items.length}</span> Pratik Tüyosu`,
    index: startIndex,
    episodeNo: Math.floor(startIndex / perWeek) + 1,
    step: perWeek
  };
}
