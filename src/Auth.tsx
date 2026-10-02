import { useState } from 'react';
import { supabase } from './supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [state, setState] = useState<string>('idle');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, data: { username: username.trim() } } });
    setState(error ? error.message : 'sent');
  };
  return (
    <main className="auth">
      <div className="logo">🎯</div>
      <h1>Hunt HQ</h1>
      <p>Our team's shiny and perfect-build hunting list.</p>
      {state === 'sent' ? <p className="ok">Check your inbox, we sent you a sign-in link.</p> : (
        <form onSubmit={send}>
          <input type="email" required placeholder="you@team.com" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="text" maxLength={24} placeholder="Choose a username (new accounts only)" value={username} onChange={e => setUsername(e.target.value)} />
          <button className="primary">Email me a sign-in link</button>
          {state !== 'idle' && <p className="err">{state}</p>}
        </form>
      )}
    </main>
  );
}