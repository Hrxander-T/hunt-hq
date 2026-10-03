import { useState, type CSSProperties } from 'react';
import type { Hunt, Profile } from './types';
import { art, pretty, TYPE_COLORS, ivSummary, natureText } from './lib';
import Avatar from './Avatar';

interface Props {
  h: Hunt; people: Record<string, Profile>; me: string;
  onStatus: () => void; onClaim: () => void; onEdit: () => void; onDelete: () => void;
}
const NEXT = { planned: 'Start hunting', hunting: 'Mark as caught', caught: 'Move back to planned' } as const;

export default function HuntCard({ h, people, me, onStatus, onClaim, onEdit, onDelete }: Props) {
  const [armed, setArmed] = useState(false);
  const hunter = h.hunter_id ? people[h.hunter_id] : null;
  const adder = h.added_by ? people[h.added_by] : null;
  const iv = ivSummary(h.iv_reqs ?? {});
  const specs: [string, string][] = [];
  if (h.natures?.length) specs.push(['Nature', h.natures.map(natureText).join(', ')]);
  if (h.abilities?.length) specs.push(['Ability', h.abilities.join(', ')]);
  if (iv.length) specs.push(['IVs', iv.join('  ·  ')]);

  return (
    <article className={`card ${h.status}`} style={{ '--tint': TYPE_COLORS[h.types[0]] ?? '#9aa8c2' } as CSSProperties}>
      <div className="head">
        <img className="art" src={art(h.pokemon_id, h.shiny)} alt="" loading="lazy" />
        <div className="grow">
          <div className="meta">
            <span className={`pill ${h.status}`}>{h.status}</span>
            {h.shiny && <span className="pill shiny">Shiny</span>}
            <span className="stars" aria-label={`Priority ${h.priority} of 3`}>{'★'.repeat(h.priority)}</span>
          </div>
          <h2>{pretty(h.name)}</h2>
          <div className="chips left">{h.types.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}</div>
        </div>
      </div>
      {specs.length > 0 && <dl className="specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {h.notes && <p className="notes">{h.notes}</p>}
      <div className="people">
        {hunter ? <span className="who"><Avatar name={hunter.name} size={22} /> {hunter.id === me ? 'You are hunting this' : `${hunter.name} is hunting this`}</span>
          : <span className="muted">Nobody has claimed this yet</span>}
        {(!hunter || hunter.id === me) && <button className="ghost small" onClick={onClaim}>{hunter ? 'Release' : 'Claim'}</button>}
      </div>
      <div className="actions">
        <button className="primary" onClick={onStatus}>{NEXT[h.status]}</button>
        <button onClick={onEdit}>Edit</button>
        <button className="ghost" onClick={() => { if (armed) onDelete(); else { setArmed(true); setTimeout(() => setArmed(false), 3500); } }}>{armed ? 'Confirm delete' : 'Delete'}</button>
      </div>
      {adder && <small className="muted">Added by {adder.name}</small>}
    </article>
  );
}
