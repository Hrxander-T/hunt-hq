// Screenshots sent by the Android capture app: they wait in Supabase (pending_shots) with the picture in Cloudinary.
// syncPhoneShots() pulls them into the Dump queue; deleteShots() removes them again once they are saved or skipped.
import { supabase } from '../supabase';
import type { DumpQueue } from './queue';

export interface PendingShot { public_id: string; url: string; at: string }
const isDone = (s: string) => s === 'saved' || s === 'skipped';

/** Hands out new shots (and your own unfinished ones) and marks them as yours. */
export async function claimShots(): Promise<PendingShot[]> {
  const { data, error } = await supabase.rpc('claim_pending_shots');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { shot_public_id: string; shot_url: string; shot_created_at: string }[];
  return rows.map(r => ({ public_id: r.shot_public_id, url: r.shot_url, at: r.shot_created_at })).sort((a, b) => a.at.localeCompare(b.at));
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
  for (const r of fresh) {
    try { files.push(await downloadShot(r)); ids.push(r.public_id); } catch { /* try again next round */ }
  }
  if (!files.length) return 0;
  return (await q.add(files, ids)).added;
}
