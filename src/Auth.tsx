import { useState } from 'react';
import { supabase } from './supabase';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'join'>('in');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(sessionStorage.getItem('hunt.notice') ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(''); sessionStorage.removeItem('hunt.notice');
    if (mode === 'join') {
      const { data, error } = await supabase.functions.invoke('redeem-invite', { body: { code, username, email, password } });
      if (error) {
        let m = error.message;
        try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) m = b.error; } catch { /* keep default */ }
        setBusy(false); return setMsg(m);
      }
      if (data?.error) { setBusy(false); return setMsg(data.error); }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
    setBusy(false);
  };

  return (
    <main className="auth">
      <div className="logo">🎯</div>
      <h1>Hunt HQ</h1>
      <p>{mode === 'in' ? 'Sign in to your account.' : 'Create your account with the invite code you were sent.'}</p>
      <form onSubmit={submit}>
        {mode === 'join' && <>
          <input required placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" />
          <input required minLength={2} maxLength={24} placeholder="Choose a username" value={username} onChange={e => setUsername(e.target.value)} />
        </>}
        <input type="email" required placeholder="you@team.com" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" required minLength={mode === 'join' ? 8 : 1} placeholder={mode === 'join' ? 'Choose a password (8+ characters)' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} />
        <button className="primary" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {msg && <p className="err">{msg}</p>}
      </form>
      <button type="button" className="ghost" onClick={() => { setMode(mode === 'in' ? 'join' : 'in'); setMsg(''); }}>
        {mode === 'in' ? 'I have an invite code' : 'Back to sign in'}
      </button>
    </main>
  );
}
