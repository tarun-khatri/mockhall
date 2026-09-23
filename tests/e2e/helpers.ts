import { expect, type Page } from '@playwright/test';

export const SEC = 1000;
export const MIN = 60 * SEC;

/** Start the next full mock from Home (instructions → agree → start). */
export async function startFullMock(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: /Start Mock/ }).click();
  await expect(page.getByRole('heading', { name: /Mock \d\d/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start test' })).toBeDisabled();
  await page.getByLabel('I have read the instructions').check();
  await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Start test' }).click();
  await page.waitForURL(/\/test\//);
  await expect(page.getByRole('radiogroup', { name: 'Options' })).toBeVisible();
}

/** Start a chapter test/practice from the chapter list sheet. */
export async function startChapter(page: Page, subject: string, chapter: RegExp, mode: 'Practice' | 'Test', count = '10') {
  await page.goto(`./practice/${subject}`);
  await page.getByRole('button', { name: chapter }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: mode, exact: true }).click();
  await sheet.getByRole('radio', { name: count, exact: true }).click();
  await sheet.getByRole('button', { name: 'Start' }).click();
  await page.waitForURL(/\/test\//, { timeout: 90_000 });
  await expect(page.getByRole('radiogroup', { name: 'Options' })).toBeVisible();
}

export async function option(page: Page, i: number) {
  await page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio').nth(i).click();
}

export async function questionNumber(page: Page): Promise<number> {
  const text = await page.getByText(/^Q \d+ of \d+$/).textContent();
  return Number(text!.match(/Q (\d+)/)![1]);
}

/** Read the timer pill as seconds. */
export async function timerSeconds(page: Page): Promise<number> {
  const t = (await page.getByRole('timer').textContent())!.replace(/[^\d:]/g, '');
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
}

/** The stored attempt (questions + responses) straight from IndexedDB. */
export async function storedAttempt(page: Page): Promise<{ questions: { id: string; answerIndex: number }[]; sectionQuestionIds: string[][]; responses: Record<string, { selected: number | null }> }> {
  const id = page.url().split('/').pop()!;
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mockhall');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readonly');
          const get = tx.objectStore('kv').get(`attempt:${id}`);
          get.onsuccess = () => resolve(get.result.attempt);
          get.onerror = () => reject(get.error);
        };
      }),
    id,
  ) as never;
}
