import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Activity, Hunt, Profile, Status } from './types';
import { pretty } from './lib';
import HuntCard from './HuntCard';
import HuntForm from './HuntForm';

const NEXT: Record<Status, Status> = { planned: 'hunting', hunting: 'caught', caught: 'planned' };

export default function Board({ me }: { me: string }) {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [feed, setFeed] = useState<Activity[]>([]);
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [sort, setSort] = useState('priority');
  const [form, setForm] = useState<{ edit?: Hunt } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [h, p, a] = await Promise.all([
      supabase.from('hunts').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(8),
    ]);
    if (h.error) return setErr(h.error.message);
    setHunts(h.data as Hunt[]); setFeed((a.data ?? []) as Activity[]);
    setPeople(Object.fromEntries(((p.data ?? []) as Profile[]).map(x => [x.id, x])));
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('team').on('postgres_changes', { event: '*', schema: 'public' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const who = people[me]?.name ?? 'Someone';
  const log = (text: string) => supabase.from('activity').insert({ text }).then(() => load());
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else load(); };

  const save = async (d: Partial<Hunt>) => {
    const fields = { ...d };
    delete fields.id; delete fields.created_at; delete fields.added_by;
    if (form?.edit) await run(supabase.from('hunts').update(fields).eq('id', form.edit.id));
    else { await run(supabase.from('hunts').insert(fields)); log(`${who} added ${pretty(d.name!)} to the list`); }
    setForm(null);
  };
  const step = (h: Hunt) => {
    const next = NEXT[h.status];
    run(supabase.from('hunts').update({ status: next }).eq('id', h.id));
    if (next === 'caught') log(`${who} caught ${pretty(h.name)}${h.shiny ? ' ✨' : ''} after ${h.attempts} attempts 🎉`);
  };

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    const order = { hunting: 0, planned: 1, caught: 2 };
    return hunts
      .filter(h => (!status || h.status === status) && (!s || [h.name, h.nature, h.ability, h.notes, people[h.hunter_id ?? '']?.name].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'attempts' ? b.attempts - a.attempts
        : sort === 'newest' ? +new Date(b.created_at) - +new Date(a.created_at) : sort === 'status' ? order[a.status] - order[b.status]
        : b.priority - a.priority || a.name.localeCompare(b.name));
  }, [hunts, people, q, status, sort]);

  const count = (s: Status) => hunts.filter(h => h.status === s).length;
  return (
    <div className="wrap">
      <header>
        <h1>🎯 Hunt HQ</h1>
        <p>{hunts.length} on the list · {count('hunting')} being hunted · {count('caught')} caught</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
      <div className="bar">
        <input type="search" placeholder="Search Pokémon, nature, hunter…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="planned">Planned</option><option value="hunting">Hunting</option><option value="caught">Caught</option></select>
        <select value={sort} onChange={e => setSort(e.target.value)}><option value="priority">Priority</option><option value="name">Name</option><option value="attempts">Most attempts</option><option value="status">Status</option><option value="newest">Newest</option></select>
        <button className="primary" onClick={() => setForm({})}>+ Add hunt</button>
      </div>
      <div className="layout">
        <section className="cards">
          {shown.length === 0 && <p className="empty">{hunts.length ? 'Nothing matches that filter.' : 'The list is empty. Add the first Pokémon your team wants to hunt.'}</p>}
          {shown.map(h => (
            <HuntCard key={h.id} h={h} people={people} me={me}
              onBump={d => run(supabase.rpc('increment_attempts', { hunt: h.id, delta: d }))}
              onStatus={() => step(h)}
              onClaim={() => run(supabase.from('hunts').update({ hunter_id: h.hunter_id === me ? null : me }).eq('id', h.id))}
              onEdit={() => setForm({ edit: h })}
              onDelete={() => run(supabase.from('hunts').delete().eq('id', h.id))} />
          ))}
        </section>
        <aside>
          <h3>Team feed</h3>
          {feed.length === 0 ? <p className="empty">Catches and new hunts show up here.</p> : <ul>{feed.map(a => <li key={a.id}>{a.text}</li>)}</ul>}
        </aside>
      </div>
      {form && <HuntForm initial={form.edit} onSave={save} onClose={() => setForm(null)} />}
    </div>
  );
}
