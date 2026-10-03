-- Run ONCE in Supabase SQL Editor (after schema.sql). Safe if you already ran migration-username.sql.
-- EDIT your admin email in the last line first.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'active') then
    alter table profiles add column active boolean not null default false;
    update profiles set active = true;  -- accounts that already exist keep access
  end if;
end $$;
alter table profiles add column if not exists is_admin boolean not null default false;
create unique index if not exists profiles_name_unique on profiles (lower(name));

-- People can edit only their own name/emoji, never is_admin or active.
revoke update on profiles from authenticated;
grant update (name, emoji) on profiles to authenticated;

create table if not exists invites (
  code text primary key,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null
);
alter table invites enable row level security;  -- no policies: only admin functions and the edge function touch it

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

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;
create or replace function is_active() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select active from profiles where id = auth.uid()), false)
$$;
create or replace function my_access() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('admin', is_admin(), 'active', is_active())
$$;

create or replace function create_invite(days int default 7) returns text language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  insert into invites (code, created_by, expires_at) values (c, auth.uid(), now() + make_interval(days => greatest(1, days)));
  return c;
end $$;
create or replace function admin_invites() returns table (code text, created_at timestamptz, expires_at timestamptz, used_by_name text, status text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return query
    select i.code, i.created_at, i.expires_at, p.name,
      case when i.used_at is not null then 'used' when i.expires_at < now() then 'expired' else 'open' end
    from invites i left join profiles p on p.id = i.used_by order by i.created_at desc limit 30;
end $$;
create or replace function revoke_invite(c text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  delete from invites where invites.code = c and used_at is null;
end $$;
create or replace function admin_members() returns table (user_id uuid, name text, email text, is_admin boolean, active boolean, last_seen timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, p.name, u.email::text, p.is_admin, p.active, u.last_sign_in_at
    from profiles p join auth.users u on u.id = p.id order by p.name;
end $$;
-- Turn someone's access off/on. Also bans them at the auth level so they cannot sign in at all.
create or replace function admin_set_active(uid uuid, on_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from profiles where id = uid and is_admin) then raise exception 'Cannot change an admin'; end if;
  update profiles set active = on_off where id = uid;
  update auth.users set banned_until = case when on_off then null else 'infinity'::timestamptz end where id = uid;
end $$;
-- Delete an account completely (their hunts stay, shown as added by nobody).
create or replace function admin_delete_user(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from profiles where id = uid and is_admin) then raise exception 'Cannot delete an admin'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function create_invite(int), admin_invites(), revoke_invite(text), admin_members(), admin_set_active(uuid, boolean), admin_delete_user(uuid) from public, anon;
grant execute on function create_invite(int), admin_invites(), revoke_invite(text), admin_members(), admin_set_active(uuid, boolean), admin_delete_user(uuid) to authenticated;

-- Only active accounts can read/write shared data.
drop policy if exists "team read profiles" on profiles;
drop policy if exists "team all hunts" on hunts;
drop policy if exists "team read activity" on activity;
drop policy if exists "log own activity" on activity;
drop policy if exists "members read profiles" on profiles;
drop policy if exists "members all hunts" on hunts;
drop policy if exists "members read activity" on activity;
drop policy if exists "members log activity" on activity;
create policy "active read profiles" on profiles for select to authenticated using (is_active());
create policy "active all hunts" on hunts for all to authenticated using (is_active()) with check (is_active());
create policy "active read activity" on activity for select to authenticated using (is_active());
create policy "active log activity" on activity for insert to authenticated with check (user_id = auth.uid() and is_active());

-- ===== FIRST-TIME SETUP: put YOUR email here (you must already exist under Authentication > Users) =====
update profiles set is_admin = true, active = true where id = (select id from auth.users where lower(email) = lower('you@example.com'));
