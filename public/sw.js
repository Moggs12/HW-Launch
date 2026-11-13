// Offline support for the installed app.
// The build (vite.config.ts, swPlugin) fills in VERSION (a hash of every built file) and PRECACHE (the
// app shell, code, car pictures, sounds and icons), so every deploy changes this file and phones pick
// it up by themselves: no hand-bumped version number. In `npm run dev` the service worker is not used.
//
// Pages: network first (fresh index.html straight away), cached copy when offline or the network hangs.
// Hashed code in assets/: cache first (the name changes when the content does).
// Everything else (pictures, sounds, fonts): cached copy now, refreshed in the background.
const VERSION = '__SW_VERSION__';
const PRECACHE = ['./' /*__SW_PRECACHE__*/];
const CACHE = `launch-${VERSION}`;
const NAV_TIMEOUT_MS = 4000;

const hashed = url => /\/assets\/[^/]+-[\w-]{8,}\.\w+$/.test(url);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Reuse hashed files from the previous version instead of downloading three.js again.
    await Promise.all(PRECACHE.map(async path => {
      const url = new URL(path, self.registration.scope).href;
      if (hashed(url)) {
        const old = await caches.match(url);
        if (old) return cache.put(url, old);
      }
      // 'no-cache' revalidates with the server so a stale HTTP-cached index.html never gets precached.
      const res = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
      return cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('launch-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function page(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok && !res.redirected) cache.put(req.url, res.clone());   // ?test etc. keep their own entry
    return res;
  });
  const fallback = async () => (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || (await cache.match('./index.html'));
  // Use the network if it answers quickly; on a slow car-park signal fall back to the cached shell.
  const timeout = new Promise(resolve => setTimeout(resolve, NAV_TIMEOUT_MS)).then(fallback);
  try {
    return (await Promise.race([network, timeout])) || await network;
  } catch {
    return (await fallback()) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  if (req.headers.has('range')) return;   // let media range requests go straight to the network

  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }

  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: !font });
    if (hit && hashed(req.url)) return hit;
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});
