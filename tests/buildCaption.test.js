import { describe, it, expect } from 'vitest';
import { buildCaption, _internal } from '../src/buildCaption.js';

const entry = {
  id: 'sb-0014',
  verse: 'Bular bu âlemin hem berzahında\nEsîr etmiş durur çok pehlivanı'
};

describe('buildCaption', () => {
  it('verse ilk satirini caption icinde icerir', () => {
    const caption = buildCaption(entry, '2026-05-12');
    expect(caption).toContain('Bular bu âlemin hem berzahında');
  });

  // Eskiden sabit CORE_TAGS listesi vardi; etiketler content/seo-templates.json'a
  // tasindi ve bu test 'CORE_TAGS is not iterable' ile kirmizi kaldi (2026-11-10'da goruldu).
  it('caption her zaman en az bir hashtag ile biter', () => {
    const caption = buildCaption(entry, '2026-05-12');
    expect(caption.split('\n').at(-1)).toMatch(/^#\S+( #\S+)*$/);
  });

  it('ayni tarih ayni captioni uretir (deterministic)', () => {
    const a = buildCaption(entry, '2026-05-12');
    const b = buildCaption(entry, '2026-05-12');
    expect(a).toBe(b);
  });

  it('farkli tarih farkli caption uretir', () => {
    const a = buildCaption(entry, '2026-05-12');
    const b = buildCaption(entry, '2026-05-13');
    expect(a).not.toBe(b);
  });

  it('caption en fazla 6 hashtag icerir (2 core + 4 rotated)', () => {
    const caption = buildCaption(entry, '2026-05-12');
    const hashtagCount = (caption.match(/#/g) || []).length;
    expect(hashtagCount).toBe(6);
  });

  it('30 gun boyunca tum captionlar farklidir', () => {
    const captions = new Set();
    for (let d = 1; d <= 30; d++) {
      const date = `2026-05-${String(d).padStart(2, '0')}`;
      captions.add(buildCaption(entry, date));
    }
    expect(captions.size).toBe(30);
  });

  it('verse undefined ise hata firlatir', () => {
    expect(() => buildCaption({ id: 'sb-x' }, '2026-05-12')).toThrow(/verse eksik/);
  });

  it('verse bos string ise hata firlatir', () => {
    expect(() => buildCaption({ id: 'sb-x', verse: '   ' }, '2026-05-12')).toThrow(/verse eksik/);
  });

  it('entry null ise hata firlatir', () => {
    expect(() => buildCaption(null, '2026-05-12')).toThrow(/verse eksik/);
  });

  it('gecersiz tarih format hata firlatir', () => {
    expect(() => buildCaption(entry, 'May 12, 2026')).toThrow(/dateStr gecersiz/);
  });
});
