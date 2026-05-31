import { describe, it, expect, vi } from 'vitest';
import { runDaily } from '../src/index.js';

describe('runDaily', () => {
  it('orchestrates pick → render → post and updates state', async () => {
    const verses = [
      { id: '001', verse: 'V1', source: 'S1', moods: ['halvet'], caption: 'c1' }
    ];
    const photos = [
      { id: 'p1', url: 'https://example.com/1.jpg', moods: ['halvet'] }
    ];
    const renderMock = vi.fn().mockResolvedValue('/tmp/out.png');
    const uploadMock = vi.fn().mockResolvedValue('https://cdn/1.png');
    const postMock = vi.fn().mockResolvedValue({ postId: 'IG-1' });

    const state = { launchDate: '2026-04-27', lastPost: null, recentPhotos: [] };

    const result = await runDaily({
      verses, photos, state,
      today: '2026-04-27',
      render: renderMock,
      upload: uploadMock,
      post: postMock,
      env: { igUserId: 'X', accessToken: 'Y' }
    });

    expect(renderMock).toHaveBeenCalledOnce();
    expect(uploadMock).toHaveBeenCalledOnce();
    expect(postMock).toHaveBeenCalledOnce();
    expect(result.newState.lastPost.verseId).toBe('001');
    expect(result.newState.lastPost.postId).toBe('IG-1');
    expect(result.newState.recentPhotos).toContain('p1');
  });

  it('initializes launchDate when null', async () => {
    const verses = [{ id: '001', verse: 'V', source: 'S', moods: ['halvet'], caption: 'c' }];
    const photos = [{ id: 'p1', url: 'u', moods: ['halvet'] }];

    const result = await runDaily({
      verses, photos,
      state: { launchDate: null, lastPost: null, recentPhotos: [] },
      today: '2026-04-27',
      render: vi.fn().mockResolvedValue('/p'),
      upload: vi.fn().mockResolvedValue('https://cdn/x.png'),
      post: vi.fn().mockResolvedValue({ postId: 'X' }),
      env: { igUserId: 'X', accessToken: 'Y' }
    });

    expect(result.newState.launchDate).toBe('2026-04-27');
  });

  it('limits recentPhotos to 14 most recent', async () => {
    const verses = [{ id: '001', verse: 'V', source: 'S', moods: ['halvet'], caption: 'c' }];
    const photos = [{ id: 'p-new', url: 'u', moods: ['halvet'] }];

    const oldRecent = Array.from({ length: 14 }, (_, i) => `p${i}`);
    const result = await runDaily({
      verses, photos,
      state: { launchDate: '2026-04-27', lastPost: null, recentPhotos: oldRecent },
      today: '2026-04-27',
      render: vi.fn().mockResolvedValue('/p'),
      upload: vi.fn().mockResolvedValue('https://cdn/x.png'),
      post: vi.fn().mockResolvedValue({ postId: 'X' }),
      env: { igUserId: 'X', accessToken: 'Y' }
    });

    expect(result.newState.recentPhotos.length).toBe(14);
    expect(result.newState.recentPhotos).toContain('p-new');
    expect(result.newState.recentPhotos).not.toContain('p0');
  });
});
