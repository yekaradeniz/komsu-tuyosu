// Komsu Tuyosu - YouTube Shorts only post script.
// cli-render.js calistiktan sonra state.lastPost'a bakar, bekleyen reel'i
// YouTube'a yukler. Instagram flow YOK (kanal sadece YouTube).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readState, writeState } from './state.js';
import { buildCaption } from './buildCaption.js';
import { buildFirstComment } from './buildFirstComment.js';
import { uploadToYoutube } from './uploadToYoutube.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CONTENT_FILE = process.env.CONTENT_FILE || 'komsu-tuyosu.json';
const STATE_FILE = process.env.STATE_FILE || 'log.json';
const content = JSON.parse(readFileSync(join(ROOT, 'content', CONTENT_FILE), 'utf-8'));
const statePath = join(ROOT, 'output', STATE_FILE);
const state = readState(statePath);

if (!state.lastPost?.date) {
  throw new Error('Bekleyen post yok. Once npm run render calistirin.');
}

if (state.lastPost.postId) {
  console.log(`Bu post zaten paylasildi (postId: ${state.lastPost.postId}). Atlaniyor.`);
  process.exit(0);
}

const entry = content.find(e => e.id === state.lastPost.verseId);
if (!entry) throw new Error(`Entry ${state.lastPost.verseId} bulunamadi`);

const date = state.lastPost.date;
const videoPath = join(ROOT, 'output', `${date}.mp4`);

const ytClientId     = process.env.YOUTUBE_CLIENT_ID;
const ytClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const ytRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

if (!ytClientId || !ytClientSecret || !ytRefreshToken) {
  throw new Error('YouTube credentials eksik: YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN');
}

const caption = buildCaption(entry, date);
console.log(`Caption (${caption.length} char): ${caption.split('\n')[0]}...`);

try {
  const { videoId, url: ytUrl } = await uploadToYoutube({
    videoPath,
    verse: entry.verse,
    caption,
    concept: entry.concept,
    moods: entry.moods,
    playlistId: 'PLynH0txiEqh30D7_OctvEaSRpsZR2SCD2',  // "Pratik Ev İpuçları" (Shorts)
    firstComment: buildFirstComment(entry, date),      // etkilesim + abone CTA
    clientId: ytClientId,
    clientSecret: ytClientSecret,
    refreshToken: ytRefreshToken
  });
  console.log(`YouTube Shorts yuklendi: ${ytUrl} (${videoId})`);

  writeState(statePath, {
    ...state,
    lastPost: { ...state.lastPost, postId: videoId, youtubeUrl: ytUrl },
    lastSuccessfulPostId: videoId,
    cooldownUntil: null
  });
} catch (err) {
  console.error(`YouTube upload hata: ${err.name}: ${err.message}`);
  throw err;
}
