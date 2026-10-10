import { useEffect, useMemo, useState } from 'react';
import type { Caught } from './types';
import { laterStages, pokeInfo, type PokeInfo } from './lib';
import { buildPool, lineItems, loadGen, matchBuilds, type BuildMatch, type EvoInfo, type GenData, type PoolItem } from './smogon';

const nameOf = (c: Caught) => c.species.toLowerCase().replace(/ /g, '-');

export interface BuildMatchState {
  /** Matches per catch id, best first. A catch has no entry when no Smogon sets exist for it (or its evolutions) in this generation. */
  results: Map<string, BuildMatch[]>;
  /** The generation file is loading, or evolution info is still being fetched for pre-evolution catches. */
  loading: boolean;
  /** The generation file could not be loaded. */
  failed: boolean;
}

// Compares every catch with the Smogon builds of one generation. Catches carry no generation, so the person picks which to compare with.
export function useBuildMatch(caught: Caught[], gen: number, minOther: number): BuildMatchState {
  const [data, setData] = useState<GenData | null | undefined>(undefined);
  const [evos, setEvos] = useState<Map<string, EvoInfo>>(new Map());

  useEffect(() => {
    let live = true;
    setData(undefined);
    loadGen(gen).then(d => live && setData(d));
    return () => { live = false; };
  }, [gen]);

  // Species with no sets of their own in this generation need their evolution line looked up (PokéAPI, cached after the first time).
  const needy = useMemo(() => {
    const m = new Map<string, number>();
    if (data) for (const c of caught) { const n = nameOf(c); if (!m.has(n) && buildPool(data, n).length === 0) m.set(n, c.pokemon_id); }
    return [...m];
  }, [data, caught]);
  const needyKey = needy.map(([n]) => n).join('|');

  useEffect(() => {
    if (!data) return;
    let live = true;
    (async () => {
      for (const [n, id] of needy) {
        if (!live) return;
        if (evos.has(`${gen}:${n}`)) continue;
        try {
          const own = await pokeInfo(id);
          const later = await laterStages(own.species);
          const src: Record<string, PokeInfo> = {};
          for (const it of lineItems(data, n, later)) if (it.poke !== n) src[it.poke] = await pokeInfo(it.poke);
          if (live) setEvos(p => new Map(p).set(`${gen}:${n}`, { own, later, src }));
        } catch { if (live) setEvos(p => new Map(p).set(`${gen}:${n}`, { own: { species: n, abilities: [] }, later: [], src: {} })); } // offline or unknown species: stays unmatched
      }
    })();
    return () => { live = false; };
  }, [data, needyKey, gen]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const out = new Map<string, BuildMatch[]>();
    if (!data) return out;
    const pools = new Map<string, PoolItem[]>();
    for (const c of caught) {
      const n = nameOf(c);
      let pool = pools.get(n);
      if (!pool) { pool = buildPool(data, n, evos.get(`${gen}:${n}`)); pools.set(n, pool); }
      if (pool.length) out.set(c.id, matchBuilds(c, pool, minOther));
    }
    return out;
  }, [data, evos, caught, gen, minOther]);

  const pending = needy.some(([n]) => !evos.has(`${gen}:${n}`));
  return { results, loading: data === undefined || pending, failed: data === null };
}
