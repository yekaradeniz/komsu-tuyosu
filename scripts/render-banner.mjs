// Kanal banner'i render eder (2048x1152). Kullanim: node scripts/render-banner.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const html = readFileSync(join(ROOT, 'template', 'lf-komsu-banner.html'), 'utf-8');
const outPath = join(ROOT, 'output', 'komsu-banner.png');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 2048, height: 1152 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 500));
writeFileSync(outPath, await page.screenshot({ type: 'png' }));
await browser.close();
console.log('✓ Banner:', outPath);
