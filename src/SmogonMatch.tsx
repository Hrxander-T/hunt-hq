import { useState } from 'react';
import type { Caught, Hunt } from './types';
import { pretty, toId } from './lib';
import { formatInfo, type BuildMatch } from './smogon';
import ReqMatch from './ReqMatch';

type C = Pick<Caught, 'species' | 'nature' | 'ability' | 'shiny' | 'ivs'>;
export const matchLabel = (m: BuildMatch) => `${formatInfo(m.build.format).label}, ${m.build.name}`;

// Expanded view of how one catch compares with the Smogon builds of a generation (best match first).
export default function SmogonMatch({ c, matches, gen }: { c: C; matches: BuildMatch[]; gen: number }) {
  const [sel, setSel] = useState(0);
  const [all, setAll] = useState(false);
  const okN = matches.filter(m => m.res.ok).length;
  const cur = matches[sel] ?? matches[0];
  if (!cur) return null;
  const evolved = toId(cur.from) !== toId(c.species);
  return (
    <div className="smgm">
      <span className="lbl">Smogon builds, Gen {gen}: {okN} of {matches.length} matched</span>
      <div className="smgl" role="group" aria-label="Smogon builds, best match first">
        {(all ? matches : matches.slice(0, 5)).map((m, i) => (
          <button type="button" key={m.build.key} className={`smgb ${m.res.ok ? 'ok' : 'bad'}${i === sel ? ' on' : ''}`} aria-pressed={i === sel} onClick={() => setSel(i)}>
            <span>{matchLabel(m)}</span><small>{m.res.ok ? 'Matches' : `${m.res.count} ${m.res.count === 1 ? 'miss' : 'misses'}`}</small>
          </button>
        ))}
        {matches.length > 5 && <button type="button" className="small" onClick={() => { setAll(!all); setSel(0); }}>{all ? 'Show fewer' : `Show all ${matches.length}`}</button>}
      </div>
      <ReqMatch c={c} h={{ natures: cur.build.natures, abilities: cur.abilities } as unknown as Hunt} r={cur.res} />
      {evolved && <p className="muted">This set is written for {pretty(cur.from)}. Natures and IVs carry over when it evolves, and the ability is matched by slot.</p>}
    </div>
  );
}
