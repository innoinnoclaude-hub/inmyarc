-- ============================================================
-- Day locking + passcode-gated writes.
--
-- The browser holds a public anon key, so anything enforced only in React can
-- be bypassed with curl. Everything here is therefore enforced by Postgres:
--
--   * RLS restricts direct writes on entries/day_logs to TODAY (Asia/Kolkata).
--     At midnight IST the previous day becomes read-only with no job to run —
--     the policy simply stops matching.
--   * Column grants stop anon writing `rating` at all, by any route.
--   * Past-day edits and all rating changes go through SECURITY DEFINER
--     functions that verify a bcrypt passcode inside the database.
--
-- The passcode is stored hashed. The table holding it has no grants and no
-- policies, so it is invisible to the anon role.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- the app's notion of "today" ----------
create or replace function public.today_ist() returns date
language sql stable
set search_path = public, pg_temp
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------- secrets ----------
create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_secrets (key, value)
values ('passcode', extensions.crypt('Arysh@123', extensions.gen_salt('bf', 12)))
on conflict (key) do update
  set value = excluded.value, updated_at = now();

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated, public;

-- ---------- brute force throttle ----------
create table if not exists public.passcode_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
create index if not exists passcode_attempts_at_idx on public.passcode_attempts (at desc);
alter table public.passcode_attempts enable row level security;
revoke all on public.passcode_attempts from anon, authenticated, public;

/**
 * True when the passcode matches. Logs every attempt and refuses to answer at
 * all after 10 failures in 15 minutes, so the endpoint cannot be ground down.
 * bcrypt at cost 12 makes each guess cost real time on top of that.
 */
create or replace function public.verify_passcode(p_pass text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stored text;
  fails  integer;
  good   boolean;
begin
  select count(*) into fails
    from public.passcode_attempts
   where ok = false and at > now() - interval '15 minutes';
  if fails >= 10 then
    raise exception 'Too many incorrect attempts. Try again in a few minutes.'
      using errcode = '42501';
  end if;

  select value into stored from public.app_secrets where key = 'passcode';
  -- schema-qualified: pgcrypto lives in `extensions`, and hard-coding the
  -- schema keeps this immune to search_path tricks
  good := stored is not null
          and stored = extensions.crypt(coalesce(p_pass, ''), stored);

  insert into public.passcode_attempts (ok) values (good);
  delete from public.passcode_attempts where at < now() - interval '1 day';
  return good;
end $$;

revoke all on function public.verify_passcode(text) from public;
grant execute on function public.verify_passcode(text) to anon, authenticated;

create or replace function public.require_passcode(p_pass text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.verify_passcode(p_pass) then
    raise exception 'Incorrect passcode.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_passcode(text) from public, anon, authenticated;

-- ============================================================
-- RLS: direct writes are limited to today
-- ============================================================
drop policy if exists entries_write  on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;

create policy entries_insert on public.entries for insert to anon, authenticated
  with check (log_date = public.today_ist());
create policy entries_update on public.entries for update to anon, authenticated
  using (log_date = public.today_ist())
  with check (log_date = public.today_ist());
create policy entries_delete on public.entries for delete to anon, authenticated
  using (log_date = public.today_ist());

drop policy if exists day_logs_write  on public.day_logs;
drop policy if exists day_logs_insert on public.day_logs;
drop policy if exists day_logs_update on public.day_logs;

create policy day_logs_insert on public.day_logs for insert to anon, authenticated
  with check (log_date = public.today_ist());
create policy day_logs_update on public.day_logs for update to anon, authenticated
  using (log_date = public.today_ist())
  with check (log_date = public.today_ist());

-- ============================================================
-- Column grants: `rating` is never writable by the anon role
-- ============================================================
revoke all on public.entries  from anon, authenticated;
revoke all on public.day_logs from anon, authenticated;

grant select on public.entries to anon, authenticated;
grant insert (log_date, member_id, created_by, title, details, status, minutes)
  on public.entries to anon, authenticated;
grant update (title, details, status, minutes, remarks, status_by, status_at)
  on public.entries to anon, authenticated;
grant delete on public.entries to anon, authenticated;

grant select on public.day_logs to anon, authenticated;
grant insert (member_id, log_date, attendance, note) on public.day_logs to anon, authenticated;
-- PostgREST's upsert writes every payload column in the ON CONFLICT DO UPDATE,
-- so the conflict-target columns need update rights too. RLS still pins both
-- the old and the new row to today, so this cannot backdate anything.
grant update (member_id, log_date, attendance, note) on public.day_logs to anon, authenticated;
