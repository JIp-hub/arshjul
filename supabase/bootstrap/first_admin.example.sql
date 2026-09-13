-- Copy this file to first_admin.local.sql (ignored by Git), replace both
-- placeholders, and run it once in the Supabase SQL Editor after the user
-- already exists in Authentication > Users.

begin;

do $bootstrap$
declare
  target_email constant text := 'REPLACE_WITH_FIRST_ADMIN_EMAIL';
  target_display_name constant text := 'REPLACE_WITH_DISPLAY_NAME';
  target_user_id uuid;
  new_family_id uuid;
begin
  if target_email like 'REPLACE_%' or target_display_name like 'REPLACE_%' then
    raise exception 'Replace the bootstrap placeholders before running this script.';
  end if;

  if exists (select 1 from public.families) then
    raise exception 'Bootstrap stopped: a family already exists.';
  end if;

  select id
    into strict target_user_id
    from auth.users
    where lower(email) = lower(target_email);

  insert into public.families (name, invite_code)
  values (
    'Familjen',
    replace(gen_random_uuid()::text, '-', '')
  )
  returning id into new_family_id;

  insert into public.family_members (family_id, user_id, display_name, role)
  values (new_family_id, target_user_id, target_display_name, 'admin');

  raise notice 'Created family % with first admin %', new_family_id, target_user_id;
end
$bootstrap$;

commit;
