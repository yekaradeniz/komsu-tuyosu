import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gemini istemcisi taklit edilir, gercek API cagrilmaz.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() { this.models = { generateContent }; }
  }
}));

import { isImageBufferSpiritual, ModerationUnavailableError } from '../src/checkPhoto.js';

const KEY = 'test-key';
const BUF = Buffer.from('fake-image');

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// KURAL: moderasyon calismazsa video YAYINLANMAZ.
// 19 Eylul 2026'da Gemini prepay kredisi bitti (HTTP 402). Kod 402'yi
// taniyamadi, ham hata firlatti ve 3 kanalin videosu ayni gun kayboldu.
// Daha tehlikelisi: 429 kota hatasi sessizce "onaylandi" donuyordu, yani
// moderasyonsuz video yayina gidebiliyordu. Bu testler ikisini de kilitler.
describe('moderasyon calismazsa video yayinlanmaz', () => {
  beforeEach(() => { generateContent.mockReset(); });

  it('402 prepay kredisi bitti: onay DONDURMEZ, firlatir', async () => {
    generateContent.mockRejectedValue(apiError(402,
      '{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}'));
    await expect(isImageBufferSpiritual(BUF, 'image/png', KEY))
      .rejects.toBeInstanceOf(ModerationUnavailableError);
    // Kredi hatasi kosu boyunca gecmez, tekrar denemek bosuna.
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('429 kota asildi: onay DONDURMEZ, firlatir', async () => {
    generateContent.mockRejectedValue(apiError(429, 'quota exceeded'));
    await expect(isImageBufferSpiritual(BUF, 'image/png', KEY))
      .rejects.toBeInstanceOf(ModerationUnavailableError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('CI icinde API key yoksa: onay DONDURMEZ, firlatir', async () => {
    const prev = process.env.CI;
    process.env.CI = 'true';
    try {
      await expect(isImageBufferSpiritual(BUF, 'image/png', ''))
        .rejects.toBeInstanceOf(ModerationUnavailableError);
    } finally {
      if (prev === undefined) delete process.env.CI; else process.env.CI = prev;
    }
  });

  it('israrli bos yanit: onay DONDURMEZ, firlatir', async () => {
    vi.useFakeTimers();
    generateContent.mockResolvedValue({ text: '' });
    try {
      const assertion = expect(isImageBufferSpiritual(BUF, 'image/png', KEY))
        .rejects.toBeInstanceOf(ModerationUnavailableError);
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('YES yanitinda onaylar', async () => {
    generateContent.mockResolvedValue({ text: 'YES' });
    await expect(isImageBufferSpiritual(BUF, 'image/png', KEY))
      .resolves.toMatchObject({ approved: true });
  });

  it('NO yanitinda reddeder', async () => {
    generateContent.mockResolvedValue({ text: 'NO' });
    await expect(isImageBufferSpiritual(BUF, 'image/png', KEY))
      .resolves.toMatchObject({ approved: false });
  });
});
