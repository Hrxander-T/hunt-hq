export type Platform = 'android' | 'windows' | 'linux' | 'other';
export interface AppFile { id: Exclude<Platform, 'other'>; label: string; file: string; note: string }

// File names inside the private Supabase Storage bucket "apps" (see supabase/migration-apps.sql).
export const APP_FILES: AppFile[] = [
  { id: 'android', label: 'Android', file: 'HuntHQ-Capture.apk', note: 'Floating capture button. When asked, allow installing from this browser.' },
  { id: 'windows', label: 'Windows', file: 'HuntHQCapture.exe', note: 'Tray app, press F9 in the game. Needs a config.json next to it with the upload token.' },
  { id: 'linux', label: 'Linux', file: 'HuntHQCapture-linux.tar.gz', note: 'Tray app, press F9 in the game. X11 only. Needs a config.json next to it with the upload token.' },
];

export function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return 'android'; // Android user agents also say "Linux", so check this first
  if (/windows/i.test(ua)) return 'windows';
  if (/linux|x11/i.test(ua)) return 'linux';
  return 'other';
}

export function sortForPlatform(files: AppFile[], mine: Platform): AppFile[] {
  return [...files].sort((a, b) => Number(b.id === mine) - Number(a.id === mine));
}
