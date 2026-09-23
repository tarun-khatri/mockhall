import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Every generated question must be a pure function of its seed (SPEC 5).
    files: ['src/content/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/lib/rng.ts — Math.random is banned in content code.' }],
      'no-restricted-globals': ['error', { name: 'Date', message: 'Generators must be deterministic — no Date in content code.' }],
    },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Style-only rules: reported, but they must not block a deploy.
      'no-useless-assignment': 'warn',
      'prefer-const': 'warn',
    },
  },
);
