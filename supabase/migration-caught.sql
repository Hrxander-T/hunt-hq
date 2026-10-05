-- Run ONCE in Supabase SQL Editor (after migration-v2.sql). Adds the Caught history, reactions and admin approval.

create table if not exists caught (
  id uuid primary key default gen_random_uuid(),
  pokemon_id int not null,
  species text not null,
  types text[] not null default '{}',
  nickname text, level int, nature text, ability text, item text, gender text,
  shiny boolean not null default false,
  ivs jsonb not null default '{}'::jsonb,
  evs jsonb not null default '{}'::jsonb,
  moves text[] not null default '{}',
  paste text,
  hunt_id uuid references hunts(id) on delete set null,
  caught_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  approved boolean not null default false,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz
);
create table if not exists caught_reactions (
  caught_id uuid not null references caught(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  kind text not null check (kind in ('congrats', 'ivs', 'wow')),
  primary key (caught_id, user_id, kind)
);
alter table caught enable row level security;
alter table caught_reactions enable row level security;

-- Only active team members can read. Owners and the admin can change or delete entries.
create policy "active read caught" on caught for select to authenticated using (is_active());
create policy "active insert caught" on caught for insert to authenticated
  with check (is_active() and caught_by = auth.uid() and approved = false and approved_by is null and approved_at is null);
create policy "owner or admin update caught" on caught for update to authenticated
  using (is_active() and (caught_by = auth.uid() or is_admin())) with check (is_active() and (caught_by = auth.uid() or is_admin()));
create policy "owner or admin delete caught" on caught for delete to authenticated
  using (is_active() and (caught_by = auth.uid() or is_admin()));
-- Approval fields can never be edited directly, only through approve_caught() below.
revoke update on caught from authenticated;
grant update (pokemon_id, species, types, nickname, level, nature, ability, item, gender, shiny, ivs, evs, moves, paste, hunt_id) on caught to authenticated;

create policy "active read reactions" on caught_reactions for select to authenticated using (is_active());
create policy "active add reaction" on caught_reactions for insert to authenticated with check (is_active() and user_id = auth.uid());
create policy "remove own reaction" on caught_reactions for delete to authenticated using (user_id = auth.uid());

-- If the stats of an approved catch are edited, the approval is removed so it must be checked again.
create or replace function reset_caught_approval() returns trigger language plpgsql as $$
begin
  if (new.pokemon_id, new.nature, new.ability, new.ivs, new.hunt_id, new.shiny)
     is distinct from (old.pokemon_id, old.nature, old.ability, old.ivs, old.hunt_id, old.shiny) then
    new.approved := false; new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists caught_reset_approval on caught;
create trigger caught_reset_approval before update on caught for each row execute function reset_caught_approval();

create or replace function approve_caught(cid uuid, on_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update caught set approved = on_off,
    approved_by = case when on_off then auth.uid() else null end,
    approved_at = case when on_off then now() else null end
  where id = cid;
end $$;
revoke all on function approve_caught(uuid, boolean) from public, anon;
grant execute on function approve_caught(uuid, boolean) to authenticated;

alter publication supabase_realtime add table caught, caught_reactions;
