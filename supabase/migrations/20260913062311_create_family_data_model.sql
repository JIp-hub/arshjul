-- Årshjulet B1: private family data, explicit grants, and RLS.
-- Generated locally. Apply only after the B2 review and Supabase project setup.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Keep future public objects closed until a later migration grants access explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  invite_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint families_invite_code_format check (
    invite_code is null or invite_code ~ '^[A-Za-z0-9_-]{16,128}$'
  )
);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, user_id),
  constraint family_members_one_family_per_user unique (user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  event_date date not null,
  event_time time,
  place text check (place is null or char_length(place) <= 300),
  description text check (description is null or char_length(description) <= 4000),
  icon text not null default '🗓️' check (icon in ('🗓️', '🎉')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.birthdays (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  birth_year smallint check (birth_year between 1 and 9999),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_day smallint not null check (birth_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthdays_real_calendar_date check (
    birth_day <= case birth_month
      when 2 then case
        when mod(coalesce(birth_year, 2000), 400) = 0
          or (mod(coalesce(birth_year, 2000), 4) = 0 and mod(coalesce(birth_year, 2000), 100) <> 0)
        then 29
        else 28
      end
      when 4 then 30
      when 6 then 30
      when 9 then 30
      when 11 then 30
      else 31
    end
  )
);

create index events_family_date_idx on public.events (family_id, event_date);
create index events_family_creator_idx on public.events (family_id, created_by);
create index birthdays_family_date_idx on public.birthdays (family_id, birth_month, birth_day);
create unique index birthdays_family_unique_person_date_idx
  on public.birthdays (family_id, lower(btrim(name)), birth_month, birth_day, coalesce(birth_year, 0));

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger families_set_updated_at
before update on public.families
for each row execute function private.set_updated_at();

create trigger family_members_set_updated_at
before update on public.family_members
for each row execute function private.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function private.set_updated_at();

create trigger birthdays_set_updated_at
before update on public.birthdays
for each row execute function private.set_updated_at();

create or replace function private.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.family_members membership
      where membership.family_id = target_family_id
        and membership.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_family_admin(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.family_members membership
      where membership.family_id = target_family_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'admin'
    );
$$;

revoke all on function private.is_family_member(uuid) from public, anon, authenticated;
revoke all on function private.is_family_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_admin(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.events enable row level security;
alter table public.birthdays enable row level security;

revoke all on table public.families from anon, authenticated;
revoke all on table public.family_members from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.birthdays from anon, authenticated;

-- Data API access is explicit. RLS still decides which rows are visible or writable.
grant select on table public.families to authenticated;
grant update (name, invite_code) on table public.families to authenticated;
grant select on table public.family_members to authenticated;
grant select, delete on table public.events to authenticated;
grant insert (family_id, created_by, title, event_date, event_time, place, description, icon)
  on table public.events to authenticated;
grant update (title, event_date, event_time, place, description, icon)
  on table public.events to authenticated;
grant select, delete on table public.birthdays to authenticated;
grant insert (family_id, name, birth_year, birth_month, birth_day)
  on table public.birthdays to authenticated;
grant update (name, birth_year, birth_month, birth_day)
  on table public.birthdays to authenticated;

create policy families_select_for_members
on public.families
for select
to authenticated
using ((select private.is_family_member(id)));

create policy families_update_for_admins
on public.families
for update
to authenticated
using ((select private.is_family_admin(id)))
with check ((select private.is_family_admin(id)));

create policy family_members_select_for_members
on public.family_members
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy events_select_for_members
on public.events
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy events_insert_for_members
on public.events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_family_member(family_id))
);

create policy events_update_for_owner_or_admin
on public.events
for update
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_family_admin(family_id))
)
with check (
  created_by = (select auth.uid())
  or (select private.is_family_admin(family_id))
);

create policy events_delete_for_owner_or_admin
on public.events
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_family_admin(family_id))
);

create policy birthdays_select_for_members
on public.birthdays
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy birthdays_insert_for_admins
on public.birthdays
for insert
to authenticated
with check ((select private.is_family_admin(family_id)));

create policy birthdays_update_for_admins
on public.birthdays
for update
to authenticated
using ((select private.is_family_admin(family_id)))
with check ((select private.is_family_admin(family_id)));

create policy birthdays_delete_for_admins
on public.birthdays
for delete
to authenticated
using ((select private.is_family_admin(family_id)));
