import { useCallback, useEffect, useRef, useState } from 'react';
import type { Caught, Hunt } from '../types';
import { loadList, type Entry } from '../lib';
import { health, readerConfigured } from './readerApi';
import { captureSupported, startCapture, type CaptureSession } from './capture';
import { takeShared } from './shared';
import { firstAttention, itemLabel, MAX_ITEMS, nextAfter, type AddResult, type ItemStatus } from './queue';
import type { useDumpQueue } from './useDumpQueue';
import ReviewPane from './ReviewPane';

type Dump = ReturnType<typeof useDumpQueue>;
interface Props { dump: Dump; hunts: Hunt[]; caught: Caught[]; me: string; onChanged: () => void }
type Reader = 'checking' | 'online' | 'offline' | 'unset';

const CHIP: Record<ItemStatus, string> = { queued: 'Waiting', reading: 'Reading…', ready: 'Ready', review: 'Check', notfound: 'No card', failed: 'Failed', saved: 'Saved', skipped: 'Skipped' };
const READER_TEXT: Record<Reader, string> = {
  checking: 'Checking the reader…', online: 'Reader online',
  offline: 'Reader offline. Screenshots wait in the queue and can be retried.', unset: 'Reader address not set (VITE_READER_URL)',
};
let toastId = 0;

export default function DumpTab({ dump, hunts, caught, me, onChanged }: Props) {
  const { q, items, loaded, persistFailed } = dump;
  const [list, setList] = useState<Entry[]>([]);
  const [sel, setSel] = useState('');
  const [over, setOver] = useState(false);
  const [reader, setReader] = useState<Reader>('checking');
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const pick = useRef<HTMLInputElement>(null);

  const toast = useCallback((text: string) => {
    const id = ++toastId;
    setToasts(t => [...t, { id, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000);
  }, []);
  const checkReader = useCallback(async () => {
    if (!readerConfigured()) { setReader('unset'); return; }
    setReader('checking');
    setReader((await health()).ok ? 'online' : 'offline');
  }, []);
  useEffect(() => { void checkReader(); }, [checkReader]);
  useEffect(() => { loadList().then(setList).catch(() => toast('Could not load the Pokémon list. Species cannot be checked until it loads.')); }, [toast]);

  const addFiles = useCallback(async (files: File[]): Promise<AddResult | undefined> => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length < files.length) toast(`Skipped ${files.length - images.length} file(s) that are not images.`);
    if (!images.length) return;
    const r = await q.add(images);
    if (r.duplicates.length) toast(`Already in the queue, skipped: ${r.duplicates.join(', ')}`);
    if (r.rejected.length) toast(`The queue holds at most ${MAX_ITEMS} items. Not added: ${r.rejected.join(', ')}. Save, skip or clear some first.`);
    return r;
  }, [q, toast]);

  useEffect(() => { // Ctrl+V anywhere on this tab. Pasting text into a field is left alone (no image files in it).
    const onPaste = (ev: ClipboardEvent) => {
      const files = [...(ev.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      ev.preventDefault();
      const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
      void addFiles(files.map((f, i) => new File([f], `pasted-${stamp}${files.length > 1 ? `-${i + 1}` : ''}.png`, { type: f.type }))); // clipboard images are all called image.png
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  // Screenshots sent from Android's Share menu wait in storage until the queue is ready.
  useEffect(() => {
    if (!loaded) return;
    void takeShared().then(files => { if (files.length) void addFiles(files); });
    if (new URLSearchParams(location.search).has('shared')) history.replaceState(null, '', location.pathname); // so a reload does not look like a new share
  }, [loaded, addFiles]);

  // ---- Capture button: share the game window once, then one click = one screenshot into the queue ----
  const [cap, setCap] = useState<CaptureSession | null>(null);
  const [flash, setFlash] = useState('');
  const capRef = useRef<CaptureSession | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const begin = async () => {
    try {
      const s = await startCapture(() => { capRef.current = null; setCap(null); }); // the user pressed the browser's "Stop sharing"
      capRef.current = s; setCap(s);
    } catch (e) { if ((e as Error).name !== 'NotAllowedError') toast(`Could not start capture: ${(e as Error).message}`); } // NotAllowedError = picker cancelled
  };
  const end = () => { capRef.current?.stop(); capRef.current = null; setCap(null); };
  const shoot = async () => {
    if (!cap) return;
    try {
      const r = await addFiles([await cap.grab()]);
      if (r && r.added > 0) { setFlash('✓ Sent to the queue'); setTimeout(() => setFlash(''), 2000); }
    } catch (e) { toast((e as Error).message); }
  };
  useEffect(() => () => { capRef.current?.stop(); }, []); // leaving the Dump tab stops sharing
  useEffect(() => { if (preview.current) preview.current.srcObject = cap?.stream ?? null; }, [cap]);

  // Keep something selected: the first item that needs attention (or the first item while everything is still being read).
  useEffect(() => { if (loaded && !items.some(i => i.id === sel)) setSel(firstAttention(items) ?? items[0]?.id ?? ''); }, [loaded, items, sel]);
  const advance = (id: string) => setSel(nextAfter(items, id) ?? id);
  const cur = items.find(i => i.id === sel);
  const savedCount = items.filter(i => i.status === 'saved').length;

  return (
    <div className="dump">
      <div className={`dzone${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}>
        <b>Drop screenshots here</b>
        <span className="muted">or paste with Ctrl+V. One screenshot can hold several cards. Up to {MAX_ITEMS} in the queue.</span>
        <div className="row">
          <button className="primary" onClick={() => pick.current?.click()}>Choose screenshots</button>
          {captureSupported() && !cap && <button onClick={() => void begin()}>Start capture</button>}
          {savedCount > 0 && <button onClick={() => q.clearSaved()}>Clear {savedCount} saved</button>}
        </div>
        {cap && (
          <div className="capbar">
            <video ref={preview} className="capprev" muted autoPlay playsInline />
            <button className="primary big" onClick={() => void shoot()}>📷 Capture</button>
            <button onClick={end}>Stop</button>
            {flash && <span className="okmsg" role="status">{flash}</span>}
            <span className="muted capnote">Keep the game window visible, not minimized.</span>
          </div>
        )}
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <span className={`rdr ${reader}`} role="status"><i />{READER_TEXT[reader]}{(reader === 'offline' || reader === 'online') && <button className="ghost small" onClick={() => void checkReader()}>Check again</button>}</span>
      </div>

      {persistFailed && <p className="warn">This browser could not keep your queue (private window or full storage). Save everything before closing or reloading the page.</p>}
      {toasts.map(t => <p key={t.id} className="warn toast" role="status" onClick={() => setToasts(a => a.filter(x => x.id !== t.id))}>{t.text}</p>)}
      <datalist id="dump-species">{list.map(s => <option key={s.id} value={s.name} />)}</datalist>

      {!loaded ? <p className="muted">Loading your queue…</p> : items.length === 0 ? (
        <p className="empty">No screenshots yet. Drop in screenshots of your Pokémon summary screens; each one is read and shown here for you to check before it is saved.</p>
      ) : (
        <div className="dmain">
          <div className="dqueue" role="list" aria-label="Queue">
            {items.map(i => (
              <button key={i.id} role="listitem" className={`ditem${i.id === sel ? ' sel' : ''}`} aria-current={i.id === sel} onClick={() => setSel(i.id)}>
                {i.card?.image ? <img className="dthumb" src={i.card.image} alt="" loading="lazy" /> : <span className="dthumb" aria-hidden>{i.status === 'reading' ? '…' : ''}</span>}
                <span className="dname"><b title={itemLabel(i)}>{itemLabel(i)}</b>{i.card?.name && <small>{i.card.name}</small>}</span>
                <span className={`dchip ${i.status}`}>{CHIP[i.status]}</span>
              </button>
            ))}
          </div>
          <div>{cur && <ReviewPane key={cur.id} item={cur} q={q} list={list} hunts={hunts} caught={caught} me={me} onChanged={onChanged} onAdvance={advance} />}</div>
        </div>
      )}
    </div>
  );
}
