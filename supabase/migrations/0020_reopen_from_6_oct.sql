-- ============================================================
-- Open the board again, from 6 October 2026.
--
-- Same mechanism as 0014 and 0015: `editable_from()` is the one definition of
-- how far back the board may write, and the UI reads it too, so moving the
-- date moves the edit controls, the "Open for backfill" chip and the day
-- picker with it.
--
-- Anything before 6 October stays read-only, and the future is never writable.
-- Verdicts and brownies are unaffected — they are admin-only on any day.
--
-- To close it again:
--   create or replace function public.editable_from() returns date
--   language sql stable set search_path = public, pg_temp
--   as $$ select public.today_ist() $$;
-- ============================================================

create or replace function public.editable_from() returns date
language sql stable
set search_path = public, pg_temp
as $$ select date '2026-10-06' $$;
