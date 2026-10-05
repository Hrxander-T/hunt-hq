import type { Caught, Hunt, StatKey } from './types';
import { ivLabel, NATURES, STATS, type Entry } from './lib';

type Stats = Partial<Record<StatKey, number>>;
export interface Parsed {
  species: string; nickname?: string; gender?: string; item?: string; level?: number; nature?: string; ability?: string;
  shiny: boolean; ivs: Stats; evs: Stats; moves: string[]; raw: string; warnings: string[];
}

const readStats = (s: string): Stats => {
  const o: Stats = {};
  for (const m of s.matchAll(/(\d+)\s*(hp|atk|def|spa|spd|spe)\b/gi)) o[m[2].toLowerCase() as StatKey] = +m[1];
  return o;
};

function parseBlock(block: string): Parsed | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length || /^(ability|level|evs|ivs|-|shiny|tera)/i.test(lines[0])) return null;
  let head = lines[0], item: string | undefined, gender: string | undefined, nickname: string | undefined;
  const at = head.indexOf(' @ ');
  if (at >= 0) { item = head.slice(at + 3).trim(); head = head.slice(0, at).trim(); }
  const g = head.match(/\s\((M|F)\)$/);
  if (g) { gender = g[1]; head = head.slice(0, g.index).trim(); }
  let species = head;
  const n = head.match(/^(.*)\s\(([^()]+)\)$/);
  if (n) { nickname = n[1].trim(); species = n[2].trim(); }

  const p: Parsed = { species, nickname, gender, item, shiny: false, ivs: {}, evs: {}, moves: [], raw: block.trim(), warnings: [] };
  let sawIvs = false;
  for (const l of lines.slice(1)) {
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^ability:\s*(.+)$/i))) p.ability = m[1].trim();
    else if ((m = l.match(/^level:\s*(\d+)/i))) p.level = +m[1];
    else if ((m = l.match(/^shiny:\s*yes/i))) p.shiny = true;
    else if ((m = l.match(/^gender:\s*(male|female|m|f)\b/i))) p.gender = m[1][0].toUpperCase();
    else if ((m = l.match(/^evs:\s*(.+)$/i))) p.evs = readStats(m[1]);
    else if ((m = l.match(/^ivs:\s*(.+)$/i))) { p.ivs = readStats(m[1]); sawIvs = true; }
    else if ((m = l.match(/^([A-Za-z]+)\s+nature\b/i))) p.nature = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    else if ((m = l.match(/^[-–]\s*(.+)$/))) p.moves.push(m[1].replace(/[.\s]+$/, '').trim());
  }
  p.moves = p.moves.slice(0, 4);
  // Showdown rule: stats not listed in an IVs line are 31.
  p.ivs = Object.fromEntries(STATS.map(([k]) => [k, p.ivs[k] ?? 31])) as Stats;
  if (!sawIvs) p.warnings.push('No IVs listed, so every IV is assumed to be 31.');
  if (!p.nature) p.warnings.push('No nature found.');
  else if (!(p.nature in NATURES)) p.warnings.push(`"${p.nature}" is not a known nature.`);
  if (!p.ability) p.warnings.push('No ability found.');
  return p;
}

export const parsePaste = (text: string): Parsed[] =>
  text.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(parseBlock).filter((p): p is Parsed => !!p);

const norm = (s: string) => s.toLowerCase().replace(/[.'’:%]/g, '').trim().replace(/\s+/g, '-');
export function findSpecies(name: string, list: Entry[]): Entry | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return list.find(e => e.name === n) ?? list.find(e => e.name.startsWith(n + '-'));
}

export const ivTotal = (ivs: Stats | undefined) => STATS.reduce((a, [k]) => a + (ivs?.[k] ?? 0), 0);

// Hidden Power type: taken from a "Hidden Power [Type]" move if the paste has one, otherwise calculated from the IVs (Gen 3 to 7 formula).
const HP_TYPES = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
export function hiddenPower(c: Pick<Caught, 'ivs' | 'moves'>): string | null {
  for (const mv of c.moves ?? []) {
    const m = mv.match(/^hidden power\s*[[(:]?\s*([a-z]+)/i);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  }
  const iv = c.ivs;
  if (!iv || STATS.some(([k]) => iv[k] === undefined)) return null;
  const b = (k: StatKey) => (iv[k] as number) & 1;
  const n = b('hp') + 2 * b('atk') + 4 * b('def') + 8 * b('spe') + 16 * b('spa') + 32 * b('spd');
  return HP_TYPES[Math.floor((n * 15) / 63)];
}

// Does a catch satisfy a hunt's nature / ability / IV / shiny requirements?
export function checkReqs(c: Pick<Caught, 'nature' | 'ability' | 'shiny' | 'ivs'>, h: Hunt) {
  const misses: string[] = [];
  const low = (s: string | null) => (s ?? '').toLowerCase();
  if (h.natures?.length && !h.natures.some(n => low(n) === low(c.nature))) misses.push(`Nature ${c.nature ?? 'unknown'} is not on the list`);
  if (h.abilities?.length && !h.abilities.some(a => low(a) === low(c.ability))) misses.push(`Ability ${c.ability ?? 'unknown'} is not on the list`);
  for (const [k, label] of STATS) {
    const r = h.iv_reqs?.[k];
    if (!r) continue;
    const v = c.ivs?.[k];
    if (v === undefined) { misses.push(`${label} unknown`); continue; }
    const ok = r.op === 'eq' ? v === r.v : r.op === 'min' ? v >= r.v : v <= r.v;
    if (!ok) misses.push(`${label} ${v} (needs ${ivLabel(r)})`);
  }
  if (h.shiny && !c.shiny) misses.push('Not shiny');
  return { ok: misses.length === 0, misses };
}
