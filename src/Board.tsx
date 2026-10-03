import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Hunt, Profile, Status } from './types';
import HuntCard from './HuntCard';
import HuntForm from './HuntForm';
import AdminPanel from './AdminPanel';
import ProfileDialog from './ProfileDialog';
import Avatar from './Avatar';

const NEXT: Record<Status, Status> = { planned: 'hunting', hunting: 'caught', caught: 'planned' };
const fields = (d: Partial<Hunt>) => ({
  pokemon_id: d.pokemon_id, name: d.name, types: d.types, shiny: !!d.shiny, natures: d.natures ?? [], abilities: d.abilities ?? [],
  iv_reqs: d.iv_reqs ?? {}, notes: d.notes || null, priority: d.priority ?? 2, status: d.status ?? 'planned',
});

export default function Board({ me }: { me: string }) {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [sort, setSort] = useState('priority');
  const [form, setForm] = useState<{ edit?: Hunt } | null>(null);
  const [err, setErr] = useState('');
  const [admin, setAdmin] = useState(false);
  const [panel, setPanel] = useState(false);
  const [profile, setProfile] = useState(false);

  const load = useCallback(async () => {
    const acc = await supabase.rpc('my_access');
    if (acc.data && !acc.data.active) {
      sessionStorage.setItem('hunt.notice', 'Your access has been turned off. Ask the admin if this is a mistake.');
      supabase.auth.signOut(); return;
    }
    setAdmin(!!acc.data?.admin);
    const [h, p] = await Promise.all([supabase.from('hunts').select('*'), supabase.from('profiles').select('*')]);
    if (h.error) return setErr(h.error.message);
    setHunts(h.data as Hunt[]);
    setPeople(Object.fromEntries(((p.data ?? []) as Profile[]).map(x => [x.id, x])));
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('team').on('postgres_changes', { event: '*', schema: 'public' }, () => load()).subscribe();
    const t = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => { supabase.removeChannel(ch); clearInterval(t); window.removeEventListener('focus', load); };
  }, [load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else load(); };
  const save = async (d: Partial<Hunt>) => {
    if (form?.edit) await run(supabase.from('hunts').update(fields(d)).eq('id', form.edit.id));
    else await run(supabase.from('hunts').insert(fields(d)));
    setForm(null);
  };

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    const order = { hunting: 0, planned: 1, caught: 2 };
    return hunts
      .filter(h => (!status || h.status === status) &&
        (!s || [h.name, ...(h.natures ?? []), ...(h.abilities ?? []), h.notes, people[h.hunter_id ?? '']?.name].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'newest' ? +new Date(b.created_at) - +new Date(a.created_at)
        : sort === 'status' ? order[a.status] - order[b.status]
        : b.priority - a.priority || a.name.localeCompare(b.name));
  }, [hunts, people, q, status, sort]);

  const count = (s: Status) => hunts.filter(h => h.status === s).length;
  const myName = people[me]?.name ?? 'Profile';
  return (
    <div className="wrap">
      <header className="appbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div><h1>Hunt HQ</h1><p>{hunts.length} on the list · {count('hunting')} active · {count('caught')} caught</p></div>
        </div>
        <div className="acct">
          <button className="user" onClick={() => setProfile(true)} title="Edit your profile"><Avatar name={myName} size={24} /><span>{myName}</span></button>
          {admin && <button onClick={() => setPanel(true)}>Admin</button>}
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
      <div className="bar">
        <input type="search" placeholder="Search Pokémon, nature, ability, hunter" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option><option value="planned">Planned</option><option value="hunting">Hunting</option><option value="caught">Caught</option></select>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="priority">Sort: priority</option><option value="name">Sort: name</option><option value="status">Sort: status</option><option value="newest">Sort: newest</option></select>
        <button className="primary" onClick={() => setForm({})}>Add hunt</button>
      </div>
      <section className="cards">
        {shown.length === 0 && <p className="empty">{hunts.length ? 'Nothing matches that filter.' : 'The list is empty. Add the first Pokémon your team wants to hunt.'}</p>}
        {shown.map(h => (
          <HuntCard key={h.id} h={h} people={people} me={me}
            onStatus={() => run(supabase.from('hunts').update({ status: NEXT[h.status] }).eq('id', h.id))}
            onClaim={() => run(supabase.from('hunts').update({ hunter_id: h.hunter_id === me ? null : me }).eq('id', h.id))}
            onEdit={() => setForm({ edit: h })}
            onDelete={() => run(supabase.from('hunts').delete().eq('id', h.id))} />
        ))}
      </section>
      {profile && <ProfileDialog me={me} current={people[me]} onClose={() => setProfile(false)} onSaved={() => { setProfile(false); load(); }} />}
      {panel && <AdminPanel onClose={() => setPanel(false)} />}
      {form && <HuntForm initial={form.edit} onSave={save} onClose={() => setForm(null)} />}
    </div>
  );
}
