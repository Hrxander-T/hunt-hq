-- Run once in Supabase SQL Editor if you already ran schema.sql.
create unique index if not exists profiles_name_unique on profiles (lower(name));
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare base text := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
begin
  begin
    insert into profiles (id, name) values (new.id, base);
  exception when unique_violation then
    insert into profiles (id, name) values (new.id, base || '-' || substr(new.id::text, 1, 4));
  end;
  return new;
end $$;

-- Rename an existing account (change both names):
-- update profiles set name = 'NewName' where name = 'old-email-prefix';
