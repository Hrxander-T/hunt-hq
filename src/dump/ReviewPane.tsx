import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import type { Caught, Hunt, StatKey } from '../types';
import { art, details, natureText, NATURES, pretty, STATS, type Entry } from '../lib';
import { checkReqs, findSpecies, parsePaste } from '../paste';
import { buildCatchPayload } from '../catchPayload';
import ReqMatch, { ReqSummary } from '../ReqMatch';
import { fromReader, hardFlags, softFlags, toShowdown, type Draft, type FieldId, type Flag } from './mapping';
import { itemLabel, type ConfirmKey, type DumpItem, type DumpQueue } from './queue';

export interface PaneProps {
  item: DumpItem; q: DumpQueue; list: Entry[]; hunts: Hunt[]; caught: Caught[]; me: string;
  onChanged: () => void; onAdvance: (id: string) => void;
}

// The uploaded screenshot, with the rectangle the reader cut the card from (detect.box is in the screenshot's own pixels).
function Original({ url, box }: { url: string; box?: [number, number, number, number] }) {
  const [dim, setDim] = useState<[number, number] | null>(null);
  return (
    <div className="dorig">
      <img src={url} alt="The uploaded screenshot" onLoad={e => setDim([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
      {dim && box && <span className="dbox" style={{ left: `${(box[0] / dim[0]) * 100}%`, top: `${(box[1] / dim[1]) * 100}%`, width: `${(box[2] / dim[0]) * 100}%`, height: `${(box[3] / dim[1]) * 100}%` }} />}
    </div>
  );
}

const Msgs = ({ hard, soft }: { hard: string[]; soft: string[] }) => <>{hard.map(m => <p key={m} className="fmsg hard">{m}</p>)}{soft.map(m => <p key={m} className="fmsg">{m}</p>)}</>;
// The rows follow the order the card shows its stats in: Attack, Defense, Speed, Sp. Atk, Sp. Def, HP.
const CARD_ORDER: StatKey[] = ['atk', 'def', 'spe', 'spa', 'spd', 'hp'];
const STAT_ROWS = CARD_ORDER.map(k => STATS.find(([x]) => x === k)!);
const rowOf = (f: FieldId) => (f.startsWith('iv.') || f.startsWith('ev.') ? `stat.${f.slice(3)}` : f); // IV and EV of one stat are checked together

function Editor({ item, q, list, hunts, caught, me, onChanged, onAdvance }: PaneProps) {
  const card = item.card!;
  const draft = useMemo<Draft>(() => item.edits ?? fromReader(card, list), [item.edits, card, list]);
  const e = useMemo(() => (list.length ? findSpecies(draft.species, list) : undefined), [draft.species, list]);
  const [abilities, setAbilities] = useState<string[]>([]);
  const [zoom, setZoom] = useState(false);
  const [orig, setOrig] = useState(false);
  const eid = e?.id;
  useEffect(() => {
    let off = false; setAbilities([]);
    if (eid) details(eid).then(d => { if (!off) setAbilities(d.abilities.map((a: { name: string }) => a.name)); }).catch(() => undefined);
    return () => { off = true; };
  }, [eid]);

  // ---- what is uncertain ----
  const confirmed = item.confirmed;
  const done = (k: ConfirmKey) => confirmed.includes(k);
  const hard = useMemo(() => hardFlags(draft, list), [draft, list]); // never clearable
  const soft = useMemo(() => softFlags(card, draft), [card, draft]);
  const active = soft.filter((f): f is Flag & { field: FieldId } => f.field !== null && !f.info && !done(f.field));
  const notices = soft.filter(f => f.field === null && !f.info);
  const infos = soft.filter(f => f.info);
  const noticeOpen = notices.length > 0 && !done('notice');
  const todo = new Set<string>([...active.map(f => rowOf(f.field)), ...(noticeOpen ? ['notice'] : [])]).size;
  const blocked = hard.length > 0 || todo > 0 || !e;
  const msgsFor = (fields: FieldId[]) => {
    const uniq = (fl: Flag[]) => [...new Set(fl.filter(f => f.field !== null && fields.includes(f.field)).map(f => f.message))];
    return { hard: uniq(hard), soft: uniq(active) };
  };

  // ---- editing: changing a value counts as having checked it ----
  const confirm = (keys: ConfirmKey[]) => q.update(item.id, { confirmed: [...new Set([...confirmed, ...keys])] });
  const change = (patch: Partial<Draft>, keys: ConfirmKey[]) => q.update(item.id, { edits: { ...draft, ...patch }, confirmed: [...new Set([...confirmed, ...keys])] });
  const setStat = (kind: 'ivs' | 'evs', k: StatKey, raw: string) => {
    const next = { ...draft[kind] };
    if (raw === '') delete next[k]; else next[k] = Number(raw);
    change({ [kind]: next } as Partial<Draft>, [`iv.${k}`, `ev.${k}`]);
  };

  // ---- hunt link (same logic as SubmitCatch) ----
  const options = e ? hunts.filter(h => h.pokemon_id === e.id) : [];
  const suggested = options.find(h => h.status !== 'caught') ?? options[0];
  const hunt = options.find(h => h.id === (item.huntId !== undefined ? item.huntId ?? '' : suggested?.id ?? '')); // a hunt of another species is ignored
  const chk = hunt ? checkReqs({ nature: draft.nature, ability: draft.ability, shiny: draft.shiny, ivs: draft.ivs }, hunt) : null;
  const dup = e ? caught.find(c => c.caught_by === me && c.pokemon_id === e.id && c.nature === draft.nature && STATS.every(([k]) => c.ivs?.[k] === draft.ivs[k])) : undefined;
  const evTotal = STATS.reduce((a, [k]) => a + (draft.evs[k] ?? 0), 0);

  const save = async () => {
    if (blocked || !e || item.saving || !q.beginSave(item.id)) return; // beginSave makes a double click or a second shortcut harmless
    try {
      const parsed = parsePaste(toShowdown(draft))[0]; // the paste is what the Edit flow in Caught re-reads, so it is the single source for the row
      if (!parsed) throw new Error('Could not build the Showdown paste for this Pokémon.');
      const { data, error } = await supabase.from('caught').insert(await buildCatchPayload(e, parsed, hunt?.id ?? null)).select('id').single();
      if (error) throw error;
      q.finishSave(item.id, (data as { id: string }).id);
      onChanged(); onAdvance(item.id);
    } catch (err) { q.failSave(item.id, (err as { message?: string }).message ?? 'Could not save.'); }
  };
  const skip = () => { if (!item.saving) { q.skip(item.id); onAdvance(item.id); } };
  useEffect(() => { // Ctrl+Enter saves and moves on, Esc skips (closes the zoom first). Plain Enter is not bound: it would fire inside the inputs.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); void save(); }
      else if (ev.key === 'Escape') { if (zoom) setZoom(false); else skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const box = (label: string, fields: FieldId[], control: ReactNode) => {
    const m = msgsFor(fields), flagged = m.soft.length > 0;
    return (
      <div className={`field${m.hard.length ? ' hardf' : flagged ? ' flagf' : ''}`}>
        <span className="lbl">{label}</span>
        <div className="fctl">{control}{flagged && <button type="button" className="tick small" aria-label={`${label} is right`} title="I checked it, it is right" onClick={() => confirm(fields)}>✓ Right</button>}</div>
        <Msgs {...m} />
      </div>
    );
  };
  const url = q.originalUrl(item.id);

  return (
    <div className="dreview">
      <div className="dimg">
        <div className="seg" role="group" aria-label="Which image">
          <button className={!orig ? 'on' : ''} onClick={() => setOrig(false)}>Card</button>
          <button className={orig ? 'on' : ''} onClick={() => setOrig(true)}>Original screenshot</button>
        </div>
        {orig && url ? <Original url={url} box={card.detect?.box} />
          : card.image ? <img className="crop" src={card.image} alt="The card the reader looked at" title="Click to zoom" onClick={() => setZoom(true)} />
          : <p className="muted">No image was returned.</p>}
        <p className="muted">{itemLabel(item)}{card.detect ? ` · card match ${Math.round(card.detect.score * 100)}%` : ''}</p>
      </div>

      <div className="dform">
        {notices.length > 0 && (
          <div className="notice">
            {notices.map(f => <p key={f.message} className="fmsg">{f.message}</p>)}
            {noticeOpen ? <button className="small" onClick={() => confirm(['notice'])}>I checked this</button> : <span className="okmsg">Checked</span>}
          </div>
        )}
        {infos.map(f => <p key={f.message} className="muted">{f.message}</p>)}
        {notices.length === 0 && infos.length === 0 && soft.length === 0 && hard.length === 0 && <p className="okmsg">All checks passed. Have a quick look before saving.</p>}

        {box('Pokémon', ['species'], <>{e && <img className="art sm" src={art(e.id, draft.shiny)} alt="" />}<input list="dump-species" aria-label="Pokémon" value={draft.species} onChange={ev => change({ species: ev.target.value }, ['species'])} /></>)}
        <div className="grid2">
          {box('Level', ['level'], <input type="number" inputMode="numeric" min={1} max={100} aria-label="Level" value={draft.level ?? ''} onChange={ev => change({ level: ev.target.value === '' ? null : Number(ev.target.value) }, ['level'])} />)}
          {box('Gender', ['gender'], (
            <div className="seg" role="group" aria-label="Gender">
              {([['M', 'Male'], ['F', 'Female'], [null, 'None']] as const).map(([g, l]) => <button key={l} className={draft.gender === g ? 'on' : ''} onClick={() => change({ gender: g }, ['gender'])}>{l}</button>)}
            </div>
          ))}
        </div>
        <label className="switch"><input type="checkbox" checked={draft.shiny} onChange={ev => change({ shiny: ev.target.checked }, [])} /><span className="track" /> Shiny</label>
        <div className="grid2">
          {box('Nature', ['nature'], (
            <select aria-label="Nature" value={draft.nature ?? ''} onChange={ev => change({ nature: ev.target.value || null }, ['nature'])}>
              <option value="">(unknown)</option>
              {draft.nature && !(draft.nature in NATURES) && <option value={draft.nature}>{draft.nature}</option>}
              {Object.keys(NATURES).map(n => <option key={n} value={n}>{natureText(n)}</option>)}
            </select>
          ))}
          {box('Ability', ['ability'], <input list="dump-ability" aria-label="Ability" value={draft.ability ?? ''} onChange={ev => change({ ability: ev.target.value || null }, ['ability'])} />)}
        </div>
        <datalist id="dump-ability">{abilities.map(a => <option key={a} value={a} />)}</datalist>

        <div className="field">
          <span className="lbl">IVs and EVs <small className="muted">EVs {evTotal} / 510</small></span>
          <div className="srow shead"><span /><span className="lbl">IV (0-31)</span><span className="lbl">EV (0-252)</span><span /></div>
          {STAT_ROWS.map(([k, l]) => {
            const ids: FieldId[] = [`iv.${k}`, `ev.${k}`], m = msgsFor(ids), flagged = m.soft.length > 0;
            return (
              <div key={k} className={m.hard.length ? 'hardf' : flagged ? 'flagf' : ''}>
                <div className="srow">
                  <span className="ivl">{l}</span>
                  <input type="number" inputMode="numeric" min={0} max={31} aria-label={`${l} IV`} value={draft.ivs[k] ?? ''} onChange={ev => setStat('ivs', k, ev.target.value)} />
                  <input type="number" inputMode="numeric" min={0} max={252} aria-label={`${l} EV`} value={draft.evs[k] ?? ''} onChange={ev => setStat('evs', k, ev.target.value)} />
                  {flagged ? <button type="button" className="tick small" aria-label={`${l} is right`} title="I checked it, it is right" onClick={() => confirm(ids)}>✓ Right</button> : <span />}
                </div>
                <Msgs {...m} />
              </div>
            );
          })}
        </div>

        {e && (
          <label className="field"><span className="lbl">Link to a hunt (counts toward its target when the requirements are met)</span>
            <select value={hunt?.id ?? ''} onChange={ev => q.update(item.id, { huntId: ev.target.value || null })}>
              <option value="">Do not link</option>
              {options.map(h => <option key={h.id} value={h.id}>{pretty(h.name)} hunt ({h.status})</option>)}
            </select>
            {options.length === 0 && <small className="hint">There is no hunt for this Pokémon on the list.</small>}
          </label>
        )}
        {chk && hunt && <>
          <span className="lbl">Against the linked hunt: <ReqSummary r={chk} /></span>
          <ReqMatch c={{ nature: draft.nature, ability: draft.ability, shiny: draft.shiny, ivs: draft.ivs }} h={hunt} r={chk} />
        </>}
        {dup && <p className="warn">You already have a {pretty(dup.species)} with the same nature and IVs in Caught ({new Date(dup.created_at).toLocaleDateString()}). Save it only if this is a different one.</p>}

        {item.saveError && <p className="err">{item.saveError}</p>}
        <div className="foot">
          <span className="muted grow">{blocked ? (todo > 0 ? `${todo} to confirm or edit before saving` : hard.length > 0 ? 'Fix the red fields before saving' : '') : 'Ctrl+Enter saves · Esc skips'}</span>
          <button onClick={skip} disabled={item.saving}>Skip</button>
          <button className="primary" disabled={blocked || item.saving} onClick={() => void save()}>{item.saving ? 'Saving…' : 'Save & next'}</button>
        </div>
      </div>
      {zoom && card.image && <div className="overlay dzoom" role="dialog" aria-label="Card, zoomed" onClick={() => setZoom(false)}><img src={card.image} alt="" /></div>}
    </div>
  );
}

// Everything that is not "ready for review": waiting, reading, failed, nothing found, skipped, saved.
function StatePane({ item, q, onAdvance }: PaneProps) {
  const s = item.status, url = q.originalUrl(item.id);
  const act = (fn: () => void) => () => { fn(); };
  const remove = () => { onAdvance(item.id); q.remove(item.id); };
  const text: Record<string, string> = {
    queued: 'Waiting for its turn.',
    reading: 'Reading the card. This takes a second or two, but over a minute if the reader PC is off.',
    failed: item.error ?? 'Reading failed.',
    notfound: item.card?.warnings?.[0] ?? 'No card found in this screenshot. Try a clearer or larger one.',
    skipped: 'Skipped.',
    saved: `Saved to Caught${item.card?.name ? `: ${item.card.name}` : ''}.`,
  };
  return (
    <div className="dreview one">
      <div className="dimg">
        {url && s !== 'saved' && <Original url={url} />}
        {s === 'saved' && item.card?.image && <img className="crop" src={item.card.image} alt="" />}
      </div>
      <div className="dform">
        <p className={s === 'failed' || s === 'notfound' ? 'err' : s === 'saved' ? 'okmsg' : 'muted'}>{text[s]}</p>
        <p className="muted">{itemLabel(item)}</p>
        <div className="actions">
          {(s === 'queued' || s === 'reading') && <button onClick={act(() => q.cancel(item.id))}>Cancel</button>}
          {s === 'failed' && <button className="primary" onClick={act(() => q.retry(item.id))}>Retry</button>}
          {(s === 'failed' || s === 'notfound') && <button onClick={() => { q.skip(item.id); onAdvance(item.id); }}>Skip</button>}
          {s === 'skipped' && <button className="primary" onClick={act(() => q.reopen(item.id))}>Bring back</button>}
          <button className="ghost" onClick={remove}>Remove from queue</button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewPane(p: PaneProps) {
  return p.item.card && (p.item.status === 'ready' || p.item.status === 'review') ? <Editor {...p} /> : <StatePane {...p} />;
}
