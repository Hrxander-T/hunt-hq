import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderCard } from './readerApi';
import { DumpQueue, sha256Hex } from './queue';
import { memoryStore } from './store';

vi.mock('../supabase', () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
import { supabase } from '../supabase';
import { deleteShots, syncPhoneShots } from './pending';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const card = (over: Partial<ReaderCard> = {}): ReaderCard => ({ status: 'ok', name: 'Natu', image: 'data:image/png;base64,AAA', warnings: [], ...over });
const file = (name: string, body = name) => new File([body], name, { type: 'image/png' });
const tick = () => new Promise<void>(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
let n = 0;

function make(cards: ReaderCard[] = [card()], release?: (id: string) => Promise<boolean>) {
  return new DumpQueue({ read: async () => cards, store: memoryStore(), hash: sha256Hex, uid: () => `id${++n}`, now: () => 1000, release });
}
const items = (q: DumpQueue) => q.getSnapshot().items;
const markSaved = (q: DumpQueue, id: string) => { expect(q.beginSave(id)).toBe(true); q.finishSave(id, 'caught1'); };

describe('cleaning up the cloud copy of a phone screenshot', () => {
  it('deletes it once the only card is saved', async () => {
    const release = vi.fn(async () => true);
    const q = make([card()], release); await q.load();
    await q.add([file('a')], ['cloud1']); await settle();
    markSaved(q, items(q)[0].id);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('cloud1');
  });
  it('waits until every card of the screenshot is saved or skipped', async () => {
    const release = vi.fn(async () => true);
    const q = make([card(), card({ name: 'Pidgey' })], release); await q.load();
    await q.add([file('a')], ['cloud1']); await settle();
    expect(items(q)).toHaveLength(2);
    markSaved(q, items(q)[0].id);
    expect(release).not.toHaveBeenCalled();
    q.skip(items(q)[1].id);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('deletes it when the item is skipped', async () => {
    const release = vi.fn(async () => true);
    const q = make([card()], release); await q.load();
    await q.add([file('a')], ['cloud1']); await settle();
    q.skip(items(q)[0].id);
    expect(release).toHaveBeenCalledWith('cloud1');
  });
  it('deletes it when the item is removed', async () => {
    const release = vi.fn(async () => true);
    const q = make([card()], release); await q.load();
    await q.add([file('a')], ['cloud1']); await settle();
    q.remove(items(q)[0].id);
    expect(release).toHaveBeenCalledWith('cloud1');
  });
  it('never touches the cloud for screenshots that did not come from the phone', async () => {
    const release = vi.fn(async () => true);
    const q = make([card()], release); await q.load();
    await q.add([file('a')]); await settle();
    markSaved(q, items(q)[0].id);
    q.remove(items(q)[0].id);
    expect(release).not.toHaveBeenCalled();
  });
  it('deletes the cloud copy of a duplicate, but not when the existing item uses that same copy', async () => {
    const release = vi.fn(async () => true);
    const q = make([card()], release); await q.load();
    await q.add([file('a', 'same')], ['cloud1']); await settle();
    await q.add([file('b', 'same')], ['cloud2']); // same picture arrived again under another cloud id
    expect(release).toHaveBeenCalledWith('cloud2');
    release.mockClear();
    await q.add([file('c', 'same')], ['cloud1']); // same cloud id as the item that is still waiting
    expect(release).not.toHaveBeenCalled();
  });
});

describe('syncPhoneShots', () => {
  const row = { shot_public_id: 'pending/a', shot_url: 'https://res.cloudinary.com/demo/image/upload/a.png', shot_created_at: '2026-01-01T10:00:00Z' };
  const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['png-bytes'], { type: 'image/png' }) }));
  beforeEach(() => {
    rpc.mockReset(); invoke.mockReset();
    rpc.mockResolvedValue({ data: [row], error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    vi.stubGlobal('fetch', okFetch());
  });

  it('adds a new phone screenshot to the queue and remembers its cloud id', async () => {
    const q = make(); await q.load();
    expect(await syncPhoneShots(q)).toBe(1);
    expect(items(q)).toHaveLength(1);
    expect(items(q)[0].cloudId).toBe('pending/a');
    expect(items(q)[0].name).toBe('phone-pending-a.png');
  });
  it('does not download the same screenshot again on the next round', async () => {
    const q = make(); await q.load();
    await syncPhoneShots(q); await settle();
    expect(await syncPhoneShots(q)).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(items(q)).toHaveLength(1);
  });
  it('tries the delete again when a finished screenshot is still listed', async () => {
    const q = make(); await q.load();
    await syncPhoneShots(q); await settle();
    markSaved(q, items(q)[0].id);
    invoke.mockClear();
    await syncPhoneShots(q);
    expect(invoke).toHaveBeenCalledWith('delete-shots', { body: { public_ids: ['pending/a'] } });
  });
  it('leaves a screenshot alone while it is still being reviewed', async () => {
    const q = make(); await q.load();
    await syncPhoneShots(q); await settle();
    await syncPhoneShots(q);
    expect(invoke).not.toHaveBeenCalled();
  });
  it('skips a picture it cannot download and tries again later', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const q = make(); await q.load();
    expect(await syncPhoneShots(q)).toBe(0);
    expect(items(q)).toHaveLength(0);
  });
  it('throws when Supabase refuses, so the caller can stay quiet and retry', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Not allowed' } });
    const q = make(); await q.load();
    await expect(syncPhoneShots(q)).rejects.toThrow('Not allowed');
  });
});

describe('deleteShots', () => {
  beforeEach(() => { invoke.mockReset(); });
  it('is true only when the server says everything was deleted', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteShots(['x'])).toBe(true);
    invoke.mockResolvedValue({ data: { ok: false, failed: ['x'] }, error: null });
    expect(await deleteShots(['x'])).toBe(false);
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await deleteShots(['x'])).toBe(false);
    invoke.mockImplementation(async () => { throw new Error('offline'); });
    expect(await deleteShots(['x'])).toBe(false);
  });
});
