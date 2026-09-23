import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MIN, option, questionNumber, startChapter, startFullMock, storedAttempt, timerSeconds } from './helpers';

test.describe('full mock', () => {
  test('palette colours and counts follow the save rule @smoke', async ({ page }) => {
    await startFullMock(page);
    const save = page.getByRole('button', { name: 'Save & next' });
    const mark = page.getByRole('button', { name: 'Mark for review & next' });
    // Q1–Q5 answered
    for (let i = 0; i < 5; i++) {
      await option(page, i % 5);
      await save.click();
    }
    // Q6 answered & marked, Q7 marked without an answer
    await option(page, 1);
    await mark.click();
    await mark.click();
    // Q8: select, save, then clear → not answered
    await option(page, 2);
    await save.click();
    await page.getByRole('button', { name: 'Previous question' }).click();
    await page.getByRole('button', { name: 'Clear response' }).click();
    await page.getByRole('button', { name: 'Question palette', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Question palette' });
    await expect(sheet.getByRole('button', { name: /^Question 1, Answered$/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Question 6, Answered & marked/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Question 7, Marked for review$/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Question 8, Not answered/ })).toBeVisible();
    // Q9 was opened by "Save & next" on Q8 before going back, so it counts as visited.
    await expect(sheet.getByRole('button', { name: /^Question 9, Not answered$/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Question 10, Not visited$/ })).toBeVisible();
    const legend = sheet.getByRole('list', { name: 'Legend' });
    await expect(legend.getByText('Answered', { exact: true }).locator('..')).toContainText('5');
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('section expiry → interstitial → next section, previous locked', async ({ page }) => {
    await page.clock.install();
    await startFullMock(page);
    await expect(page.getByRole('button', { name: /English Language/ })).toBeVisible();
    await page.clock.fastForward(20 * MIN + 500);
    await expect(page.getByRole('alertdialog')).toContainText('time is over');
    await page.clock.fastForward(4000);
    await expect(page.getByRole('button', { name: /Numerical Ability/ })).toBeVisible();
    await page.getByRole('button', { name: 'Question palette', exact: true }).click();
    await expect(page.getByRole('tab', { name: /English Language/ })).toHaveAttribute('aria-disabled', 'true');
  });

  test('reload mid-section keeps question, selection and time', async ({ page }) => {
    await startFullMock(page);
    await option(page, 0);
    await page.getByRole('button', { name: 'Save & next' }).click();
    await page.getByRole('button', { name: 'Save & next' }).click();
    await option(page, 3); // unsaved draft on Q3
    const before = await timerSeconds(page);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole('radiogroup', { name: 'Options' })).toBeVisible();
    expect(await questionNumber(page)).toBe(3);
    await expect(page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio').nth(3)).toHaveAttribute('aria-checked', 'true');
    const after = await timerSeconds(page);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(3);
  });

  test('strict timer keeps running while hidden', async ({ page }) => {
    await page.clock.install();
    await startFullMock(page);
    const before = await timerSeconds(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(3 * MIN);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(500);
    const after = await timerSeconds(page);
    expect(before - after).toBeGreaterThanOrEqual(179);
    expect(before - after).toBeLessThanOrEqual(182);
  });

  test('back button during a mock asks before leaving', async ({ page }) => {
    await page.goto('./');
    await startFullMock(page);
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Leave the test?' })).toBeVisible();
    await page.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(/\/test\//);
  });
});

test.describe('chapter tests', () => {
  test('scripted answers give the exact score; solutions filters work @smoke', async ({ page }) => {
    await startChapter(page, 'quant', /Percentage/, 'Test');
    // Answer Q1–Q6 with option A, skip the rest.
    for (let i = 0; i < 6; i++) {
      await option(page, 0);
      await page.getByRole('button', { name: 'Save & next' }).click();
    }
    const attempt = await storedAttempt(page);
    const ids = attempt.sectionQuestionIds[0].slice(0, 6);
    const byId = new Map(attempt.questions.map((q) => [q.id, q]));
    const correct = ids.filter((id) => byId.get(id)!.answerIndex === 0).length;
    const expected = correct - 0.25 * (6 - correct);
    await page.getByRole('button', { name: 'Question palette', exact: true }).click();
    await page.getByRole('dialog', { name: 'Question palette' }).getByRole('button', { name: 'Submit test' }).click();
    await page.getByRole('dialog', { name: 'Submit test?' }).getByRole('button', { name: 'Submit test' }).click();
    await page.waitForURL(/\/result\//);
    const shown = (await page.locator('h1').first().textContent())!.replace('−', '-');
    expect(parseFloat(shown)).toBeCloseTo(expected, 5);

    await page.getByRole('button', { name: 'View solutions' }).click();
    await page.getByRole('button', { name: /^Wrong \d+/ }).click();
    const wrongCount = 6 - correct;
    if (wrongCount) await expect(page.getByText(`1 / ${wrongCount}`)).toBeVisible();
    await page.getByRole('button', { name: /^Skipped \d+/ }).click();
    await expect(page.getByText('1 / 4')).toBeVisible();
  });

  test('try a similar one keeps subtype and difficulty', async ({ page }) => {
    await startChapter(page, 'quant', /Percentage/, 'Test');
    await page.getByRole('button', { name: 'Question palette', exact: true }).click();
    await page.getByRole('dialog', { name: 'Question palette' }).getByRole('button', { name: 'Submit test' }).click();
    await page.getByRole('dialog', { name: 'Submit test?' }).getByRole('button', { name: 'Submit test' }).click();
    await page.getByRole('button', { name: 'View solutions' }).click();
    const meta = await page.getByText(/· medium$/).first().textContent();
    const firstPrompt = await page.locator('.q-text').textContent();
    await page.getByRole('button', { name: /Similar/ }).click();
    await page.waitForURL(/\/test\//);
    const attempt = await storedAttempt(page);
    expect(attempt.questions[0].id).toMatch(/^quant\.percentage\..+\.m\./);
    expect(meta).toContain('medium');
    await expect(page.locator('.q-text')).not.toHaveText(firstPrompt ?? '');
  });

  test('practice mode locks the answer and shows the solution with times @smoke', async ({ page }) => {
    await startChapter(page, 'quant', /Simple & compound interest/, 'Practice');
    await option(page, 2);
    const options = page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio');
    await expect(options.nth(2)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('region', { name: 'Solution' }).or(page.getByLabel('Solution'))).toBeVisible();
    await expect(page.getByText(/Your time \d+:\d\d · Target \d+:\d\d/)).toBeVisible();
    await options.nth(0).click({ force: true }); // a locked question must ignore further taps
    const locked = await storedAttempt(page);
    const qid = locked.sectionQuestionIds[0][0];
    expect(locked.responses[qid].selected).toBe(2);
  });
});

test.describe('device features', () => {
  test('works offline after first load (chapter practice)', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.goto('./practice/quant');
    await page.getByRole('button', { name: /Percentage/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start' }).waitFor();
    await page.keyboard.press('Escape');
    await context.setOffline(true);
    await page.goto('./');
    await expect(page.getByText(/Offline/)).toBeVisible();
    await startChapter(page, 'quant', /Percentage/, 'Practice');
    await context.setOffline(false);
  });

  test('export → reset → import restores history', async ({ page }) => {
    await startChapter(page, 'quant', /Percentage/, 'Test');
    await page.getByRole('button', { name: 'Question palette', exact: true }).click();
    await page.getByRole('dialog', { name: 'Question palette' }).getByRole('button', { name: 'Submit test' }).click();
    await page.getByRole('dialog', { name: 'Submit test?' }).getByRole('button', { name: 'Submit test' }).click();
    await page.waitForURL(/\/result\//);
    await page.goto('./settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export progress' }).click();
    const file = await (await download).path();
    await page.getByRole('button', { name: 'Reset all data' }).click();
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('All data on this phone was deleted.')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles(file!);
    await page.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByText(/Imported/)).toBeVisible();
    await page.goto('./progress');
    await expect(page.getByText('Percentage').first()).toBeVisible();
  });

  test('no horizontal scroll and no serious axe issues on main screens @smoke', async ({ page }) => {
    for (const path of ['/', '/practice', '/practice/quant', '/practice/reasoning', '/practice/english', '/mocks', '/progress', '/mistakes', '/settings']) {
      await page.goto('.' + path);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(
        a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path}: ${v.id}`),
      ).toEqual([]);
    }
  });
});
