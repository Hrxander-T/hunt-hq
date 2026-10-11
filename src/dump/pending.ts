// Screenshots sent by the Android capture app: they wait in Supabase (pending_shots) with the picture in Cloudinary.
// syncPhoneShots() pulls them into the Dump queue; deleteShots() removes them again once they are saved or skipped.
import { supabase } from '../supabase';
import type { DumpQueue } from './queue';
import type { ReaderCard } from './readerApi';

/** read = what the PC worker did with it: 'done' (cards are the result), 'failed', or null (not read yet). */
export interface PendingShot { public_id: string; url: string; at: string; read: 'done' | 'failed' | null; cards?: ReaderCard[] }
const isDone = (s: string) => s === 'saved' || s === 'skipped';
// A new shot without a background result is left alone for a few minutes: the PC worker is probably about to read it,
// and the reader is on the same PC anyway, so reading it in the browser now would only do the same work twice.
export const WAIT_FOR_WORKER_MS = 3 * 60_000;

/** Hands out new shots (and your own unfinished ones) and marks them as yours. */
export async function claimShots(): Promise<PendingShot[]> {
  const { data, error } = await supabase.rpc('claim_pending_shots');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { shot_public_id: string; shot_url: string; shot_created_at: string; shot_read_status: string | null; shot_read_result: { cards?: unknown } | null }[];
  return rows.map((r): PendingShot => {
    const cards = Array.isArray(r.shot_read_result?.cards) && r.shot_read_result.cards.length ? r.shot_read_result.cards as ReaderCard[] : undefined;
    return { public_id: r.shot_public_id, url: r.shot_url, at: r.shot_created_at, read: r.shot_read_status === 'done' && cards ? 'done' : r.shot_read_status === 'failed' ? 'failed' : null, cards };
  }).sort((a, b) => a.at.localeCompare(b.at));
}

export async function downloadShot(s: PendingShot): Promise<File> {
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`Could not download ${s.public_id} (HTTP ${res.status})`);
  const blob = await res.blob();
  return new File([blob], `phone-${s.public_id.replace(/[^\w-]/g, '-')}.png`, { type: blob.type || 'image/png' });
}

/** Deletes the pictures from Cloudinary and the rows from Supabase. true = all gone. */
export async function deleteShots(ids: string[]): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('delete-shots', { body: { public_ids: ids } });
    return !error && !!(data as { ok?: boolean } | null)?.ok;
  } catch { return false; }
}

/** One round: fetch what is new from the phone, add it to the queue, and clean up what is already finished. Throws when offline. */
export async function syncPhoneShots(q: DumpQueue): Promise<number> {
  const rows = await claimShots();
  const fresh: PendingShot[] = [];
  for (const r of rows) {
    const mine = q.getSnapshot().items.filter(i => i.cloudId === r.public_id);
    if (mine.length === 0) fresh.push(r);
    else if (mine.every(i => isDone(i.status))) void deleteShots([r.public_id]); // an earlier delete did not go through: try again
  }
  const files: File[] = [];
  const ids: string[] = [];
  const pre: (ReaderCard[] | undefined)[] = [];
  for (const r of fresh) {
    if (r.read === null && Date.now() - Date.parse(r.at) < WAIT_FOR_WORKER_MS) continue; // picked up in a later round
    try { files.push(await downloadShot(r)); ids.push(r.public_id); pre.push(r.read === 'done' ? r.cards : undefined); } catch { /* try again next round */ }
  }
  if (!files.length) return 0;
  return (await q.add(files, ids, pre)).added;
}
