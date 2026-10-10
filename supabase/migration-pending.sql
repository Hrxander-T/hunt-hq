-- Run ONCE in Supabase SQL Editor (after migration-caught.sql).
-- Screenshots sent by the Android capture app wait here until someone reviews them in the Dump tab.
-- Only a link and an id are stored; the picture itself is in Cloudinary.

create table if not exists pending_shots (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,          -- Cloudinary id, needed to delete the picture later
  url text not null,
  created_at timestamptz not null default now(),
  claimed_by uuid references profiles(id) on delete set null,  -- who opened it in Dump first
  claimed_at timestamptz
);
alter table pending_shots enable row level security;  -- no policies: only the functions below and the edge functions touch it

-- Dump calls this when it opens. Hands out new shots (and your own unfinished ones) and marks them as yours,
-- so two teammates opening Dump at the same time do not both get the same picture.
create or replace function claim_pending_shots()
returns table (shot_id uuid, shot_public_id text, shot_url text, shot_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Not allowed'; end if;
  return query
    update pending_shots p set claimed_by = auth.uid(), claimed_at = now()
    where p.claimed_by is null or p.claimed_by = auth.uid()
    returning p.id, p.public_id, p.url, p.created_at;
end $$;
revoke all on function claim_pending_shots() from public, anon;
grant execute on function claim_pending_shots() to authenticated;
