// Hunt HQ service worker. Its only job: receive images shared from Android (the manifest's share_target),
// keep them in the browser's Cache Storage, and open the app. The app picks them up from there (src/dump/shared.ts).
// It does not cache the site or touch any other request.
const CACHE = 'hunt-share';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'POST' || url.pathname !== '/share-target') return; // everything else goes to the network as usual
  event.respondWith((async () => {
    try {
      const form = await req.formData();
      const files = form.getAll('images').filter(f => typeof f !== 'string');
      const cache = await caches.open(CACHE);
      const stamp = Date.now();
      await Promise.all(files.map((f, i) => cache.put(
        new URL(`/shared/${stamp}-${i}`, self.location.origin).href,
        new Response(f, { headers: { 'content-type': f.type || 'image/png', 'x-name': encodeURIComponent(f.name || 'shared.png'), 'x-added': String(stamp) } }),
      )));
    } catch (e) { /* storing failed: open the app anyway, it will just find nothing */ }
    return Response.redirect(new URL('/?shared=1', self.location.origin).href, 303);
  })());
});
