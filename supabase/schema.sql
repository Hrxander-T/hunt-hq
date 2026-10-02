-- Run this once in Supabase: SQL Editor > New query > paste > Run.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  emoji text not null default '🎯'
);
create table hunts (
  id uuid primary key default gen_random_uuid(),
  pokemon_id int not null,
  name text not null,
  types text[] not null default '{}',
  shiny boolean not null default false,
  nature text, ability text, ivs text, ball text, notes text,
  priority int not null default 2 check (priority between 1 and 3),
  status text not null default 'planned' check (status in ('planned','hunting','caught')),
  attempts int not null default 0,
  hunter_id uuid references profiles(id) on delete set null,
  added_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table activity (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null default auth.uid(),
  text text not null,
  created_at timestamptz not null default now()
);

-- Create a profile automatically on first sign-in (name = part of email before @).
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Atomic counter so two people tapping + at once never lose an attempt.
create function increment_attempts(hunt uuid, delta int) returns int language sql as $$
  update hunts set attempts = greatest(0, attempts + delta) where id = hunt returning attempts;
$$;

alter table profiles enable row level security;
alter table hunts enable row level security;
alter table activity enable row level security;
-- Everyone signed in is on the team: read and write the shared list.
create policy "team read profiles" on profiles for select to authenticated using (true);
create policy "edit own profile" on profiles for update to authenticated using (id = auth.uid());
create policy "team all hunts" on hunts for all to authenticated using (true) with check (true);
create policy "team read activity" on activity for select to authenticated using (true);
create policy "log own activity" on activity for insert to authenticated with check (user_id = auth.uid());

alter publication supabase_realtime add table hunts, activity, profiles;
