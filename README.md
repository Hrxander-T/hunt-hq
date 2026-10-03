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
