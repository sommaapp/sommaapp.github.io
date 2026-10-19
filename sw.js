'use strict';

const CACHE = 'somma-app-backend-v1.1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=backend1',
  './config.js?v=backend1',
  './backend.js?v=backend1',
  './app.js?v=backend1',
  './vendor/supabase-2.118.0.min.js'
];
const OPTIONAL_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const STATIC_PATHS = new Set([...CORE_ASSETS, ...OPTIONAL_ASSETS].map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // The application shell is mandatory for offline startup.
    await cache.addAll(CORE_ASSETS);

    // PWA metadata/icons improve installation but must never make the whole
    // service-worker installation fail if one optional file is unavailable.
    await Promise.allSettled(OPTIONAL_ASSETS.map(asset => cache.add(asset)));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== CACHE && /^(somma-app-|somma-mvp-)/.test(key))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Cache only the static shell. Auth, database responses and mutations are
  // always online and never enter the service-worker cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = STATIC_PATHS.has(url.pathname);
  if (!isNavigation && !isStaticAsset) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-cache' });

      if (response.ok && (isNavigation || isStaticAsset)) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;

      // Any same-origin navigation can fall back to the cached application
      // shell, including installed-PWA launches that resolve to '/'.
      if (isNavigation) {
        const shell =
          await caches.match('./index.html', { ignoreSearch: true }) ||
          await caches.match('./', { ignoreSearch: true });
        if (shell) return shell;
      }

      throw error;
    }
  })());
});
