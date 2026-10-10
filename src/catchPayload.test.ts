import { describe, expect, it } from 'vitest';
import { catchRow } from './catchPayload';
import { parsePaste } from './paste';
import { toShowdown } from './dump/mapping';

const natu = { id: 177, name: 'natu' };
const paste = 'Nat (Natu) (F) @ Leftovers\nLevel: 44\nShiny: Yes\nCareful Nature\nAbility: Synchronize\nEVs: 4 HP\nIVs: 21 HP / 30 Atk / 26 Def / 18 SpA / 6 SpD / 22 Spe\n- Wish\n- Psychic';

describe('catchRow', () => {
  it('builds exactly the columns the caught table accepts, and none of the approval ones', () => {
    const row = catchRow(natu, parsePaste('Natu\nLevel: 44\nCareful Nature\nAbility: Synchronize')[0], ['psychic', 'flying'], '');
    expect(Object.keys(row).sort()).toEqual(['ability', 'evs', 'gender', 'hunt_id', 'item', 'ivs', 'level', 'moves', 'nature', 'nickname', 'paste', 'pokemon_id', 'shiny', 'species', 'types']);
    expect(row).toMatchObject({ pokemon_id: 177, species: 'natu', types: ['psychic', 'flying'], hunt_id: null, nickname: null, item: null, gender: null, level: 44 });
  });
  it('copies every parsed field and links the hunt', () => {
    const p = parsePaste(paste)[0];
    expect(catchRow(natu, p, ['psychic'], 'hunt-1')).toEqual({
      pokemon_id: 177, species: 'natu', types: ['psychic'], nickname: 'Nat', level: 44, nature: 'Careful', ability: 'Synchronize', item: 'Leftovers',
      gender: 'F', shiny: true, ivs: p.ivs, evs: { hp: 4 }, moves: ['Wish', 'Psychic'], paste: p.raw, hunt_id: 'hunt-1',
    });
  });
  it('stores the Showdown text the Dump tab wrote, so the Edit flow can re-open it', () => {
    const text = toShowdown({ species: 'natu', level: 10, gender: 'F', shiny: false, nature: 'Bold', ability: 'Synchronize', ivs: { hp: 21, atk: 30, def: 26, spa: 18, spd: 16, spe: 22 }, evs: {} });
    expect(catchRow(natu, parsePaste(text)[0], ['psychic'], null).paste).toBe(text);
  });
});
