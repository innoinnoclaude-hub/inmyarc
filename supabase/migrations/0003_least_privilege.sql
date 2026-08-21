-- Supabase's default privileges hand `anon` every DML verb (plus TRUNCATE,
-- which bypasses RLS entirely) on every table in `public`. RLS alone was
-- holding the roster shut. Make the grants match the intent so a future policy
-- mistake cannot open a door that was never supposed to exist.

revoke all on public.members  from anon, authenticated;
revoke all on public.day_logs from anon, authenticated;
revoke all on public.entries  from anon, authenticated;

-- roster: read-only from the browser, changed only from the SQL editor
grant select on public.members to anon, authenticated;

-- attendance: created and amended, never deleted
grant select, insert, update on public.day_logs to anon, authenticated;

-- entries: full lifecycle, still gated by RLS
grant select, insert, update, delete on public.entries to anon, authenticated;
