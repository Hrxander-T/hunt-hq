import { describe, expect, it } from 'vitest';
import type { Draft } from './mapping';
import { ReaderError, type ReaderCard } from './readerApi';
import { DumpQueue, firstAttention, isUnsaved, itemLabel, MAX_ITEMS, needsAction, nextAfter, pendingCount, sha256Hex, type DumpItem, type QueueStore } from './queue';
import { memoryStore } from './store';

const card = (over: Partial<ReaderCard> = {}): ReaderCard => ({ status: 'ok', name: 'Natu', image: 'data:image/png;base64,AAA', warnings: [], ...over });
const file = (name: string, body = name) => new File([body], name, { type: 'image/png' });
const tick = () => new Promise<void>(r => setTimeout(r, 0));
const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let n = 0; // ids stay unique across queues that share one store

type MemStore = ReturnType<typeof memoryStore>;
function harness(store: MemStore = memoryStore(), maxParallel?: number) {
  const pending = new Map<string, ReturnType<typeof deferred<ReaderCard[]>>>();
  const started: string[] = []; const stats = { live: 0, max: 0 };
  const q = new DumpQueue({
    read: (f, signal) => {
      started.push(f.name); stats.live++; stats.max = Math.max(stats.max, stats.live);
      const d = deferred<ReaderCard[]>(); pending.set(f.name, d);
      signal.addEventListener('abort', () => d.reject(new ReaderError('aborted', 'Cancelled.')));
      return d.promise.finally(() => { stats.live--; });
    },
    store, hash: sha256Hex, uid: () => `id${++n}`, now: () => 1000,
  }, maxParallel);
  return {
    q, store, started, stats,
    finish: async (name: string, cards: ReaderCard[]) => { pending.get(name)!.resolve(cards); await tick(); },
    fail: async (name: string, e: unknown) => { pending.get(name)!.reject(e); await tick(); },
  };
}
const items = (q: DumpQueue) => q.getSnapshot().items;
const statuses = (q: DumpQueue) => items(q).map(i => i.status);
const natu: Draft = { species: 'natu', level: 10, gender: 'F', shiny: false, nature: 'Bold', ability: 'Synchronize', ivs: { hp: 21 }, evs: {} };

describe('reading', () => {
  it('reads one screenshot at a time, in order', async () => {
    const h = harness(); await h.q.load();
    expect(await h.q.add([file('a.png'), file('b.png'), file('c.png')])).toEqual({ added: 3, duplicates: [], rejected: [] });
    expect(h.started).toEqual(['a.png']);
    expect(statuses(h.q)).toEqual(['reading', 'queued', 'queued']);
    await h.finish('a.png', [card()]);
    expect(h.started).toEqual(['a.png', 'b.png']);
    await h.finish('b.png', [card()]); await h.finish('c.png', [card()]);
    expect(statuses(h.q)).toEqual(['ready', 'ready', 'ready']);
    expect(h.stats.max).toBe(1);
  });
  it('can read two at once when the limit is raised', async () => {
    const h = harness(undefined, 2); await h.q.load();
    await h.q.add([file('a.png'), file('b.png'), file('c.png')]);
    expect(h.started).toEqual(['a.png', 'b.png']);
  });
  it('maps the API status to an item status', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a'), file('b'), file('c'), file('d')]);
    await h.finish('a', [card({ status: 'ok' })]);
    await h.finish('b', [card({ status: 'review', warnings: ['level missing'] })]);
    await h.finish('c', [card({ status: 'not_found' })]);
    await h.finish('d', [card({ status: 'error', warnings: ['cannot open image'] })]);
    expect(statuses(h.q)).toEqual(['ready', 'review', 'notfound', 'failed']);
    expect(items(h.q)[3].error).toBe('cannot open image');
    expect(items(h.q)[0].error).toBeUndefined();
  });
  it('turns a screenshot with two cards into two items next to each other', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png'), file('b.png')]);
    await h.finish('a.png', [card({ name: 'A' }), card({ name: 'B', status: 'review' })]);
    const it = items(h.q);
    expect(it.map(i => itemLabel(i))).toEqual(['a.png - card 1/2', 'a.png - card 2/2', 'b.png']);
    expect(it.map(i => i.status)).toEqual(['ready', 'review', 'reading']);
    expect(it[0].hash).toBe(it[1].hash);
    expect(new Set(it.map(i => i.id)).size).toBe(3);
    expect(it[0].card?.name).toBe('A'); expect(it[1].card?.name).toBe('B');
    await h.q.flush();
    expect(h.store.rows.size).toBe(3);
  });
  it('drops the raw OCR debug text', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png')]);
    await h.finish('a.png', [card({ debug: 'x'.repeat(1000) })]);
    expect(items(h.q)[0].card).not.toHaveProperty('debug');
  });
});

describe('adding', () => {
  it('skips a screenshot that is already in the queue, also inside one drop', async () => {
    const h = harness(); await h.q.load();
    expect(await h.q.add([file('x.png', '1'), file('y.png', '1')])).toEqual({ added: 1, duplicates: ['y.png'], rejected: [] });
    expect(await h.q.add([file('copy.png', '1'), file('z.png', '2')])).toEqual({ added: 1, duplicates: ['copy.png'], rejected: [] });
    expect(items(h.q)).toHaveLength(2);
  });
  it('stops at 50 items and reports the rest', async () => {
    const h = harness(); await h.q.load();
    const res = await h.q.add(Array.from({ length: MAX_ITEMS + 2 }, (_, i) => file(`f${i}`)));
    expect(res.added).toBe(MAX_ITEMS);
    expect(res.rejected).toEqual([`f${MAX_ITEMS}`, `f${MAX_ITEMS + 1}`]);
  });
  it('two adds at the same time cannot both insert the same file', async () => {
    const h = harness(); await h.q.load();
    await Promise.all([h.q.add([file('a.png', 'same')]), h.q.add([file('b.png', 'same')])]);
    expect(items(h.q)).toHaveLength(1);
  });
});

describe('failure, retry, cancel, remove', () => {
  it('marks a failed read, keeps the item, and retry reads it again', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png')]);
    await h.fail('a.png', new ReaderError('network', 'Could not reach the reader.'));
    expect(items(h.q)[0]).toMatchObject({ status: 'failed', error: 'Could not reach the reader.' });
    h.q.retry(items(h.q)[0].id);
    expect(statuses(h.q)).toEqual(['reading']);
    await h.finish('a.png', [card()]);
    expect(statuses(h.q)).toEqual(['ready']);
    expect(h.started).toEqual(['a.png', 'a.png']);
  });
  it('cancels a running read, which can be retried, and carries on with the next one', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png'), file('b.png')]);
    h.q.cancel(items(h.q)[0].id); await tick();
    expect(items(h.q)[0]).toMatchObject({ status: 'failed', error: 'Cancelled.' });
    expect(h.started).toEqual(['a.png', 'b.png']);
    h.q.retry(items(h.q)[0].id);
    await h.finish('b.png', [card()]);
    expect(h.started).toEqual(['a.png', 'b.png', 'a.png']);
  });
  it('a removed item stays removed even if the reader answers late', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png')]);
    h.q.remove(items(h.q)[0].id); await tick();
    expect(items(h.q)).toEqual([]);
    await h.q.flush();
    expect(h.store.rows.size).toBe(0);
  });
  it('ignores an answer that arrives after the item was cancelled', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png')]);
    const id = items(h.q)[0].id;
    h.q.cancel(id);
    await h.finish('a.png', [card()]); // a reader that ignores the abort and answers anyway
    expect(items(h.q).find(i => i.id === id)?.status).toBe('failed');
  });
});

describe('persistence', () => {
  it('restores items, edits, confirmations and the file after a reload, and resumes reading', async () => {
    const store = memoryStore();
    const a = harness(store); await a.q.load();
    await a.q.add([file('a.png'), file('b.png')]);
    await a.finish('a.png', [card({ status: 'review', warnings: ['level missing'] })]);
    const id = items(a.q)[0].id;
    a.q.update(id, { edits: natu, confirmed: ['level'], huntId: 'h1' });
    expect(store.rows.get(id)?.confirmed).toEqual([]); // typing is batched, not written on every keystroke
    await a.q.flush();
    expect(store.rows.get(id)).toMatchObject({ edits: natu, confirmed: ['level'], huntId: 'h1' });
    a.q.dispose(); await a.q.flush();

    const b = harness(store); await b.q.load(); await tick();
    expect(statuses(b.q)).toEqual(['review', 'reading']); // the read that was interrupted starts again
    expect(items(b.q)[0]).toMatchObject({ edits: natu, confirmed: ['level'], huntId: 'h1', name: 'a.png' });
    expect(items(b.q)[0].blob).toBeInstanceOf(File);
    expect(b.started).toEqual(['b.png']);
  });
  it('survives dispose followed by load on the same queue (React strict mode)', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png')]);
    h.q.dispose(); await h.q.load(); await tick();
    expect(statuses(h.q)).toEqual(['reading']);
    expect(h.started).toEqual(['a.png', 'a.png']);
    await h.finish('a.png', [card()]);
    expect(statuses(h.q)).toEqual(['ready']);
  });
  it('keeps working in memory when the store fails, and says so', async () => {
    const bad: MemStore = { ...memoryStore(), put: async () => { throw new Error('quota'); }, remove: async () => { throw new Error('quota'); } };
    const h = harness(bad); await h.q.load();
    expect(h.q.getSnapshot().persistFailed).toBe(false);
    await h.q.add([file('a.png')]); await h.q.flush();
    expect(h.q.getSnapshot().persistFailed).toBe(true);
    await h.finish('a.png', [card()]);
    expect(statuses(h.q)).toEqual(['ready']);
  });
  it('reports a store that cannot be read', async () => {
    const bad: MemStore = { ...memoryStore(), all: async () => { throw new Error('blocked'); } };
    const h = harness(bad); await h.q.load();
    expect(h.q.getSnapshot()).toMatchObject({ loaded: true, persistFailed: true });
  });
});

describe('actions', () => {
  const ready = async () => { const h = harness(); await h.q.load(); await h.q.add([file('a.png')]); await h.finish('a.png', [card()]); return { h, id: items(h.q)[0].id }; };
  it('can only be saved once, even with a double click', async () => {
    const { h, id } = await ready();
    expect(h.q.beginSave(id)).toBe(true);
    expect(h.q.beginSave(id)).toBe(false);
    h.q.failSave(id, 'network down');
    expect(items(h.q)[0]).toMatchObject({ saving: false, saveError: 'network down', status: 'ready' });
    expect(h.q.beginSave(id)).toBe(true);
    h.q.finishSave(id, 'row-1');
    expect(items(h.q)[0]).toMatchObject({ status: 'saved', savedId: 'row-1', saving: false });
    expect(h.q.beginSave(id)).toBe(false); // a saved item can never be inserted again
    await h.q.flush();
    expect(h.store.rows.get(id)).toMatchObject({ status: 'saved', savedId: 'row-1' });
  });
  it('does not persist the transient saving flag', async () => {
    const { h, id } = await ready();
    h.q.beginSave(id); await h.q.flush();
    expect(h.store.rows.get(id)?.saving).toBeFalsy();
  });
  it('ignores edits while saving and after saved', async () => {
    const { h, id } = await ready();
    h.q.beginSave(id); h.q.update(id, { confirmed: ['level'] });
    expect(items(h.q)[0].confirmed).toEqual([]);
    h.q.finishSave(id, 'r'); h.q.update(id, { confirmed: ['level'] });
    expect(items(h.q)[0].confirmed).toEqual([]);
  });
  it('skip and reopen go back to the right status; a saved or running item cannot be skipped', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png'), file('b.png')]);
    h.q.skip(items(h.q)[0].id); // still reading
    expect(items(h.q)[0].status).toBe('reading');
    await h.finish('a.png', [card({ status: 'review' })]);
    const id = items(h.q)[0].id;
    h.q.skip(id); expect(items(h.q)[0].status).toBe('skipped');
    h.q.reopen(id); expect(items(h.q)[0].status).toBe('review');
    h.q.finishSave(id, 'r'); h.q.skip(id); expect(items(h.q)[0].status).toBe('saved');
  });
  it('clearSaved removes only saved items', async () => {
    const h = harness(); await h.q.load();
    await h.q.add([file('a.png'), file('b.png')]);
    await h.finish('a.png', [card()]); await h.finish('b.png', [card()]);
    h.q.finishSave(items(h.q)[0].id, 'r');
    h.q.clearSaved(); await h.q.flush();
    expect(items(h.q).map(i => i.name)).toEqual(['b.png']);
    expect([...h.store.rows.values()].map(i => i.name)).toEqual(['b.png']);
  });
  it('hands out an object URL for the original and revokes it on remove', async () => {
    const { h, id } = await ready();
    const u = h.q.originalUrl(id)!;
    expect(u).toMatch(/^blob:/);
    expect(h.q.originalUrl(id)).toBe(u);
    h.q.remove(id);
    expect(h.q.originalUrl(id)).toBeUndefined();
  });
});

describe('selectors', () => {
  const mk = (id: string, status: DumpItem['status']) => ({ id, status } as DumpItem);
  const list = [mk('a', 'saved'), mk('b', 'review'), mk('c', 'reading'), mk('d', 'ready'), mk('e', 'failed'), mk('f', 'skipped')];
  it('counts items that wait for the user', () => {
    expect(list.filter(needsAction).map(i => i.id)).toEqual(['b', 'd', 'e']);
    expect(pendingCount(list)).toBe(3);
  });
  it('finds the first and the next item that needs attention, wrapping around', () => {
    expect(firstAttention(list)).toBe('b');
    expect(nextAfter(list, 'b')).toBe('d');
    expect(nextAfter(list, 'e')).toBe('b');
    expect(nextAfter(list, 'a')).toBe('b');
    expect(nextAfter([mk('x', 'review')], 'x')).toBeUndefined();
    expect(nextAfter([], 'x')).toBeUndefined();
  });
  it('knows which items would be lost on reload', () => {
    expect(list.filter(isUnsaved).map(i => i.id)).toEqual(['b', 'c', 'd']);
  });
});
