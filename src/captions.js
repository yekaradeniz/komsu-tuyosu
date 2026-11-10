/**
 * Kelime senkron altyazi ve b-roll kurgu plani (v2 reel formati). Saf fonksiyonlar.
 *
 * Neden: 99 nis videosunun tutma egrisinde en buyuk kayip 5-8. saniyede, soru
 * karti kaybolup 165 karakterlik duragan paragraf belirdigi anda (medyan egri
 * t25=95 -> t40=65). Paragraf yerine konusmayla ayni anda akan 2-3 kelimelik
 * altyazi ve 3 saniyede bir degisen goruntu geliyor.
 */

const BREAK_AFTER = /[.,;:?!…]$/;

/**
 * ElevenLabs karakter zamanlamasini kelimelere cevirir.
 * @param {{characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[]}} alignment
 * @returns {Array<{text: string, start: number, end: number}>}
 */
export function wordsFromAlignment(alignment) {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  if (chars.length !== starts.length || chars.length !== ends.length) {
    throw new Error('wordsFromAlignment: karakter ve zaman dizileri ayni uzunlukta degil');
  }
  const words = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      if (cur) { words.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { text: '', start: starts[i], end: ends[i] };
    cur.text += chars[i];
    cur.end = ends[i];
  }
  if (cur) words.push(cur);
  return words;
}

/**
 * Kelimeleri ekranda birlikte duracak kucuk gruplara boler.
 * Noktalama bir grubu kapatir: cumle ortasinda bolunmus altyazi okunmuyor.
 */
export function chunkWords(words, { maxWords = 3, maxChars = 16 } = {}) {
  const chunks = [];
  let cur = [];
  const len = (arr) => arr.reduce((a, w) => a + w.text.length, 0) + Math.max(0, arr.length - 1);
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || len(cur) + 1 + w.text.length > maxChars)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
    if (BREAK_AFTER.test(w.text)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }));
}

/**
 * Her kelime icin bir altyazi karesi: grup ekranda, o an soylenen kelime vurgulu.
 * @param {ReturnType<typeof chunkWords>} chunks
 * @param {number} offset   - sesin videodaki baslangic ani (saniye)
 * @param {number} hold     - son kelimeden sonra grubun ekranda kalma payi (saniye)
 * @returns {Array<{texts: string[], active: number, start: number, end: number}>}
 */
export function captionFrames(chunks, offset = 0, hold = 0.3) {
  const frames = [];
  chunks.forEach((chunk, ci) => {
    const nextChunkStart = chunks[ci + 1]?.start ?? Infinity;
    const chunkEnd = Math.min(nextChunkStart, chunk.end + hold);
    chunk.words.forEach((w, wi) => {
      const end = chunk.words[wi + 1]?.start ?? chunkEnd;
      if (end <= w.start) return;
      frames.push({
        texts: chunk.words.map((x) => x.text),
        active: wi,
        start: offset + w.start,
        end: offset + end,
      });
    });
  });
  return frames;
}

/**
 * Kareleri ffmpeg concat demuxer metnine cevirir; aralar bos kareyle dolar.
 * @param {Array<{file: string, start: number, end: number}>} frames - zaman sirali, cakismasiz
 * @param {number} totalLen
 * @param {string} blankFile
 */
export function concatScript(frames, totalLen, blankFile) {
  const lines = ['ffconcat version 1.0'];
  const add = (file, dur) => {
    if (dur <= 0.0005) return;
    lines.push(`file '${file}'`, `duration ${dur.toFixed(3)}`);
  };
  let t = 0;
  for (const f of frames) {
    const start = Math.max(f.start, t);
    const end = Math.min(f.end, totalLen);
    if (end <= start) continue;
    add(blankFile, start - t);
    add(f.file, end - start);
    t = end;
  }
  add(blankFile, totalLen - t);
  // concat demuxer son dosyanin suresini yok sayar; bos kareyi bir kez daha yaz.
  lines.push(`file '${blankFile}'`);
  return lines.join('\n') + '\n';
}

/**
 * Arka plan kurgusu: yaklasik `target` saniyede bir goruntu degisir.
 * Klip sayisi azsa ayni klibin baska bir yerinden devam edilir (ikinci tur).
 * @param {Array<{path: string, duration: number}>} clips - moderasyondan gecmis klipler
 * @param {number} totalLen
 * @returns {Array<{path: string, offset: number, len: number}>}
 */
export function planSegments(clips, totalLen, target = 3) {
  if (!clips?.length) throw new Error('planSegments: klip yok');
  if (!(totalLen > 0)) throw new Error('planSegments: totalLen pozitif olmali');
  const n = Math.max(clips.length, Math.round(totalLen / target));
  const len = totalLen / n;
  const uses = new Map();
  const segs = [];
  for (let i = 0; i < n; i++) {
    const clip = clips[i % clips.length];
    const use = uses.get(clip.path) ?? 0;
    uses.set(clip.path, use + 1);
    // Stok videonun ilk saniyeleri duragan: %20'den basla, her tekrar %35 ileri.
    const wanted = clip.duration * (0.2 + 0.35 * use);
    const offset = Math.max(0, Math.min(wanted, clip.duration - len - 0.1));
    segs.push({ path: clip.path, offset: +offset.toFixed(2), len: +len.toFixed(3) });
  }
  return segs;
}
