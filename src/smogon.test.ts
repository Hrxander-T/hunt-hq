import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/smogon-sample.json';
import { buildsFor, consensus, formatInfo, lineItems, mapAbilities, mapAbility, speciesKey, buildNote, itemTally, tally, buildPool, matchBuilds, toRequirements, type GenData } from './smogon';
import type { AbilitySlot } from './lib';
import { checkReqs } from './paste';

const data = sample as unknown as GenData;

describe('species matching', () => {
  it('maps PokeAPI form names to Showdown names', () => {
    expect(speciesKey(data, 'tauros-paldea-blaze-breed')).toBe('Tauros-Paldea-Blaze');
    expect(speciesKey(data, 'venusaur')).toBe('Venusaur');
  });
  it('never falls back from a regional form to its base species', () => {
    expect(speciesKey(data, 'raichu-alola')).toBe('Raichu-Alola');
    expect(speciesKey(data, 'ninetales-hisui')).toBeUndefined();
  });
});

describe('normalizing sets', () => {
  it('flattens single values, lists and missing fields', () => {
    const b = buildsFor(data, 'venusaur');
    const ou = b.find(x => x.format === 'ou')!;
    expect(ou.natures).toEqual(['Timid', 'Naive']);
    expect(ou.ivs).toEqual({});
    const pu = b.find(x => x.format === 'pu' && x.name === 'Offensive')!;
    expect(pu.abilities).toEqual([]);
    expect(pu.items).toEqual(['Heavy-Duty Boots', 'Life Orb']);
  });
  it('keeps alternative EV spreads and strips ":2" from set names', () => {
    expect(buildsFor(data, 'clefairy').find(x => x.format === 'nfe')!.evs).toHaveLength(2);
    expect(buildsFor(data, 'chansey').find(x => x.format === 'nationaldexuu')!.name).toBe('Pink Blob');
  });
});

describe('formats', () => {
  it('groups formats', () => {
    expect(formatInfo('ou').group).toBe('main');
    expect(formatInfo('vgc2025')).toMatchObject({ label: 'VGC 2025', group: 'doubles' });
    expect(formatInfo('doublesou').group).toBe('doubles');
    expect(formatInfo('monotype').group).toBe('monotype');
    expect(formatInfo('nationaldexuu')).toMatchObject({ label: 'National Dex UU', group: 'natdex' });
    expect(formatInfo('godlygift').group).toBe('other');
    expect(formatInfo('vgc2025').order).toBeLessThan(formatInfo('vgc2023').order);
  });
});

describe('requirements', () => {
  it('keeps listed IVs exact and sets the rest to 20+', () => {
    expect(toRequirements(['Modest'], { atk: 0 }, 20)).toEqual({
      hp: { op: 'min', v: 20 }, atk: { op: 'eq', v: 0 }, def: { op: 'min', v: 20 }, spa: { op: 'min', v: 20 }, spd: { op: 'min', v: 20 }, spe: { op: 'min', v: 20 },
    });
  });
  it('drops the requirement for a stat any chosen nature lowers', () => {
    const r = toRequirements(['Timid', 'Naive'], { atk: 0 }, 20); // Timid lowers Atk, Naive lowers SpD
    expect(r.atk).toEqual({ op: 'eq', v: 0 }); // listed IV still wins
    expect(r.spd).toBeUndefined();
    expect(r.spe).toEqual({ op: 'min', v: 20 });
  });
  it('treats neutral natures as lowering nothing', () => {
    expect(Object.keys(toRequirements(['Hardy'], {}, 20))).toHaveLength(6);
  });
});

describe('consensus', () => {
  it('counts natures, abilities and listed IVs across sets', () => {
    const c = consensus(buildsFor(data, 'venusaur'));
    expect(c.natures[0]).toEqual({ value: 'Timid', n: 4 });
    expect(c.ivs.find(i => i.stat === 'atk')).toMatchObject({ v: 0 });
    expect(c.abilities.find(a => a.value === 'Chlorophyll')!.n).toBe(4);
  });
});

// ---- evolution lines and ability translation ----
const set = { moves: [['Tackle']] };
const lineData = {
  Vulpix: { ou: { A: set } }, 'Vulpix-Alola': { ou: { A: set } },
  Ninetales: { ou: { A: set } }, 'Ninetales-Alola': { ou: { A: set } },
  Larvitar: { lc: { A: set } }, Tyranitar: { ou: { A: set } },
  Sandshrew: { ou: { A: set } }, 'Sandslash-Alola': { ou: { A: set } },
} as unknown as GenData;
const keys = (r: { key: string }[]) => r.map(x => x.key);

describe('lineItems', () => {
  it('leads a regional form to its regional evolution', () => {
    expect(keys(lineItems(lineData, 'vulpix-alola', ['ninetales']))).toEqual(['Vulpix-Alola', 'Ninetales-Alola']);
  });
  it('never picks a regional form for a plain species', () => {
    expect(keys(lineItems(lineData, 'vulpix', ['ninetales']))).toEqual(['Vulpix', 'Ninetales']);
    // even when only the regional evolution has sets
    expect(keys(lineItems(lineData, 'sandshrew', ['sandslash']))).toEqual(['Sandshrew']);
  });
  it('falls back to the plain evolution when a regional form has no regional evolution', () => {
    expect(keys(lineItems(lineData, 'vulpix-alola', ['tyranitar']))).toEqual(['Vulpix-Alola', 'Tyranitar']);
  });
  it('includes later stages and skips species without sets', () => {
    expect(keys(lineItems(lineData, 'larvitar', ['pupitar', 'tyranitar']))).toEqual(['Larvitar', 'Tyranitar']);
    expect(lineItems(lineData, 'larvitar', ['tyranitar'])[1]).toEqual({ poke: 'tyranitar', key: 'Tyranitar' });
  });
});

describe('mapAbility', () => {
  const larvitar: AbilitySlot[] = [{ name: 'Guts', slot: 1, hidden: false }, { name: 'Sand Veil', slot: 3, hidden: true }];
  const tyranitar: AbilitySlot[] = [{ name: 'Sand Stream', slot: 1, hidden: false }, { name: 'Unnerve', slot: 3, hidden: true }];
  it('translates by slot (Tyranitar to Larvitar)', () => {
    expect(mapAbility('Sand Stream', tyranitar, larvitar)).toBe('Guts');
    expect(mapAbility('Unnerve', tyranitar, larvitar)).toBe('Sand Veil');
    expect(mapAbility('sand stream', tyranitar, larvitar)).toBe('Guts'); // case-insensitive
  });
  it('returns null for an ability the source species does not have', () => {
    expect(mapAbility('Intimidate', tyranitar, larvitar)).toBeNull();
  });
  it('handles a slot gap: a normal ability maps to the first normal one, a hidden one has no match', () => {
    const src: AbilitySlot[] = [{ name: 'Flash Fire', slot: 1, hidden: false }, { name: 'Water Veil', slot: 2, hidden: false }, { name: 'Guts', slot: 3, hidden: true }];
    const dst: AbilitySlot[] = [{ name: 'Run Away', slot: 1, hidden: false }]; // no slot 2, no hidden
    expect(mapAbility('Water Veil', src, dst)).toBe('Run Away');
    expect(mapAbility('Guts', src, dst)).toBeNull();
    expect(mapAbility('Water Veil', src, [{ name: 'Anticipation', slot: 3, hidden: true }])).toBeNull(); // nothing normal to fall back to
  });
  it('mapAbilities de-duplicates and drops misses', () => {
    const src: AbilitySlot[] = [{ name: 'A', slot: 1, hidden: false }, { name: 'B', slot: 2, hidden: false }, { name: 'C', slot: 3, hidden: true }];
    const dst: AbilitySlot[] = [{ name: 'X', slot: 1, hidden: false }];
    expect(mapAbilities(['A', 'B', 'C', 'Nope'], src, dst)).toEqual(['X']);
  });
});

describe('builds tab helpers', () => {
  const b = {
    key: 'k', species: 'Tyranitar', format: 'gen9ou', name: 'Dragon Dance', natures: ['Jolly'], abilities: ['Sand Stream'], items: ['Leftovers', 'Choice Band'],
    ivs: {}, evs: [{ atk: 252, spe: 252, hp: 4 }, { atk: 252, hp: 252 }], tera: [], moves: [],
  } as unknown as Parameters<typeof buildNote>[0];
  it('tally counts and sorts most common first', () => {
    expect(tally(['a', 'b', 'b', 'c', 'c', 'c'])).toEqual([{ value: 'c', n: 3 }, { value: 'b', n: 2 }, { value: 'a', n: 1 }]);
  });
  it('itemTally counts each item once per set', () => {
    const two = [b, { ...b, items: ['Leftovers'] }] as typeof b[];
    expect(itemTally(two)).toEqual([{ value: 'Leftovers', n: 2 }, { value: 'Choice Band', n: 1 }]);
  });
  it('buildNote names the source species only when given', () => {
    const plain = buildNote(b, 9);
    expect(plain.startsWith('Smogon Gen 9 ')).toBe(true);
    expect(plain).toContain('Dragon Dance');
    expect(plain).toContain('Leftovers / Choice Band');
    expect(buildNote(b, 9, 'Tyranitar')).toContain('Gen 9 Tyranitar ');
  });
  it('mapAbility ignores apostrophes and hyphens (PokeAPI vs Showdown spelling)', () => {
    const slots: AbilitySlot[] = [{ name: 'Minds Eye', slot: 1, hidden: false }];
    expect(mapAbility("Mind's Eye", slots, slots)).toBe('Minds Eye');
  });
});

describe('matching catches to builds', () => {
  const mdata = {
    Tyranitar: { ou: {
      'Dragon Dance': { moves: [['Dragon Dance']], ability: 'Sand Stream', nature: 'Jolly', item: 'Leftovers', evs: { atk: 252, spe: 252, hp: 4 } },
      'Special': { moves: [['Fire Blast']], ability: 'Sand Stream', nature: 'Modest', evs: { spa: 252 }, ivs: { atk: 0 } },
    } },
  } as unknown as GenData;
  const all31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const evo = {
    own: { species: 'larvitar', abilities: [{ name: 'Guts', slot: 1, hidden: false }, { name: 'Sand Veil', slot: 3, hidden: true }] },
    later: ['pupitar', 'tyranitar'],
    src: { tyranitar: { species: 'tyranitar', abilities: [{ name: 'Sand Stream', slot: 1, hidden: false }, { name: 'Unnerve', slot: 3, hidden: true }] } },
  };

  it('uses the species own sets when it has some', () => {
    const pool = buildPool(mdata, 'tyranitar');
    expect(pool.map(p => p.build.name).sort()).toEqual(['Dragon Dance', 'Special']);
    expect(pool.every(p => p.from === 'tyranitar')).toBe(true);
  });
  it('needs evolution info to use a later stage, and translates abilities by slot', () => {
    expect(buildPool(mdata, 'larvitar')).toEqual([]);
    const pool = buildPool(mdata, 'larvitar', evo);
    expect(pool.length).toBe(2);
    expect(pool.every(p => p.from === 'tyranitar' && p.abilities[0] === 'Guts')).toBe(true);
  });
  it('ranks a full match first and counts misses on the others', () => {
    const res = matchBuilds({ nature: 'Jolly', ability: 'Sand Stream', ivs: all31 }, buildPool(mdata, 'tyranitar'), 20);
    expect(res[0].build.name).toBe('Dragon Dance');
    expect(res[0].res.ok).toBe(true);
    expect(res[1].res.ok).toBe(false);
    expect(res[1].res.count).toBeGreaterThanOrEqual(2); // wrong nature, and Atk 31 is not the set's 0
  });
  it('matches a Larvitar catch against Tyranitar sets using the translated ability', () => {
    const res = matchBuilds({ nature: 'Jolly', ability: 'Guts', ivs: all31 }, buildPool(mdata, 'larvitar', evo), 20);
    expect(res[0].res.ok).toBe(true);
    expect(matchBuilds({ nature: 'Jolly', ability: 'Sand Veil', ivs: all31 }, buildPool(mdata, 'larvitar', evo), 20)[0].res.ok).toBe(false);
  });
  it('honours the minimum for stats the set does not list', () => {
    const low = { ...all31, spe: 10 };
    expect(matchBuilds({ nature: 'Jolly', ability: 'Sand Stream', ivs: low }, buildPool(mdata, 'tyranitar'), 20)[0].res.ok).toBe(false);
    expect(matchBuilds({ nature: 'Jolly', ability: 'Sand Stream', ivs: low }, buildPool(mdata, 'tyranitar'), 5)[0].res.ok).toBe(true);
  });
  it('checkReqs compares abilities by id, so spelling differences do not count as misses', () => {
    const h = { natures: [], abilities: ['Minds Eye'], iv_reqs: {}, shiny: false } as unknown as Parameters<typeof checkReqs>[1];
    expect(checkReqs({ nature: null, ability: "Mind's Eye", shiny: false, ivs: {} }, h).ability).toBe('ok');
  });
});
