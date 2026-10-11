import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { APP_FILES, detectPlatform, sortForPlatform } from './apps';

interface InstallEvent extends Event { prompt: () => Promise<void> }

export default function GetApps() {
  const [have, setHave] = useState<Set<string> | null>(null); // null = still checking
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const rows = sortForPlatform(APP_FILES, detectPlatform(navigator.userAgent));
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;

  useEffect(() => {
    supabase.storage.from('apps').list().then(
      ({ data }) => setHave(new Set((data ?? []).map(f => f.name))),
      () => setHave(new Set()),
    );
  }, []);
  useEffect(() => { // the browser offers "install this web app" once; keep it for our button
    const h = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const download = async (file: string) => {
    setBusy(file); setErr('');
    const { data, error } = await supabase.storage.from('apps').createSignedUrl(file, 60, { download: true });
    setBusy('');
    if (error || !data) setErr('Could not start the download. Try again.');
    else location.href = data.signedUrl;
  };

  return (
    <details className="apps">
      <summary>Get the apps</summary>
      {install && !standalone && (
        <div className="approw">
          <span><b>Hunt HQ</b><small>Install this website as an app on this device.</small></span>
          <button className="primary" onClick={() => void install.prompt()}>Install</button>
        </div>
      )}
      {rows.map(a => (
        <div key={a.id} className="approw">
          <span><b>{a.label} capture app</b><small>{a.note}</small></span>
          {have === null ? <span className="muted">Checking…</span>
            : have.has(a.file) ? <button disabled={busy === a.file} onClick={() => void download(a.file)}>{busy === a.file ? 'Starting…' : 'Download'}</button>
            : <span className="muted">Not uploaded yet</span>}
        </div>
      ))}
      {err && <p className="warn" role="status">{err}</p>}
    </details>
  );
}
