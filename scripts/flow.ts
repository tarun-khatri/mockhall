/**
 * Ad-hoc visual walk-through of the exam flow at 360 px (review aid, not a test).
 *   npx tsx scripts/flow.ts <baseUrl> <outDir> <subject> <chapterTitle> [mode=test|practice] [scheme=light|dark]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base, outDir, subject, chapterTitle, mode = 'test', scheme = 'light'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, colorScheme: scheme as 'light' | 'dark', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[console] ${m.text()}`));
const shot = async (name: string) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, `${name}-${scheme}.png`) });
  console.log(`saved ${name}`);
};

await page.goto(`${base}/practice/${subject}`, { waitUntil: 'load', timeout: 120_000 });
await page.getByRole('button', { name: new RegExp(chapterTitle, 'i') }).first().click();
await page.getByRole('radio', { name: mode === 'test' ? 'Test' : 'Practice' }).click();
await shot('sheet');
await page.getByRole('button', { name: 'Start' }).click();
await page.waitForURL(/\/test\//, { timeout: 120_000 });
await shot('exam-q1');
await page.getByRole('radio').nth(1).click();
await shot('exam-selected');
if (mode === 'test') {
  await page.getByRole('button', { name: 'Save & next' }).click();
  await page.getByRole('radio').nth(2).click();
  await page.getByRole('button', { name: 'Mark for review & next' }).click();
  await page.getByRole('button', { name: 'Mark for review & next' }).click();
  await page.getByRole('button', { name: 'Question palette', exact: true }).click();
  await shot('palette');
  await page.getByRole('button', { name: 'Submit test' }).click();
  await shot('submit-sheet');
  await page.getByRole('dialog', { name: 'Submit test?' }).getByRole('button', { name: 'Submit test' }).click();
  await page.waitForURL(/\/result\//, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(outDir, `result-${scheme}.png`), fullPage: true });
  await page.getByRole('button', { name: 'View solutions' }).click();
  await shot('solutions');
} else {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, `practice-feedback-${scheme}.png`), fullPage: true });
}
await browser.close();
