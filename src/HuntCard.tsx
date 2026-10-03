import { useState, type CSSProperties } from 'react';
import type { Hunt, Profile } from './types';
import { art, pretty, natureText, TYPE_COLORS } from './lib';

interface Props {
  h: Hunt; people: Record<string, Profile>; me: string;
  onBump: (d: number) => void; onStatus: () => void; onClaim: () => void; onEdit: () => void; onDelete: () => void;
}
const NEXT = { planned: 'Start hunting', hunting: 'Mark caught 🎉', caught: 'Back to planned' } as const;

export default function HuntCard({ h, people, me, onBump, onStatus, onClaim, onEdit, onDelete }: Props) {
  const [armed, setArmed] = useState(false);
  const color = TYPE_COLORS[h.types[0]] ?? '#9aa8c2';
  const hunter = h.hunter_id ? people[h.hunter_id] : null;
  const adder = h.added_by ? people[h.added_by] : null;
  const tags = [['Nature', natureText(h.nature)], ['Ability', h.ability], ['IVs', h.ivs]].filter(t => t[1]);
  return (
    <article className={`card ${h.status}`} style={{ '--tint': color } as CSSProperties}>
      <img className="art" src={art(h.pokemon_id, h.shiny)} alt={pretty(h.name)} loading="lazy" />
      <div className="top">
        <span className={`pill ${h.status}`}>{h.status}</span>
        <span className="stars" aria-label={`Priority ${h.priority}`}>{'★'.repeat(h.priority)}</span>
      </div>
      <h2>{h.shiny && <span title="Shiny hunt">✨ </span>}{pretty(h.name)}</h2>
      <div className="chips">{h.types.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}</div>
      {tags.length > 0 && <div className="tags">{tags.map(([k, v]) => <span key={k as string}><b>{k}</b> {v}</span>)}</div>}
      {h.notes && <p className="notes">{h.notes}</p>}
      <div className="counter">
        <button aria-label="Fewer attempts" onClick={() => onBump(-1)}>−</button>
        <strong>{h.attempts}</strong>
        <button aria-label="More attempts" onClick={() => onBump(1)}>+</button>
        <small>attempts</small>
      </div>
      <div className="people">
        <button className={hunter ? 'claimed' : ''} onClick={onClaim}>{hunter ? `${hunter.emoji} ${hunter.name} is on it${hunter.id === me ? ' (you)' : ''}` : "🙋 I'll hunt this"}</button>
        {adder && <small>added by {adder.name}</small>}
      </div>
      <div className="actions">
        <button className="primary" onClick={onStatus}>{NEXT[h.status]}</button>
        <button onClick={onEdit}>Edit</button>
        <button className="ghost" onClick={() => { if (armed) onDelete(); else { setArmed(true); setTimeout(() => setArmed(false), 3500); } }}>{armed ? 'Sure?' : 'Delete'}</button>
      </div>
    </article>
  );
}
