-- ============================================================
-- Close the backfill window opened in 0014.
--
-- The team has caught up, so the board goes back to writing today only
-- (Asia/Kolkata). The policies from 0014 stay as they are — they compare
-- log_date to editable_from() .. today_ist() — and moving the start of the
-- window to today makes that range exactly one day. The board reads the same
-- function, so it locks past days again without a code change.
--
-- Nothing already logged is touched. Corrections to past days go through
-- /rating, as before 0014.
--
-- To reopen from a given date:
--   create or replace function public.editable_from() returns date
--   language sql stable set search_path = public, pg_temp
--   as $$ select date '2026-09-01' $$;
-- ============================================================

create or replace function public.editable_from() returns date
language sql stable
set search_path = public, pg_temp
as $$ select public.today_ist() $$;
