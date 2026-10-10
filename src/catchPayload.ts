// The one place that turns a parsed catch into a row for the `caught` table.
// Used by SubmitCatch (pasted Showdown text) and by the Dump tab (which builds a Showdown paste first), so the two never drift apart.
// It never sets approved / approved_by / approved_at / caught_by: RLS forbids it and the database fills them in.
import type { StatKey } from './types';
import { details, type Entry } from './lib';
import type { Parsed } from './paste';

export interface CatchPayload {
  pokemon_id: number; species: string; types: string[]; nickname: string | null; level: number | null;
  nature: string | null; ability: string | null; item: string | null; gender: string | null; shiny: boolean;
  ivs: Partial<Record<StatKey, number>>; evs: Partial<Record<StatKey, number>>; moves: string[]; paste: string; hunt_id: string | null;
}

/** Pure part: no network. `types` come from PokéAPI (lowercase). */
export const catchRow = (e: Entry, p: Parsed, types: string[], huntId: string | null): CatchPayload => ({
  pokemon_id: e.id, species: e.name, types, nickname: p.nickname ?? null, level: p.level ?? null,
  nature: p.nature ?? null, ability: p.ability ?? null, item: p.item ?? null, gender: p.gender ?? null,
  shiny: p.shiny, ivs: p.ivs, evs: p.evs, moves: p.moves, paste: p.raw, hunt_id: huntId || null,
});

export async function buildCatchPayload(e: Entry, p: Parsed, huntId: string | null): Promise<CatchPayload> {
  const d = await details(e.id);
  return catchRow(e, p, d.types, huntId);
}
