import { useEffect, useMemo, useState } from 'react';
import type { Caught, Hunt, IvOp, IvReqs, Profile, Reaction, StatKey } from './types';
import { pretty, sprite, STATS } from './lib';
import { checkReqs, hiddenPower, ivTotal } from './paste';
import CaughtRow from './CaughtRow';
import SubmitCatch from './SubmitCatch';

interface Props { caught: Caught[]; hunts: Hunt[]; people: Record<string, Profile>; reactions: Reaction[]; me: string; admin: boolean; onChanged: () => void }
type SortKey = 'date' | 'species' | 'nature' | 'ability' | 'total' | 'level' | 'hp' | 'by' | StatKey;
interface Filters { who: string; appr: string; nature: string; ability: string; gender: string; hp: string; shiny: boolean; hunt: string; iv: IvReqs }
const EMPTY: Filters = { who: '', appr: '', nature: '', ability: '', gender: '', hp: '', shiny: false, hunt: '', iv: {} };
const PAGE = 60;
const SORTS: [SortKey, string][] = [['date', 'Newest'], ['species', 'Pokémon'], ['nature', 'Nature'], ['ability', 'Ability'], ['total', 'Total IVs'],
  ...STATS.map(([k, l]) => [k, `${l} IV`] as [SortKey, string]), ['hp', 'Hidden Power'], ['level', 'Level'], ['by', 'Submitted by']];

export default function CaughtList({ caught, hunts, people, reactions, me, admin, onChanged }: Props) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [grouped, setGrouped] = useState(false);
  const [panel, setPanel] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Caught | undefined>();
  useEffect(() => setLimit(PAGE), [q, f, sort, grouped]);

  const huntById = useMemo(() => new Map(hunts.map(h => [h.id, h])), [hunts]);
  const opts = useMemo(() => ({
    natures: [...new Set(caught.map(c => c.nature).filter(Boolean))].sort() as string[],
    abilities: [...new Set(caught.map(c => c.ability).filter(Boolean))].sort() as string[],
    hps: [...new Set(caught.map(c => hiddenPower(c)).filter(Boolean))].sort() as string[],
  }), [caught]);

  const nameOf = (c: Caught) => people[c.caught_by ?? '']?.name ?? '';
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const target = f.hunt ? huntById.get(f.hunt) : undefined;
    const out = caught.filter(c => {
      if (s && ![c.species.replace(/-/g, ' '), c.nickname, c.nature, c.ability, nameOf(c)].join(' ').toLowerCase().includes(s)) return false;
      if (f.who && c.caught_by !== f.who) return false;
      if (f.appr && (f.appr === 'approved') !== c.approved) return false;
      if (f.nature && c.nature !== f.nature) return false;
      if (f.ability && c.ability !== f.ability) return false;
      if (f.gender && c.gender !== f.gender) return false;
      if (f.hp && hiddenPower(c) !== f.hp) return false;
      if (f.shiny && !c.shiny) return false;
      if (target && (c.pokemon_id !== target.pokemon_id || !checkReqs(c, target).ok)) return false;
      for (const [k, r] of Object.entries(f.iv) as [StatKey, { op: IvOp; v: number }][]) {
        const v = c.ivs?.[k];
        if (v === undefined || !(r.op === 'eq' ? v === r.v : r.op === 'min' ? v >= r.v : v <= r.v)) return false;
      }
      return true;
    });
    const val = (c: Caught): string | number => {
      switch (sort.key) {
        case 'date': return +new Date(c.created_at);
        case 'species': return c.species;
        case 'nature': return c.nature ?? '';
        case 'ability': return c.ability ?? '';
        case 'total': return ivTotal(c.ivs);
        case 'level': return c.level ?? 0;
        case 'hp': return hiddenPower(c) ?? '';
        case 'by': return nameOf(c);
        default: return c.ivs?.[sort.key] ?? -1;
      }
    };
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return r * sort.dir || +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [caught, q, f, sort, people, huntById]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<number, Caught[]>();
    for (const c of rows) m.set(c.pokemon_id, [...(m.get(c.pokemon_id) ?? []), c]);
    return [...m.values()].sort((a, b) => a[0].species.localeCompare(b[0].species));
  }, [rows]);

  const activeFilters = Object.entries(f).filter(([k, v]) => (k === 'iv' ? Object.keys(v as object).length : !!v)).length;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF(p => ({ ...p, [k]: v }));
  const head = (key: SortKey, label: string) => (
    <button className={sort.key === key ? 'on' : ''} onClick={() => setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'species' || key === 'nature' || key === 'ability' || key === 'by' || key === 'hp' ? 1 : -1 }))}>
      {label}{sort.key === key && (sort.dir === 1 ? ' ▲' : ' ▼')}
    </button>
  );
  const setIvOp = (k: StatKey, op: IvOp | 'any') => setF(p => { const iv = { ...p.iv }; if (op === 'any') delete iv[k]; else iv[k] = { op, v: iv[k]?.v ?? (op === 'max' ? 10 : op === 'min' ? 20 : 31) }; return { ...p, iv }; });
  const setIvVal = (k: StatKey, v: number) => setF(p => ({ ...p, iv: { ...p.iv, [k]: { op: p.iv[k]?.op ?? 'eq', v: Math.min(31, Math.max(0, v || 0)) } } }));
  const finish = () => { setOpen(false); setEdit(undefined); onChanged(); };
  const row = (c: Caught) => (
    <CaughtRow key={c.id} c={c} hunt={c.hunt_id ? huntById.get(c.hunt_id) : undefined} people={people} me={me} admin={admin}
      reactions={reactions.filter(r => r.caught_id === c.id)} onChanged={onChanged} onEdit={() => setEdit(c)} />
  );

  return (
    <>
      <div className="bar">
        <input type="search" placeholder="Search Pokémon, nature, ability, person" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
        <select value={sort.key} onChange={e => setSort(s => ({ ...s, key: e.target.value as SortKey }))} aria-label="Sort by">{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
        <button onClick={() => setSort(s => ({ ...s, dir: (-s.dir) as 1 | -1 }))} aria-label="Reverse sort order">{sort.dir === 1 ? 'Ascending' : 'Descending'}</button>
        <button className={grouped ? 'on' : ''} aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>Group by Pokémon</button>
        <button className={panel ? 'on' : ''} aria-expanded={panel} onClick={() => setPanel(!panel)}>Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}</button>
        <button className="primary" onClick={() => setOpen(true)}>Submit a catch</button>
      </div>

      {panel && (
        <div className="fpanel">
          <div className="fgrid">
            <label className="field"><span className="lbl">Matches hunt requirements</span>
              <select value={f.hunt} onChange={e => set('hunt', e.target.value)}><option value="">Any</option>{hunts.map(h => <option key={h.id} value={h.id}>{pretty(h.name)} ({h.status})</option>)}</select></label>
            <label className="field"><span className="lbl">Nature</span>
              <select value={f.nature} onChange={e => set('nature', e.target.value)}><option value="">Any</option>{opts.natures.map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="field"><span className="lbl">Ability</span>
              <select value={f.ability} onChange={e => set('ability', e.target.value)}><option value="">Any</option>{opts.abilities.map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="field"><span className="lbl">Gender</span>
              <select value={f.gender} onChange={e => set('gender', e.target.value)}><option value="">Any</option><option value="M">Male</option><option value="F">Female</option></select></label>
            <label className="field"><span className="lbl">Hidden Power</span>
              <select value={f.hp} onChange={e => set('hp', e.target.value)}><option value="">Any</option>{opts.hps.map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="field"><span className="lbl">Submitted by</span>
              <select value={f.who} onChange={e => set('who', e.target.value)}><option value="">Everyone</option>{Object.values(people).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field"><span className="lbl">Approval</span>
              <select value={f.appr} onChange={e => set('appr', e.target.value)}><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option></select></label>
            <label className="switch"><input type="checkbox" checked={f.shiny} onChange={e => set('shiny', e.target.checked)} /><span className="track" /> Shiny only</label>
          </div>
          <h4>IV conditions</h4>
          <div className="ivgrid">{STATS.map(([k, label]) => {
            const r = f.iv[k];
            return (
              <div className="ivrow" key={k}>
                <span className="ivl">{label}</span>
                <select aria-label={`${label} condition`} value={r?.op ?? 'any'} onChange={e => setIvOp(k, e.target.value as IvOp | 'any')}>
                  <option value="any">Any</option><option value="eq">Exactly</option><option value="min">At least</option><option value="max">At most</option>
                </select>
                <input type="number" inputMode="numeric" min={0} max={31} aria-label={`${label} value`} disabled={!r} value={r ? r.v : ''} onChange={e => setIvVal(k, +e.target.value)} />
              </div>
            );
          })}</div>
          <div className="row"><button className="ghost" onClick={() => setF(EMPTY)}>Clear filters</button></div>
        </div>
      )}

      <p className="muted count">{rows.length === caught.length ? `${caught.length} catches` : `${rows.length} of ${caught.length} catches`}</p>
      {rows.length === 0 ? <p className="empty">{caught.length ? 'Nothing matches those filters.' : 'No catches yet. Paste a Showdown set to submit the first one.'}</p> : (
        <div className="ctable">
          <div className="chead">
            <span /><span>{head('species', 'Pokémon')}</span><span>G</span><span>{head('nature', 'Nature')}</span><span>{head('ability', 'Ability')}</span>
            <span className="ivc">{STATS.map(([k, l]) => <span key={k}>{head(k, l)}</span>)}<span>{head('total', 'Σ')}</span></span>
            <span>{head('hp', 'Hid. Power')}</span><span>{head('by', 'By')}</span><span>Status</span>
          </div>
          {grouped ? groups.map(g => {
            const id = String(g[0].pokemon_id), isOpen = openGroups.has(id) || !!q.trim();
            return (
              <div className="group" key={id}>
                <button className="ghead" aria-expanded={isOpen} onClick={() => setOpenGroups(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}>
                  <img className="spr" src={sprite(g[0].pokemon_id)} alt="" loading="lazy" decoding="async" />
                  <b>{pretty(g[0].species)}</b><span className="count-pill">{g.length}</span>
                  <small>{g.filter(c => c.approved).length} approved</small><span className="chev">{isOpen ? 'Hide' : 'Show'}</span>
                </button>
                {isOpen && g.map(row)}
              </div>
            );
          }) : rows.slice(0, limit).map(row)}
          {!grouped && rows.length > limit && <button className="more" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more ({rows.length - limit} left)</button>}
        </div>
      )}
      {(open || edit) && <SubmitCatch hunts={hunts} editing={edit} onClose={() => { setOpen(false); setEdit(undefined); }} onDone={finish} />}
    </>
  );
}
