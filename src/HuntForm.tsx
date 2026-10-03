import { useEffect, useMemo, useState } from 'react';
import type { Hunt, Status } from './types';
import { loadList, details, pretty, art, NATURES, natureText, TYPE_COLORS, type Entry } from './lib';

type Draft = Partial<Hunt>;
interface Props { initial?: Hunt; onSave: (d: Draft) => void; onClose: () => void }

function Seg<T extends string | number>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {opts.map(([v, label]) => <button type="button" key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

export default function HuntForm({ initial, onSave, onClose }: Props) {
  const [list, setList] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [d, setD] = useState<Draft>(initial ?? { priority: 2, status: 'planned', shiny: false, types: [] });
  const [abilities, setAbilities] = useState<{ name: string; hidden: boolean }[]>([]);
  const chosen = !!d.pokemon_id;

  useEffect(() => { loadList().then(setList); if (initial) details(initial.pokemon_id).then(x => setAbilities(x.abilities)); }, [initial]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ /g, '-');
    if (!s) return [];
    return list.filter(e => e.name.includes(s) || String(e.id) === s)
      .sort((a, b) => Number(b.name.startsWith(s)) - Number(a.name.startsWith(s))).slice(0, 24);
  }, [q, list]);

  const pick = (e: Entry) => {
    setD(p => ({ ...p, pokemon_id: e.id, name: e.name }));
    details(e.id).then(x => { setAbilities(x.abilities); setD(p => ({ ...p, types: x.types, ability: x.abilities[0]?.name ?? null })); });
    setQ('');
  };
  const set = <K extends keyof Hunt>(k: K, v: Hunt[K] | null) => setD(p => ({ ...p, [k]: v }));
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (chosen) onSave(d); };
  const tint = TYPE_COLORS[d.types?.[0] ?? ''] ?? 'var(--brand)';

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet hf" onSubmit={submit}>
        <h2>{initial ? 'Edit hunt' : 'Add a hunt'}</h2>

        {!chosen ? (
          <section>
            <input autoFocus type="search" value={q} placeholder="Search by name or Dex number…" onChange={e => setQ(e.target.value)} />
            {matches.length > 0 ? (
              <div className="picks">{matches.map(e => (
                <button type="button" key={e.id} onClick={() => pick(e)}><img src={art(e.id)} alt="" loading="lazy" /><span>{pretty(e.name)}</span></button>
              ))}</div>
            ) : <p className="hint">{q ? 'No Pokémon found. Check the spelling.' : 'Regional forms like Alolan Vulpix are included.'}</p>}
          </section>
        ) : (
          <div className="banner" style={{ ['--tint' as string]: tint }}>
            <img src={art(d.pokemon_id!, d.shiny)} alt="" />
            <div>
              <strong>{d.shiny && '✨ '}{pretty(d.name ?? '')}</strong>
              <div className="chips">{d.types?.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}</div>
              <button type="button" className="ghost" onClick={() => set('pokemon_id', undefined as unknown as number)}>Change Pokémon</button>
            </div>
          </div>
        )}

        {chosen && <>
          <section>
            <h4>Build</h4>
            <div className="grid2">
              <label>Nature<input list="natures" value={d.nature ?? ''} placeholder="e.g. Adamant" onChange={e => set('nature', e.target.value)} /><small>{natureText(d.nature)}</small></label>
              <label>IV targets<input value={d.ivs ?? ''} placeholder="e.g. 31 HP / Atk / Spe" onChange={e => set('ivs', e.target.value)} /></label>
            </div>
            <label>Ability
              {abilities.length > 0 ? (
                <div className="seg wrap">{abilities.map(a => (
                  <button type="button" key={a.name} className={d.ability === a.name ? 'on' : ''} onClick={() => set('ability', a.name)}>{a.name}{a.hidden ? ' (hidden)' : ''}</button>
                ))}</div>
              ) : <input value={d.ability ?? ''} onChange={e => set('ability', e.target.value)} />}
            </label>
          </section>

          <section>
            <h4>Hunt</h4>
            <div className="grid2">
              <label>Priority<Seg<number> value={d.priority ?? 2} opts={[[1, 'Low'], [2, 'Medium'], [3, 'High']]} onChange={v => set('priority', v)} /></label>
              <label>Status<Seg<Status> value={(d.status ?? 'planned') as Status} opts={[['planned', 'Planned'], ['hunting', 'Hunting'], ['caught', 'Caught']]} onChange={v => set('status', v)} /></label>
            </div>
            <label className="switch"><input type="checkbox" checked={!!d.shiny} onChange={e => set('shiny', e.target.checked)} /><span className="track" /> Shiny hunt ✨</label>
          </section>

          <label>Notes<textarea rows={3} value={d.notes ?? ''} placeholder="Moves, EVs, held item, where to find it…" onChange={e => set('notes', e.target.value)} /></label>
        </>}

        <datalist id="natures">{Object.keys(NATURES).map(n => <option key={n} value={n} />)}</datalist>
        <div className="foot"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!chosen}>Save hunt</button></div>
      </form>
    </div>
  );
}
