import { describe, it, expect } from 'vitest';
import { pickContent } from '../src/pickContent.js';

const sampleVerses = [
  { id: '001', verse: 'first', source: 'A' },
  { id: '002', verse: 'second', source: 'B' },
  { id: '003', verse: 'third', source: 'C' }
];

describe('pickContent', () => {
  it('returns the verse at the given index', () => {
    expect(pickContent(sampleVerses, 0).id).toBe('001');
    expect(pickContent(sampleVerses, 1).id).toBe('002');
    expect(pickContent(sampleVerses, 2).id).toBe('003');
  });

  it('wraps around when index exceeds length', () => {
    expect(pickContent(sampleVerses, 3).id).toBe('001');
    expect(pickContent(sampleVerses, 4).id).toBe('002');
    expect(pickContent(sampleVerses, 100).id).toBe('002'); // 100 % 3 = 1
  });

  it('throws when verses array is empty', () => {
    expect(() => pickContent([], 0)).toThrow(/empty/i);
  });

  it('throws when index is negative', () => {
    expect(() => pickContent(sampleVerses, -1)).toThrow(/negative/i);
  });
});
