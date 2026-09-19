-- ============================================================
-- Open the board for backfilling.
--
-- Until now the board could write only today (Asia/Kolkata). The team has gaps
-- going back to the start of September, so direct writes are now allowed on any
-- day from editable_from() up to and including today — the same add, edit,
-- delete, status, remarks and attendance the board already had for today.
--
-- Unchanged:
--   * nothing before editable_from() and nothing in the future is writable
--     from the board; those still go through /rating
--   * efficiency and impact stay admin-only (column grants, not RLS)
--
-- editable_from() is the one place the window is defined. The board reads it
-- too, so moving the date here moves the UI with it. To go back to today-only:
--   create or replace function public.editable_from() returns date
--   language sql stable set search_path = public, pg_temp
--   as $$ select public.today_ist() $$;
-- ============================================================

create or replace function public.editable_from() returns date
language sql stable
set search_path = public, pg_temp
as $$ select date '2026-09-01' $$;

-- evaluated by the RLS policies as the querying role, and read by the board
revoke all on function public.editable_from() from public;
grant execute on function public.editable_from() to anon, authenticated;

drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;

create policy entries_insert on public.entries for insert to anon, authenticated
  with check (log_date between public.editable_from() and public.today_ist());
create policy entries_update on public.entries for update to anon, authenticated
  using      (log_date between public.editable_from() and public.today_ist())
  with check (log_date between public.editable_from() and public.today_ist());
create policy entries_delete on public.entries for delete to anon, authenticated
  using (log_date between public.editable_from() and public.today_ist());

drop policy if exists day_logs_insert on public.day_logs;
drop policy if exists day_logs_update on public.day_logs;

create policy day_logs_insert on public.day_logs for insert to anon, authenticated
  with check (log_date between public.editable_from() and public.today_ist());
create policy day_logs_update on public.day_logs for update to anon, authenticated
  using      (log_date between public.editable_from() and public.today_ist())
  with check (log_date between public.editable_from() and public.today_ist());
