import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.jsx'

/**
 * ── Stale-deployment self-heal ───────────────────────────────────────────
 *
 * Problem: After a new Vercel deployment, chunk filenames change (new hashes).
 * If a user has the old index.html open in a tab and navigates to a lazy route,
 * the browser tries to fetch e.g. CustomerOrderDetail-OldHash.js which no
 * longer exists on the CDN → network error → blank page.
 *
 * Fix: Vite fires `vite:preloadError` whenever a dynamic import fails.
 * We listen for it and force a full page reload. On reload the browser
 * fetches the fresh index.html with the new chunk URLs — the user sees
 * a momentary flash instead of a broken app.
 *
 * The `sessionStorage` flag prevents an infinite reload loop in the rare
 * case the new chunks themselves fail (network down, bad deploy, etc.).
 */
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault(); // suppress the unhandled-rejection noise in the console

  const RELOAD_KEY = 'jmove_chunk_reload';
  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  const now        = Date.now();

  // Only auto-reload once per 30 seconds to prevent loops
  if (!lastReload || now - Number(lastReload) > 30_000) {
    sessionStorage.setItem(RELOAD_KEY, String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)
