-- Applied only after approval. Existing family data and membership grants stay intact.
create table public.family_access_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  email_normalized text not null check (email_normalized = lower(btrim(email))),
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'retry_needed', 'rejected')),
  user_id uuid references auth.users(id) on delete set null,
  processing_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, email_normalized)
);

create index family_access_requests_admin_queue_idx
  on public.family_access_requests (family_id, status, created_at);

create trigger family_access_requests_set_updated_at
before update on public.family_access_requests
for each row execute function private.set_updated_at();

alter table public.family_access_requests enable row level security;
revoke all on public.family_access_requests from public, anon, authenticated;
grant select on public.family_access_requests to authenticated;

create policy family_access_requests_select_for_admins
on public.family_access_requests for select to authenticated
using ((select private.is_family_admin(family_id)));

-- A server-only throttle. No raw IP address is retained.
create table private.family_access_attempts (
  ip_hash text not null,
  hour_start timestamptz not null,
  attempts integer not null default 1,
  primary key (ip_hash, hour_start)
);
alter table private.family_access_attempts enable row level security;
revoke all on private.family_access_attempts from public, anon, authenticated;

-- Called only by the Edge Function with a server key. Anonymous clients have no
-- direct INSERT, SELECT, or RPC permission on applications.
create function public.submit_family_access_request(
  p_code text, p_name text, p_email text, p_ip_hash text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_family_id uuid;
  v_attempts integer;
  v_hour timestamptz := date_trunc('hour', now());
  v_email text := lower(btrim(p_email));
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{16,128}$'
     or p_name is null or char_length(btrim(p_name)) not between 1 and 120
     or p_email is null or char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  select id into v_family_id from public.families where invite_code = p_code;
  if v_family_id is null then return false; end if;

  delete from private.family_access_attempts where hour_start < v_hour - interval '48 hours';
  insert into private.family_access_attempts (ip_hash, hour_start, attempts)
  values (p_ip_hash, v_hour, 1)
  on conflict (ip_hash, hour_start) do update
    set attempts = private.family_access_attempts.attempts + 1
  returning attempts into v_attempts;
  if v_attempts > 5 then return false; end if;

  -- A second limit contains floods from rotating addresses.
  if (select count(*) from public.family_access_requests
      where family_id = v_family_id and created_at >= now() - interval '1 hour') >= 30 then
    return false;
  end if;

  insert into public.family_access_requests
    (family_id, display_name, email, email_normalized)
  values (v_family_id, btrim(p_name), v_email, v_email)
  on conflict (family_id, email_normalized) do nothing;
  return true;
end;
$$;
revoke all on function public.submit_family_access_request(text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_family_access_request(text,text,text,text) to service_role;

-- Auth Admin has no lookup-by-email method. Keep this exact-match lookup
-- inaccessible to browser roles, including signed-in members and admins.
create function public.find_access_auth_user(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.find_access_auth_user(text) from public, anon, authenticated;
grant execute on function public.find_access_auth_user(text) to service_role;

-- Membership alone is insufficient. The email address must have been confirmed
-- through Supabase Auth before any family row is visible.
create or replace function private.is_family_member(target_family_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.family_members m
      join auth.users u on u.id = m.user_id
      where m.family_id = target_family_id
        and m.user_id = (select auth.uid())
        and u.email_confirmed_at is not null
        and u.last_sign_in_at is not null
    );
$$;

create or replace function private.is_family_admin(target_family_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.family_members m
      join auth.users u on u.id = m.user_id
      where m.family_id = target_family_id
        and m.user_id = (select auth.uid())
        and m.role = 'admin'
        and u.email_confirmed_at is not null
        and u.last_sign_in_at is not null
    );
$$;

revoke all on function private.is_family_member(uuid) from public, anon, authenticated;
revoke all on function private.is_family_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_admin(uuid) to authenticated;
