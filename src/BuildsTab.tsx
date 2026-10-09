import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Hunt } from './types';
import { art, details, laterStages, loadList, natureText, pokeInfo, pretty, STATS, TYPE_COLORS, type Entry, type PokeInfo } from './lib';
import {
  buildNote, buildsForKey, consensus, DEFAULT_GROUPS, evText, formatInfo, itemTally, lineItems, loadGen, loadManifest, mapAbilities, mapAbility, toId, toRequirements,
  type Build, type GenData, type Manifest, type Stats,
} from './smogon';

interface Props { hunts: Hunt[]; onCreateHunt: (draft: Partial<Hunt>) => void }
const PAGE = 12;
const lab = (k: string) => STATS.find(s => s[0] === k)?.[1] ?? k;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="brow"><span className="blabel">{label}</span><span className="bval">{children}</span></div>;
}

function SetCard({ b, abLabel, canCreate, onCreate }: { b: Build; abLabel: (a: string) => string; canCreate: boolean; onCreate: () => void }) {
  const evs = b.evs[0];
  const evRows = STATS.filter(([k]) => evs?.[k]);
  const ivs = Object.entries(b.ivs);
  return (
    <article className="bcard">
      <header className="bhead">
        <div className="grow"><b>{b.name}</b></div>
        <button type="button" className="small primary" disabled={!canCreate} onClick={onCreate} title={canCreate ? 'Open the hunt form filled in from this set' : 'Loading Pokémon data'}>Create hunt</button>
      </header>
      <div className="bfacts">
        {b.natures.length > 0 && <Row label="Nature">{b.natures.map(natureText).join(' or ')}</Row>}
        {b.abilities.length > 0 && <Row label="Ability">{b.abilities.map(abLabel).join(' or ')}</Row>}
        {b.items.length > 0 && <Row label="Item">{b.items.join(' or ')}</Row>}
        {b.tera.length > 0 && <Row label="Tera type">{b.tera.join(' or ')}</Row>}
      </div>
      {evRows.length > 0 && (
        <div className="bevs" role="group" aria-label="EV spread">
          {evRows.map(([k, l]) => (
            <div className="evr" key={k}>
              <span className="evl">{l}</span>
              <span className="evbar" aria-hidden="true"><i style={{ width: `${Math.min(100, (evs![k]! / 252) * 100)}%` }} /></span>
              <b className="evn">{evs![k]}</b>
            </div>
          ))}
          {b.evs.length > 1 && <small className="muted">{b.evs.length - 1} other {b.evs.length === 2 ? 'spread' : 'spreads'}: {b.evs.slice(1).map(evText).join('  ·  ')}</small>}
        </div>
      )}
      {ivs.length > 0 && <Row label="IVs">{ivs.map(([k, v]) => `${v} ${lab(k)}`).join(', ')}</Row>}
      {b.moves.length > 0 && <ol className="bmoves">{b.moves.map((m, i) => <li key={i}>{m.join(' / ')}</li>)}</ol>}
    </article>
  );
}

export default function BuildsTab({ hunts, onCreateHunt }: Props) {
  const [list, setList] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Entry | null>(() => { try { return JSON.parse(read('hunt.builds.sel') ?? 'null') as Entry | null; } catch { return null; } });
  const [types, setTypes] = useState<string[]>([]);
  const [manifest, setManifest] = useState<Manifest | null | undefined>(undefined);
  const [gen, setGen] = useState(() => +(read('hunt.smogon.gen') ?? 9) || 9);
  const [data, setData] = useState<GenData | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [fmt, setFmt] = useState('');
  const [minOther, setMinOther] = useState(() => +(read('hunt.smogon.min') ?? 20) || 20);
  const [later, setLater] = useState<string[]>([]);
  const [pick, setPick] = useState('');
  const [huntInfo, setHuntInfo] = useState<PokeInfo | null>(null);
  const [srcInfo, setSrcInfo] = useState<PokeInfo | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => { loadList().then(setList).catch(() => undefined); loadManifest().then(setManifest); }, []);
  const gens = manifest ? Object.keys(manifest.gens).map(Number).sort((a, b) => b - a) : [];
  const activeGen = gens.includes(gen) ? gen : gens[0];
  useEffect(() => {
    if (!activeGen) return;
    let live = true;
    setData(undefined);
    loadGen(activeGen).then(d => live && setData(d));
    return () => { live = false; };
  }, [activeGen]);

  // Details for the searched Pokémon and every later evolution stage (a Larvitar search also offers Tyranitar sets).
  useEffect(() => {
    setLater([]); setPick(''); setHuntInfo(null); setSrcInfo(null); setTypes([]); setFmt(''); setLimit(PAGE);
    if (!sel) return;
    let live = true;
    details(sel.id).then(x => live && setTypes(x.types)).catch(() => undefined);
    pokeInfo(sel.name).then(async i => {
      if (!live) return;
      setHuntInfo(i);
      const l = await laterStages(i.species).catch(() => [] as string[]);
      if (live) setLater(l);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sel]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ /g, '-');
    if (!s) return [];
    return list.filter(e => e.name.includes(s) || String(e.id) === s)
      .sort((a, b) => Number(b.name.startsWith(s)) - Number(a.name.startsWith(s))).slice(0, 24);
  }, [q, list]);
  const choose = (e: Entry) => { setSel(e); setQ(''); write('hunt.builds.sel', JSON.stringify(e)); };

  const name = sel?.name ?? '';
  const line = useMemo(() => {
    if (!data || !name) return [];
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
    setSrcInfo(null);
    if (!active || active.poke === name) return;
    let live = true;
    pokeInfo(active.poke).then(i => live && setSrcInfo(i)).catch(() => undefined);
    return () => { live = false; };
  }, [active?.poke, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const formats = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of shown) m.set(b.format, (m.get(b.format) ?? 0) + 1);
    return [...m].map(([id, n]) => ({ id, n, ...formatInfo(id) })).sort((a, b) => a.order - b.order);
  }, [shown]);
  const scoped = useMemo(() => (fmt ? shown.filter(b => b.format === fmt) : shown), [shown, fmt]);
  const cons = useMemo(() => consensus(scoped), [scoped]);
  const items = useMemo(() => itemTally(scoped), [scoped]);
  const perFormat = useMemo(() => { const m = new Map<string, number>(); for (const b of scoped) m.set(b.format, (m.get(b.format) ?? 0) + 1); return m; }, [scoped]);
  useEffect(() => { if (fmt && !formats.some(f => f.id === fmt)) setFmt(''); }, [formats, fmt]);
  useEffect(() => { setLimit(PAGE); }, [fmt, activeGen, showAll, active?.poke, sel]);

  const canCreate = !!sel && !!huntInfo && (!translating || !!srcInfo);
  const abLabel = (a: string) => {
    if (!translating || !srcInfo || !huntInfo) return a;
    const m = mapAbility(a, srcInfo.abilities, huntInfo.abilities);
    return m ? `${a} → ${m}` : `${a} (no match)`;
  };
  const create = (b: Build) => {
    if (!sel || !huntInfo || !canCreate) return;
    // Abilities are stored with the app's own spelling (PokeAPI), translated by slot when the build is for a later evolution.
    const own = new Map(huntInfo.abilities.map(a => [toId(a.name), a.name]));
    const abilities = translating && srcInfo
      ? mapAbilities(b.abilities, srcInfo.abilities, huntInfo.abilities)
      : [...new Set(b.abilities.map(a => own.get(toId(a))).filter((x): x is string => !!x))];
    onCreateHunt({
      pokemon_id: sel.id, name: sel.name, types, natures: b.natures, abilities,
      iv_reqs: toRequirements(b.natures, b.ivs as Stats, minOther),
      notes: buildNote(b, activeGen, translating && active ? pretty(active.poke) : ''),
    });
  };
  const setMin = (v: number) => { const n = Math.min(31, Math.max(0, v || 0)); setMinOther(n); write('hunt.smogon.min', String(n)); };
  const onList = sel ? hunts.filter(h => h.pokemon_id === sel.id).length : 0;
  const tint = TYPE_COLORS[types[0] ?? ''] ?? '#6d4aff';
  const top = <T,>(t: T[]) => t.slice(0, 5);

  return (
    <section className="builds">
      <div className="btool">
        <input type="search" value={q} placeholder="Search a Pokémon by name or Dex number" aria-label="Search a Pokémon"
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); choose(matches[0]); } }} />
        {gens.length > 0 && (
          <label className="inl">Generation
            <select value={activeGen} onChange={e => { setGen(+e.target.value); write('hunt.smogon.gen', e.target.value); setFmt(''); }}>
              {gens.map(g => <option key={g} value={g}>Gen {g}</option>)}
            </select>
          </label>
        )}
        <label className="inl" title="Used when you create a hunt from a set: stats the set does not list get this minimum">Other IVs at least
          <input type="number" min={0} max={31} inputMode="numeric" value={minOther} onChange={e => setMin(+e.target.value)} />
        </label>
        <label className="inl"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show all formats</label>
      </div>

      {q.trim() && (matches.length > 0
        ? <div className="picks bpicks">{matches.map(e => (
          <button type="button" key={e.id} onClick={() => choose(e)}><img src={art(e.id)} alt="" loading="lazy" /><span>{pretty(e.name)}</span></button>
        ))}</div>
        : <p className="hint">No Pokémon found. Check the spelling.</p>)}

      {!sel && !q.trim() && <p className="empty">Search a Pokémon to see its Smogon sets. Evolutions are included, so searching Larvitar also shows Tyranitar sets.</p>}

      {sel && (
        <div className="banner" style={{ ['--tint' as string]: tint }}>
          <img src={art(sel.id)} alt="" />
          <div>
            <strong>{pretty(sel.name)} <span className="muted">#{sel.id}</span></strong>
            <div className="chips left">
              {types.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}
              {onList > 0 && <span className="chip onlist">{onList === 1 ? 'On the hunt list' : `On the hunt list (${onList})`}</span>}
            </div>
          </div>
        </div>
      )}

      {sel && manifest === undefined && <p className="hint">Loading…</p>}
      {manifest === null && <p className="hint">Smogon data is not installed yet. Run <code>npm run data:smogon</code>, commit <code>public/data/smogon/</code> and redeploy.</p>}
      {sel && manifest && data === undefined && <p className="hint">Loading Gen {activeGen} sets…</p>}
      {sel && data === null && <p className="err">Could not load the Gen {activeGen} file.</p>}
      {sel && data && withSets.length === 0 && <p className="empty">No Smogon sets for {pretty(name)} or its evolutions in Gen {activeGen}. Try another generation.</p>}
      {sel && data && all.length > 0 && shown.length === 0 && <p className="hint">All {all.length} sets are in other formats. Turn on "Show all formats".</p>}

      {sel && data && withSets.length > 0 && (withSets.length > 1 || translating) && (
        <div className="bline">
          <span className="lbl">Builds for</span>
          <div className="fchips" role="group" aria-label="Species">
            {withSets.map(x => <button type="button" key={x.poke} className={active?.poke === x.poke ? 'on' : ''} aria-pressed={active?.poke === x.poke} onClick={() => { setPick(x.poke); setFmt(''); }}>{pretty(x.poke)} ({x.shown.length})</button>)}
          </div>
          {translating && active && <p className="hint">{pretty(name)} evolves into {pretty(active.poke)}. Natures and IVs carry over when it evolves. Abilities are matched by slot, so a hunt made from these sets gets the matching {pretty(name)} ability (shown as "Sand Stream → Guts").</p>}
        </div>
      )}

      {shown.length > 0 && (
        <>
          <div className="fchips" role="group" aria-label="Format">
            <button type="button" className={!fmt ? 'on' : ''} aria-pressed={!fmt} onClick={() => setFmt('')}>All ({shown.length})</button>
            {formats.map(f => <button type="button" key={f.id} className={fmt === f.id ? 'on' : ''} aria-pressed={fmt === f.id} onClick={() => setFmt(f.id)}>{f.label} ({f.n})</button>)}
          </div>

          <div className="bsum">
            <b>Most used across {scoped.length} {scoped.length === 1 ? 'set' : 'sets'}</b>
            <div className="bsumgrid">
              {cons.natures.length > 0 && <div><span className="lbl">Natures</span><div className="chips left">{top(cons.natures).map(t => <span key={t.value} className="schip">{t.value}<small> {t.n}</small></span>)}</div></div>}
              {cons.abilities.length > 0 && <div><span className="lbl">Abilities</span><div className="chips left">{top(cons.abilities).map(t => <span key={t.value} className="schip ab">{abLabel(t.value)}<small> {t.n}</small></span>)}</div></div>}
              {items.length > 0 && <div><span className="lbl">Items</span><div className="chips left">{top(items).map(t => <span key={t.value} className="schip">{t.value}<small> {t.n}</small></span>)}</div></div>}
            </div>
          </div>

          <div className="bgrid">
            {scoped.slice(0, limit).map((b, i, arr) => (
              <Fragment key={b.key}>
                {(i === 0 || arr[i - 1].format !== b.format) && (
                  <h3 className="bfmt">{formatInfo(b.format).label} <span className="muted">{perFormat.get(b.format)} {perFormat.get(b.format) === 1 ? 'set' : 'sets'}</span></h3>
                )}
                <SetCard b={b} abLabel={abLabel} canCreate={canCreate} onCreate={() => create(b)} />
              </Fragment>
            ))}
          </div>
          {scoped.length > limit && <button type="button" className="more" onClick={() => setLimit(l => l + PAGE)}>Show more ({scoped.length - limit} left)</button>}
          {!showAll && all.length > shown.length && <p className="hint">{all.length - shown.length} more sets exist in other formats. Tick "Show all formats" to see them.</p>}
        </>
      )}
      {sel && <p className="hint">Builds from Smogon University's strategy dex, via the pkmn project. Set data is copyrighted by Smogon and its contributors.</p>}
    </section>
  );
}
