begin;
select plan(18);

select has_table('public', 'families', 'families exists');
select has_table('public', 'family_members', 'family_members exists');
select has_table('public', 'events', 'events exists');
select has_table('public', 'birthdays', 'birthdays exists');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.families (id, name, invite_code)
values ('10000000-0000-0000-0000-000000000001', 'Testfamiljen', 'TEST_CODE_1234567890');

insert into public.family_members (family_id, user_id, display_name, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Admin', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Medlem', 'member');

insert into public.events (id, family_id, created_by, title, event_date) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Admins händelse', '2026-01-10'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Medlems händelse', '2026-01-11');

insert into public.birthdays (family_id, name, birth_year, birth_month, birth_day)
values ('10000000-0000-0000-0000-000000000001', 'Testperson', 2000, 2, 29);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is((select count(*) from public.families), 1::bigint, 'member reads own family');
select is((select count(*) from public.events), 2::bigint, 'member reads all family events');
select lives_ok(
  $$insert into public.events (family_id, created_by, title, event_date)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Egen ny händelse', '2026-02-01')$$,
  'member creates own event'
);
select throws_ok(
  $$insert into public.events (family_id, created_by, title, event_date)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Förfalskad ägare', '2026-02-02')$$,
  '42501', null, 'member cannot create an event for another user'
);
select lives_ok(
  $$update public.events set title = 'Försök ändra admin' where id = '20000000-0000-0000-0000-000000000001'$$,
  'unauthorized update is safely filtered by RLS'
);

reset role;
select is(
  (select title from public.events where id = '20000000-0000-0000-0000-000000000001'),
  'Admins händelse',
  'member did not change another users event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$insert into public.birthdays (family_id, name, birth_month, birth_day)
    values ('10000000-0000-0000-0000-000000000001', 'Nekad', 3, 3)$$,
  '42501', null, 'member cannot administer birthdays'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$update public.events set title = 'Admin ändrade' where id = '20000000-0000-0000-0000-000000000002'$$,
  'admin updates any family event'
);
select lives_ok(
  $$insert into public.birthdays (family_id, name, birth_month, birth_day)
    values ('10000000-0000-0000-0000-000000000001', 'Ny födelsedag', 4, 4)$$,
  'admin administers birthdays'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is((select count(*) from public.events), 0::bigint, 'non-member reads no events');
select is((select count(*) from public.birthdays), 0::bigint, 'non-member reads no birthdays');
select is(
  (select count(*) from public.families where invite_code = 'TEST_CODE_1234567890'),
  0::bigint,
  'knowing the family code grants no access'
);

reset role;
select throws_ok(
  $$insert into public.birthdays (family_id, name, birth_year, birth_month, birth_day)
    values ('10000000-0000-0000-0000-000000000001', 'Ogiltigt datum', 2026, 2, 29)$$,
  '23514', null, 'database rejects invalid calendar dates'
);

insert into public.families (id, name)
values ('10000000-0000-0000-0000-000000000002', 'Andra testfamiljen');
select lives_ok(
  $$insert into public.family_members (family_id, user_id, display_name, role)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Medlem', 'member')$$,
  'one user can have more than one family membership'
);

select * from finish();
rollback;
