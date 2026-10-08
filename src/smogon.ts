import type { IvReqs, StatKey } from './types';
import { NATURES, STATS } from './lib';

export type Stats = Partial<Record<StatKey, number>>;
type One<T> = T | T[];
export interface RawSet { moves?: (string | string[])[]; ability?: One<string>; item?: One<string>; nature?: One<string>; evs?: Stats | Stats[]; ivs?: Stats | Stats[]; teratypes?: One<string> }
export type GenData = Record<string, Record<string, Record<string, RawSet>>>;
export interface Manifest { generated: string; gens: Record<string, { bytes: number; species: number }> }
export interface Build { key: string; species: string; format: string; name: string; natures: string[]; abilities: string[]; items: string[]; ivs: Stats; evs: Stats[]; moves: string[][]; tera: string[] }

function arr<T>(v: One<T> | undefined): T[] { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
export const toId = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- loading (static files in public/data/smogon, fetched only when needed) ----
const base = () => `${import.meta.env.BASE_URL}data/smogon/`;
let manifestP: Promise<Manifest | null> | undefined;
const genCache = new Map<number, Promise<GenData | null>>();
export function loadManifest(): Promise<Manifest | null> {
  manifestP ??= fetch(`${base()}manifest.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}
export function loadGen(g: number): Promise<GenData | null> {
  if (!genCache.has(g)) genCache.set(g, fetch(`${base()}gen${g}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return genCache.get(g)!;
}

// ---- species matching: PokeAPI names ("tauros-paldea-combat-breed") to Showdown names ("Tauros-Paldea-Combat") ----
const REGIONAL = new Set(['alola', 'galar', 'hisui', 'paldea', 'mega', 'gmax']);
const indexCache = new WeakMap<GenData, Map<string, string>>();
export function speciesKey(data: GenData, pokeName: string): string | undefined {
  let idx = indexCache.get(data);
  if (!idx) { idx = new Map(Object.keys(data).map(k => [toId(k), k])); indexCache.set(data, idx); }
  const parts = pokeName.toLowerCase().split('-');
  for (let n = parts.length; n >= 1; n--) {
    if (parts.slice(n).some(p => REGIONAL.has(p))) break; // never fall back from a regional form to its base species
    const k = idx.get(toId(parts.slice(0, n).join('-')));
    if (k) return k;
  }
  return undefined;
}

function normalize(species: string, format: string, name: string, s: RawSet): Build {
  const ivsRaw = Array.isArray(s.ivs) ? s.ivs[0] : s.ivs;
  return {
    key: `${species}|${format}|${name}`, species, format, name: name.replace(/:\d+$/, ''),
    natures: arr(s.nature), abilities: arr(s.ability), items: arr(s.item), ivs: { ...(ivsRaw ?? {}) },
    evs: Array.isArray(s.evs) ? s.evs : s.evs ? [s.evs] : [], moves: (s.moves ?? []).map(m => arr(m)), tera: arr(s.teratypes),
  };
}
export function buildsFor(data: GenData, pokeName: string): Build[] {
  const key = speciesKey(data, pokeName);
  if (!key) return [];
  const out: Build[] = [];
  for (const [format, sets] of Object.entries(data[key])) for (const [name, s] of Object.entries(sets)) out.push(normalize(key, format, name, s));
  return out;
}

// ---- formats ----
export type Group = 'main' | 'doubles' | 'monotype' | 'natdex' | 'other';
const MAIN = ['anythinggoes', 'ag', 'ubers', 'ubersuu', 'ou', 'uubl', 'uu', 'rubl', 'ru', 'nubl', 'nu', 'publ', 'pu', 'zubl', 'zu', 'nfe', 'lc'];
const LABELS: Record<string, string> = {
  anythinggoes: 'AG', ag: 'AG', ubers: 'Ubers', ubersuu: 'UUbers', ou: 'OU', uubl: 'UUBL', uu: 'UU', rubl: 'RUBL', ru: 'RU', nubl: 'NUBL', nu: 'NU', publ: 'PUBL', pu: 'PU',
  zubl: 'ZUBL', zu: 'ZU', nfe: 'NFE', lc: 'LC', monotype: 'Monotype', doublesou: 'Doubles OU', doublesuu: 'Doubles UU', doublesubers: 'Doubles Ubers',
  battlestadiumsingles: 'Battle Stadium Singles', stabmons: 'STABmons', godlygift: 'Godly Gift', almostanyability: 'Almost Any Ability',
  balancedhackmons: 'Balanced Hackmons', mixandmega: 'Mix and Mega', inheritance: 'Inheritance', partnersincrime: 'Partners in Crime',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function formatInfo(id: string): { label: string; group: Group; order: number } {
  const m = MAIN.indexOf(id);
  if (m >= 0) return { label: LABELS[id], group: 'main', order: m };
  const v = id.match(/^vgc(\d+)$/);
  if (v) return { label: `VGC ${v[1]}`, group: 'doubles', order: 150 - (+v[1] % 100) };
  if (/^doubles/.test(id)) return { label: LABELS[id] ?? `Doubles ${id.slice(7).toUpperCase()}`, group: 'doubles', order: 100 };
  if (/^battle(stadium|spot)/.test(id)) return { label: LABELS[id] ?? cap(id), group: 'doubles', order: 160 };
  if (id === 'monotype') return { label: 'Monotype', group: 'monotype', order: 300 };
  if (id.startsWith('nationaldex')) { const rest = id.slice(11); return { label: `National Dex ${rest ? formatInfo(rest).label : ''}`.trim(), group: 'natdex', order: 400 }; }
  return { label: LABELS[id] ?? cap(id), group: 'other', order: 500 };
}
export const DEFAULT_GROUPS = new Set<Group>(['main', 'doubles', 'monotype']);

// ---- turning builds into hunt requirements ----
const KEY: Record<string, StatKey> = { Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };
export const loweredStats = (natures: string[]): Set<StatKey> => {
  const out = new Set<StatKey>();
  for (const n of natures) { const down = NATURES[n]?.[1]; if (down) out.add(KEY[down]); }
  return out;
};
// Listed IVs are kept exactly; every other stat needs `minOther`+, except a stat that one of the natures lowers (no requirement).
export function toRequirements(natures: string[], listed: Stats, minOther: number): IvReqs {
  const lowered = loweredStats(natures);
  const out: IvReqs = {};
  for (const [k] of STATS) {
    if (listed[k] !== undefined) out[k] = { op: 'eq', v: listed[k]! };
    else if (!lowered.has(k)) out[k] = { op: 'min', v: minOther };
  }
  return out;
}

export interface Tally { value: string; n: number }
export interface Consensus { total: number; natures: Tally[]; abilities: Tally[]; ivs: { stat: StatKey; v: number; n: number }[] }
export function consensus(builds: Build[]): Consensus {
  const nat = new Map<string, number>(), ab = new Map<string, number>(), iv = new Map<string, number>();
  for (const b of builds) {
    for (const n of new Set(b.natures)) nat.set(n, (nat.get(n) ?? 0) + 1);
    for (const a of new Set(b.abilities)) ab.set(a, (ab.get(a) ?? 0) + 1);
    for (const [k, v] of Object.entries(b.ivs)) iv.set(`${k}:${v}`, (iv.get(`${k}:${v}`) ?? 0) + 1);
  }
  const tally = (m: Map<string, number>): Tally[] => [...m].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
  return {
    total: builds.length, natures: tally(nat), abilities: tally(ab),
    ivs: [...iv].map(([k, n]) => { const [stat, v] = k.split(':'); return { stat: stat as StatKey, v: +v, n }; }).sort((a, b) => b.n - a.n),
  };
}
export const evText = (e?: Stats) => (e ? STATS.filter(([k]) => e[k]).map(([k, l]) => `${e[k]} ${l}`).join(' / ') : '');
