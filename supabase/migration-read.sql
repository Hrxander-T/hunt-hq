-- Run ONCE in Supabase SQL Editor (after migration-pending.sql).
-- Background reading: the reader on the PC reads each new shot and stores the result here.
-- read_status: null = not read yet, 'done' = read_result is filled, 'failed' = the Dump tab reads it in the browser.

alter table pending_shots add column if not exists read_status text check (read_status in ('done', 'failed'));
alter table pending_shots add column if not exists read_result jsonb;   -- {"cards": [...]} from the reader, without the images
alter table pending_shots add column if not exists read_at timestamptz;

drop function if exists claim_pending_shots();
create or replace function claim_pending_shots()
returns table (shot_id uuid, shot_public_id text, shot_url text, shot_created_at timestamptz, shot_read_status text, shot_read_result jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not is_active() then raise exception 'Not allowed'; end if;
  return query
    update pending_shots p set claimed_by = auth.uid(), claimed_at = now()
    where p.claimed_by is null or p.claimed_by = auth.uid()
    returning p.id, p.public_id, p.url, p.created_at, p.read_status, p.read_result;
end $$;
revoke all on function claim_pending_shots() from public, anon;
grant execute on function claim_pending_shots() to authenticated;
