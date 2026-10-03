import { useEffect, useMemo, useState } from 'react';
import type { Hunt, IvOp, Status } from './types';
import { loadList, details, pretty, art, NATURES, natureText, TYPE_COLORS, STATS, type Entry } from './lib';

type Draft = Partial<Hunt>;
interface Props { initial?: Hunt; onSave: (d: Draft) => void; onClose: () => void }

function Seg<T extends string | number>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {opts.map(([v, label]) => <button type="button" key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}
const clamp = (n: number) => Math.min(31, Math.max(0, Math.round(n) || 0));

export default function HuntForm({ initial, onSave, onClose }: Props) {
  const [list, setList] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [d, setD] = useState<Draft>({ priority: 2, status: 'planned', shiny: false, types: [], natures: [], abilities: [], iv_reqs: {}, ...initial });
  const [abilityOpts, setAbilityOpts] = useState<{ name: string; hidden: boolean }[]>([]);
  const chosen = !!d.pokemon_id;
  const nat = d.natures ?? [], abs = d.abilities ?? [], iv = d.iv_reqs ?? {};

  useEffect(() => { loadList().then(setList); if (initial) details(initial.pokemon_id).then(x => setAbilityOpts(x.abilities)); }, [initial]);
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

  const set = <K extends keyof Hunt>(k: K, v: Hunt[K]) => setD(p => ({ ...p, [k]: v }));
  const pick = (e: Entry) => {
    setD(p => ({ ...p, pokemon_id: e.id, name: e.name, abilities: [] }));
    details(e.id).then(x => { setAbilityOpts(x.abilities); setD(p => ({ ...p, types: x.types })); });
    setQ('');
  };
  const setOp = (k: typeof STATS[number][0], op: IvOp | 'any') => setD(p => {
    const next = { ...(p.iv_reqs ?? {}) };
    if (op === 'any') delete next[k]; else next[k] = { op, v: next[k]?.v ?? (op === 'max' ? 10 : op === 'min' ? 20 : 31) };
    return { ...p, iv_reqs: next };
  });
  const setVal = (k: typeof STATS[number][0], v: number) => setD(p => ({ ...p, iv_reqs: { ...(p.iv_reqs ?? {}), [k]: { op: p.iv_reqs?.[k]?.op ?? 'eq', v: clamp(v) } } }));
  const preset = (zero: typeof STATS[number][0] | null) => set('iv_reqs', Object.fromEntries(STATS.map(([k]) => [k, { op: 'eq', v: k === zero ? 0 : 31 }])));
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (chosen) onSave(d); };
  const tint = TYPE_COLORS[d.types?.[0] ?? ''] ?? '#6d4aff';

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet hf" onSubmit={submit}>
        <h2>{initial ? 'Edit hunt' : 'Add a hunt'}</h2>

        {!chosen ? (
          <section>
            <input autoFocus type="search" value={q} placeholder="Search by name or Dex number" onChange={e => setQ(e.target.value)} />
            {matches.length > 0 ? (
              <div className="picks">{matches.map(e => (
                <button type="button" key={e.id} onClick={() => pick(e)}><img src={art(e.id)} alt="" loading="lazy" /><span>{pretty(e.name)}</span></button>
              ))}</div>
            ) : <p className="hint">{q ? 'No Pokémon found. Check the spelling.' : 'Regional forms such as Alolan Vulpix are included.'}</p>}
          </section>
        ) : (
          <div className="banner" style={{ ['--tint' as string]: tint }}>
            <img src={art(d.pokemon_id!, d.shiny)} alt="" />
            <div>
              <strong>{pretty(d.name ?? '')}</strong>
              <div className="chips left">{d.types?.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}</div>
              <button type="button" className="ghost small" onClick={() => set('pokemon_id', undefined as unknown as number)}>Change Pokémon</button>
            </div>
          </div>
        )}

        {chosen && <>
          <section>
            <h4>Natures</h4>
            <p className="hint">Any nature you add is acceptable. Leave empty for any.</p>
            {nat.length > 0 && <div className="chips left">{nat.map(n => (
              <span className="tagchip" key={n}>{natureText(n)}<button type="button" aria-label={`Remove ${n}`} onClick={() => set('natures', nat.filter(x => x !== n))}>×</button></span>
            ))}</div>}
            <select value="" onChange={e => e.target.value && set('natures', [...nat, e.target.value])}>
              <option value="">{nat.length ? 'Add another nature' : 'Add a nature'}</option>
              {Object.keys(NATURES).filter(n => !nat.includes(n)).map(n => <option key={n} value={n}>{natureText(n)}</option>)}
            </select>
          </section>

          <section>
            <h4>Abilities</h4>
            <p className="hint">Select every ability you would accept. Leave empty for any.</p>
            <div className="seg wrap">{abilityOpts.map(a => (
              <button type="button" key={a.name} className={abs.includes(a.name) ? 'on' : ''}
                onClick={() => set('abilities', abs.includes(a.name) ? abs.filter(x => x !== a.name) : [...abs, a.name])}>{a.name}{a.hidden ? ' (hidden)' : ''}</button>
            ))}</div>
          </section>

          <section>
            <h4>IV requirements</h4>
            <div className="presets">
              <button type="button" onClick={() => preset(null)}>All 31</button>
              <button type="button" onClick={() => preset('atk')}>All 31, 0 Atk</button>
              <button type="button" onClick={() => preset('spe')}>All 31, 0 Spe</button>
              <button type="button" className="ghost" onClick={() => set('iv_reqs', {})}>Clear</button>
            </div>
            <div className="ivgrid">{STATS.map(([k, label]) => {
              const r = iv[k];
              return (
                <div className="ivrow" key={k}>
                  <span className="ivl">{label}</span>
                  <select aria-label={`${label} requirement`} value={r?.op ?? 'any'} onChange={e => setOp(k, e.target.value as IvOp | 'any')}>
                    <option value="any">Any</option><option value="eq">Exactly</option><option value="min">At least</option><option value="max">At most</option>
                  </select>
                  <input type="number" inputMode="numeric" min={0} max={31} aria-label={`${label} value`} disabled={!r} value={r ? r.v : ''} onChange={e => setVal(k, +e.target.value)} />
                </div>
              );
            })}</div>
          </section>

          <section>
            <h4>Hunt</h4>
            <div className="grid2">
              <div className="field"><span className="lbl">Priority</span><Seg<number> value={d.priority ?? 2} opts={[[1, 'Low'], [2, 'Medium'], [3, 'High']]} onChange={v => set('priority', v)} /></div>
              <div className="field"><span className="lbl">Status</span><Seg<Status> value={(d.status ?? 'planned') as Status} opts={[['planned', 'Planned'], ['hunting', 'Hunting'], ['caught', 'Caught']]} onChange={v => set('status', v)} /></div>
            </div>
            <label className="switch"><input type="checkbox" checked={!!d.shiny} onChange={e => set('shiny', e.target.checked)} /><span className="track" /> Shiny hunt</label>
          </section>

          <label className="field"><span className="lbl">Notes</span><textarea rows={3} value={d.notes ?? ''} placeholder="Moves, EVs, held item, where to find it" onChange={e => set('notes', e.target.value)} /></label>
        </>}

        <div className="foot"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!chosen}>Save hunt</button></div>
      </form>
    </div>
  );
}
