/* Wayly minimal service worker — Offline Mode MVP.
   Strategy:
     - Pre-cache the app shell on install
     - Network-first for everything (so users always get the latest)
     - Fall back to cache only when network fails (typical offline state)
     - Never cache /api/ POST/PATCH/DELETE responses
*/
const SHELL_CACHE = 'wayly-shell-v1';
const RUNTIME_CACHE = 'wayly-runtime-v1';
const SHELL_ASSETS = ['/', '/index.html', '/favicon.ico'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
        )),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return; // never cache mutations

    const url = new URL(request.url);

    // Don't cache cross-origin or analytics / Plausible
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            const fresh = await fetch(request);
            // Cache successful HTML/asset responses only
            if (fresh.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font')) {
                const cache = await caches.open(RUNTIME_CACHE);
                cache.put(request, fresh.clone());
            }
            return fresh;
        } catch (_err) {
            const cached = await caches.match(request);
            if (cached) return cached;
            if (request.destination === 'document') {
                const shell = await caches.match('/index.html');
                if (shell) return shell;
            }
            return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
    })());
});
