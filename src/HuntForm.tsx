import { useEffect, useMemo, useState } from 'react';
import type { Hunt } from './types';
import { loadList, details, pretty, art, NATURES, natureText, type Entry } from './lib';

type Draft = Partial<Hunt>;
interface Props { initial?: Hunt; onSave: (d: Draft) => void; onClose: () => void }

export default function HuntForm({ initial, onSave, onClose }: Props) {
  const [list, setList] = useState<Entry[]>([]);
  const [q, setQ] = useState(initial ? pretty(initial.name) : '');
  const [picking, setPicking] = useState(!initial);
  const [d, setD] = useState<Draft>(initial ?? { priority: 2, status: 'planned', shiny: false, types: [] });
  const [abilities, setAbilities] = useState<{ name: string; hidden: boolean }[]>([]);
  useEffect(() => { loadList().then(setList); if (initial) details(initial.pokemon_id).then(x => setAbilities(x.abilities)); }, [initial]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ /g, '-');
    if (!s || !picking) return [];
    return list.filter(e => e.name.includes(s) || String(e.id) === s).slice(0, 24);
  }, [q, list, picking]);

  const pick = (e: Entry) => {
    setQ(pretty(e.name)); setPicking(false);
    setD(p => ({ ...p, pokemon_id: e.id, name: e.name }));
    details(e.id).then(x => { setAbilities(x.abilities); setD(p => ({ ...p, types: x.types, ability: x.abilities[0]?.name ?? null })); });
  };
  const set = (k: keyof Hunt, v: unknown) => setD(p => ({ ...p, [k]: v }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (d.pokemon_id) onSave(d); };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <h2>{initial ? 'Edit hunt' : 'Add a hunt'}</h2>
        <label>Pokémon
          <input autoFocus value={q} placeholder="Search by name or Dex #, regional forms included" onChange={e => { setQ(e.target.value); setPicking(true); }} />
        </label>
        {matches.length > 0 && (
          <div className="picks">{matches.map(e => (
            <button type="button" key={e.id} onClick={() => pick(e)}><img src={art(e.id)} alt="" loading="lazy" /><span>{pretty(e.name)}</span></button>
          ))}</div>
        )}
        {d.pokemon_id && !picking && <div className="chosen"><img src={art(d.pokemon_id, d.shiny)} alt="" /><div>{d.types?.map(t => <span key={t} className="chip">{t}</span>)}</div></div>}
        <div className="grid2">
          <label>Nature<input list="natures" value={d.nature ?? ''} onChange={e => set('nature', e.target.value)} /><small>{natureText(d.nature)}</small></label>
          <label>Ability<input list="abilities" value={d.ability ?? ''} onChange={e => set('ability', e.target.value)} /></label>
          <label>IV targets<input value={d.ivs ?? ''} placeholder="31 HP / Atk / Spe" onChange={e => set('ivs', e.target.value)} /></label>
          <label>Ball<input value={d.ball ?? ''} placeholder="Love Ball" onChange={e => set('ball', e.target.value)} /></label>
          <label>Priority<select value={d.priority} onChange={e => set('priority', +e.target.value)}><option value={3}>★★★ High</option><option value={2}>★★ Medium</option><option value={1}>★ Low</option></select></label>
          <label>Status<select value={d.status} onChange={e => set('status', e.target.value)}><option value="planned">Planned</option><option value="hunting">Hunting</option><option value="caught">Caught</option></select></label>
        </div>
        <label className="check"><input type="checkbox" checked={!!d.shiny} onChange={e => set('shiny', e.target.checked)} /> Shiny hunt ✨</label>
        <label>Notes<textarea rows={3} value={d.notes ?? ''} placeholder="Moves, EVs, held item, where to find it…" onChange={e => set('notes', e.target.value)} /></label>
        <datalist id="natures">{Object.keys(NATURES).map(n => <option key={n} value={n} />)}</datalist>
        <datalist id="abilities">{abilities.map(a => <option key={a.name} value={a.name} />)}</datalist>
        {abilities.length > 0 && <div className="chips">{abilities.map(a => <button type="button" key={a.name} className="chip" onClick={() => set('ability', a.name)}>{a.name}{a.hidden ? ' (hidden)' : ''}</button>)}</div>}
        <div className="row"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!d.pokemon_id}>Save hunt</button></div>
      </form>
    </div>
  );
}
