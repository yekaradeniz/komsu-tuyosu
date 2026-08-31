/**
 * Her Shorts'a atilacak ILK YORUM metni.
 *
 * Neden: bos yorum kutusu insanlari yazmaktan cekindirir. Kanal hesabindan
 * gelen, SORU soran bir ilk yorum hem yanit olasiligini artirir hem yorum
 * sinyali dagitimi besler. Abone CTA'si da aciklamadan bagimsiz ikinci bir
 * temas noktasi yaratir.
 *
 * Spam gorunmemesi icin tarih tabanli rotasyon: her gun farkli sablon, o gunun
 * konusuna gore degisen soru. Metinler content/seo-templates.json icinde.
 */
import { dateSeed, pickTemplate } from './seoTemplate.js';

export function buildFirstComment(entry, dateStr) {
  const seed = dateSeed(dateStr);
  const soru = pickTemplate(entry, 'commentQuestions', seed);
  const cta = pickTemplate(entry, 'commentCtas', seed);
  return `${soru}\n\n${cta}`;
}

export const _internal = { dateSeed };
