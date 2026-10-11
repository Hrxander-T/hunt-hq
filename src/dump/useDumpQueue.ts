import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { readCards } from './readerApi';
import { DumpQueue, isUnsaved, pendingCount, sha256Hex, uid } from './queue';
import { idbStore } from './store';
import { deleteShots, syncPhoneShots } from './pending';
import { addCardImages } from './crop';

const SYNC_EVERY_MS = 30_000;

/** One queue per signed-in user. Call it in Board (above the tab switch) so the queue keeps working when the tab is not shown. */
export function useDumpQueue(userId: string) {
  const q = useMemo(() => new DumpQueue({ read: readCards, store: idbStore(userId), hash: sha256Hex, uid, now: Date.now, release: id => deleteShots([id]), addImages: addCardImages }), [userId]);
  useEffect(() => {
    void q.load();
    const flush = () => { void q.flush(); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); q.dispose(); };
  }, [q]);
  const state = useSyncExternalStore(q.subscribe, q.getSnapshot);
  // Screenshots from the capture apps: checked when the app opens, every 30 seconds, when you come back to the page, and on "Check now".
  const [sync, setSync] = useState({ nextAt: 0, checking: false });
  const checkRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!state.loaded) return;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { // the next automatic check is always 30 seconds after the last round
      clearTimeout(timer);
      setSync(s => ({ ...s, nextAt: Date.now() + SYNC_EVERY_MS }));
      timer = setTimeout(() => { void run(); }, SYNC_EVERY_MS);
    };
    const run = async (manual = false) => {
      if (busy) return;
      if (!manual && document.visibilityState !== 'visible') { schedule(); return; }
      busy = true;
      setSync(s => ({ ...s, checking: true }));
      try { await syncPhoneShots(q); } catch { /* offline or not ready: try again next round */ } finally {
        busy = false;
        setSync(s => ({ ...s, checking: false }));
        schedule();
      }
    };
    const onVisible = () => { void run(); };
    checkRef.current = () => { void run(true); };
    void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [q, state.loaded]);
  const checkNow = useCallback(() => checkRef.current(), []);
  // Only warn when leaving would lose work: persistence is broken and something unsaved is waiting.
  const atRisk = state.persistFailed && state.items.some(isUnsaved);
  useEffect(() => {
    if (!atRisk) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [atRisk]);
  return { q, ...state, pending: pendingCount(state.items), nextCheckAt: sync.nextAt, checking: sync.checking, checkNow };
}
