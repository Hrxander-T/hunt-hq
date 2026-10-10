import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { readCards } from './readerApi';
import { DumpQueue, isUnsaved, pendingCount, sha256Hex, uid } from './queue';
import { idbStore } from './store';

/** One queue per signed-in user. Call it in Board (above the tab switch) so the queue keeps working when the tab is not shown. */
export function useDumpQueue(userId: string) {
  const q = useMemo(() => new DumpQueue({ read: readCards, store: idbStore(userId), hash: sha256Hex, uid, now: Date.now }), [userId]);
  useEffect(() => {
    void q.load();
    const flush = () => { void q.flush(); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); q.dispose(); };
  }, [q]);
  const state = useSyncExternalStore(q.subscribe, q.getSnapshot);
  // Only warn when leaving would lose work: persistence is broken and something unsaved is waiting.
  const atRisk = state.persistFailed && state.items.some(isUnsaved);
  useEffect(() => {
    if (!atRisk) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [atRisk]);
  return { q, ...state, pending: pendingCount(state.items) };
}
