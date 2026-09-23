/** Render PWA icons (PNG) from the SVG mark using the local Chromium/Chrome. Run once: npx tsx scripts/icons.ts */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const mark = (size: number, pad: number, radius: number) => `
<html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="#15213D"/>
  <g transform="translate(32 32) scale(${(64 - 2 * pad) / 64}) translate(-32 -32)">
    <circle cx="32" cy="32" r="17" fill="none" stroke="#F5F7FA" stroke-width="4"/>
    <circle cx="32" cy="32" r="9.5" fill="#8AA4FF"/>
  </g>
</svg></body></html>`;

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage();
const jobs: [string, number, number, number][] = [
  ['icon-192.png', 192, 0, 14],
  ['icon-512.png', 512, 0, 14],
  ['icon-maskable-512.png', 512, 10, 0], // safe zone: content within the central 80%
  ['apple-touch-icon.png', 180, 4, 0],
];
for (const [name, size, pad, radius] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(mark(size, pad, radius));
  await page.locator('svg').screenshot({ path: join(out, name), omitBackground: radius > 0 });
  console.log(`wrote ${name}`);
}
await browser.close();
