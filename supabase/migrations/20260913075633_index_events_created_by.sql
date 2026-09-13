-- Cover the events.created_by foreign key for user deletion and ownership lookups.
create index if not exists events_created_by_idx
  on public.events (created_by);
