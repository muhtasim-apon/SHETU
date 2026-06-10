-- ============================================================================
-- Shetu — RLS policies required by the new Profile + Rewards features.
-- These are ACCESS POLICIES only (no table columns / schema changes).
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- ============================================================================

-- 1. Avatar uploads — let an authenticated user manage files under a folder
--    named after their own user id in the public "avatars" bucket.
--    (Bucket "avatars" already exists and is public-read.)
drop policy if exists "avatars_user_insert" on storage.objects;
create policy "avatars_user_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- 2. Profile self-edit — let a user update their own profiles row
--    (name / phone editing on the Profile page).
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 3. Reward points — let a user insert + read their own reward_points rows,
--    so the Rewards balance ties to the reward_points table.
--    reward_points.patient_id references patients.id owned by the user.
drop policy if exists "reward_points_self_insert" on public.reward_points;
create policy "reward_points_self_insert" on public.reward_points
  for insert to authenticated
  with check (patient_id in (select id from public.patients where profile_id = auth.uid()));

drop policy if exists "reward_points_self_select" on public.reward_points;
create policy "reward_points_self_select" on public.reward_points
  for select to authenticated
  using (patient_id in (select id from public.patients where profile_id = auth.uid()));
