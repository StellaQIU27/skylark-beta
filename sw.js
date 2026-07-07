/* Skylark service worker — network-first for same-origin app shell.
   Only caches code/images (app shell). Never touches localStorage,
   so user data (pets, records, nickname) is completely unaffected.
   Supabase / CDN (cross-origin) requests pass straight through. */
const CACHE = 'skylark-shell-v1';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // drop old shell caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // Only handle our own origin (app + images). Let Supabase/fonts/CDN go straight to network.
  if (url.origin !== self.location.origin) return;
  // Network-first: always try to get the freshest version; fall back to cache when offline.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
