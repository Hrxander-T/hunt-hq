import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Caught, Hunt, Profile } from './types';
import { ivSummary, pretty, sprite } from './lib';
import { checkReqs, type ReqResult } from './paste';
import ReqMatch, { ReqSummary } from './ReqMatch';

interface Props { hunt: Hunt; caught: Caught[]; people: Record<string, Profile>; me: string; admin: boolean; onClose: () => void; onChanged: () => void }

export default function HuntCatches({ hunt, caught, people, me, admin, onClose, onChanged }: Props) {
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const linked = caught.filter(c => c.hunt_id === hunt.id);
  const cands = caught.filter(c => c.pokemon_id === hunt.pokemon_id && !c.hunt_id)
    .map(c => ({ c, chk: checkReqs(c, hunt) })).sort((a, b) => Number(b.chk.ok) - Number(a.chk.ok));
  const reqs = [hunt.natures?.length ? `Nature: ${hunt.natures.join(' / ')}` : '', hunt.abilities?.length ? `Ability: ${hunt.abilities.join(' / ')}` : '',
    ivSummary(hunt.iv_reqs ?? {}).length ? `IVs: ${ivSummary(hunt.iv_reqs ?? {}).join(', ')}` : '', hunt.shiny ? 'Shiny' : ''].filter(Boolean);

  const setLink = async (c: Caught, id: string | null) => {
    const { error } = await supabase.from('caught').update({ hunt_id: id }).eq('id', c.id);
    if (error) setErr(error.message); else { setErr(''); setArmed(''); onChanged(); }
  };
  const matching = linked.filter(c => checkReqs(c, hunt).ok).length;
  const canEdit = (c: Caught) => c.caught_by === me || admin;

  const rowOf = (c: Caught, chk: ReqResult, link: boolean) => (
    <div className="lrow" key={c.id}>
      <img className="spr" src={sprite(c.pokemon_id, c.shiny)} alt="" loading="lazy" />
      <div className="linfo">
        <b>{people[c.caught_by ?? '']?.name ?? 'Unknown'}{c.gender ? ` · ${c.gender}` : ''}{c.shiny ? ' · Shiny' : ''}{c.approved ? ' · Approved' : ''}</b>
        <ReqSummary r={chk} />
      </div>
      {canEdit(c)
        ? link
          ? <button className="small primary" onClick={() => setLink(c, hunt.id)}>Link</button>
          : <button className="small ghost" onClick={() => { if (!c.approved || armed === c.id) setLink(c, null); else setArmed(c.id); }}>{armed === c.id ? 'Remove approval and unlink' : 'Unlink'}</button>
        : <span />}
      <ReqMatch c={c} h={hunt} r={chk} />
    </div>
  );

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet wide">
        <h2>{pretty(hunt.name)} catches</h2>
        <p className="muted">{reqs.length ? `Requirements: ${reqs.join('  |  ')}` : 'No specific requirements.'}</p>
        <h3>Linked: {matching} of {hunt.target ?? 1} needed match ({linked.length} linked)</h3>
        {linked.length ? linked.map(c => rowOf(c, checkReqs(c, hunt), false)) : <p className="empty small">Nothing linked yet.</p>}
        <h3>Unlinked {pretty(hunt.name)} in the Caught list ({cands.length})</h3>
        {cands.length ? cands.map(x => rowOf(x.c, x.chk, true)) : <p className="empty small">No unlinked catches of this Pokémon.</p>}
        <p className="muted">Only linked catches that meet the requirements count toward the target. Changing a link removes the catch's approval so it is checked again.</p>
        {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
        <div className="foot"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
