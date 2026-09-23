import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import './index.css';
import { App } from './app/App';
import { useSettings } from './app/settings';

void useSettings.getState().load();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (offline). Registered after first render so it never delays the app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  });
}
