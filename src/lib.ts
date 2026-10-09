import type { IvReq, IvReqs, StatKey } from './types';
export interface Entry { id: number; name: string }
export const STATS: [StatKey, string][] = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
export const ivLabel = (r: IvReq) => (r.op === 'eq' ? `${r.v}` : r.op === 'min' ? `${r.v}+` : `${r.v}\u2212`);
export const ivSummary = (iv: IvReqs) => STATS.filter(([k]) => iv[k]).map(([k, l]) => `${l} ${ivLabel(iv[k]!)}`);
export const NATURES: Record<string, [string, string] | null> = {
  Hardy:null,Docile:null,Serious:null,Bashful:null,Quirky:null,Lonely:['Atk','Def'],Brave:['Atk','Spe'],Adamant:['Atk','SpA'],Naughty:['Atk','SpD'],
  Bold:['Def','Atk'],Relaxed:['Def','Spe'],Impish:['Def','SpA'],Lax:['Def','SpD'],Timid:['Spe','Atk'],Hasty:['Spe','Def'],Jolly:['Spe','SpA'],Naive:['Spe','SpD'],
  Modest:['SpA','Atk'],Mild:['SpA','Def'],Quiet:['SpA','Spe'],Rash:['SpA','SpD'],Calm:['SpD','Atk'],Gentle:['SpD','Def'],Sassy:['SpD','Spe'],Careful:['SpD','SpA'],
};
export const natureText = (n?: string | null) => {
  if (!n) return '';
  const k = Object.keys(NATURES).find(x => x.toLowerCase() === n.trim().toLowerCase());
  if (!k) return n;
  const v = NATURES[k];
  return v ? `${k} (+${v[0]} −${v[1]})` : `${k} (neutral)`;
};
export const TYPE_COLORS: Record<string, string> = {
  normal:'#a8a77a',fire:'#ee8130',water:'#6390f0',grass:'#7ac74c',electric:'#f7d02c',ice:'#96d9d6',fighting:'#c22e28',poison:'#a33ea1',ground:'#e2bf65',
  flying:'#a98ff3',psychic:'#f95587',bug:'#a6b91a',rock:'#b6a136',ghost:'#735797',dragon:'#6f35fc',dark:'#705746',steel:'#b7b7ce',fairy:'#d685ad',
};
export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
};
export const pretty = (n: string) => n.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const sprite = (id: number, shiny = false) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? 'shiny/' : ''}${id}.png`;
export const art = (id: number, shiny = false) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`;

// PokéAPI: one cached list for search (includes regional forms), one cached call per Pokémon for types/abilities.
export async function loadList(): Promise<Entry[]> {
  const cached = localStorage.getItem('pokelist.v1');
  if (cached) return JSON.parse(cached);
  const j = await (await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000')).json();
  const list: Entry[] = j.results.map((p: { name: string; url: string }) => ({ id: +p.url.split('/').filter(Boolean).pop()!, name: p.name }));
  localStorage.setItem('pokelist.v1', JSON.stringify(list));
  return list;
}
export async function details(id: number) {
  const key = `poke.${id}`;
  const c = localStorage.getItem(key);
  if (c) return JSON.parse(c) as { types: string[]; abilities: { name: string; hidden: boolean }[] };
  const j = await (await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)).json();
  const out = {
    types: j.types.map((t: { type: { name: string } }) => t.type.name),
    abilities: j.abilities.map((a: { ability: { name: string }; is_hidden: boolean }) => ({ name: pretty(a.ability.name), hidden: a.is_hidden })),
  };
  localStorage.setItem(key, JSON.stringify(out));
  return out;
}

// Abilities keep their slot when a Pokémon evolves (1 and 2 are normal, 3 is hidden), so we need the slot numbers.
export interface AbilitySlot { name: string; slot: number; hidden: boolean }
export interface PokeInfo { species: string; abilities: AbilitySlot[] }
export async function pokeInfo(nameOrId: string | number): Promise<PokeInfo> {
  const key = `poke2.${nameOrId}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c) as PokeInfo; } catch { /* ignore */ }
  const j = await (await fetch(`https://pokeapi.co/api/v2/pokemon/${nameOrId}`)).json();
  const out: PokeInfo = {
    species: j.species.name,
    abilities: j.abilities.map((a: { ability: { name: string }; slot: number; is_hidden: boolean }) => ({ name: pretty(a.ability.name), slot: a.slot, hidden: a.is_hidden })),
  };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

// Species this Pokémon evolves into (every later stage), from PokéAPI's evolution chain. Example: larvitar -> pupitar, tyranitar.
export async function laterStages(species: string): Promise<string[]> {
  const key = `evo.${species}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c) as string[]; } catch { /* ignore */ }
  interface Node { species: { name: string }; evolves_to: Node[] }
  const sp = await (await fetch(`https://pokeapi.co/api/v2/pokemon-species/${species}`)).json();
  const chain = await (await fetch(sp.evolution_chain.url)).json();
  const find = (n: Node): Node | null => (n.species.name === species ? n : n.evolves_to.map(find).find(Boolean) ?? null);
  const out: string[] = [];
  const walk = (n: Node) => n.evolves_to.forEach(c => { out.push(c.species.name); walk(c); });
  const node = find(chain.chain as Node);
  if (node) walk(node);
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}
