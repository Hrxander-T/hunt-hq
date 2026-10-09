import { useEffect, useMemo, useState } from 'react';
import type { Hunt } from './types';
import { laterStages, pokeInfo, pretty, STATS, type PokeInfo } from './lib';
import {
  buildsForKey, consensus, DEFAULT_GROUPS, evText, formatInfo, lineItems, loadGen, loadManifest, mapAbilities, mapAbility, toRequirements,
  type Build, type GenData, type Manifest, type Stats,
} from './smogon';

interface Props { name: string; notes?: string | null; allowedAbilities: string[]; onApply: (patch: Partial<Hunt>) => void }
const lab = (k: string) => STATS.find(s => s[0] === k)?.[1] ?? k;

export default function SmogonPanel({ name, notes, allowedAbilities, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null | undefined>(undefined);
  const [gen, setGen] = useState(() => { try { return +(localStorage.getItem('hunt.smogon.gen') ?? 9) || 9; } catch { return 9; } });
  const [data, setData] = useState<GenData | null | undefined>(undefined);
  const [fmt, setFmt] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [minOther, setMinOther] = useState(() => { try { return +(localStorage.getItem('hunt.smogon.min') ?? 20) || 20; } catch { return 20; } });
  const [parts, setParts] = useState({ natures: true, abilities: true, ivs: true, note: true });
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(8);
  const [done, setDone] = useState('');
  const [later, setLater] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const [huntInfo, setHuntInfo] = useState<PokeInfo | null>(null);
  const [srcInfo, setSrcInfo] = useState<PokeInfo | null>(null);

  useEffect(() => { if (open && manifest === undefined) loadManifest().then(setManifest); }, [open, manifest]);
  const gens = manifest ? Object.keys(manifest.gens).map(Number).sort((a, b) => b - a) : [];
  const activeGen = gens.includes(gen) ? gen : gens[0];
  useEffect(() => { if (!open || !activeGen) return; let live = true; setData(undefined); loadGen(activeGen).then(d => live && setData(d)); return () => { live = false; }; }, [open, activeGen]);

  // The hunted species plus every later evolution stage, so a Larvitar hunt can use Tyranitar builds.
  useEffect(() => {
    if (!open || !name) return;
    let live = true;
    setLater([]); setPick(''); setHuntInfo(null);
    pokeInfo(name).then(async i => {
      if (!live) return;
      setHuntInfo(i);
      const l = await laterStages(i.species).catch(() => [] as string[]);
      if (live) setLater(l);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [open, name]);
  const line = useMemo(() => {
    if (!data) return [];
    const inShown = (b: Build) => showAll || DEFAULT_GROUPS.has(formatInfo(b.format).group);
    return lineItems(data, name, later).map(it => { const all = buildsForKey(data, it.key); return { ...it, all, shown: all.filter(inShown) }; });
  }, [data, name, later, showAll]);
  const withSets = line.filter(x => x.all.length > 0);
  const best = line.filter(x => x.shown.length > 0).reduce<(typeof line)[number] | undefined>((m, x) => (!m || x.shown.length >= m.shown.length ? x : m), undefined);
  const active = line.find(x => x.poke === pick) ?? line.find(x => x.poke === name && x.shown.length > 0) ?? best ?? line.find(x => x.poke === name) ?? line[0];
  const all = active?.all ?? [];
  const shown = useMemo(() => [...(active?.shown ?? [])].sort((a, b) => formatInfo(a.format).order - formatInfo(b.format).order || a.name.localeCompare(b.name)), [active]);
  const translating = !!active && active.poke !== name;
  useEffect(() => {
    if (!active || active.poke === name) { setSrcInfo(null); return; }
    let live = true;
    pokeInfo(active.poke).then(i => live && setSrcInfo(i)).catch(() => undefined);
    return () => { live = false; };
  }, [active?.poke, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !translating || (!!srcInfo && !!huntInfo);
  const mapAb = (names: string[]) => (translating && srcInfo && huntInfo ? mapAbilities(names, srcInfo.abilities, huntInfo.abilities) : names);
  const abLabel = (a: string) => {
    if (!translating || !srcInfo || !huntInfo) return a;
    const m = mapAbility(a, srcInfo.abilities, huntInfo.abilities);
    return m ? `${a} → ${m}` : `${a} (no match)`;
  };
  const formats = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of shown) m.set(b.format, (m.get(b.format) ?? 0) + 1);
    return [...m].map(([id, n]) => ({ id, n, ...formatInfo(id) })).sort((a, b) => a.order - b.order);
  }, [shown]);
  const scoped = useMemo(() => (fmt ? shown.filter(b => b.format === fmt) : shown), [shown, fmt]);
  const cons = useMemo(() => consensus(scoped), [scoped]);

  useEffect(() => { setPicked({}); setLimit(8); setDone(''); }, [name, activeGen, fmt, showAll, active?.poke]);
  useEffect(() => { if (fmt && !formats.some(f => f.id === fmt)) setFmt(''); }, [formats, fmt]);

  const on = (key: string, def: boolean) => picked[key] ?? def;
  const topNat = cons.natures[0]?.n ?? 0, topAb = cons.abilities[0]?.n ?? 0, ivThr = Math.ceil(scoped.length / 2);
  const toggle = (key: string, def: boolean) => setPicked(p => ({ ...p, [key]: !(p[key] ?? def) }));
  const allowed = (abs: string[]) => (allowedAbilities.length ? abs.filter(a => allowedAbilities.some(x => x.toLowerCase() === a.toLowerCase())) : abs);

  const apply = (natures: string[], abilities: string[], ivs: Stats, label: string, detail: string) => {
    const patch: Partial<Hunt> = {};
    if (parts.natures) patch.natures = natures;
    if (parts.abilities) patch.abilities = allowed(mapAb(abilities));
    if (parts.ivs) patch.iv_reqs = toRequirements(natures, ivs, minOther);
    if (parts.note) {
      const who = translating && active ? `${pretty(active.poke)} ` : '';
      const entry = `Smogon Gen ${activeGen} ${who}${label}${detail ? `: ${detail}` : ''}`;
      if (!(notes ?? '').includes(entry)) patch.notes = [(notes ?? '').trim(), entry].filter(Boolean).join('\n');
    }
    onApply(patch);
    setDone(label);
  };
  const useBuild = (b: Build) => apply(b.natures, b.abilities, b.ivs, `${formatInfo(b.format).label}, ${b.name}`, [b.items.join(' / '), evText(b.evs[0])].filter(Boolean).join(', '));
  const useConsensus = () => {
    const natures = cons.natures.filter(t => on(`n:${t.value}`, t.n >= Math.max(1, Math.ceil(topNat / 2)))).map(t => t.value);
    const abilities = cons.abilities.filter(t => on(`a:${t.value}`, t.n >= Math.max(1, Math.ceil(topAb / 2)))).map(t => t.value);
    const ivs: Stats = {};
    for (const t of cons.ivs) if (on(`i:${t.stat}:${t.v}`, t.n >= ivThr) && ivs[t.stat] === undefined) ivs[t.stat] = t.v;
    apply(natures, abilities, ivs, `common picks of ${scoped.length} sets (${fmt ? formatInfo(fmt).label : 'shown formats'})`, '');
  };
  const setMin = (v: number) => { const n = Math.min(31, Math.max(0, v || 0)); setMinOther(n); try { localStorage.setItem('hunt.smogon.min', String(n)); } catch { /* ignore */ } };

  return (
    <details className="smg" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Smogon builds{done ? ` (applied: ${done})` : ''}</summary>
      <div className="sbody">
        {manifest === undefined && <p className="hint">Loading…</p>}
        {manifest === null && <p className="hint">Smogon data is not installed yet. Run <code>npm run data:smogon</code>, commit <code>public/data/smogon/</code> and redeploy.</p>}
        {manifest && (
          <>
            <div className="sctl">
              <label className="inl">Generation
                <select value={activeGen} onChange={e => { setGen(+e.target.value); try { localStorage.setItem('hunt.smogon.gen', e.target.value); } catch { /* ignore */ } setFmt(''); }}>
                  {gens.map(g => <option key={g} value={g}>Gen {g}</option>)}
                </select>
              </label>
              <label className="inl">Other IVs at least
                <input type="number" min={0} max={31} inputMode="numeric" value={minOther} onChange={e => setMin(+e.target.value)} />
              </label>
              <label className="inl"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show all formats</label>
            </div>
            <div className="parts" role="group" aria-label="What to apply">
              <span className="lbl">Apply:</span>
              {(['natures', 'abilities', 'ivs', 'note'] as const).map(k => (
                <label key={k}><input type="checkbox" checked={parts[k]} onChange={e => setParts({ ...parts, [k]: e.target.checked })} /> {k === 'ivs' ? 'IVs' : k === 'note' ? 'Note' : k[0].toUpperCase() + k.slice(1)}</label>
              ))}
            </div>

            {data === undefined && <p className="hint">Loading Gen {activeGen} sets…</p>}
            {data === null && <p className="err">Could not load the Gen {activeGen} file.</p>}
            {data && withSets.length === 0 && <p className="hint">No Smogon sets for {pretty(name)} or its evolutions in Gen {activeGen}. Try another generation.</p>}
            {data && all.length > 0 && shown.length === 0 && <p className="hint">All {all.length} sets are in other formats. Turn on "Show all formats".</p>}

            {data && withSets.length > 0 && (withSets.length > 1 || translating) && (
              <div>
                <span className="lbl">Builds for</span>
                <div className="fchips" role="group" aria-label="Species">
                  {withSets.map(x => <button type="button" key={x.poke} className={active?.poke === x.poke ? 'on' : ''} onClick={() => { setPick(x.poke); setFmt(''); }}>{pretty(x.poke)} ({x.shown.length})</button>)}
                </div>
                {translating && active && <p className="hint">{pretty(name)} evolves into {pretty(active.poke)}. Natures and IVs carry over when it evolves. Abilities are matched by slot, so each build ability is translated to the matching {pretty(name)} ability (shown as "Sand Stream → Guts").</p>}
              </div>
            )}

            {shown.length > 0 && (
              <>
                <div className="fchips" role="group" aria-label="Format">
                  <button type="button" className={!fmt ? 'on' : ''} onClick={() => setFmt('')}>All ({shown.length})</button>
                  {formats.map(f => <button type="button" key={f.id} className={fmt === f.id ? 'on' : ''} onClick={() => setFmt(f.id)}>{f.label} ({f.n})</button>)}
                </div>

                <div className="cons">
                  <b>Common across {scoped.length} {scoped.length === 1 ? 'set' : 'sets'}</b>
                  <p className="hint">Tap to include or exclude. This counts how often something appears in Smogon sets.</p>
                  {cons.natures.length > 0 && <div><span className="lbl">Natures</span><div className="chips left">{cons.natures.map(t => {
                    const def = t.n >= Math.max(1, Math.ceil(topNat / 2)), k = `n:${t.value}`;
                    return <button type="button" key={k} className={`ctog ${on(k, def) ? 'on' : ''}`} aria-pressed={on(k, def)} onClick={() => toggle(k, def)}>{t.value}<small>{t.n}</small></button>;
                  })}</div></div>}
                  {cons.abilities.length > 0 && <div><span className="lbl">Abilities</span><div className="chips left">{cons.abilities.map(t => {
                    const def = t.n >= Math.max(1, Math.ceil(topAb / 2)), k = `a:${t.value}`;
                    return <button type="button" key={k} className={`ctog ${on(k, def) ? 'on' : ''}`} aria-pressed={on(k, def)} onClick={() => toggle(k, def)}>{abLabel(t.value)}<small>{t.n}</small></button>;
                  })}</div></div>}
                  {cons.ivs.length > 0 && <div><span className="lbl">IVs listed by sets</span><div className="chips left">{cons.ivs.map(t => {
                    const def = t.n >= ivThr, k = `i:${t.stat}:${t.v}`;
                    return <button type="button" key={k} className={`ctog ${on(k, def) ? 'on' : ''}`} aria-pressed={on(k, def)} onClick={() => toggle(k, def)}>{lab(t.stat)} {t.v}<small>{t.n}</small></button>;
                  })}</div></div>}
                  <div><button type="button" className="primary small" disabled={!ready} onClick={useConsensus}>Apply selected</button></div>
                </div>

                {scoped.slice(0, limit).map(b => (
                  <div className="scard" key={b.key}>
                    <div className="stop"><div className="grow"><b>{formatInfo(b.format).label}</b> <span className="muted">{b.name}</span></div>
                      <button type="button" className="small primary" disabled={!ready} onClick={() => useBuild(b)}>Use this build</button></div>
                    <div className="chips left">
                      {b.natures.map(n => <span key={n} className="schip">{n}</span>)}
                      {b.abilities.map(a => <span key={a} className="schip ab">{abLabel(a)}</span>)}
                      {Object.entries(b.ivs).map(([k, v]) => <span key={k} className="schip iv">{lab(k)} {v}</span>)}
                    </div>
                    <small className="muted">{[b.items.join(' / '), evText(b.evs[0]) + (b.evs.length > 1 ? ' (or other spreads)' : '')].filter(Boolean).join('  ·  ')}</small>
                    <details><summary className="muted">Moves</summary><p className="muted">{b.moves.map(m => m.join(' / ')).join('  ·  ')}</p></details>
                  </div>
                ))}
                {scoped.length > limit && <button type="button" className="more" onClick={() => setLimit(l => l + 8)}>Show more ({scoped.length - limit} left)</button>}
                {!showAll && all.length > shown.length && <p className="hint">{all.length - shown.length} more sets exist in other formats. Tick "Show all formats" to see them.</p>}
              </>
            )}
            <p className="hint">Builds from Smogon University's strategy dex, via the pkmn project. Set data is copyrighted by Smogon and its contributors.</p>
          </>
        )}
      </div>
    </details>
  );
}
