import { defineConfig, devices } from '@playwright/test';

const port = 4173;
// CI installs Playwright's Chromium; locally the bundled download may be blocked, so fall back to system Chrome.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : 'chrome');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${process.env.BASE_PATH ?? '/'}`,
    trace: 'retain-on-failure',
    channel,
  },
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'small-android', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] }, grep: /@smoke/ },
    // iPhone 13 geometry on Chromium (WebKit is not installed on the dev machine).
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' }, grep: /@smoke/ },
  ],
});
