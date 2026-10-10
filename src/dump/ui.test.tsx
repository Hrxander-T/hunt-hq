import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Entry } from '../lib';
import type { ReaderCard, ReaderStat } from './readerApi';
import { DumpQueue, sha256Hex, type DumpItem } from './queue';
import { memoryStore } from './store';
import ReviewPane from './ReviewPane';

vi.mock('../supabase', () => ({ supabase: {} })); // the pane only talks to Supabase when Save is clicked

const list: Entry[] = [{ id: 177, name: 'natu' }];
const stat = (iv: number, ev = 0): ReaderStat => ({ stat: null, iv, ev });
const natu = (over: Partial<ReaderCard> = {}): ReaderCard => ({
  status: 'ok', name: 'Natu', level: 10, gender: 'F', shiny: false, ability: 'Synchronize', nature: 'Bold', hidden_power: 'Fighting', image: 'data:image/png;base64,AAA',
  stats: { HP: stat(21), ATK: stat(30), DEF: stat(26), SPD: stat(22), SPATK: stat(18), SPDEF: stat(16) }, warnings: [], ...over,
});
const q = new DumpQueue({ read: async () => [], store: memoryStore(), hash: sha256Hex, uid: () => 'x', now: () => 0 });
const item = (card: ReaderCard, over: Partial<DumpItem> = {}): DumpItem => ({
  id: 'i1', hash: 'h', name: 'a.png', blob: new File(['x'], 'a.png'), createdAt: 0, order: 1,
  status: card.status === 'ok' ? 'ready' : 'review', card, cardIndex: 0, cardCount: 1, confirmed: [], ...over,
});
const html = (it: DumpItem) => renderToStaticMarkup(<ReviewPane item={it} q={q} list={list} hunts={[]} caught={[]} me="me" onChanged={() => undefined} onAdvance={() => undefined} />);
const saveDisabled = (h: string) => /class="primary"[^>]*disabled/.test(h);

describe('review pane', () => {
  it('shows a clean card with Save enabled', () => {
    const h = html(item(natu()));
    expect(h).toContain('All checks passed');
    expect(h).toContain('value="natu"');
    expect(saveDisabled(h)).toBe(false);
  });
  it('highlights the uncertain stat with the API message and blocks Save (the Natu example)', () => {
    const w = "SPDEF row '15156000' has an extra digit; IV/EV could be any of [(15, 0), (16, 0)]";
    const h = html(item(natu({ status: 'review', warnings: [w], stats: { ...natu().stats, SPDEF: stat(15) } })));
    expect(h).toContain('extra digit');
    expect(h).toContain('IVs imply Hidden Power Steel but the card shows Fighting.');
    expect(h).toContain('flagf');
    expect(saveDisabled(h)).toBe(true);
    expect(h).toMatch(/\d+ to confirm or edit before saving/);
  });
  it('enables Save once every highlight is confirmed', () => {
    const w = "SPDEF row '15156000' has an extra digit; IV/EV could be any of [(15, 0), (16, 0)]";
    const c = natu({ status: 'review', warnings: [w], stats: { ...natu().stats, SPDEF: stat(15) } });
    const all = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].flatMap(k => [`iv.${k}`, `ev.${k}`]) as DumpItem['confirmed'];
    expect(saveDisabled(html(item(c, { confirmed: all })))).toBe(false);
    expect(saveDisabled(html(item(c, { confirmed: ['iv.spd', 'ev.spd'] })))).toBe(true); // the hidden power flag on the other IVs is still open
  });
  it('does not let a hard error be confirmed away', () => {
    const h = html(item(natu({ name: 'Zzzz' }), { confirmed: ['species'] }));
    expect(h).toContain('is not a known Pokémon');
    expect(h).toContain('hardf');
    expect(saveDisabled(h)).toBe(true);
  });
  it('requires acknowledging a general notice', () => {
    const c = natu({ status: 'review', warnings: ['something odd happened'] });
    expect(saveDisabled(html(item(c)))).toBe(true);
    expect(saveDisabled(html(item(c, { confirmed: ['notice'] })))).toBe(false);
  });
  it("uses the user's edits instead of the reader's values", () => {
    const edits = { species: 'natu', level: 42, gender: null, shiny: true, nature: 'Timid', ability: 'Early Bird', ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 }, evs: {} };
    const h = html(item(natu(), { edits }));
    expect(h).toContain('value="42"');
    expect(h).toContain('value="Early Bird"');
  });
  it('explains a failed read and offers Retry', () => {
    const h = html(item(natu(), { status: 'failed', error: 'Could not reach the reader.' }));
    expect(h).toContain('Could not reach the reader.');
    expect(h).toContain('Retry');
  });
  it('explains a screenshot with no card', () => {
    expect(html(item(natu({ status: 'not_found' }), { status: 'notfound' }))).toContain('No card found');
  });
});

describe('stat order', () => {
  it('lists the IV and EV rows in the order the card shows them: Atk, Def, Spe, SpA, SpD, HP', () => {
    const h = html(item(natu()));
    const at = ['Atk', 'Def', 'Spe', 'SpA', 'SpD', 'HP'].map(l => h.indexOf(`aria-label="${l} IV"`));
    expect(at.every(i => i > -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});
