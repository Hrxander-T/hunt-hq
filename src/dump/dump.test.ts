import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../lib';
import { findSpecies, parsePaste } from '../paste';
import { health, READ_TIMEOUT_MS, readCards, readerConfigured, type ReaderCard, type ReaderStat } from './readerApi';
import { allFlags, checkFlags, fieldFlags, fromReader, hardFlags, rangeFlags, softFlags, toShowdown, type Draft, type Flag } from './mapping';

const list: Entry[] = [{ id: 177, name: 'natu' }, { id: 16, name: 'pidgey' }, { id: 122, name: 'mr-mime' }];
const stat = (iv: number, ev = 0): ReaderStat => ({ stat: null, iv, ev });
// A clean Natu card. Its real SPDEF IV is 16: IVs 21/30/26/18/16/22 give Hidden Power Fighting, with 15 they would give Steel.
const mk = (over: Partial<ReaderCard> = {}): ReaderCard => ({
  status: 'ok', source: 'screenshot', name: 'Natu', level: 10, gender: 'F', shiny: false, types: ['Psychic', 'Flying'],
  ability: 'Synchronize', nature: 'Bold', region: 'Johto', hidden_power: 'Fighting', hp_max: 31,
  stats: { HP: stat(21), ATK: stat(30), DEF: stat(26), SPD: stat(22), SPATK: stat(18), SPDEF: stat(16) },
  warnings: [], corrected: [], detect: { score: 0.9, scale: 1, box: [0, 0, 10, 10] }, ...over,
});
const fields = (fl: Flag[]) => fl.map(f => f.field);

describe('fromReader', () => {
  it('maps the six stat keys, SPD is Speed and SPDEF is Sp. Def', () => {
    const d = fromReader(mk({ stats: { HP: stat(1, 4), ATK: stat(2, 8), DEF: stat(3, 12), SPD: stat(4, 16), SPATK: stat(5, 20), SPDEF: stat(6, 24) } }), list);
    expect(d.ivs).toEqual({ hp: 1, atk: 2, def: 3, spe: 4, spa: 5, spd: 6 });
    expect(d.evs).toEqual({ hp: 4, atk: 8, def: 12, spe: 16, spa: 20, spd: 24 });
  });
  it('ignores the HP stat value (always null) and keeps its IV and EV', () => {
    const d = fromReader(mk({ stats: { ...mk().stats, HP: { stat: null, iv: 2, ev: 0 } } }), list);
    expect(d.ivs.hp).toBe(2);
  });
  it('maps gender N to null, keeps M and F', () => {
    expect(fromReader(mk({ gender: 'N' }), list).gender).toBeNull();
    expect(fromReader(mk({ gender: 'M' }), list).gender).toBe('M');
    expect(fromReader(mk({ gender: null }), list).gender).toBeNull();
  });
  it('normalizes nature and ability strings', () => {
    const d = fromReader(mk({ nature: 'bold', ability: ' Synchronize ' }), list);
    expect([d.nature, d.ability]).toEqual(['Bold', 'Synchronize']);
    expect(fromReader(mk({ nature: '', ability: null }), list)).toMatchObject({ nature: null, ability: null });
    expect(fromReader(mk({ nature: 'Weird' }), list).nature).toBe('Weird'); // unknown stays visible, the form will flag it
  });
  it('resolves the species to the list name and keeps unknown text as read', () => {
    expect(fromReader(mk(), list).species).toBe('natu');
    expect(fromReader(mk({ name: 'Mr. Mime' }), list).species).toBe('mr-mime');
    expect(fromReader(mk({ name: 'Zzzz' }), list).species).toBe('Zzzz');
    expect(fromReader(mk({ name: null }), list).species).toBe('');
  });
  it('leaves an IV the card did not give undefined and defaults its EV to 0', () => {
    const d = fromReader(mk({ stats: { HP: stat(21), ATK: { stat: null, iv: null, ev: null } } }), list);
    expect(d.ivs.atk).toBeUndefined();
    expect(d.evs.atk).toBe(0);
  });
});

describe('fieldFlags (one test per row of the table)', () => {
  const one = (w: string) => fieldFlags(mk({ status: 'review', warnings: [w] }));
  it('has no flags for a clean card', () => expect(fieldFlags(mk())).toEqual([]));
  it('maps "<field> missing"', () => {
    expect(fields(one('name missing'))).toEqual(['species']);
    expect(fields(one('level missing'))).toEqual(['level']);
    expect(fields(one('gender missing'))).toEqual(['gender']);
    expect(fields(one('ability missing'))).toEqual(['ability']);
    expect(fields(one('nature missing'))).toEqual(['nature']);
  });
  it('treats region, hidden power and hp_max missing as info only', () => {
    for (const w of ['region missing', 'hidden_power missing', 'hp_max missing']) expect(one(w)).toEqual([{ field: null, message: w, info: true }]);
  });
  it('highlights stat, IV and EV of a stat row problem (the Natu example)', () => {
    const w = "SPDEF row '15156000' has an extra digit; IV/EV could be any of [(15, 0), (16, 0)]";
    expect(one(w)).toEqual([{ field: 'iv.spd', message: w }, { field: 'ev.spd', message: w }]); // SPDEF is spd, not spe
  });
  it('maps every stat name to the right key', () => {
    const m: Record<string, string> = { ATK: 'atk', DEF: 'def', SPD: 'spe', SPATK: 'spa', SPDEF: 'spd', HP: 'hp' };
    for (const [rk, k] of Object.entries(m)) {
      expect(fields(one(`${rk} stat read 17, formula says 18`))).toEqual([`iv.${k}`, `ev.${k}`]);
      expect(fields(one(`${rk} iv/ev out of range`))).toEqual([`iv.${k}`, `ev.${k}`]);
    }
  });
  it('maps ability not in the species list', () => expect(fields(one("ability 'Foo' not in ['Synchronize', 'Early Bird']"))).toEqual(['ability']));
  it('maps name unread and name unknown to species', () => {
    expect(fields(one("name unread; stats fit several species: ['natu', 'xatu']"))).toEqual(['species']);
    expect(fields(one('name unknown: Natuu'))).toEqual(['species']);
  });
  it('maps "stats rows found" to all twelve stat fields', () => {
    const f = one('stats rows found 4, expected 6');
    expect(f).toHaveLength(12);
    expect(new Set(fields(f)).size).toBe(12);
  });
  it('maps MISMATCH and nature_check to nature, without doubling up', () => {
    expect(fields(one('MISMATCH: nature Bold does not fit the stats'))).toEqual(['nature']);
    expect(fields(fieldFlags(mk({ nature_check: 'MISMATCH' })))).toEqual(['nature']);
    expect(fields(fieldFlags(mk({ nature_check: { ok: false } })))).toEqual(['nature']);
    expect(fieldFlags(mk({ nature_check: { ok: true } }))).toEqual([]);
    expect(fields(fieldFlags(mk({ status: 'review', warnings: ['MISMATCH x'], nature_check: 'MISMATCH' })))).toEqual(['nature']);
  });
  it('flags auto-corrected stats and shows the correction', () => {
    const f = fieldFlags(mk({ status: 'review', corrected: ['DEF: 65 -> 55'] }));
    expect(fields(f)).toEqual(['iv.def', 'ev.def']);
    expect(f[0].message).toContain('DEF: 65 -> 55');
  });
  it('flags level_inferred and name_from_stats', () => {
    expect(fields(fieldFlags(mk({ level_inferred: true })))).toEqual(['level']);
    expect(fields(fieldFlags(mk({ name_from_stats: true })))).toEqual(['species']);
  });
  it('turns anything else into a general notice', () => expect(one('something odd')).toEqual([{ field: null, message: 'something odd' }]));
  it('drops exact duplicates', () => expect(fieldFlags(mk({ status: 'review', warnings: ['level missing', 'level missing'] }))).toHaveLength(1));
});

describe('hidden power check', () => {
  const natu15 = () => fromReader(mk({ stats: { ...mk().stats, SPDEF: stat(15) } }), list);
  it('flags all six IVs when the IVs imply another type (Natu SPDEF 15 vs 16)', () => {
    const f = checkFlags(natu15(), 'Fighting', list);
    expect(fields(f)).toEqual(['iv.hp', 'iv.atk', 'iv.def', 'iv.spa', 'iv.spd', 'iv.spe']);
    expect(f[0].message).toBe('IVs imply Hidden Power Steel but the card shows Fighting.');
  });
  it('clears once the IV is corrected to 16', () => {
    const d = natu15(); d.ivs.spd = 16;
    expect(checkFlags(d, 'Fighting', list)).toEqual([]);
  });
  it('is case-insensitive and skipped without a card value', () => {
    expect(checkFlags(fromReader(mk(), list), 'fighting', list)).toEqual([]);
    expect(checkFlags(natu15(), null, list)).toEqual([]);
  });
});

describe('other client checks', () => {
  it('flags an unresolved species, but not while the list is still loading', () => {
    const d = fromReader(mk({ name: 'Zzzz' }), list);
    expect(fields(checkFlags(d, null, list))).toEqual(['species']);
    expect(checkFlags(d, null, [])).toEqual([]);
  });
  it('flags a missing IV and skips the hidden power check', () => {
    const d = fromReader(mk({ stats: { ...mk().stats, ATK: { stat: null, iv: null, ev: null } } }), list);
    expect(fields(checkFlags(d, 'Fighting', list))).toEqual(['iv.atk']);
  });
  it('enforces IV, EV, total EV and level limits', () => {
    const d = fromReader(mk(), list);
    expect(rangeFlags(d)).toEqual([]);
    d.ivs.atk = 32; d.level = 101;
    expect(fields(rangeFlags(d))).toEqual(['level', 'iv.atk']);
    d.ivs.atk = 30; d.level = 10; d.evs = { hp: 252, atk: 252, spe: 252 };
    expect(fields(rangeFlags(d))).toHaveLength(6); // total 756 flags all six EV fields
    d.evs = { hp: 253 };
    expect(fields(rangeFlags(d))).toEqual(['ev.hp']);
  });
  it('allFlags combines API flags and client checks', () => {
    const c = mk({ status: 'review', warnings: ['level missing'], stats: { ...mk().stats, SPDEF: stat(15) } });
    const f = allFlags(c, fromReader(c, list), list);
    expect(fields(f)).toContain('level');
    expect(fields(f).filter(x => x === 'iv.spd')).toHaveLength(1);
  });
});

describe('toShowdown', () => {
  const natu: Draft = { species: 'natu', level: 10, gender: 'F', shiny: false, nature: 'Bold', ability: 'Synchronize', ivs: { hp: 21, atk: 30, def: 26, spa: 18, spd: 16, spe: 22 }, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } };
  it('writes the documented format, omits the EVs line when all are zero', () => {
    expect(toShowdown(natu)).toBe('Natu (F)\nLevel: 10\nBold Nature\nAbility: Synchronize\nIVs: 21 HP / 30 Atk / 26 Def / 18 SpA / 16 SpD / 22 Spe');
  });
  it('writes shiny, only non-zero EVs, and no gender for genderless', () => {
    const t = toShowdown({ ...natu, gender: null, shiny: true, evs: { hp: 4, spe: 252 } });
    expect(t.split('\n').slice(0, 3)).toEqual(['Natu', 'Level: 10', 'Shiny: Yes']);
    expect(t).toContain('EVs: 4 HP / 252 Spe\n');
  });
  it('round trips through parsePaste', () => {
    for (const d of [
      { ...natu, shiny: true, evs: { hp: 4, atk: 0, spe: 252 } },
      { ...natu, species: 'mr-mime', gender: null as null, nature: 'Timid', ability: 'Soundproof' },
    ]) {
      const p = parsePaste(toShowdown(d))[0];
      expect(findSpecies(p.species, list)?.name).toBe(d.species);
      expect(p.level).toBe(d.level);
      expect(p.nature).toBe(d.nature);
      expect(p.ability).toBe(d.ability);
      expect(p.gender).toBe(d.gender ?? undefined);
      expect(p.shiny).toBe(d.shiny);
      expect(p.ivs).toEqual(d.ivs);
      expect(p.evs).toEqual(Object.fromEntries(Object.entries(d.evs).filter(([, v]) => v)));
      expect(p.warnings).toEqual([]);
    }
  });
});

describe('readerApi', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const file = () => new File(['x'], 'a.png', { type: 'image/png' });
  const hang = () => vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => { init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }));
  beforeEach(() => { vi.stubEnv('VITE_READER_URL', 'https://reader.test/pokemmo/'); vi.stubEnv('VITE_READER_API_KEY', ''); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('posts the file as multipart to /read_all with the ngrok header and no key', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ cards: [mk()] }));
    vi.stubGlobal('fetch', f);
    const cards = await readCards(file());
    expect(cards).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://reader.test/pokemmo/read_all');
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(init?.headers).toEqual({ 'ngrok-skip-browser-warning': '1' });
  });
  it('sends x-api-key only when configured', async () => {
    vi.stubEnv('VITE_READER_API_KEY', 'secret');
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ cards: [mk()] }));
    vi.stubGlobal('fetch', f);
    await readCards(file());
    expect(f.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'secret' });
  });
  it.each([[400, /open that file/], [401, /API key/], [413, /too big/], [500, /failed/], [503, /HTTP 503/]])('maps HTTP %i to a friendly message', async (status, msg) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'x' }, status)));
    await expect(readCards(file())).rejects.toMatchObject({ kind: 'http', status, message: expect.stringMatching(msg) });
  });
  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(readCards(file())).rejects.toMatchObject({ kind: 'network' });
  });
  it('reports an HTML answer (ngrok warning page) and an empty card list as bad responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>warning</html>', { status: 200 })));
    await expect(readCards(file())).rejects.toMatchObject({ kind: 'bad_response' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ cards: [] })));
    await expect(readCards(file())).rejects.toMatchObject({ kind: 'bad_response' });
  });
  it('fails clearly when the reader address is not set', async () => {
    vi.stubEnv('VITE_READER_URL', '');
    expect(readerConfigured()).toBe(false);
    await expect(readCards(file())).rejects.toMatchObject({ kind: 'config' });
  });
  it('can be cancelled by the caller', async () => {
    vi.stubGlobal('fetch', hang());
    const ctl = new AbortController();
    const p = expect(readCards(file(), ctl.signal)).rejects.toMatchObject({ kind: 'aborted' });
    ctl.abort();
    await p;
  });
  it('gives up after the 120 s timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang());
    const p = expect(readCards(file())).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await p;
  });
  it('health never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, pokemon_loaded: 649 })));
    expect(await health()).toEqual({ ok: true, pokemon_loaded: 649 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down'); }));
    expect(await health()).toMatchObject({ ok: false });
  });
});

describe('hard and soft flags (what blocks Save)', () => {
  it('splits what can be confirmed from what cannot', () => {
    const c = mk({ status: 'review', warnings: ['level missing'], stats: { ...mk().stats, SPDEF: stat(15) } });
    const d = fromReader(c, list);
    expect(hardFlags(d, list)).toEqual([]); // nothing the user could not fix by confirming
    const soft = softFlags(c, d);
    expect(fields(soft)).toContain('level');
    expect(fields(soft).filter(f => f === 'iv.spd')).toHaveLength(1); // the hidden power mismatch
  });
  it('treats no species, an unknown nature and a missing IV as hard', () => {
    const d = fromReader(mk({ name: 'Zzzz', nature: 'Weird', stats: { ...mk().stats, ATK: { stat: null, iv: null, ev: null } } }), list);
    expect(fields(hardFlags(d, list))).toEqual(['species', 'nature', 'iv.atk']);
  });
  it('treats an out-of-range value as hard', () => {
    const d = fromReader(mk(), list); d.ivs.hp = 40;
    expect(fields(hardFlags(d, list))).toEqual(['iv.hp']);
  });
});
