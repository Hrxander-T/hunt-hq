-- Run ONCE in Supabase SQL Editor. Adds multiple natures/abilities and structured IV requirements.
alter table hunts add column if not exists natures text[] not null default '{}';
alter table hunts add column if not exists abilities text[] not null default '{}';
alter table hunts add column if not exists iv_reqs jsonb not null default '{}'::jsonb;

-- Carry over what already exists.
update hunts set natures = array[nature] where nature is not null and nature <> '' and natures = '{}';
update hunts set abilities = array[ability] where ability is not null and ability <> '' and abilities = '{}';
-- Old free-text IVs can't be parsed reliably, so keep them readable in the notes.
update hunts set notes = trim(both E'\n' from coalesce(notes, '') || E'\nOld IV note: ' || ivs)
  where ivs is not null and ivs <> '' and iv_reqs = '{}'::jsonb and coalesce(notes, '') not like '%Old IV note:%';
-- The old columns (nature, ability, ivs, ball, attempts) are left in place and simply no longer used by the app.
