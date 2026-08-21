-- Postgres grants EXECUTE on new functions to PUBLIC by default, so an earlier
-- `revoke ... from anon` did not actually take the privilege away — anon still
-- reached them through PUBLIC. These are SECURITY DEFINER internals; only the
-- trigger and the owner should ever call them.
revoke all on function public.refresh_daily_score(uuid, date)  from public, anon, authenticated;
revoke all on function public.rebuild_daily_scores()           from public, anon, authenticated;
revoke all on function public.entries_sync_scores()            from public, anon, authenticated;
revoke all on function public.touch_updated_at()               from public, anon, authenticated;
revoke all on function public.require_passcode(text)           from public, anon, authenticated;

-- today_ist() is referenced by the RLS policies, which are evaluated as the
-- querying role, so anon must be able to call it. It leaks nothing.
grant execute on function public.today_ist() to anon, authenticated;

-- The deliberate public surface, restated so this file is the whole picture.
grant execute on function public.verify_passcode(text) to anon, authenticated;
grant execute on function public.set_rating(text, uuid, integer) to anon, authenticated;
grant execute on function public.admin_update_entry(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_delete_entry(text, uuid) to anon, authenticated;
grant execute on function public.admin_insert_entry(text, date, uuid, uuid, text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_set_day(text, uuid, date, text, text) to anon, authenticated;
