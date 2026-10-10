// The Dump queue: reads screenshots one at a time, keeps the results and the user's edits, survives reloads.
// Plain TypeScript with no React, so it can be tested without a browser. useDumpQueue.ts is the thin React wrapper.
import type { ReaderCard } from './readerApi';
import type { Draft, FieldId } from './mapping';

export const MAX_PARALLEL = 1; // the server allows 2 (MAX_CONCURRENT); raise this to read two at once
export const MAX_ITEMS = 50;
const SAVE_DELAY_MS = 250; // typing in the form is saved to IndexedDB at most this often

export type ItemStatus = 'queued' | 'reading' | 'ready' | 'review' | 'notfound' | 'failed' | 'saved' | 'skipped';
/** A field the user confirmed or edited, or 'notice' for "I have read the general warnings". */
export type ConfirmKey = FieldId | 'notice';
export interface DumpItem {
  id: string; hash: string; name: string; blob: File; createdAt: number;
  order: number; // list position; a second card from the same screenshot sits just after the first (e.g. 3 and 3.001)
  status: ItemStatus; card?: ReaderCard; cardIndex: number; cardCount: number;
  error?: string; // why reading failed
  edits?: Draft; confirmed: ConfirmKey[]; huntId?: string | null; // the user's work; huntId undefined = not chosen yet
  savedId?: string; saveError?: string; saving?: boolean; // saving and saveError are never persisted
}
export interface QueueState { items: DumpItem[]; loaded: boolean; persistFailed: boolean }
export interface AddResult { added: number; duplicates: string[]; rejected: string[] } // file names

export interface QueueStore { all(): Promise<DumpItem[]>; put(item: DumpItem): Promise<void>; remove(ids: string[]): Promise<void> }
export interface QueueDeps {
  read(file: File, signal: AbortSignal): Promise<ReaderCard[]>;
  store: QueueStore; hash(file: File): Promise<string>; uid(): string; now(): number;
}

export async function sha256Hex(file: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle; // missing on plain http (not localhost): fall back to a weaker fingerprint
  if (!subtle) { const f = file as File; return `weak-${f.name}-${f.size}-${f.lastModified ?? 0}`; }
  const buf = await subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// ---- selectors ----
export const itemLabel = (i: DumpItem) => i.cardCount > 1 ? `${i.name} - card ${i.cardIndex + 1}/${i.cardCount}` : i.name;
/** Waiting for the user: something to check, save, retry or skip. */
export const needsAction = (i: DumpItem) => i.status === 'ready' || i.status === 'review' || i.status === 'notfound' || i.status === 'failed';
export const pendingCount = (items: DumpItem[]) => items.filter(needsAction).length;
/** Work that would be lost if the page closed and nothing was persisted. */
export const isUnsaved = (i: DumpItem) => i.status === 'queued' || i.status === 'reading' || i.status === 'ready' || i.status === 'review';
export const firstAttention = (items: DumpItem[]) => items.find(needsAction)?.id;
/** The next item after `id` that needs action, wrapping around to the start. */
export function nextAfter(items: DumpItem[], id: string): string | undefined {
  const at = items.findIndex(i => i.id === id);
  const order = [...items.slice(at + 1), ...items.slice(0, Math.max(at, 0))];
  return order.find(i => i.id !== id && needsAction(i))?.id;
}

const statusOf = (c: ReaderCard): ItemStatus => c.status === 'ok' ? 'ready' : c.status === 'not_found' ? 'notfound' : c.status === 'error' ? 'failed' : 'review'; // anything unexpected must be checked
const slim = (c: ReaderCard): ReaderCard => { const copy = { ...c }; delete copy.debug; return copy; }; // raw OCR text is not needed after reading
function restore(row: DumpItem): DumpItem {
  const blob = row.blob instanceof File ? row.blob : new File([row.blob], row.name, { type: (row.blob as Blob).type });
  return { ...row, blob, confirmed: row.confirmed ?? [], status: row.status === 'reading' ? 'queued' : row.status, saving: undefined, saveError: undefined };
}

export class DumpQueue {
  private state: QueueState = { items: [], loaded: false, persistFailed: false };
  private listeners = new Set<() => void>();
  private aborts = new Map<string, AbortController>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private urls = new Map<string, string>();
  private writes: Promise<void> = Promise.resolve(); // all store writes run in order through this chain
  private addChain: Promise<unknown> = Promise.resolve();
  private loadP: Promise<void> = Promise.resolve();
  private active = 0; private gen = 0; private disposed = false;
  private deps: QueueDeps; private maxParallel: number;
  constructor(deps: QueueDeps, maxParallel = MAX_PARALLEL) { this.deps = deps; this.maxParallel = maxParallel; }

  // ---- store for useSyncExternalStore ----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  private set(p: Partial<QueueState>) { this.state = { ...this.state, ...p }; this.listeners.forEach(f => f()); }
  private get(id: string) { return this.state.items.find(i => i.id === id); }
  private patch(id: string, p: Partial<DumpItem>, persist: 'now' | 'soon' | 'none' = 'now') {
    if (!this.get(id)) return;
    this.set({ items: this.state.items.map(i => i.id === id ? { ...i, ...p } : i) });
    if (persist === 'now') this.save(id); else if (persist === 'soon') this.saveSoon(id);
  }

  // ---- persistence ----
  private enqueue(job: () => Promise<void>) {
    this.writes = this.writes.then(job).catch(() => { if (!this.state.persistFailed) this.set({ persistFailed: true }); });
  }
  private save(id: string) {
    const t = this.timers.get(id); if (t) { clearTimeout(t); this.timers.delete(id); }
    this.enqueue(async () => { const i = this.get(id); if (i) await this.deps.store.put({ ...i, saving: undefined, saveError: undefined }); });
  }
  private saveSoon(id: string) { if (!this.timers.has(id)) this.timers.set(id, setTimeout(() => this.save(id), SAVE_DELAY_MS)); }
  /** Write everything that is waiting. Call before the page goes away. */
  async flush() { for (const id of [...this.timers.keys()]) this.save(id); await this.writes; }

  /** Restore from the store (items that were being read go back to the queue) and start working. Safe to call again after dispose(). */
  load(): Promise<void> {
    this.disposed = false; this.active = 0;
    const gen = ++this.gen;
    this.loadP = (async () => {
      await this.writes;
      let rows: DumpItem[] = [];
      try { rows = await this.deps.store.all(); } catch { if (gen === this.gen) this.set({ persistFailed: true }); }
      if (gen !== this.gen) return;
      this.set({ items: rows.map(restore).sort((a, b) => a.order - b.order), loaded: true });
      rows.filter(r => r.status === 'reading').forEach(r => this.save(r.id));
      this.pump();
    })();
    return this.loadP;
  }
  /** Stop reading and release resources. The reads that were running go back to the queue, nothing is lost. */
  dispose() {
    this.disposed = true; this.gen++; this.active = 0;
    for (const i of this.state.items) if (i.status === 'reading') this.patch(i.id, { status: 'queued' });
    for (const c of this.aborts.values()) c.abort();
    this.aborts.clear();
    for (const id of [...this.urls.keys()]) this.revoke(id);
    void this.flush();
  }

  // ---- adding ----
  add(files: File[]): Promise<AddResult> {
    const p = this.addChain.then(() => this.doAdd(files));
    this.addChain = p.catch(() => undefined);
    return p;
  }
  private async doAdd(files: File[]): Promise<AddResult> {
    await this.loadP;
    const res: AddResult = { added: 0, duplicates: [], rejected: [] };
    for (const f of files) {
      const hash = await this.deps.hash(f);
      const items = this.state.items;
      if (items.some(i => i.hash === hash)) { res.duplicates.push(f.name); continue; }
      if (items.length >= MAX_ITEMS) { res.rejected.push(f.name); continue; }
      const order = Math.floor(Math.max(0, ...items.map(i => i.order))) + 1;
      const item: DumpItem = { id: this.deps.uid(), hash, name: f.name, blob: f, createdAt: this.deps.now(), order, status: 'queued', cardIndex: 0, cardCount: 1, confirmed: [] };
      this.set({ items: [...items, item] }); this.save(item.id);
      res.added++; this.pump();
    }
    return res;
  }

  // ---- the worker ----
  private pump() {
    if (this.disposed || !this.state.loaded) return;
    while (this.active < this.maxParallel) {
      const next = this.state.items.find(i => i.status === 'queued');
      if (!next) return;
      this.active++; void this.run(next);
    }
  }
  private async run(item: DumpItem) {
    const gen = this.gen; // a read that outlives dispose()/load() is stale: it must not touch the new state or the worker count
    const ctl = new AbortController(); this.aborts.set(item.id, ctl);
    this.patch(item.id, { status: 'reading', error: undefined });
    try {
      const cards = await this.deps.read(item.blob, ctl.signal);
      if (gen === this.gen) this.apply(item.id, cards);
    } catch (e) {
      // Only a read that is still current fails. Cancelled, removed and disposed items already changed state.
      if (gen === this.gen && this.get(item.id)?.status === 'reading') this.patch(item.id, { status: 'failed', error: (e as Error).message || 'Reading failed.' });
    } finally {
      if (this.aborts.get(item.id) === ctl) this.aborts.delete(item.id);
      if (gen === this.gen) { this.active--; this.pump(); }
    }
  }
  private apply(id: string, cards: ReaderCard[]) {
    const cur = this.get(id);
    if (!cur || cur.status !== 'reading') return; // cancelled, removed or restarted while the answer was on its way
    const made = cards.map((c, k): DumpItem => ({
      ...cur, id: k === 0 ? cur.id : this.deps.uid(), order: cur.order + k / 1000, card: slim(c), cardIndex: k, cardCount: cards.length,
      status: statusOf(c), error: c.status === 'error' ? c.warnings?.[0] || 'The reader could not open that image.' : undefined,
      edits: undefined, confirmed: [], huntId: undefined, savedId: undefined, saveError: undefined,
    }));
    this.set({ items: this.state.items.flatMap(i => i.id === id ? made : [i]) });
    made.forEach(m => this.save(m.id));
  }

  // ---- actions ----
  retry(id: string) { if (this.get(id)?.status === 'failed') { this.patch(id, { status: 'queued', error: undefined }); this.pump(); } }
  /** Stop a waiting or running read. The item becomes 'failed' (Cancelled) so it can be retried. */
  cancel(id: string) {
    const s = this.get(id)?.status;
    if (s !== 'queued' && s !== 'reading') return;
    this.patch(id, { status: 'failed', error: 'Cancelled.' });
    this.aborts.get(id)?.abort();
  }
  skip(id: string) { const i = this.get(id); if (i && (needsAction(i) || i.status === 'queued') && !i.saving) this.patch(id, { status: 'skipped' }); }
  reopen(id: string) { const i = this.get(id); if (i?.status === 'skipped') { this.patch(id, { status: i.card ? statusOf(i.card) : 'queued' }); this.pump(); } }
  /** Save the user's work on an item: edits, confirmed fields, chosen hunt. Ignored once saving or saved. */
  update(id: string, p: Partial<Pick<DumpItem, 'edits' | 'confirmed' | 'huntId'>>) {
    const i = this.get(id);
    if (i && (i.status === 'ready' || i.status === 'review') && !i.saving) this.patch(id, p, 'soon');
  }
  remove(id: string) {
    if (!this.get(id)) return;
    const t = this.timers.get(id); if (t) { clearTimeout(t); this.timers.delete(id); }
    this.revoke(id);
    this.set({ items: this.state.items.filter(i => i.id !== id) });
    this.aborts.get(id)?.abort();
    this.enqueue(() => this.deps.store.remove([id]));
  }
  clearSaved() { this.state.items.filter(i => i.status === 'saved').forEach(i => this.remove(i.id)); }

  // Saving to Supabase happens in the UI; these three make double inserts impossible.
  /** true = you may insert now. false = already saving or saved (or not ready), do not insert. */
  beginSave(id: string): boolean {
    const i = this.get(id);
    if (!i || i.saving || (i.status !== 'ready' && i.status !== 'review')) return false;
    this.patch(id, { saving: true, saveError: undefined }, 'none'); return true;
  }
  finishSave(id: string, savedId: string) { this.patch(id, { status: 'saved', savedId, saving: false, saveError: undefined }); }
  failSave(id: string, message: string) { this.patch(id, { saving: false, saveError: message }, 'none'); }

  /** Object URL of the uploaded screenshot (for 'show original'). Revoked when the item is removed or the queue is disposed. */
  originalUrl = (id: string): string | undefined => {
    const i = this.get(id); if (!i) return undefined;
    let u = this.urls.get(id);
    if (!u) { u = URL.createObjectURL(i.blob); this.urls.set(id, u); }
    return u;
  };
  private revoke(id: string) { const u = this.urls.get(id); if (u) { URL.revokeObjectURL(u); this.urls.delete(id); } }
}
