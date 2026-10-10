import { afterEach, describe, expect, it, vi } from 'vitest';
import { takeShared } from './shared';

// A tiny stand-in for the browser's Cache Storage.
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    keys: async () => [...store.keys()].map(k => new Request(k)),
    match: async (r: Request) => store.get(r.url)?.clone(),
    delete: async (r: Request) => store.delete(r.url),
  };
  return { store, caches: { open: async () => cache } };
}
const put = (store: Map<string, Response>, id: string, body: string, name: string, added: number) =>
  store.set(`https://app.test/shared/${id}`, new Response(body, { headers: { 'content-type': 'image/png', 'x-name': encodeURIComponent(name), 'x-added': String(added) } }));

afterEach(() => vi.unstubAllGlobals());

describe('takeShared', () => {
  it('hands out each shared image once, with its original name, and empties the storage', async () => {
    const f = fakeCaches(); vi.stubGlobal('caches', f.caches);
    put(f.store, '1-0', 'aaa', 'Screenshot 1 (summary).png', 1000);
    put(f.store, '1-1', 'bbb', 'b.png', 1000);
    const files = await takeShared(2000);
    expect(files.map(x => x.name)).toEqual(['Screenshot 1 (summary).png', 'b.png']);
    expect(await files[0].text()).toBe('aaa');
    expect(files[0].type).toBe('image/png');
    expect(f.store.size).toBe(0);
    expect(await takeShared(2000)).toEqual([]);
  });
  it('drops shares older than a day', async () => {
    const f = fakeCaches(); vi.stubGlobal('caches', f.caches);
    put(f.store, 'old', 'x', 'old.png', 1000);
    put(f.store, 'new', 'y', 'new.png', 1000 + 25 * 3600 * 1000);
    const files = await takeShared(1000 + 26 * 3600 * 1000);
    expect(files.map(x => x.name)).toEqual(['new.png']);
    expect(f.store.size).toBe(0);
  });
  it('returns nothing when there is no Cache Storage (plain http, old browsers) or it fails', async () => {
    expect(await takeShared()).toEqual([]);
    vi.stubGlobal('caches', { open: async () => { throw new Error('blocked'); } });
    expect(await takeShared()).toEqual([]);
  });
});
