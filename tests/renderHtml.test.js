import { describe, it, expect } from 'vitest';
import { renderHtml } from '../src/renderHtml.js';

describe('renderHtml', () => {
  it('replaces all placeholders with values', () => {
    const html = renderHtml({
      verse: 'Bir mısra',
      original: null,
      source: 'Yûnus Emre',
      photoUrl: 'https://example.com/p.jpg'
    });
    expect(html).toContain('Bir mısra');
    expect(html).toContain('Yûnus Emre');
    expect(html).toContain('https://example.com/p.jpg');
    expect(html).not.toContain('{{verse}}');
    expect(html).not.toContain('{{photoUrl}}');
  });

  it('hides the original element when original is null', () => {
    const html = renderHtml({
      verse: 'X', original: null, source: 'Y', photoUrl: 'u'
    });
    expect(html).toMatch(/class="original hidden"/);
  });

  it('shows the original element when present', () => {
    const html = renderHtml({
      verse: 'X', original: '"Dil ber"', source: 'Y', photoUrl: 'u'
    });
    expect(html).toContain('"Dil ber"');
    expect(html).toMatch(/class="original "/);
  });

  it('preserves newlines in verse via white-space CSS', () => {
    const html = renderHtml({
      verse: 'line one\nline two',
      original: null,
      source: 'X',
      photoUrl: 'u'
    });
    expect(html).toContain('line one\nline two');
  });

  it('escapes nothing — verses are trusted curated content', () => {
    const html = renderHtml({
      verse: 'tek "tırnak" içinde',
      original: null,
      source: 'X',
      photoUrl: 'u'
    });
    expect(html).toContain('tek "tırnak" içinde');
  });
});
