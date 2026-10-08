// Downloads Smogon strategy-dex sets (as published by the pkmn project) into public/data/smogon/.
// Usage: npm run data:smogon            (gens 3-9)
//        npm run data:smogon -- --gens=9,8
// Source: https://pkmn.github.io/smogon/data/sets/gen9.json (change the number for other generations).
// The set data is copyrighted by Smogon University and its contributors; keep the attribution shown in the app.
import { mkdir, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const gens = (args.gens ?? '9,8,7,6,5,4,3').split(',').map(Number).filter(Boolean);
const dir = new URL('../public/data/smogon/', import.meta.url);
await mkdir(dir, { recursive: true });

const manifest = { source: 'https://pkmn.github.io/smogon/data/sets/', generated: new Date().toISOString(), gens: {} };
for (const g of gens) {
  const url = `https://pkmn.github.io/smogon/data/sets/gen${g}.json`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`gen${g}: HTTP ${res.status}, skipped`); continue; }
  const data = await res.json();

  // Upstream is unofficial and may change shape: verify { Species: { format: { "Set name": { moves: [...] } } } } before trusting it.
  let sets = 0, good = 0;
  for (const formats of Object.values(data)) for (const byName of Object.values(formats ?? {})) for (const s of Object.values(byName ?? {})) { sets++; if (Array.isArray(s?.moves)) good++; }
  if (sets < 20 || good / sets < 0.9) throw new Error(`gen${g}: unexpected structure (${good}/${sets} sets look valid). The upstream format may have changed.`);

  const text = JSON.stringify(data);
  await writeFile(new URL(`gen${g}.json`, dir), text);
  manifest.gens[g] = { bytes: text.length, species: Object.keys(data).length };
  console.log(`gen${g}: ${Object.keys(data).length} species, ${sets} sets, ${(text.length / 1024).toFixed(0)} KB`);
}
if (!Object.keys(manifest.gens).length) throw new Error('Nothing downloaded.');
await writeFile(new URL('manifest.json', dir), JSON.stringify(manifest, null, 2));
console.log('Wrote public/data/smogon/manifest.json');
