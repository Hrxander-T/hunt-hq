import { useEffect, useState } from 'react';
import { APP_FILES, detectPlatform, downloadUrl, sortForPlatform } from './apps';

interface InstallEvent extends Event { prompt: () => Promise<void> }

export default function GetApps() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const rows = sortForPlatform(APP_FILES, detectPlatform(navigator.userAgent));
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;

  useEffect(() => { // the browser offers "install this web app" once; keep it for our button
    const h = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

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
          <button onClick={() => { location.href = downloadUrl(a.file); }}>Download</button>
        </div>
      ))}
    </details>
  );
}
