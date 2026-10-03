import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

interface Member { user_id: string; name: string; email: string; is_admin: boolean; active: boolean; last_seen: string | null }
interface Invite { code: string; created_at: string; expires_at: string; used_by_name: string | null; status: 'open' | 'used' | 'expired' }

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fresh, setFresh] = useState('');
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState('');
  const [armed, setArmed] = useState('');

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([supabase.rpc('admin_members'), supabase.rpc('admin_invites')]);
    if (m.error) setMsg(m.error.message); else setMembers(m.data as Member[]);
    if (i.data) setInvites(i.data as Invite[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; setMsg(error ? error.message : ''); load(); };
  const create = async () => {
    const { data, error } = await supabase.rpc('create_invite', { days });
    if (error) return setMsg(error.message);
    setFresh(data as string); setMsg(''); load();
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setMsg('Copied.'); } catch { setMsg('Select the code and copy it manually.'); } };
  const confirm = (key: string, fn: () => void) => { if (armed === key) { setArmed(''); fn(); } else setArmed(key); };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>Admin</h2>
        <h3>Invite a teammate</h3>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <select value={days} onChange={e => setDays(+e.target.value)} style={{ width: 'auto' }}>
            <option value={1}>Expires in 1 day</option><option value={7}>Expires in 7 days</option><option value={30}>Expires in 30 days</option>
          </select>
          <button className="primary" onClick={create}>Create invite code</button>
        </div>
        {fresh && <p>Send this one-time code: <b className="code">{fresh}</b> <button onClick={() => copy(fresh)}>Copy</button></p>}
        {msg && <p className="err">{msg}</p>}
        {invites.length > 0 && <table><tbody>{invites.map(i => (
          <tr key={i.code}>
            <td><span className="code">{i.code}</span></td>
            <td>{i.status === 'used' ? `Used by ${i.used_by_name ?? 'a deleted user'}` : i.status === 'expired' ? 'Expired' : `Open until ${new Date(i.expires_at).toLocaleDateString()}`}</td>
            <td>{i.status === 'open' && <button className="ghost" onClick={() => run(supabase.rpc('revoke_invite', { c: i.code }))}>Cancel</button>}</td>
          </tr>
        ))}</tbody></table>}
        <h3>People</h3>
        <table><tbody>{members.map(m => (
          <tr key={m.user_id}>
            <td><b>{m.name}</b>{m.is_admin ? ' (admin)' : ''}<br /><small>{m.email}</small></td>
            <td>{m.active ? 'Has access' : 'Access off'}</td>
            <td>{!m.is_admin && <>
              <button className="ghost" onClick={() => run(supabase.rpc('admin_set_active', { uid: m.user_id, on_off: !m.active }))}>{m.active ? 'Turn off' : 'Turn on'}</button>
              <button className="ghost" onClick={() => confirm(m.user_id, () => run(supabase.rpc('admin_delete_user', { uid: m.user_id })))}>{armed === m.user_id ? 'Sure?' : 'Delete'}</button>
            </>}</td>
          </tr>
        ))}</tbody></table>
        <div className="row"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
