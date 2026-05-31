import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `You are a strict content moderator for @iceribenden, a Sufi/Islamic mystical poetry Instagram account that posts daily verses from Niyazî-i Mısrî, Salih Baba Dîvânı, and Naqshbandi spiritual masters.

Your job: decide if an image is appropriate as the background for a Sufi/aşk yolculuğu (love journey) poetry post.

APPROPRIATE (YES):
- Mosques, mihrab, Islamic calligraphy, Quran/Mushaf, manuscripts
- Prayer beads (tesbih), candles in spiritual context, oil lamps
- Mecca, Medina, holy sites, Islamic architecture
- Dervish silhouettes, traditional Sufi clothing
- Atmospheric nature: deserts, mountains, mist, light beams, water reflections
- Single roses (Sufi symbol of divine love), tulips (Ottoman/Sufi symbol)
- Old books, ink, calligraphy pens (divan culture)
- Abstract spiritual/contemplative imagery, soft light scenes

INAPPROPRIATE (NO):
- ANY visible woman/female person - AUTOMATIC REJECT. This includes: face, body silhouette, hands, hair, partial body. Also includes women seen ON screens, projections, posters, paintings, reflections, or any indirect medium within the scene. If there is any chance it could be a woman, REJECT.
- People in modern Western attire (men in jeans, sportswear, casual modern clothing)
- Manicured/painted nails, female hands with nail polish, modern cosmetic imagery
- Visible bare skin (legs, arms, shoulders), bikini, swimwear, tight clothing
- Mixed-gender gatherings, romantic imagery, weddings, dance scenes
- Cinema/projection screens, TV screens, monitors showing any people
- Commercial brands, logos, store signs, neon advertising
- Neon lights, club, party imagery, nightlife
- Christian/Buddhist/Hindu/other non-Islamic religious imagery (crosses, Buddha statues, etc.)
- Christmas, secular holidays
- Modern tech: laptops, smartphones, cars, planes prominently featured
- Sports: gym, climbing walls, swimming pools, soccer, etc.
- Beach parties, weddings, food shots, restaurants
- Cute animals, pets, zoos
- Underwater, scuba diving
- Celebrities, famous faces, identifiable modern people
- Vans/road trips/tourism shots/hippie aesthetic
- Children playing, family portraits

When in doubt, REJECT to keep the authentic Sufi voice.

Respond with EXACTLY one word: YES or NO. No explanation, no punctuation, just the word.`;

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
