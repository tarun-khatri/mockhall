import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/; CI sets BASE_PATH. Local dev uses "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'MockHall — free bank clerk mocks',
        short_name: 'MockHall',
        description: 'Free SBI Clerk and IBPS Clerk prelims mock tests. No login, works offline.',
        lang: 'en-IN',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F7FA',
        theme_color: '#F5F7FA',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, generators, fonts, KaTeX and the small bank index are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}', 'banks/index.json'],
        // Puzzle/seating banks are runtime-cached on first use (SPEC 13).
        globIgnores: ['banks/seating/**', 'banks/puzzles/**'],
        navigateFallback: `${base}index.html`,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/banks/') && !url.pathname.endsWith('/index.json'),
            handler: 'CacheFirst',
            options: { cacheName: 'mockhall-banks', expiration: { maxEntries: 600 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
});
