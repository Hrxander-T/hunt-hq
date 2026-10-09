-- Run ONCE in Supabase SQL Editor. Adds a "quantity needed" target to each hunt.
alter table hunts add column if not exists target int not null default 1;
alter table hunts drop constraint if exists hunts_target_range;
alter table hunts add constraint hunts_target_range check (target between 1 and 99);

-- Make the API see the new column right away.
notify pgrst, 'reload schema';
