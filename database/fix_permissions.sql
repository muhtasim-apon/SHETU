-- ============================================================
-- Shetu Auth — fix "Database error creating new user"
-- Cause: privileges on schema public were revoked, so both
-- PostgREST (service_role) and the signup trigger get
-- "42501: permission denied for schema public".
-- Run this whole file in the Supabase SQL Editor.
-- It is idempotent — safe to run more than once.
-- ============================================================

-- 1) Restore schema-level access for the Supabase roles ------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;

-- 2) Table privileges ---------------------------------------
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- The signup trigger inserts into public.profiles while the
-- auth API (role supabase_auth_admin) is creating the user,
-- so that role needs write access too.
grant insert, select, update, delete on public.profiles to supabase_auth_admin;

-- App-facing roles (used by the anon key / logged-in users)
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- 3) Make future tables inherit these grants ----------------
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;

-- 4) Harden the trigger: SECURITY DEFINER so it always runs
--    with the function owner's rights, regardless of which
--    role triggered the auth.users insert.
--    (CREATE OR REPLACE matches the documented profiles shape.)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name, phone)
  values (
    new.id,
    new.email,                                            -- profiles.email is NOT NULL
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5) Row Level Security: allow the app roles to operate.
--    (service_role bypasses RLS, but anon/authenticated do not.)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
