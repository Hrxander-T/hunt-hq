import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Caught, Hunt, Profile, Reaction, Status } from './types';
import { checkReqs } from './paste';
import HuntRow, { type HuntCounts } from './HuntRow';
import HuntCard from './HuntCard';
import HuntForm from './HuntForm';
import AdminPanel from './AdminPanel';
import ProfileDialog from './ProfileDialog';
import HuntCatches from './HuntCatches';
import Avatar from './Avatar';
import CaughtList from './CaughtList';
import BuildsTab from './BuildsTab';
import DumpTab from './dump/DumpTab';
import { useDumpQueue } from './dump/useDumpQueue';

const NEXT: Record<Status, Status> = { planned: 'hunting', hunting: 'caught', caught: 'planned' };
const GROUPS: [Status, string][] = [['hunting', 'Hunting'], ['planned', 'Planned'], ['caught', 'Caught']];
const PAGE = 40;
const fields = (d: Partial<Hunt>) => ({
  pokemon_id: d.pokemon_id, name: d.name, types: d.types, shiny: !!d.shiny, natures: d.natures ?? [], abilities: d.abilities ?? [],
  iv_reqs: d.iv_reqs ?? {}, notes: d.notes || null, priority: d.priority ?? 2, status: d.status ?? 'planned', target: d.target ?? 1,
});

export default function Board({ me }: { me: string }) {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [caught, setCaught] = useState<Caught[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [sort, setSort] = useState('priority');
  const [hunter, setHunter] = useState('');
  const [catchesId, setCatchesId] = useState('');
  const [form, setForm] = useState<{ edit?: Hunt; draft?: Partial<Hunt> } | null>(null);
  const [err, setErr] = useState('');
  const [admin, setAdmin] = useState(false);
  const [panel, setPanel] = useState(false);
  const [profile, setProfile] = useState(false);
  const [tab, setTab] = useState<'hunts' | 'caught' | 'builds' | 'dump'>(() => new URLSearchParams(location.search).has('shared') ? 'dump' : 'hunts'); // opened from Android's Share menu: go straight to the queue
  const dump = useDumpQueue(me); // lives here, above the tab switch, so screenshots keep being read while another tab is open
  const [grouped, setGrouped] = useState(() => { try { return localStorage.getItem('hunt.group') !== '0'; } catch { return true; } });
  const [view, setView] = useState<'list' | 'cards'>(() => { try { return localStorage.getItem('hunt.view') === 'cards' ? 'cards' : 'list'; } catch { return 'list'; } });
  const chooseView = (v: 'list' | 'cards') => { setView(v); try { localStorage.setItem('hunt.view', v); } catch { /* ignore */ } };
  const [openG, setOpenG] = useState<Set<string>>(new Set(['hunting', 'planned']));
  const [limits, setLimits] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const acc = await supabase.rpc('my_access');
    if (acc.data && !acc.data.active) {
      sessionStorage.setItem('hunt.notice', 'Your access has been turned off. Ask the admin if this is a mistake.');
      supabase.auth.signOut(); return;
    }
    setAdmin(!!acc.data?.admin);
    const [h, p, c, r] = await Promise.all([
      supabase.from('hunts').select('*'), supabase.from('profiles').select('*'),
      supabase.from('caught').select('*').order('created_at', { ascending: false }), supabase.from('caught_reactions').select('*'),
    ]);
    if (h.error) return setErr(h.error.message);
    if (c.error) setErr('Caught history: ' + c.error.message);
    setHunts(h.data as Hunt[]); setCaught((c.data ?? []) as Caught[]); setReactions((r.data ?? []) as Reaction[]);
    setPeople(Object.fromEntries(((p.data ?? []) as Profile[]).map(x => [x.id, x])));
  }, []);
  // Realtime events arrive in bursts (saving 20 catches = 20 events), so they trigger one reload shortly after the last one.
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadSoon = useCallback(() => { clearTimeout(soon.current); soon.current = setTimeout(load, 500); }, [load]);
  useEffect(() => {
    load();
    const ch = supabase.channel('team').on('postgres_changes', { event: '*', schema: 'public' }, () => loadSoon()).subscribe();
    const t = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => { supabase.removeChannel(ch); clearInterval(t); clearTimeout(soon.current); window.removeEventListener('focus', load); };
  }, [load, loadSoon]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else load(); };
  const save = async (d: Partial<Hunt>) => {
    if (form?.edit) await run(supabase.from('hunts').update(fields(d)).eq('id', form.edit.id));
    else await run(supabase.from('hunts').insert(fields(d)));
    setForm(null);
  };

  // A linked catch only counts toward a hunt's target when it meets that hunt's requirements.
  const huntById = useMemo(() => new Map(hunts.map(h => [h.id, h])), [hunts]);
  const counts = useMemo(() => {
    const m = new Map<string, HuntCounts>();
    for (const c of caught) {
      const h = c.hunt_id ? huntById.get(c.hunt_id) : undefined;
      if (!h) continue;
      const x = m.get(h.id) ?? { n: 0, approved: 0, linked: 0 };
      x.linked++;
      if (checkReqs(c, h).ok) { x.n++; if (c.approved) x.approved++; }
      m.set(h.id, x);
    }
    return m;
  }, [caught, huntById]);

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    const order = { hunting: 0, planned: 1, caught: 2 };
    const need = (h: Hunt) => (h.status === 'caught' ? -1 : (h.target ?? 1) - (counts.get(h.id)?.n ?? 0));
    return hunts
      .filter(h => (!status || h.status === status) && (!hunter || (hunter === 'mine' ? h.hunter_id === me : !h.hunter_id)) &&
        (!s || [h.name, ...(h.natures ?? []), ...(h.abilities ?? []), h.notes, people[h.hunter_id ?? '']?.name].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'need' ? need(b) - need(a) || b.priority - a.priority
        : sort === 'newest' ? +new Date(b.created_at) - +new Date(a.created_at)
        : sort === 'status' ? order[a.status] - order[b.status]
        : b.priority - a.priority || a.name.localeCompare(b.name));
  }, [hunts, people, q, status, sort, hunter, me, counts]);

  const count = (s: Status) => hunts.filter(h => h.status === s).length;
  const myName = people[me]?.name ?? 'Profile';
  const toggleGroup = () => setGrouped(g => { try { localStorage.setItem('hunt.group', g ? '0' : '1'); } catch { /* ignore */ } return !g; });
  const lim = (k: string) => limits[k] ?? PAGE;
  const propsOf = (h: Hunt) => ({
    h, people, me, caught: counts.get(h.id),
    onStatus: () => run(supabase.from('hunts').update({ status: h.status !== 'caught' && (counts.get(h.id)?.n ?? 0) >= (h.target ?? 1) ? 'caught' : NEXT[h.status] }).eq('id', h.id)),
    onCatches: () => setCatchesId(h.id),
    onClaim: () => run(supabase.from('hunts').update({ hunter_id: h.hunter_id === me ? null : me }).eq('id', h.id)),
    onEdit: () => setForm({ edit: h }),
    onDelete: () => run(supabase.from('hunts').delete().eq('id', h.id)),
  });
  const list = (key: string, items: Hunt[]) => {
    const body = items.slice(0, lim(key)).map(h => view === 'cards' ? <HuntCard key={h.id} {...propsOf(h)} /> : <HuntRow key={h.id} {...propsOf(h)} />);
    return (
      <>
        {view === 'cards' ? <div className="cards">{body}</div> : body}
        {items.length > lim(key) && <button className="more" onClick={() => setLimits(l => ({ ...l, [key]: lim(key) + PAGE }))}>Show more ({items.length - lim(key)} left)</button>}
      </>
    );
  };
  const catchesHunt = hunts.find(h => h.id === catchesId);

  return (
    <div className="wrap">
      <header className="appbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div><h1>Hunt HQ</h1><p>{hunts.length} on the list · {count('hunting')} active · {count('caught')} done</p></div>
        </div>
        <div className="acct">
          <button className="user" onClick={() => setProfile(true)} title="Edit your profile"><Avatar name={myName} size={24} /><span>{myName}</span></button>
          {admin && <button onClick={() => setPanel(true)}>Admin</button>}
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
      <div className="seg tabs" role="tablist">
        <button className={tab === 'hunts' ? 'on' : ''} onClick={() => setTab('hunts')}>Hunts</button>
        <button className={tab === 'caught' ? 'on' : ''} onClick={() => setTab('caught')}>Caught ({caught.length})</button>
        <button className={tab === 'builds' ? 'on' : ''} onClick={() => setTab('builds')}>Builds</button>
        <button className={tab === 'dump' ? 'on' : ''} onClick={() => setTab('dump')}>Dump ({dump.pending})</button>
      </div>
      {tab === 'builds' ? <BuildsTab hunts={hunts} onCreateHunt={draft => setForm({ draft })} />
        : tab === 'dump' ? <DumpTab dump={dump} hunts={hunts} caught={caught} me={me} onChanged={loadSoon} />
        : tab === 'caught' ? <CaughtList caught={caught} hunts={hunts} people={people} reactions={reactions} me={me} admin={admin} onChanged={load} /> : <>
        <div className="bar">
          <input type="search" placeholder="Search Pokémon, nature, ability, hunter" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option><option value="planned">Planned</option><option value="hunting">Hunting</option><option value="caught">Caught</option></select>
          <select value={hunter} onChange={e => setHunter(e.target.value)} aria-label="Filter by hunter"><option value="">All hunters</option><option value="mine">My hunts</option><option value="open">Unclaimed</option></select>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="priority">Sort: priority</option><option value="name">Sort: name</option><option value="status">Sort: status</option><option value="newest">Sort: newest</option><option value="need">Sort: most still needed</option></select>
          <div className="seg viewseg" role="group" aria-label="View"><button className={view === 'list' ? 'on' : ''} onClick={() => chooseView('list')}>List</button><button className={view === 'cards' ? 'on' : ''} onClick={() => chooseView('cards')}>Cards</button></div>
          <button className={grouped ? 'on' : ''} aria-pressed={grouped} onClick={toggleGroup}>Group by status</button>
          <button className="primary" onClick={() => setForm({})}>Add hunt</button>
        </div>
        {shown.length === 0 ? <p className="empty">{hunts.length ? 'Nothing matches that filter.' : 'The list is empty. Add the first Pokémon your team wants to hunt.'}</p> : (
          <section className={view === 'list' ? 'ctable htable' : ''}>
            {view === 'list' && <div className="chead"><span /><span>Pokémon</span><span>Requirements</span><span>Progress</span><span>Hunter</span><span>Status</span></div>}
            {grouped ? GROUPS.map(([s, label]) => {
              const items = shown.filter(h => h.status === s);
              if (!items.length) return null;
              const isOpen = openG.has(s) || !!q.trim() || !!status;
              return (
                <div className="group" key={s}>
                  <button className="ghead" aria-expanded={isOpen} onClick={() => setOpenG(o => { const n = new Set(o); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>
                    <b>{label}</b><span className="count-pill">{items.length}</span><span className="chev">{isOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {isOpen && list(s, items)}
                </div>
              );
            }) : list('all', shown)}
          </section>
        )}
      </>}
      {catchesHunt && <HuntCatches hunt={catchesHunt} caught={caught} people={people} me={me} admin={admin} onClose={() => setCatchesId('')} onChanged={load} />}
      {profile && <ProfileDialog me={me} current={people[me]} onClose={() => setProfile(false)} onSaved={() => { setProfile(false); load(); }} />}
      {panel && <AdminPanel onClose={() => setPanel(false)} />}
      {form && <HuntForm initial={form.edit} draft={form.draft} onSave={save} onClose={() => setForm(null)} />}
    </div>
  );
}
