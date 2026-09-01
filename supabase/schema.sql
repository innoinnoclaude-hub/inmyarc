-- ============================================================
-- InnovativeView — Daily Team Log  (Supabase / Postgres schema)
-- Safe to re-run: everything is idempotent.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- helpers ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- members ----------
-- Members are never deleted: every entry carries who logged it and who
-- validated it, so the roster is append-only. Retire someone with
--   update public.members set active = false where name = '...';
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  title       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- attendance (one row per member per day) ----------
create table if not exists public.day_logs (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete restrict,
  log_date    date not null,
  attendance  text not null default 'full_day'
              check (attendance in ('full_day','wfh','half_day','week_off','leave')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, log_date)
);

-- ---------- entries (work done + assigned tasks) ----------
-- `created_by` NULL means the task was assigned by someone (the portal does
-- not ask who); non-NULL means the person logged it against themselves.
-- `status` is the single verdict per task, set by anyone on the team.
create table if not exists public.entries (
  id            uuid primary key default gen_random_uuid(),
  log_date      date not null,
  member_id     uuid not null references public.members(id) on delete restrict, -- whose task it is
  created_by    uuid references public.members(id) on delete restrict,          -- null = assigned
  title         text not null check (length(btrim(title)) > 0),
  details       text,
  status        text not null default 'not_done'
                check (status in ('done','not_done','rework')),
  minutes       integer check (minutes is null or (minutes >= 0 and minutes <= 1440)),
  efficiency    smallint check (efficiency is null or efficiency between 1 and 5), -- 1-5 slider
  impact        smallint check (impact is null or impact between 1 and 5),         -- 1-5 stars
  remarks       text check (remarks is null or length(remarks) <= 500),
  status_by     uuid references public.members(id) on delete restrict,
  status_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint entries_status_trail_check check (status_by is null or status_at is not null)
);

create index if not exists entries_log_date_idx    on public.entries (log_date);
create index if not exists entries_member_day_idx  on public.entries (member_id, log_date);
create index if not exists day_logs_log_date_idx   on public.day_logs (log_date);

drop trigger if exists entries_touch   on public.entries;
create trigger entries_touch   before update on public.entries   for each row execute function public.touch_updated_at();
drop trigger if exists day_logs_touch  on public.day_logs;
create trigger day_logs_touch  before update on public.day_logs  for each row execute function public.touch_updated_at();

-- ---------- RLS: internal tool, anon key is the only client ----------
alter table public.members  enable row level security;
alter table public.day_logs enable row level security;
alter table public.entries  enable row level security;

drop policy if exists members_read      on public.members;
create policy members_read      on public.members  for select to anon, authenticated using (true);

drop policy if exists day_logs_read     on public.day_logs;
create policy day_logs_read     on public.day_logs for select to anon, authenticated using (true);
drop policy if exists day_logs_write    on public.day_logs;
create policy day_logs_write    on public.day_logs for insert to anon, authenticated with check (true);
drop policy if exists day_logs_update   on public.day_logs;
create policy day_logs_update   on public.day_logs for update to anon, authenticated using (true) with check (true);

drop policy if exists entries_read      on public.entries;
create policy entries_read      on public.entries  for select to anon, authenticated using (true);
drop policy if exists entries_write     on public.entries;
create policy entries_write     on public.entries  for insert to anon, authenticated with check (true);
drop policy if exists entries_update    on public.entries;
create policy entries_update    on public.entries  for update to anon, authenticated using (true) with check (true);
drop policy if exists entries_delete    on public.entries;
create policy entries_delete    on public.entries  for delete to anon, authenticated using (true);

-- Supabase's default privileges hand `anon` every DML verb (plus TRUNCATE,
-- which bypasses RLS) on every table in `public`. Revoke first so the grants
-- below are the whole truth, not an addition to a permissive default.
revoke all on public.members  from anon, authenticated;
revoke all on public.day_logs from anon, authenticated;
revoke all on public.entries  from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.members to anon, authenticated;                    -- roster is read-only
grant select, insert, update on public.day_logs to anon, authenticated;   -- attendance is never deleted
grant select, insert, update, delete on public.entries to anon, authenticated;

-- ---------- realtime ----------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.entries;
alter publication supabase_realtime add table public.day_logs;
alter table public.entries  replica identity full;
alter table public.day_logs replica identity full;
