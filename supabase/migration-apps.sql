-- Run ONCE in Supabase SQL Editor (after migration-pending.sql).
-- A private place for the capture app downloads (Android .apk, Windows .exe, Linux .tar.gz).
-- Private on purpose: the Android app has the upload token built in, so it must not be a public link.
-- Only signed-in team members can download. Upload the files in Dashboard > Storage > apps.

insert into storage.buckets (id, name, public) values ('apps', 'apps', false) on conflict (id) do nothing;

drop policy if exists "team can download apps" on storage.objects;
create policy "team can download apps" on storage.objects
  for select to authenticated
  using (bucket_id = 'apps' and is_active());
