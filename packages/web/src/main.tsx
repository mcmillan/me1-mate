import '@tamagui/core/reset.css';
import './styles.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TamaguiProvider } from 'tamagui';
import { config } from '../tamagui.config.ts';
import { App } from './App.tsx';

const dark = window.matchMedia('(prefers-color-scheme: dark)');

const Root = () => {
  const [theme, setTheme] = useState(dark.matches ? 'dark' : 'light');
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    dark.addEventListener('change', onChange);
    return () => dark.removeEventListener('change', onChange);
  }, []);
  return (
    <TamaguiProvider config={config} defaultTheme={theme}>
      <App />
    </TamaguiProvider>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

// Replaces the static description in index.html (there for crawlers and slow loads).
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Offline: the built app registers its service worker (src/sw.js); dev has none.
// A new build takes over quietly and never reloads the page.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch(() => {
        // Without a worker the app still works; it just needs the network to load.
      });
  });
}
