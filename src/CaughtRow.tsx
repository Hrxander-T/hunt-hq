import { useState, type CSSProperties } from 'react';
import { supabase } from './supabase';
import type { Caught, Hunt, Profile, Reaction } from './types';
import { pretty, sprite, STATS, TYPE_COLORS } from './lib';
import { checkReqs, hiddenPower, ivTotal } from './paste';
import Avatar from './Avatar';

const KINDS: [string, string][] = [['congrats', 'Congrats'], ['ivs', 'Great IVs'], ['wow', 'Wow']];
export interface RowProps {
  c: Caught; hunt?: Hunt; people: Record<string, Profile>; me: string; admin: boolean; reactions: Reaction[];
  onChanged: () => void; onEdit: () => void;
}

export default function CaughtRow({ c, hunt, people, me, admin, reactions, onChanged, onEdit }: RowProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const owner = c.caught_by ? people[c.caught_by] : null;
  const chk = hunt ? checkReqs(c, hunt) : null;
  const canApprove = admin && (c.approved || !!chk?.ok);
  const canEdit = c.caught_by === me || admin;
  const hp = hiddenPower(c);
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else { setErr(''); onChanged(); } };
  const toggle = (kind: string) => {
    const mine = reactions.some(r => r.user_id === me && r.kind === kind);
    run(mine ? supabase.from('caught_reactions').delete().eq('caught_id', c.id).eq('user_id', me).eq('kind', kind)
             : supabase.from('caught_reactions').insert({ caught_id: c.id, kind }));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(c.paste ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr('Could not copy. Select the text manually.'); } };

  return (
    <div className={`crow${open ? ' open' : ''}`} style={{ '--tint': TYPE_COLORS[c.types[0]] ?? 'var(--line)' } as CSSProperties}>
      <button className="rowmain" aria-expanded={open} onClick={() => setOpen(!open)}>
        <img className="spr" src={sprite(c.pokemon_id, c.shiny)} alt="" loading="lazy" decoding="async" />
        <span className="nm"><b>{pretty(c.species)}</b><small>{[c.nickname, c.level && `Lv ${c.level}`, c.shiny && 'Shiny'].filter(Boolean).join(' · ')}</small></span>
        <span className={`gd ${c.gender ?? ''}`}>{c.gender ?? ''}</span>
        <span className="nat">{c.nature ?? '-'}</span>
        <span className="abl">{c.ability ?? '-'}</span>
        <span className="ivc">
          {STATS.map(([k, l]) => { const v = c.ivs?.[k]; return <i key={k} className={v === 31 ? 'max' : v === 0 ? 'zero' : ''}><small>{l}</small>{v ?? '-'}</i>; })}
          <em title="Total IVs">{ivTotal(c.ivs)}</em>
        </span>
        <span className="hpw" title="Hidden Power type">{hp ?? ''}</span>
        <span className="by">{owner?.name ?? ''}</span>
        <span className={`st${c.approved ? ' ok' : ''}`}>{c.approved ? 'Approved' : 'Pending'}{reactions.length > 0 && ` · ${reactions.length}`}</span>
      </button>
      {open && (
        <div className="cdetail">
          <div className="dgrid">
            <div><span className="lbl">Submitted by</span><span className="who">{owner && <Avatar name={owner.name} size={20} />}{owner?.name ?? 'Unknown'} · {new Date(c.created_at).toLocaleDateString()}</span></div>
            {hunt && chk && <div><span className="lbl">Linked hunt</span>{chk.ok ? <span className="okmsg">Meets all requirements</span> : <span className="warn">Misses: {chk.misses.join('; ')}</span>}</div>}
            <div><span className="lbl">React</span>
              <span className="reacts">{KINDS.map(([k, label]) => {
                const n = reactions.filter(r => r.kind === k).length, mine = reactions.some(r => r.user_id === me && r.kind === k);
                return <button key={k} className={`small ${mine ? 'on' : ''}`} aria-pressed={mine} onClick={() => toggle(k)}>{label}{n > 0 && ` ${n}`}</button>;
              })}</span>
            </div>
          </div>
          <div className="actions">
            {admin && <button className={c.approved ? '' : 'primary'} disabled={!canApprove} title={canApprove ? '' : hunt ? 'Does not meet the hunt requirements' : 'Link this catch to a hunt first'}
              onClick={() => run(supabase.rpc('approve_caught', { cid: c.id, on_off: !c.approved }))}>{c.approved ? 'Remove approval' : 'Approve'}</button>}
            {c.paste && <button onClick={copy}>{copied ? 'Copied' : 'Copy paste'}</button>}
            {canEdit && <button onClick={onEdit}>Edit</button>}
            {canEdit && <button className="ghost" onClick={() => { if (armed) run(supabase.from('caught').delete().eq('id', c.id)); else { setArmed(true); setTimeout(() => setArmed(false), 3500); } }}>{armed ? 'Confirm delete' : 'Delete'}</button>}
          </div>
          {admin && !c.approved && !canApprove && <p className="muted">{hunt ? 'Approval needs the requirements to be met.' : 'Link this catch to a hunt to approve it.'}</p>}
          {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
        </div>
      )}
    </div>
  );
}
