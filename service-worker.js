const CACHE_NAME = 'spx-trade-v134';
// Same-origin app shell. Cached atomically - if any of these 404s the worker won't install, which is what you want.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './liquidity.js',
  './watchlist.html',
  './logo.png',
  './bg.png',
  './graveyard-bg.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];
// Cross-origin extras. Cached best-effort so a blocked font request can't stop the install.
const OPTIONAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Nosifer&family=Noto+Serif+JP:wght@400;700&family=Space+Mono:wght@400;700&display=swap'
];

// Install — cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).then(() =>
        Promise.all(OPTIONAL_ASSETS.map(url => cache.add(url).catch(() => null)))
      )
    )
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for the app shell (HTML/JS/CSS), so a push is live on the next load and only the
// offline case falls back to cache. Cache-first for images and fonts.
function isAppShell(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    return;
  }
  if (isAppShell(event.request)) {
    event.respondWith(
      fetch(event.request).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
