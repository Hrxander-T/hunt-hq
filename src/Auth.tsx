import { useState } from 'react';
import { supabase } from './supabase';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'join'>('in');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <main className="authwrap">
      <section className="authbrand">
        <span className="mark big" aria-hidden="true" />
        <h1>Hunt HQ</h1>
        <p>One shared list for every Pokémon your team is hunting.</p>
        <ul>
          <li>Natures, abilities and IV requirements for each target</li>
          <li>See who is hunting what</li>
          <li>Everyone stays on the same page</li>
        </ul>
      </section>
      <section className="authcard">
        <div className="seg" role="tablist">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setMsg(''); }}>Sign in</button>
          <button type="button" className={mode === 'join' ? 'on' : ''} onClick={() => { setMode('join'); setMsg(''); }}>Use invite code</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'join' && <>
            <label className="field"><span className="lbl">Invite code</span>
              <input required value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" /></label>
            <label className="field"><span className="lbl">Username</span>
              <input required minLength={2} maxLength={24} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
          </>}
          <label className="field"><span className="lbl">Email</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
          <label className="field"><span className="lbl">{mode === 'join' ? 'Choose a password' : 'Password'}</span>
            <span className="pw">
              <input type={show ? 'text' : 'password'} required minLength={mode === 'join' ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'join' ? 'new-password' : 'current-password'} />
              <button type="button" className="ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </span>
            {mode === 'join' && <small className="hint">At least 8 characters.</small>}
          </label>
          {msg && <p className="err" role="alert">{msg}</p>}
          <button className="primary wide" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
      </section>
    </main>
  );
}
