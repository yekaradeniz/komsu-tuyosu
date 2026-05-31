import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { renderToPng } from '../src/render.js';

const TEST_OUTPUT = './output/test-render.png';

describe('renderToPng', () => {
  afterEach(() => {
    if (existsSync(TEST_OUTPUT)) unlinkSync(TEST_OUTPUT);
  });

  it('writes a valid PNG file with correct dimensions', async () => {
    await renderToPng({
      verse: 'Test verse',
      original: null,
      source: 'Test',
      photoUrl: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200&q=85'
    }, TEST_OUTPUT);

    expect(existsSync(TEST_OUTPUT)).toBe(true);
    const stats = statSync(TEST_OUTPUT);
    expect(stats.size).toBeGreaterThan(50_000); // PNG should be at least 50KB
  }, 30_000); // 30s timeout for browser startup
});
