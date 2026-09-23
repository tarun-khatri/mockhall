/**
 * Walk a sectional mock and screenshot every question that opens a new stimulus set, plus a few singles.
 *   npx tsx scripts/mockshots.ts <baseUrl> <outDir> <Section title> [scheme]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base, outDir, section, scheme = 'light'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, colorScheme: scheme as 'light' | 'dark', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(base, { waitUntil: 'load' });
await page.getByRole('link', { name: new RegExp(section) }).first().click();
await page.getByLabel('I have read the instructions').check();
await page.getByRole('button', { name: 'Start test' }).click({ timeout: 120_000 });
await page.waitForURL(/\/test\//);
const total = Number((await page.getByText(/^Q \d+ of \d+$/).textContent())!.match(/of (\d+)/)![1]);
let lastSet = '';
const slug = section.split(' ')[0].toLowerCase();
for (let i = 1; i <= total; i++) {
  const region = page.locator('section[aria-label*="question"]');
  const setLabel = (await region.count()) ? await region.first().getAttribute('aria-label') : '';
  const setName = setLabel?.replace(/, question.*$/, '') ?? '';
  const isNewSet = setLabel && /question 1 of/.test(setLabel) && setName !== lastSet;
  if (isNewSet || (!setLabel && i % 6 === 1)) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, `${slug}-q${String(i).padStart(2, '0')}-${scheme}.png`), fullPage: false });
    console.log(`q${i}: ${setLabel || 'single'}`);
    lastSet = setName;
  }
  await page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Save & next' }).click();
}
// Finish and capture the solution of the first set question with its visual.
await page.getByRole('button', { name: 'Question palette', exact: true }).click();
await page.getByRole('dialog', { name: 'Question palette' }).getByRole('button', { name: 'Submit test' }).click();
await page.getByRole('dialog', { name: 'Submit test?' }).getByRole('button', { name: 'Submit test' }).click();
await page.waitForURL(/\/result\//);
await page.getByRole('button', { name: 'View solutions' }).click();
for (let i = 0; i < total; i++) {
  if (await page.locator('figure svg, figure table').count()) {
    await page.screenshot({ path: join(outDir, `${slug}-solution-visual-${scheme}.png`), fullPage: true });
    console.log(`solution visual at ${i + 1}`);
    break;
  }
  await page.getByRole('button', { name: /Next/ }).click();
}
await browser.close();
