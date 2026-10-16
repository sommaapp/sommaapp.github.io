const CACHE='apoio-mvp-v33';
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){await caches.delete(key);}await self.clients.claim();})());});
self.addEventListener('fetch',event=>{event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));});
