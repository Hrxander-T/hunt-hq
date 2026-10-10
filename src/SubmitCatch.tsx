import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Caught, Hunt } from './types';
import { art, loadList, pretty, STATS, type Entry } from './lib';
import { checkReqs, findSpecies, parsePaste } from './paste';
import { buildCatchPayload } from './catchPayload';
import ReqMatch, { ReqSummary } from './ReqMatch';

interface Props { hunts: Hunt[]; editing?: Caught; onClose: () => void; onDone: () => void }

export default function SubmitCatch({ hunts, editing, onClose, onDone }: Props) {
  const [list, setList] = useState<Entry[]>([]);
  const [text, setText] = useState(editing?.paste ?? '');
  const [fix, setFix] = useState<Record<number, string>>({});
  const [links, setLinks] = useState<Record<number, string>>(editing ? { 0: editing.hunt_id ?? '' } : {});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadList().then(setList); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const rows = useMemo(() => parsePaste(text).slice(0, editing ? 1 : 12).map((p, i) => {
    const e = list.length ? findSpecies(fix[i] ?? p.species, list) : undefined;
    const options = e ? hunts.filter(h => h.pokemon_id === e.id) : [];
    const suggested = options.find(h => h.status !== 'caught') ?? options[0];
    const link = links[i] !== undefined ? links[i] : suggested?.id ?? '';
    const hunt = options.find(h => h.id === link);
    const check = hunt ? checkReqs({ nature: p.nature ?? null, ability: p.ability ?? null, shiny: p.shiny, ivs: p.ivs }, hunt) : null;
    return { p, e, options, link, check, hunt };
  }), [text, list, fix, links, hunts, editing]);

  const ready = rows.length > 0 && rows.every(r => r.e);
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const payload = await Promise.all(rows.map(r => buildCatchPayload(r.e!, r.p, r.link)));
      const { error } = editing
        ? await supabase.from('caught').update(payload[0]).eq('id', editing.id)
        : await supabase.from('caught').insert(payload);
      if (error) throw error;
      onDone();
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Could not save.'); }
    setBusy(false);
  };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>{editing ? 'Edit catch' : 'Submit a catch'}</h2>
        <label className="field"><span className="lbl">Paste from Pokémon Showdown format{editing ? '' : ' (you can paste several, separated by a blank line)'}</span>
          <textarea className="paste" rows={8} autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={'Natu\nLevel: 44\nCareful Nature\nAbility: Synchronize\nIVs: 21 HP / 30 Atk / 26 Def / 18 SpA / 6 SpD / 22 Spe\n- Wish\n- Psychic'} />
        </label>

        {text.trim() && rows.length === 0 && <p className="err">Could not find a Pokémon in that text. The first line should be the species name.</p>}
        {rows.map((r, i) => (
          <div className="prev" key={i}>
            <div className="head">
              {r.e ? <img className="art sm" src={art(r.e.id, r.p.shiny)} alt="" /> : <div className="art sm" />}
              <div className="grow">
                <strong>{r.p.nickname ? `${r.p.nickname} (${pretty(r.e?.name ?? r.p.species)})` : pretty(r.e?.name ?? r.p.species)}</strong>
                <div className="muted">{[r.p.level && `Level ${r.p.level}`, r.p.gender && (r.p.gender === 'M' ? 'Male' : 'Female'), r.p.nature && `${r.p.nature} nature`, r.p.ability, r.p.item, r.p.shiny && 'Shiny'].filter(Boolean).join(' · ')}</div>
                <div className="muted">{STATS.map(([k, l]) => `${l} ${r.p.ivs[k]}`).join(' / ')}</div>
              </div>
            </div>
            {list.length > 0 && !r.e && (
              <label className="field"><span className="lbl">Species "{r.p.species}" was not recognised. Type the Pokémon name:</span>
                <input list="species" value={fix[i] ?? ''} onChange={e => setFix({ ...fix, [i]: e.target.value })} /></label>
            )}
            {r.p.warnings.map(w => <p key={w} className="warn">{w}</p>)}
            {r.e && (
              <label className="field"><span className="lbl">Link to a hunt (counts toward its target when the requirements are met)</span>
                <select value={r.link} onChange={e => setLinks({ ...links, [i]: e.target.value })}>
                  <option value="">Do not link</option>
                  {r.options.map(h => <option key={h.id} value={h.id}>{pretty(h.name)} hunt ({h.status})</option>)}
                </select>
                {r.options.length === 0 && <small className="hint">There is no hunt for this Pokémon on the list.</small>}
              </label>
            )}
            {r.check && r.hunt && <>
              <span className="lbl">Against the linked hunt: <ReqSummary r={r.check} /></span>
              <ReqMatch c={{ nature: r.p.nature ?? null, ability: r.p.ability ?? null, shiny: r.p.shiny, ivs: r.p.ivs }} h={r.hunt} r={r.check} />
            </>}
          </div>
        ))}
        <datalist id="species">{list.map(e => <option key={e.id} value={e.name} />)}</datalist>
        {msg && <p className="err">{msg}</p>}
        <div className="foot"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save changes' : rows.length > 1 ? `Submit ${rows.length} catches` : 'Submit catch'}</button></div>
      </div>
    </div>
  );
}
