import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickContent } from './pickContent.js';
import { pickPhoto } from './pickPhoto.js';
import { renderToPng } from './render.js';
import { postToInstagram } from './postToInstagram.js';
import { readState, writeState, daysSinceLaunch } from './state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export async function runDaily({
  verses, photos, state, today,
  render, upload, post, env
}) {
  const launchDate = state.launchDate ?? today;
  const dayIndex = daysSinceLaunch(launchDate, today);

  const verse = pickContent(verses, dayIndex);
  const recentlyUsed = new Set(state.recentPhotos);
  const photo = pickPhoto(photos, verse.moods, recentlyUsed);

  const outputPath = join(ROOT, 'output', `${today}.png`);
  await render({
    verse: verse.verse,
    original: verse.original,
    source: verse.source,
    photoUrl: photo.url
  }, outputPath);

  const publicUrl = await upload(outputPath, today);

  const result = await post({
    igUserId: env.igUserId,
    accessToken: env.accessToken,
    imageUrl: publicUrl,
    caption: verse.caption
  });

  const newRecent = [...state.recentPhotos.filter(id => id !== photo.id), photo.id].slice(-14);

  return {
    newState: {
      launchDate,
      lastPost: {
        date: today,
        verseId: verse.id,
        photoId: photo.id,
        postId: result.postId
      },
      recentPhotos: newRecent
    },
    outputPath,
    publicUrl,
    postId: result.postId
  };
}

export async function main() {
  const verses = JSON.parse(readFileSync(join(ROOT, 'content', 'verses.json'), 'utf-8'));
  const photos = JSON.parse(readFileSync(join(ROOT, 'content', 'photos.json'), 'utf-8'));
  const statePath = join(ROOT, 'output', 'log.json');
  const state = readState(statePath);

  const today = new Date().toISOString().slice(0, 10);

  // Default upload: GitHub raw URL based on env
  const uploadFn = async (filePath, dateStr) => {
    const repo = process.env.GITHUB_REPOSITORY;
    const branch = process.env.GITHUB_REF_NAME ?? 'main';
    if (!repo) throw new Error('GITHUB_REPOSITORY env var required');
    return `https://raw.githubusercontent.com/${repo}/${branch}/output/${dateStr}.png`;
  };

  const result = await runDaily({
    verses, photos, state, today,
    render: renderToPng,
    upload: uploadFn,
    post: postToInstagram,
    env: {
      igUserId: process.env.IG_USER_ID,
      accessToken: process.env.IG_ACCESS_TOKEN
    }
  });

  writeState(statePath, result.newState);
  console.log(`✓ Posted ${result.postId}: ${result.publicUrl}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('FAIL:', err.message);
    process.exit(1);
  });
}
