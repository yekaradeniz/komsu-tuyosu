import { chromium } from 'playwright';
import { renderHtml, renderExplanationHtml } from './renderHtml.js';

async function renderHtmlToPng(html, outputPath) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const bg = document.querySelector('.post-bg');
      if (!bg) return true;
      const url = window.getComputedStyle(bg).backgroundImage;
      const match = url.match(/url\("?(.+?)"?\)/);
      if (!match) return true;
      const img = new Image();
      img.src = match[1];
      return img.complete;
    }, { timeout: 15_000 });
    await page.screenshot({ path: outputPath, type: 'png', omitBackground: false, fullPage: false });
  } finally {
    await browser.close();
  }
}

export async function renderToPng(data, outputPath) {
  await renderHtmlToPng(renderHtml(data), outputPath);
}

export async function renderExplanationToPng({ explanation, photoUrl }, outputPath) {
  await renderHtmlToPng(renderExplanationHtml({ explanation, photoUrl }), outputPath);
}
