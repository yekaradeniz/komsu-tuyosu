import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `You are a content moderator for "Komşu Tüyosu", a wholesome Turkish home & lifestyle tips channel. Almost every household scene is appropriate. The DEFAULT answer is YES. Only answer NO for clearly sexual, erotic, or suggestive/glamour content.

Answer YES for: any home, room, kitchen, bathroom, floor, furniture, appliance, cleaning, cooking, laundry, organizing, tidying, food, plants, hands, objects, or a person (including a woman) doing ordinary chores in normal everyday clothing. Empty rooms, floors, surfaces, mops, close-ups of tasks - all YES. Visible arms or legs during normal housework are completely fine.

Answer NO ONLY if the image CLEARLY shows: nudity or partial nudity; lingerie, underwear, bikini, or swimwear; sexual or seductive posing; a glamour / boudoir / model photoshoot style; or a sexualized focus on a body (cleavage or skin as the subject) instead of honest housework.

If it is any ordinary household, cleaning, kitchen, or object scene, answer YES. When unsure, answer YES. Only clearly sexual / suggestive / glamour imagery gets NO.

Respond with EXACTLY one word: YES or NO. No explanation.`;

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Gemini bazen gecici asiri yuk hatasi doner (503/500/502/504, UNAVAILABLE,
// "high demand", "overloaded"). Bunlar genelde saniyeler/dakika icinde gecer.
const TRANSIENT_GEMINI_STATUSES = new Set([500, 502, 503, 504]);
function isTransientGeminiError(err) {
  if (!err) return false;
  if (TRANSIENT_GEMINI_STATUSES.has(err.status)) return true;
  const m = String(err.message || '').toLowerCase();
  return m.includes('unavailable') || m.includes('high demand')
    || m.includes('overloaded') || m.includes('try again')
    || m.includes('"code":503') || m.includes('"code":500')
    || m.includes('"code":502') || m.includes('"code":504');
}

/**
 * Validates whether an image is appropriate for the Sufi poetry account.
 * Uses Google Gemini Flash (free tier) for vision moderation.
 *
 * @param {string} imageUrl - public URL of the image to validate
 * @param {string} apiKey - Google AI Studio API key (free)
 * @returns {Promise<{approved: boolean, reason?: string}>}
 */
/**
 * Buffer'dan (lokal dosya, indirme vs.) Sufi uygunluğunu kontrol eder.
 */
export async function isImageBufferSpiritual(buffer, mimeType, apiKey) {
  if (!apiKey) return { approved: true, reason: 'no api key - moderation skipped' };
  const validMime = SUPPORTED_IMAGE_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';
  const base64 = Buffer.from(buffer).toString('base64');

  const ai = new GoogleGenAI({ apiKey });
  const maxRetries = 4; // toplam ~75s (5+10+20+40), 8 dk render timeout icinde guvenli
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: validMime, data: base64 } },
            { text: 'Is this image appropriate as the background for a Sufi poetry post?' }
          ]
        }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 10,
          temperature: 0
        }
      });
      const answer = (result.text || '').trim().toUpperCase();
      return { approved: answer.startsWith('YES'), reason: answer };
    } catch (err) {
      if (err.status === 429 || (err.message && err.message.includes('quota'))) {
        console.warn('Gemini quota exceeded, skipping moderation.');
        return { approved: true, reason: 'quota-exceeded-skipped' };
      }
      // Gecici asiri yuk: backoff ile tekrar dene. Tukenirse FIRLAT
      // (guvenli: moderasyonsuz post atilmaz, o gun post gelmeyebilir
      // ama uygunsuz icerik riski sifir).
      if (isTransientGeminiError(err) && attempt < maxRetries) {
        const waitMs = Math.min(60000, 5000 * Math.pow(2, attempt));
        console.warn(`Gemini gecici hata (${err.status ?? ''} ${String(err.message || '').slice(0, 80)}). ${waitMs / 1000}s sonra tekrar (deneme ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

export async function isPhotoSpiritual(imageUrl, apiKey) {
  if (!apiKey) return { approved: true, reason: 'no api key - moderation skipped' };
  const response = await fetch(imageUrl);
  if (!response.ok) return { approved: false, reason: `image fetch failed: ${response.status}` };
  const arrayBuffer = await response.arrayBuffer();
  const rawType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return await isImageBufferSpiritual(Buffer.from(arrayBuffer), rawType, apiKey);
}

/**
 * Picks a photo whose moods match verseMoods AND passes AI moderation.
 * Tries up to maxAttempts photos. Throws if all fail.
 */
export async function pickValidatedPhoto({
  photos,
  verseMoods,
  recentlyUsed,
  apiKey,
  maxAttempts = 5,
  rng = Math.random
}) {
  const matching = photos.filter(p =>
    p.moods.some(m => verseMoods.includes(m))
  );
  if (matching.length === 0) {
    throw new Error(`no photo matches verse moods: ${verseMoods.join(', ')}`);
  }

  // Order: fresh (not recent) first, then recent. Within each group: shuffle.
  const fresh = matching.filter(p => !recentlyUsed.has(p.id));
  const recent = matching.filter(p => recentlyUsed.has(p.id));
  const shuffled = (arr) => arr
    .map(v => [rng(), v])
    .sort((a, b) => a[0] - b[0])
    .map(x => x[1]);
  const ordered = [...shuffled(fresh), ...shuffled(recent)];

  const tried = [];
  for (const photo of ordered.slice(0, maxAttempts)) {
    const { approved, reason } = await isPhotoSpiritual(photo.url, apiKey);
    if (approved) {
      console.log(`✓ Photo ${photo.id} passed moderation`);
      return photo;
    }
    console.log(`✗ Photo ${photo.id} rejected: ${reason}`);
    tried.push(photo.id);
  }

  throw new Error(
    `No photo passed AI moderation after ${tried.length} attempts. Tried: ${tried.join(', ')}`
  );
}
