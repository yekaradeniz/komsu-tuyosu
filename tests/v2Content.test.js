import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { roundRobinByQuery } from '../src/fetchPexelsVideo.js';

// V2 reel formatinin icerikten istedikleri. Eksik alanla yayina giden video
// basliksiz ya da tek goruntulu cikar; CI'daki validate-content sadece uyarir,
// bu test kirmiziya doner.
const content = JSON.parse(readFileSync(new URL('../content/nis-testi.json', import.meta.url), 'utf-8'));
const v2 = content.filter((e) => e.format === 'v2');

describe('v2 content entries', () => {
  it('exist', () => {
    expect(v2.length).toBeGreaterThan(0);
  });

  it.each(v2.map((e) => [e.id, e]))('%s has a hook, four queries and fits the length limits', (_id, e) => {
    expect(e.hook?.trim().length).toBeGreaterThanOrEqual(10);
    expect(e.hook.trim().length).toBeLessThanOrEqual(34);
    expect(Array.isArray(e.pexelsQuery) && e.pexelsQuery.length >= 4).toBe(true);
    expect(e.verse.length).toBeGreaterThanOrEqual(85);
    expect(e.verse.length).toBeLessThanOrEqual(120);
    expect(e.explanation.length).toBeGreaterThanOrEqual(120);
    expect(e.explanation.length).toBeLessThanOrEqual(190);
    expect(e.niche).toBeTruthy();
    // Baslik verse'in ilk cumlesinden uretilir; 88 karakteri gecerse kesilir.
    const first = e.verse.match(/^(.{15,95}?[.?!])(\s|$)/)?.[1] ?? e.verse;
    expect(first.length).toBeLessThanOrEqual(88);
  });

  it('ids are unique across the whole pool', () => {
    const ids = content.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('roundRobinByQuery', () => {
  const c = (id, query) => ({ id, query });

  it('takes the first candidate of every query before any second candidate', () => {
    const out = roundRobinByQuery(
      [c(1, 'a'), c(2, 'a'), c(3, 'a'), c(4, 'b'), c(5, 'c'), c(6, 'c')],
      ['a', 'b', 'c']);
    expect(out.map((x) => x.id)).toEqual([1, 4, 5, 2, 6, 3]);
  });

  it('follows the given query order and keeps fallback queries after it', () => {
    const out = roundRobinByQuery([c(1, 'fallback'), c(2, 'b'), c(3, 'a')], ['a', 'b']);
    expect(out.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it('keeps every candidate exactly once', () => {
    const input = [c(1, 'a'), c(2, 'b'), c(3, 'a'), c(4, 'z')];
    expect(roundRobinByQuery(input, ['b']).map((x) => x.id).sort()).toEqual([1, 2, 3, 4]);
  });
});
