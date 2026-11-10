import { describe, it, expect } from 'vitest';
import { wordsFromAlignment, chunkWords, captionFrames, concatScript, planSegments } from '../src/captions.js';

// "Muz ağaç değil. Ot!" - her karakter 0.1sn
function align(text, step = 0.1) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => +(i * step).toFixed(3)),
    character_end_times_seconds: characters.map((_, i) => +((i + 1) * step).toFixed(3)),
  };
}

describe('wordsFromAlignment', () => {
  it('splits on whitespace and keeps punctuation and Turkish letters', () => {
    const words = wordsFromAlignment(align('Muz ağaç değil. Ot!'));
    expect(words.map((w) => w.text)).toEqual(['Muz', 'ağaç', 'değil.', 'Ot!']);
    expect(words[0]).toEqual({ text: 'Muz', start: 0, end: 0.3 });
    expect(words[1].start).toBeCloseTo(0.4);
    expect(words[3].end).toBeCloseTo(1.9);
  });

  it('throws when the timing arrays do not match the characters', () => {
    expect(() => wordsFromAlignment({ characters: ['a', 'b'], character_start_times_seconds: [0], character_end_times_seconds: [0.1] }))
      .toThrow(/ayni uzunlukta/);
  });

  it('returns no words for an empty alignment', () => {
    expect(wordsFromAlignment({ characters: [], character_start_times_seconds: [], character_end_times_seconds: [] })).toEqual([]);
  });
});

describe('chunkWords', () => {
  const words = wordsFromAlignment(align('Muz bir ağaçta yetişmiyor. Çünkü muz ağacı diye bir şey yok!'));

  it('closes a chunk at punctuation', () => {
    const chunks = chunkWords(words, { maxWords: 3, maxChars: 16 });
    const texts = chunks.map((c) => c.words.map((w) => w.text).join(' '));
    expect(texts[0]).toBe('Muz bir ağaçta');
    expect(texts[1]).toBe('yetişmiyor.');
    expect(texts.at(-1).endsWith('yok!')).toBe(true);
  });

  it('never exceeds the word or character limit unless one word alone is longer', () => {
    for (const c of chunkWords(words, { maxWords: 3, maxChars: 16 })) {
      expect(c.words.length).toBeLessThanOrEqual(3);
      const text = c.words.map((w) => w.text).join(' ');
      if (c.words.length > 1) expect(text.length).toBeLessThanOrEqual(16);
    }
  });

  it('keeps every word exactly once, in order', () => {
    const flat = chunkWords(words).flatMap((c) => c.words.map((w) => w.text));
    expect(flat).toEqual(words.map((w) => w.text));
  });
});

describe('captionFrames', () => {
  const chunks = chunkWords(wordsFromAlignment(align('Muz ağaç değil. Ot!')));

  it('makes one frame per word, shifted by the offset, with no overlap', () => {
    const frames = captionFrames(chunks, 5, 0.3);
    expect(frames).toHaveLength(4);
    expect(frames[0].start).toBeCloseTo(5);
    expect(frames.map((f) => f.active)).toEqual([0, 1, 2, 0]);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].start).toBeGreaterThanOrEqual(frames[i - 1].end - 1e-9);
    }
  });

  it('holds the last chunk after its last word', () => {
    const frames = captionFrames(chunks, 0, 0.3);
    expect(frames.at(-1).end).toBeCloseTo(1.9 + 0.3);
  });
});

describe('concatScript', () => {
  it('fills gaps with the blank frame and covers the whole length', () => {
    const script = concatScript(
      [{ file: 'a.png', start: 1, end: 2 }, { file: 'b.png', start: 2.5, end: 3 }],
      4, 'blank.png');
    const durations = [...script.matchAll(/duration ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(4);
    expect(script.startsWith('ffconcat version 1.0\n')).toBe(true);
    expect(script).toContain("file 'blank.png'\nduration 1.000\nfile 'a.png'\nduration 1.000");
    // son satir: suresiz bos kare (concat demuxer son sureyi yok sayar)
    expect(script.trimEnd().endsWith("file 'blank.png'")).toBe(true);
  });

  it('clips a frame that runs past the end', () => {
    const script = concatScript([{ file: 'a.png', start: 3, end: 9 }], 4, 'blank.png');
    expect(script).toContain("file 'a.png'\nduration 1.000");
  });
});

describe('planSegments', () => {
  const clips = [
    { path: 'a.mp4', duration: 20 },
    { path: 'b.mp4', duration: 12 },
  ];

  it('cuts about every 3 seconds and covers the whole length', () => {
    const segs = planSegments(clips, 18);
    expect(segs).toHaveLength(6);
    expect(segs.reduce((a, s) => a + s.len, 0)).toBeCloseTo(18, 1);
    expect(segs.map((s) => s.path)).toEqual(['a.mp4', 'b.mp4', 'a.mp4', 'b.mp4', 'a.mp4', 'b.mp4']);
  });

  it('starts a reused clip at a different place and never runs past its end', () => {
    const segs = planSegments(clips, 18);
    const a = segs.filter((s) => s.path === 'a.mp4').map((s) => s.offset);
    expect(new Set(a).size).toBe(a.length);
    for (const s of segs) {
      const dur = clips.find((c) => c.path === s.path).duration;
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset + s.len).toBeLessThanOrEqual(dur);
    }
  });

  it('uses every clip at least once when there are more clips than slots', () => {
    const many = [1, 2, 3, 4, 5].map((i) => ({ path: `${i}.mp4`, duration: 10 }));
    expect(planSegments(many, 9)).toHaveLength(5);
  });

  it('refuses an empty clip list', () => {
    expect(() => planSegments([], 10)).toThrow(/klip yok/);
  });
});
