-- The V1 UI presents one active family at a time, but the database must not
-- permanently prevent an account from being a member of another family.
alter table public.family_members
  drop constraint if exists family_members_one_family_per_user;

create index if not exists family_members_user_created_at_idx
  on public.family_members (user_id, created_at, family_id);
