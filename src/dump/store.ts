// Where the queue is kept between page loads. IndexedDB in the browser (one database per user), a Map in tests.
import type { DumpItem, QueueStore } from './queue';

export function memoryStore(): QueueStore & { rows: Map<string, DumpItem> } {
  const rows = new Map<string, DumpItem>();
  return {
    rows,
    all: async () => [...rows.values()].map(r => ({ ...r })),
    put: async i => { rows.set(i.id, { ...i }); },
    remove: async ids => { ids.forEach(id => rows.delete(id)); },
  };
}

const STORE = 'items';
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

/** Rejects (and the queue then carries on in memory) when IndexedDB is missing, blocked or full. */
export function idbStore(userId: string): QueueStore {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (!opened) opened = new Promise<IDBDatabase>((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB is not available'));
      const r = indexedDB.open(`hunt-dump:${userId}`, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('IndexedDB is blocked'));
    });
    return opened;
  };
  return {
    all: async () => req((await open()).transaction(STORE).objectStore(STORE).getAll() as IDBRequest<DumpItem[]>),
    put: async item => { const tx = (await open()).transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item); await done(tx); },
    remove: async ids => { const tx = (await open()).transaction(STORE, 'readwrite'); ids.forEach(id => tx.objectStore(STORE).delete(id)); await done(tx); },
  };
}
