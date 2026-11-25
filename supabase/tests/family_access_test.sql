begin;
select plan(10);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.invalid', '', now(), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@example.invalid', '', now(), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@example.invalid', '', null, null, '{}', '{}', now(), now());

insert into public.families (id, name, invite_code)
values ('10000000-0000-0000-0000-000000000201', 'Testfamilj', 'TEST_FAMILY_CODE_12345');
insert into public.family_members (family_id, user_id, display_name, role) values
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000201', 'Admin', 'admin'),
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Medlem', 'member'),
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 'Ny', 'member');
insert into public.family_access_requests
  (family_id, display_name, email, email_normalized)
values ('10000000-0000-0000-0000-000000000201', 'Test Person', 'person@example.invalid', 'person@example.invalid');

select ok(not has_table_privilege('anon', 'public.family_access_requests', 'SELECT'), 'anonymous cannot read applications');
select ok(not has_table_privilege('authenticated', 'public.family_access_requests', 'INSERT'), 'clients cannot insert applications');
select ok(not has_function_privilege('anon', 'public.submit_family_access_request(text,text,text,text)', 'EXECUTE'), 'anonymous cannot call server-only submit RPC');
select ok(not has_function_privilege('authenticated', 'public.find_access_auth_user(text)', 'EXECUTE'), 'members cannot look up Auth users');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
set local role authenticated;
select is((select count(*) from public.family_access_requests), 0::bigint, 'member cannot read applications');
select throws_ok(
  $$insert into public.family_members (family_id,user_id,display_name,role)
    values ('10000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202','Self','admin')$$,
  '42501', null, 'member cannot grant own admin access');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
set local role authenticated;
select is((select count(*) from public.families), 0::bigint, 'unverified invitee cannot read family');
select is((select count(*) from public.family_access_requests), 0::bigint, 'unverified invitee cannot read applications');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
set local role authenticated;
select is((select count(*) from public.family_access_requests), 1::bigint, 'admin reads family applications');

reset role;
update auth.users set email_confirmed_at = now(), last_sign_in_at = now()
where id = '00000000-0000-0000-0000-000000000203';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
set local role authenticated;
select is((select count(*) from public.families), 1::bigint, 'verified invitee can read family after sign-in');

reset role;
select * from finish();
rollback;
