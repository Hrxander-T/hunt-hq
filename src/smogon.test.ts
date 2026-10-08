import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/smogon-sample.json';
import { buildsFor, consensus, formatInfo, speciesKey, toRequirements, type GenData } from './smogon';

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
