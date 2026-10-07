import type { Caught, Hunt } from './types';
import type { ReqResult } from './paste';
import { ivLabel, STATS } from './lib';

type C = Pick<Caught, 'nature' | 'ability' | 'shiny' | 'ivs'>;

export function ReqSummary({ r }: { r: ReqResult }) {
  const none = r.nature === 'na' && r.ability === 'na' && r.shiny === 'na' && !Object.keys(r.stats).length;
  return <span className={`rq ${none ? 'none' : r.ok ? 'ok' : 'bad'}`} title={r.misses.join('; ')}>{none ? 'No requirements' : r.ok ? 'Meets all requirements' : `${r.count} ${r.count === 1 ? 'miss' : 'misses'}`}</span>;
}

export default function ReqMatch({ c, h, r }: { c: C; h: Hunt; r: ReqResult }) {
  const chip = (label: string, val: string | null, state: 'na' | 'ok' | 'miss', wanted: string[]) => state === 'na' ? null : (
    <span className={`rchip ${state}`}><span><b>{label}</b> {val || 'unknown'}</span>{state === 'miss' && <small>wanted {wanted.join(' / ')}</small>}</span>
  );
  const hasStats = Object.keys(r.stats).length > 0;
  return (
    <div className="rmatch">
      <div className="rchips">
        {chip('Nature', c.nature, r.nature, h.natures ?? [])}
        {chip('Ability', c.ability, r.ability, h.abilities ?? [])}
        {r.shiny !== 'na' && <span className={`rchip ${r.shiny}`}>{r.shiny === 'ok' ? 'Shiny' : <><span>Not shiny</span><small>shiny wanted</small></>}</span>}
      </div>
      {hasStats && (
        <div className="ivm">{STATS.map(([k, l]) => {
          const s = r.stats[k], v = c.ivs?.[k];
          return <div key={k} className={`ivmc ${s ? (s.ok ? 'ok' : 'bad') : ''}`}><small>{l}</small><b>{v ?? '-'}</b><em>{s ? ivLabel(s.req) : ''}</em></div>;
        })}</div>
      )}
    </div>
  );
}
