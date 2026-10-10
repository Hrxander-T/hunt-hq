// Everything that knows how the reader's data maps onto the app lives here, so the API can change without touching the UI.
// When the API gains structured flags (server backlog item 1), only fieldFlags() has to change.
import type { StatKey } from '../types';
import { NATURES, pretty, STATS, type Entry } from '../lib';
import { findSpecies, hiddenPower } from '../paste';
import type { ReaderCard, ReaderStatKey } from './readerApi';

type Stats = Partial<Record<StatKey, number>>;

// The reader uses the game's stat names: SPD is SPEED, SPDEF is Sp. Def. This table is the only place that knows it.
export const READER_TO_APP: Record<ReaderStatKey, StatKey> = { HP: 'hp', ATK: 'atk', DEF: 'def', SPATK: 'spa', SPDEF: 'spd', SPD: 'spe' };
const READER_KEYS = Object.keys(READER_TO_APP) as ReaderStatKey[];
const STAT_KEYS = STATS.map(([k]) => k);

/** What the review form edits. Not yet saved anywhere. */
export interface Draft {
  species: string; // canonical list name (e.g. 'natu') when it could be resolved, otherwise the text as read
  level: number | null; gender: 'M' | 'F' | null; shiny: boolean;
  nature: string | null; ability: string | null;
  ivs: Stats; evs: Stats; // an IV the card did not give stays undefined (and is flagged), an EV defaults to 0
}

const canonNature = (n?: string | null) => {
  const s = (n ?? '').trim();
  return s ? Object.keys(NATURES).find(k => k.toLowerCase() === s.toLowerCase()) ?? s : null;
};

export function fromReader(card: ReaderCard, list: Entry[]): Draft {
  const raw = (card.name ?? '').trim();
  const e = raw && list.length ? findSpecies(raw, list) : undefined;
  const ivs: Stats = {}, evs: Stats = {};
  for (const rk of READER_KEYS) { // HP.stat is always null (current HP is not read); only iv and ev are used
    const s = card.stats?.[rk], k = READER_TO_APP[rk];
    if (typeof s?.iv === 'number') ivs[k] = s.iv;
    evs[k] = typeof s?.ev === 'number' ? s.ev : 0;
  }
  return {
    species: e?.name ?? raw, level: typeof card.level === 'number' ? card.level : null,
    gender: card.gender === 'M' || card.gender === 'F' ? card.gender : null, // 'N' (genderless) is null in the app
    shiny: !!card.shiny, nature: canonNature(card.nature), ability: (card.ability ?? '').trim() || null, ivs, evs,
  };
}

// ---- flags: which fields are uncertain and why ----
export type FieldId = 'species' | 'level' | 'gender' | 'nature' | 'ability' | `iv.${StatKey}` | `ev.${StatKey}`;
/** field null = a general notice. info = FYI only, nothing to confirm. message is the API's own text where there is one. */
export interface Flag { field: FieldId | null; message: string; info?: boolean }

const STAT_RE = '(ATK|DEF|SPD|SPATK|SPDEF|HP)'; // alternation backtracks, so 'SPDEF row' resolves to SPDEF, not SPD
const R_MISSING = /^(name|level|gender|ability|nature|region|hidden[_ ]power|hp_max) missing/i;
const R_STAT = new RegExp(`^${STAT_RE}\\b.*(read \\d+, formula says|iv/ev out of range|extra digit)`, 'i');
const R_CORRECTED = new RegExp(`^${STAT_RE}\\s*:\\s*\\d+\\s*->\\s*\\d+`, 'i');
const MISSING: Record<string, FieldId | null> = { name: 'species', level: 'level', gender: 'gender', ability: 'ability', nature: 'nature', region: null, hidden_power: null, hp_max: null };
const ivEv = (rk: string): FieldId[] => { const k = READER_TO_APP[rk.toUpperCase() as ReaderStatKey]; return [`iv.${k}`, `ev.${k}`]; };
// Shape of nature_check is not documented: accept a MISMATCH string or an object with ok === false.
const natureCheckFailed = (v: unknown): boolean =>
  typeof v === 'string' ? /mismatch/i.test(v) : !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false;

/** Flags derived from the API's text (the table in DUMP_TAB_PLAN.md section 4). */
export function fieldFlags(card: ReaderCard): Flag[] {
  const out: Flag[] = [];
  const add = (fields: (FieldId | null)[], message: string, info = false) => { for (const field of fields) out.push(info ? { field, message, info } : { field, message }); };
  for (const raw of card.warnings ?? []) {
    const w = raw.trim(); let m: RegExpMatchArray | null;
    if ((m = w.match(R_MISSING))) { const f = MISSING[m[1].toLowerCase().replace(' ', '_')]; add([f], w, f === null); }
    else if ((m = w.match(R_STAT))) add(ivEv(m[1]), w);
    else if (/^ability .* not in/i.test(w)) add(['ability'], w);
    else if (/^name (unread|unknown)/i.test(w)) add(['species'], w);
    else if (/^stats rows found/i.test(w)) add(READER_KEYS.flatMap(ivEv), w);
    else if (/^MISMATCH/i.test(w)) add(['nature'], w);
    else add([null], w);
  }
  for (const raw of card.corrected ?? []) { // auto-corrected by the reader: ask the user to eyeball it
    const c = raw.trim(), m = c.match(R_CORRECTED);
    add(m ? ivEv(m[1]) : [null], `Auto-corrected by the reader: ${c}`);
  }
  if (card.level_inferred) add(['level'], 'The level was inferred, it was not read from the card.');
  if (card.name_from_stats) add(['species'], 'The name was guessed from the stats, it was not read from the card.');
  if (natureCheckFailed(card.nature_check) && !out.some(f => f.field === 'nature')) add(['nature'], 'The nature does not match the stats on the card.');
  const seen = new Set<string>();
  return out.filter(f => { const k = `${f.field}|${f.message}`; return seen.has(k) ? false : (seen.add(k), true); });
}

/** Problems the user cannot "confirm away": no species, an unknown nature, an IV that was not read. Recompute on every edit.
 *  Needs the loaded species list (the species check is skipped while it is empty). */
export function validityFlags(d: Draft, list: Entry[]): Flag[] {
  const out: Flag[] = [];
  if (list.length && !findSpecies(d.species, list)) out.push({ field: 'species', message: d.species.trim() ? `"${d.species}" is not a known Pokémon. Pick one from the list.` : 'No species. Pick one from the list.' });
  if (d.nature && !(d.nature in NATURES)) out.push({ field: 'nature', message: `"${d.nature}" is not a known nature. Pick one from the list.` });
  for (const [k, l] of STATS) if (d.ivs[k] === undefined) out.push({ field: `iv.${k}`, message: `${l} IV was not read.` });
  return out;
}

/** Hidden power cross-check: a misread IV digit usually flips a parity bit, which changes the type. Can be confirmed by the user. */
export function hiddenPowerFlags(d: Draft, cardHiddenPower: string | null | undefined): Flag[] {
  const hp = hiddenPower({ ivs: d.ivs, moves: [] }), seen = (cardHiddenPower ?? '').trim();
  if (!hp || !seen || hp.toLowerCase() === seen.toLowerCase()) return [];
  return STAT_KEYS.map(k => ({ field: `iv.${k}` as FieldId, message: `IVs imply Hidden Power ${hp} but the card shows ${seen}.` }));
}

/** Client-side checks on top of the API's. */
export const checkFlags = (d: Draft, cardHiddenPower: string | null | undefined, list: Entry[]): Flag[] => [...validityFlags(d, list), ...hiddenPowerFlags(d, cardHiddenPower)];

/** Hard limits the form must also respect: IV 0-31, EV 0-252 and at most 510 in total, level 1-100. */
export function rangeFlags(d: Draft): Flag[] {
  const out: Flag[] = [];
  const whole = (v: number, max: number, min = 0) => Number.isInteger(v) && v >= min && v <= max;
  if (d.level !== null && !whole(d.level, 100, 1)) out.push({ field: 'level', message: 'Level must be a whole number from 1 to 100.' });
  for (const [k, l] of STATS) {
    const iv = d.ivs[k], ev = d.evs[k];
    if (iv !== undefined && !whole(iv, 31)) out.push({ field: `iv.${k}`, message: `${l} IV must be a whole number from 0 to 31.` });
    if (ev !== undefined && !whole(ev, 252)) out.push({ field: `ev.${k}`, message: `${l} EV must be a whole number from 0 to 252.` });
  }
  const total = STAT_KEYS.reduce((a, k) => a + (d.evs[k] ?? 0), 0);
  if (total > 510) for (const k of STAT_KEYS) out.push({ field: `ev.${k}`, message: `EVs add up to ${total}; the maximum is 510.` });
  return out;
}

export const allFlags = (card: ReaderCard, d: Draft, list: Entry[]): Flag[] => [...fieldFlags(card), ...checkFlags(d, card.hidden_power, list), ...rangeFlags(d)];
/** Always block Save. */
export const hardFlags = (d: Draft, list: Entry[]): Flag[] => [...validityFlags(d, list), ...rangeFlags(d)];
/** Block Save until the user has confirmed or edited the field (or, for field null, acknowledged the notice). */
export const softFlags = (card: ReaderCard, d: Draft): Flag[] => [...fieldFlags(card), ...hiddenPowerFlags(d, card.hidden_power)];

// ---- Showdown paste (the Edit flow in SubmitCatch re-parses caught.paste, so every Dump save must write a valid one) ----
export function toShowdown(d: Draft): string {
  const evs = STATS.filter(([k]) => d.evs[k]).map(([k, l]) => `${d.evs[k]} ${l}`).join(' / ');
  const ivs = STATS.map(([k, l]) => `${d.ivs[k] ?? 31} ${l}`).join(' / '); // always all six: paste.ts assumes 31 for a missing one
  const name = pretty(d.species.trim());
  return [
    d.gender ? `${name} (${d.gender})` : name,
    d.level !== null && `Level: ${d.level}`,
    d.shiny && 'Shiny: Yes',
    d.nature && `${d.nature} Nature`,
    d.ability && `Ability: ${d.ability}`,
    evs && `EVs: ${evs}`,
    `IVs: ${ivs}`,
  ].filter(Boolean).join('\n');
}
