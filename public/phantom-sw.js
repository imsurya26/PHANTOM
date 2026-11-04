// Only the static offline notice is cached. Provider data, credentials, tiles
// and application bundles always use their ordinary network/cache policies.
const OFFLINE_CACHE = 'phantom-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/offline.css', '/phantom.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(
    OFFLINE_ASSETS.map((path) => new Request(new URL(path, self.location.origin), {
      cache: 'reload', credentials: 'omit',
    })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('phantom-offline-') && name !== OFFLINE_CACHE)
        await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PHANTOM_ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(OFFLINE_CACHE).then(async (cache) =>
      await cache.match(url.pathname) || fetch(request),
    ));
    return;
  }
  // A narrow navigation allowlist keeps API downloads and embedded applications
  // out of this fallback, even when their requests have navigation semantics.
  if (request.mode !== 'navigate' || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    return await cache.match('/offline.html') || new Response(
      'PHANTOM is unavailable offline. Reconnect and try again.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }));
});
