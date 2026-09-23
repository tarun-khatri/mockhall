import { defineConfig } from 'vitest/config';

// The dev machine has 8 GB RAM and several agents may run tests at once: keep workers low.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
