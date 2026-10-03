import { useState } from 'react';
import { supabase } from './supabase';
import type { Profile } from './types';

export default function ProfileDialog({ me, current, onClose, onSaved }: { me: string; current?: Profile; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(current?.name ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) return setMsg('Username needs at least 2 characters.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ name: n }).eq('id', me);
    setBusy(false);
    if (error) return setMsg(error.code === '23505' ? 'That username is taken. Try another.' : error.message);
    onSaved();
  };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <h2>Your profile</h2>
        <label className="field"><span className="lbl">Username</span><input autoFocus value={name} maxLength={24} onChange={e => setName(e.target.value)} /></label>
        {msg && <p className="err">{msg}</p>}
        <div className="foot"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Save</button></div>
      </form>
    </div>
  );
}
