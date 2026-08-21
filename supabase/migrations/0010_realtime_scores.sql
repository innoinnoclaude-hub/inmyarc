-- The board reads `score` from daily_scores rather than recomputing it in the
-- browser, so the table, the rank, the stat strip and the graph all trace back
-- to one definition. For that to stay live it has to broadcast like the others.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'daily_scores'
  ) then
    alter publication supabase_realtime add table public.daily_scores;
  end if;
end $$;

alter table public.daily_scores replica identity full;
