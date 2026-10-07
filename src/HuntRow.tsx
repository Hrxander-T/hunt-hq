import { useState, type CSSProperties } from 'react';
import type { Hunt, Profile } from './types';
import { pretty, sprite, TYPE_COLORS, ivSummary, natureText } from './lib';
import Avatar from './Avatar';

export interface HuntCounts { n: number; approved: number; linked: number }
interface Props {
  h: Hunt; people: Record<string, Profile>; me: string; caught?: HuntCounts;
  onStatus: () => void; onClaim: () => void; onEdit: () => void; onDelete: () => void; onCatches: () => void;
}
const NEXT = { planned: 'Start hunting', hunting: 'Mark as caught', caught: 'Move back to planned' } as const;

export default function HuntRow({ h, people, me, caught, onStatus, onClaim, onEdit, onDelete, onCatches }: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const hunter = h.hunter_id ? people[h.hunter_id] : null;
  const adder = h.added_by ? people[h.added_by] : null;
  const iv = ivSummary(h.iv_reqs ?? {});
  const req = [h.natures?.join(', '), h.abilities?.join(', '), iv.join(', ')].filter(Boolean).join('  ·  ');
  const n = caught?.n ?? 0, linked = caught?.linked ?? 0, target = h.target ?? 1, done = n >= target;

  return (
    <div className={`crow hrow ${h.status}${open ? ' open' : ''}`} style={{ '--tint': TYPE_COLORS[h.types[0]] ?? 'var(--line)' } as CSSProperties}>
      <button className="rowmain" aria-expanded={open} onClick={() => setOpen(!open)}>
        <img className="spr" src={sprite(h.pokemon_id, h.shiny)} alt="" loading="lazy" decoding="async" />
        <span className="nm"><b>{pretty(h.name)}{h.shiny && <span className="tiny">Shiny</span>}</b><small>{'★'.repeat(h.priority)} · {h.types.join(' / ')}</small></span>
        <span className="hreq" title={req}>{req || 'Any'}</span>
        <span className="hprog"><span className="meter"><span className={done ? 'full' : ''} style={{ width: `${Math.min(100, (n / target) * 100)}%` }} /></span><small>{n}/{target}</small></span>
        <span className="hwho">{hunter ? <><Avatar name={hunter.name} size={18} /> {hunter.name}</> : <span className="muted">Unclaimed</span>}</span>
        <span className={`st ${h.status}`}>{h.status}</span>
      </button>
      {open && (
        <div className="cdetail">
          <dl className="specs">
            {h.natures?.length > 0 && <div><dt>Nature</dt><dd>{h.natures.map(natureText).join(', ')}</dd></div>}
            {h.abilities?.length > 0 && <div><dt>Ability</dt><dd>{h.abilities.join(', ')}</dd></div>}
            {iv.length > 0 && <div><dt>IVs</dt><dd>{iv.join('  ·  ')}</dd></div>}
            <div><dt>Progress</dt><dd>{n} of {target} matching catches{caught?.approved ? ` (${caught.approved} approved)` : ''}{linked > n ? ` · ${linked - n} linked but not matching` : ''}{done ? ' · target reached' : ''}</dd></div>
          </dl>
          {h.notes && <p className="notes">{h.notes}</p>}
          <div className="people">
            {hunter ? <span className="who"><Avatar name={hunter.name} size={22} /> {hunter.id === me ? 'You are hunting this' : `${hunter.name} is hunting this`}</span> : <span className="muted">Nobody has claimed this yet</span>}
            {(!hunter || hunter.id === me) && <button className="ghost small" onClick={onClaim}>{hunter ? 'Release' : 'Claim'}</button>}
          </div>
          <div className="actions">
            <button className="primary" onClick={onStatus}>{done && h.status !== 'caught' ? 'Mark as caught' : NEXT[h.status]}</button>
            <button onClick={onCatches}>Catches{linked > 0 ? ` (${linked})` : ''}</button>
            <button onClick={onEdit}>Edit</button>
            <button className="ghost" onClick={() => { if (armed) onDelete(); else { setArmed(true); setTimeout(() => setArmed(false), 3500); } }}>{armed ? 'Confirm delete' : 'Delete'}</button>
          </div>
          {adder && <small className="muted">Added by {adder.name}</small>}
        </div>
      )}
    </div>
  );
}
