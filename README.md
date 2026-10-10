# Hunt HQ

A shared Pokémon hunt list for your team. React + Vite + TypeScript, Supabase for the database, logins and realtime sync, PokéAPI for Pokémon data and artwork.

## Setup
1. Create a project at supabase.com.
2. **SQL Editor**: paste and run `supabase/schema.sql`.
3. **Authentication > Providers**: keep Email on (magic links).
4. **Lock down who can join** (recommended): Authentication > Sign In / Providers, turn off "Allow new users to sign up", then invite teammates under Authentication > Users > Invite. Otherwise anyone with the URL and an email can join, because every signed-in user can edit the list.
5. **Authentication > URL Configuration**: set Site URL to your deployed URL and add `http://localhost:5173` to Redirect URLs.
6. `cp .env.example .env` and fill in the Project URL and anon key (Settings > API).
7. `npm install && npm run dev`

## Deploy
Any static host works (Vercel, Netlify, Cloudflare Pages). Build command `npm run build`, output `dist`. Add the two `VITE_` variables in the host's settings.

## Where things live
- `src/Board.tsx`: data loading, realtime refresh, filters, actions
- `src/HuntCard.tsx`: the card UI. `src/HuntForm.tsx`: add/edit with the Pokémon picker
- `src/lib.ts`: PokéAPI calls (cached in localStorage), natures, type colours, type colours, natures
- `supabase/schema.sql`: tables, row-level security, atomic attempts counter

## Ideas to build next
Per-game lists, comments and reactions per card, avatar/emoji picker (profiles.emoji already exists), Discord webhook when something is caught, shiny-charm and Masuda odds, move and EV planner, PWA install.

## Access control: invite codes + admin
Everyone has their own account. You (the admin) create one-time invite codes in the Admin panel; a teammate redeems a code with their email, a username and their own password. You can turn any account off/on or delete it.
1. Run `supabase/migration-invites.sql` in the SQL Editor (put your admin email in the last line first).
2. Make sure your admin account exists: Authentication > Users > Add user (tick auto-confirm), same email as in the SQL.
3. Deploy the edge function: `supabase functions deploy redeem-invite --no-verify-jwt` (or paste `supabase/functions/redeem-invite/index.ts` into Dashboard > Edge Functions). No extra secrets needed.
4. Keep "Allow new users to sign up" OFF in Supabase. Accounts are created only through invite codes.
5. Forgot a password? Authentication > Users > the user > Send password recovery, or set a new one there.

## Caught history
Run `supabase/migration-caught.sql` once (after `migration-v2.sql`). Members paste Pokémon Showdown sets on the Caught tab; entries can be linked to a hunt (which raises that hunt's caught count), receive reactions, and be approved by the admin when they meet the hunt's requirements.

## Quantity targets and hunt catches
Run `supabase/migration-target.sql` once. Each hunt has a quantity needed; the Catches button lists linked catches and unlinked catches of the same Pokémon that you can link.

## Smogon builds (hunt form)
Competitive sets are served as static files from `public/data/smogon/`, not from Supabase.
1. `npm run data:smogon` downloads gens 3-9 from https://pkmn.github.io/smogon/data/sets/ (`-- --gens=9,8` for specific ones) and writes a `manifest.json`. Commit the files.
2. In Add/Edit hunt, open "Smogon builds" to pick a generation and format, then tap "Use this build" or "Apply selected".
3. IV rule: IVs a set lists are kept exactly; every other stat becomes "at least N" (default 20, editable), except a stat the build's nature lowers, which gets no requirement.
4. Tests: `npm test`. Set data is copyrighted by Smogon University and its contributors; keep the credit shown in the panel.

## Dump tab (screenshots to Caught)

Drop screenshots of Pokémon summary screens into the **Dump** tab. Each one is read by the card reader (a separate API, see
`../poke-reader/API_INTEGRATION.md`), shown next to editable fields, and saved to **Caught** once you have checked it.

- **Setup:** set `VITE_READER_URL` in `.env` to the reader's base URL, for example `https://xxxx.ngrok-free.dev/pokemmo`
  (no trailing slash needed). When the app is served over https the reader URL must be https too.
- **Flow:** the queue reads one screenshot at a time. Fields the reader was unsure about are highlighted with its own message.
  Confirm (✓ Right) or edit each one, then **Save & next** (Ctrl+Enter). **Skip** is Esc. Nothing is ever saved automatically.
- **Queue storage:** the queue lives in this browser's IndexedDB (one database per user) and survives a reload. It is not shared
  between devices. If the browser cannot store it, a warning appears and the page asks before closing while work is unsaved.
- **Code:** `src/dump/` (`readerApi.ts` talks to the reader, `mapping.ts` turns a card into app data and decides which fields
  to highlight, `queue.ts` + `store.ts` are the queue, `DumpTab.tsx` + `ReviewPane.tsx` are the screens). The row written to
  `caught` is built by `src/catchPayload.ts`, shared with the Submit-a-catch form.
- **Tests:** `npm test` (the queue, the mapping and the review pane are covered; the real IndexedDB and the live reader are not).

### Security: decide before sharing the app widely

The reader API is currently open: anyone who finds its URL can use the owner's PC. Options, cheapest first:

1. Set the reader's `ALLOWED_ORIGINS` to this app's real origin and add rate limiting on the server. This stops other websites,
   not scripts.
2. Better: a Supabase Edge Function (like `redeem-invite`) that checks the user's login and `is_active()`, then forwards the
   upload to the reader with a secret key kept on the server. Check Supabase's request-size and time limits first: the slow
   fallback reader can take over a minute.
3. `VITE_READER_API_KEY` exists for local development only. Anything in a `VITE_` variable is public in the built JavaScript,
   so never put a real key there for production.
