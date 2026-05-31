export function pickPhoto(photos, verseMoods, recentlyUsed, rng = Math.random) {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error('photos array is empty');
  }

  const matching = photos.filter(p =>
    p.moods.some(m => verseMoods.includes(m))
  );

  if (matching.length === 0) {
    throw new Error(`no photo matches verse moods: ${verseMoods.join(', ')}`);
  }

  const fresh = matching.filter(p => !recentlyUsed.has(p.id));
  const pool = fresh.length > 0 ? fresh : matching;

  const idx = Math.floor(rng() * pool.length);
  return pool[Math.min(idx, pool.length - 1)];
}
