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
- `src/lib.ts`: PokéAPI calls (cached in localStorage), natures, type colours, shiny odds (`SHINY_ODDS`)
- `supabase/schema.sql`: tables, row-level security, atomic attempts counter

## Ideas to build next
Per-game lists, comments and reactions per card, avatar/emoji picker (profiles.emoji already exists), Discord webhook when something is caught, shiny-charm and Masuda odds, move and EV planner, PWA install.
