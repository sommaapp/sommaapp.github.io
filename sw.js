'use strict';

const CACHE = 'somma-app-backend-v1';
const ASSETS = [
  './', './index.html', './styles.css?v=backend1', './config.js?v=backend1',
  './backend.js?v=backend1', './app.js?v=backend1', './vendor/supabase-2.118.0.min.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png'
];
const STATIC_PATHS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE && /^(somma-app-|somma-mvp-)/.test(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Cache only the static shell. Auth, database responses and mutations are
  // always online and never enter the service-worker cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !STATIC_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
