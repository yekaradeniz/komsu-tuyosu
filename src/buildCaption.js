/**
 * YouTube description / Instagram caption metni.
 *
 * YouTube spam korumasi ayni caption'i tekrarlayan hesaplari flag eder, bu
 * yuzden giris ve hashtag seti her gun tarihten tureyen tohumla degisir.
 * Kanal adi (komsu tuyosu) marka olmadigi icin hashtag olarak KULLANILMAZ.
 *
 * Metinlerin hicbiri burada degil: hepsi content/seo-templates.json icinde.
 * Yeni nis ya da yeni seri eklerken bu dosya degismez.
 */
import { dateSeed, pickTemplate, buildHashtagsFor } from './seoTemplate.js';

export function buildCaption(entry, dateStr) {
  if (!entry || typeof entry.verse !== 'string' || entry.verse.trim() === '') {
    throw new Error(`buildCaption: entry.verse eksik veya gecersiz (id: ${entry?.id ?? 'unknown'})`);
  }
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`buildCaption: dateStr gecersiz format (beklenen YYYY-MM-DD, alindi: ${dateStr})`);
  }

  const seed = dateSeed(dateStr);
  const firstLine = entry.verse.split('\n')[0].trim();
  const intro = pickTemplate(entry, 'intros', seed, { verse: firstLine });
  const explanation = (entry.explanation || '').trim();
  const tags = buildHashtagsFor(entry, seed);

  // Format: Soru + bos satir + Cevap + bos satir + hashtagler
  const parts = [intro];
  if (explanation) parts.push('', explanation);
  parts.push('', tags.join(' '));
  return parts.join('\n');
}

export const _internal = { dateSeed };
