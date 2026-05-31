import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'template', 'post.html');
const EXPLANATION_TEMPLATE_PATH = join(__dirname, '..', 'template', 'explanation.html');

function calcFontSize(verse) {
  const lines = verse.split('\n');
  const totalChars = verse.replace(/\n/g, ' ').length;
  const lineCount = lines.length;

  return 51;
}

export function renderHtml({ verse, original, source, photoUrl }) {
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const fontSize = calcFontSize(verse);

  return template
    .replace('{{verse}}', verse)
    .replace('{{verseFontSize}}', `${fontSize}px`)
    .replace('{{original}}', original ?? '')
    .replace('{{originalHidden}}', original ? '' : 'hidden')
    .replace('{{source}}', source)
    .replace('{{photoUrl}}', photoUrl);
}

function calcExplanationFontSize(explanation) {
  const chars = explanation.length;
  if (chars > 420) return 42;
  if (chars > 320) return 45;
  if (chars > 220) return 48;
  return 51;
}

export function renderExplanationHtml({ explanation, photoUrl }) {
  const template = readFileSync(EXPLANATION_TEMPLATE_PATH, 'utf-8');
  const fontSize = calcExplanationFontSize(explanation);
  return template
    .replace('{{explanation}}', explanation)
    .replace('{{explanationFontSize}}', `${fontSize}px`)
    .replace('{{photoUrl}}', photoUrl);
}
