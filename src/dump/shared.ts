// Picks up images that Android's Share menu delivered while the app was closed or not yet signed in (public/sw.js stores them).
const CACHE = 'hunt-share'; // same name as in public/sw.js
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // a share nobody opened within a day is dropped

/** Returns the shared images and removes them from storage, so each one is handed out once. Never throws. */
export async function takeShared(now = Date.now()): Promise<File[]> {
  if (typeof caches === 'undefined') return [];
  try {
    const cache = await caches.open(CACHE);
    const files: File[] = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      await cache.delete(req);
      if (!res || now - Number(res.headers.get('x-added') ?? 0) > MAX_AGE_MS) continue;
      const blob = await res.blob();
      files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') ?? 'shared.png'), { type: blob.type || 'image/png' }));
    }
    return files;
  } catch { return []; }
}
