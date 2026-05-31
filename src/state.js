import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DEFAULT_STATE = {
  launchDate: null,
  lastPost: null,
  recentPhotos: [],
  postedVerseIds: []
};

export function readState(path) {
  if (!existsSync(path)) return { ...DEFAULT_STATE };
  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  // Backfill missing fields for backward compatibility
  return { ...DEFAULT_STATE, ...parsed };
}

export function writeState(path, state) {
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function daysSinceLaunch(launchDate, today) {
  const a = new Date(launchDate + 'T00:00:00Z');
  const b = new Date(today + 'T00:00:00Z');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
