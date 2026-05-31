import { describe, it, expect } from 'vitest';
import { pickPhoto } from '../src/pickPhoto.js';

const samplePhotos = [
  { id: 'p1', url: 'u1', moods: ['halvet'] },
  { id: 'p2', url: 'u2', moods: ['mihrap', 'gece'] },
  { id: 'p3', url: 'u3', moods: ['halvet', 'tefekkür'] },
  { id: 'p4', url: 'u4', moods: ['seyran'] }
];

describe('pickPhoto', () => {
  it('returns a photo whose moods overlap with verse moods', () => {
    const photo = pickPhoto(samplePhotos, ['halvet'], new Set(), () => 0);
    expect(photo.moods).toContain('halvet');
  });

  it('skips recently used photo IDs', () => {
    const recentlyUsed = new Set(['p1']);
    const photo = pickPhoto(samplePhotos, ['halvet'], recentlyUsed, () => 0);
    expect(photo.id).toBe('p3');
  });

  it('falls back to recently-used if all matches are recent', () => {
    const recentlyUsed = new Set(['p1', 'p3']);
    const photo = pickPhoto(samplePhotos, ['halvet'], recentlyUsed, () => 0);
    expect(['p1', 'p3']).toContain(photo.id);
  });

  it('uses the rng to pick deterministically', () => {
    const photo = pickPhoto(samplePhotos, ['halvet'], new Set(), () => 0.99);
    expect(photo.id).toBe('p3'); // last matching
  });

  it('throws when no photo matches any mood', () => {
    expect(() => pickPhoto(samplePhotos, ['nonexistent'], new Set(), () => 0))
      .toThrow(/no photo matches/i);
  });

  it('throws when photos array is empty', () => {
    expect(() => pickPhoto([], ['halvet'], new Set(), () => 0))
      .toThrow(/empty/i);
  });
});
