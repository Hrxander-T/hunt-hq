import { useState, type CSSProperties } from 'react';
import { supabase } from './supabase';
import type { Caught, Hunt, Profile, Reaction } from './types';
import { art, pretty, TYPE_COLORS, STATS, natureText } from './lib';
import { checkReqs } from './paste';
import Avatar from './Avatar';

const KINDS: [string, string][] = [['congrats', 'Congrats'], ['ivs', 'Great IVs'], ['wow', 'Wow']];
interface Props {
  c: Caught; hunt?: Hunt; people: Record<string, Profile>; me: string; admin: boolean; reactions: Reaction[];
  onChanged: () => void; onEdit: () => void;
}

export default function CaughtCard({ c, hunt, people, me, admin, reactions, onChanged, onEdit }: Props) {
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const owner = c.caught_by ? people[c.caught_by] : null;
  const canEdit = c.caught_by === me || admin;
  const chk = hunt ? checkReqs(c, hunt) : null;
  const canApprove = admin && (c.approved || !!chk?.ok);
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else { setErr(''); onChanged(); } };

  const toggle = (kind: string) => {
    const mine = reactions.some(r => r.user_id === me && r.kind === kind);
    run(mine ? supabase.from('caught_reactions').delete().eq('caught_id', c.id).eq('user_id', me).eq('kind', kind)
             : supabase.from('caught_reactions').insert({ caught_id: c.id, kind }));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(c.paste ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr('Could not copy. Select the text manually.'); } };
  const title = c.nickname ? `${c.nickname} (${pretty(c.species)})` : pretty(c.species);

  return (
    <article className="card" style={{ '--tint': TYPE_COLORS[c.types[0]] ?? '#9aa8c2' } as CSSProperties}>
      <div className="head">
        <img className="art" src={art(c.pokemon_id, c.shiny)} alt="" loading="lazy" />
        <div className="grow">
          <div className="meta">
            <span className={`pill ${c.approved ? 'caught' : ''}`}>{c.approved ? 'Approved' : 'Pending'}</span>
            {c.shiny && <span className="pill shiny">Shiny</span>}
            {c.level && <span className="muted">Level {c.level}</span>}
          </div>
          <h2>{title}</h2>
          <div className="chips left">{c.types.map(t => <span key={t} className="chip" style={{ background: TYPE_COLORS[t] }}>{t}</span>)}</div>
        </div>
      </div>
      <dl className="specs">
        {c.nature && <div><dt>Nature</dt><dd>{natureText(c.nature)}</dd></div>}
        {c.ability && <div><dt>Ability</dt><dd>{c.ability}</dd></div>}
        {c.item && <div><dt>Item</dt><dd>{c.item}</dd></div>}
      </dl>
      <ul className="ivs">{STATS.map(([k, l]) => { const v = c.ivs?.[k]; return <li key={k} className={v === 31 ? 'max' : v === 0 ? 'zero' : ''}><span>{l}</span><b>{v ?? '-'}</b></li>; })}</ul>
      {c.moves.length > 0 && <ul className="moves">{c.moves.map(m => <li key={m}>{m}</li>)}</ul>}
      {hunt && chk && (chk.ok ? <p className="okmsg">Meets the requirements of its hunt.</p> : <p className="warn">Misses: {chk.misses.join('; ')}.</p>)}
      <div className="reacts">{KINDS.map(([k, label]) => {
        const n = reactions.filter(r => r.kind === k).length, mine = reactions.some(r => r.user_id === me && r.kind === k);
        return <button key={k} className={`small ${mine ? 'on' : ''}`} aria-pressed={mine} onClick={() => toggle(k)}>{label}{n > 0 && ` ${n}`}</button>;
      })}</div>
      <div className="people">
        <span className="who">{owner && <Avatar name={owner.name} size={22} />} {owner?.name ?? 'Unknown'} <span className="muted">· {new Date(c.created_at).toLocaleDateString()}</span></span>
        {c.paste && <button className="ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy paste'}</button>}
      </div>
      {admin && (
        <div className="actions">
          <button className={c.approved ? '' : 'primary'} disabled={!canApprove} title={canApprove ? '' : hunt ? 'Does not meet the hunt requirements' : 'Link this catch to a hunt first'}
            onClick={() => run(supabase.rpc('approve_caught', { cid: c.id, on_off: !c.approved }))}>{c.approved ? 'Remove approval' : 'Approve'}</button>
          {!c.approved && !canApprove && <small className="muted">{hunt ? 'Requirements not met' : 'Not linked to a hunt'}</small>}
        </div>
      )}
      {canEdit && (
        <div className="actions">
          <button onClick={onEdit}>Edit</button>
          <button className="ghost" onClick={() => { if (armed) run(supabase.from('caught').delete().eq('id', c.id)); else { setArmed(true); setTimeout(() => setArmed(false), 3500); } }}>{armed ? 'Confirm delete' : 'Delete'}</button>
        </div>
      )}
      {err && <p className="err" onClick={() => setErr('')}>{err}</p>}
    </article>
  );
}
