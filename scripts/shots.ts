/**
 * Screenshot screens at 360×740 in light and dark for visual review (SPEC 14.6).
 *   npx tsx scripts/shots.ts <baseUrl> <outDir> [path ...]
 * Paths may include "#action" suffixes handled below (e.g. "/practice/quant#open-first").
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5173', outDir = 'shots', ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ['/', '/practice', '/practice/quant', '/mocks', '/progress', '/mistakes', '/settings'];
mkdirSync(outDir, { recursive: true });

// Bundled Chromium if installed, else the system Chrome / Edge.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' })).catch(() => chromium.launch({ channel: 'msedge' }));
for (const scheme of ['light', 'dark'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.log(`[console] ${m.text()}`));
  for (const t of targets) {
    const [path, action] = t.split('#');
    await page.goto(base + path, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForSelector('main, [role="status"]', { timeout: 120_000 });
    await page.waitForTimeout(1200);
    if (action === 'open-first') {
      await page.locator('main button').first().click();
      await page.waitForTimeout(800);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) console.log(`[overflow] ${t} (${scheme}) by ${overflow}px`);
    const name = `${t.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${scheme}.png`;
    await page.screenshot({ path: join(outDir, name), fullPage: true });
    console.log(`saved ${name}`);
  }
  await ctx.close();
}
await browser.close();
