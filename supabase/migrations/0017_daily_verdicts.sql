-- ============================================================
-- A new way of judging the work, from 1 October 2026.
--
-- Out: per-task efficiency and impact, and the points they produced. Rating
-- every task one by one never reflected how someone actually did, and the score
-- it produced is no longer the measure.
--
-- In: one verdict per person per day, set by an admin, in five categories —
-- not up to the mark, rework, up to the mark, over performed, extraordinary —
-- plus up to two "brownie" marks for overtime and for working a holiday. The
-- board shows nothing until an admin has decided, then the person's row and all
-- their tasks carry that category's colour.
--
-- The leaderboard follows the categories: everyone in a category shares one
-- position, extraordinary at the top and not up to the mark at the bottom.
--
-- Everything before 1 October goes: tasks, attendance, rollups and every rating
-- with them. A full JSON export was taken first and lives outside the repo.
-- ============================================================

-- ---------- 1. the clean slate ----------
delete from public.entries   where log_date < date '2026-10-01';
delete from public.day_logs  where log_date < date '2026-10-01';
delete from public.daily_scores where log_date < date '2026-10-01';

-- ---------- 2. the verdict ----------
create table if not exists public.day_marks (
  member_id uuid not null references public.members (id) on delete restrict,
  log_date  date not null,
  category  text not null check (category in
              ('not_upto_mark', 'rework', 'upto_mark', 'over_performed', 'extraordinary')),
  -- at most two brownies, one each: worked overtime, worked a holiday
  overtime  boolean not null default false,
  holiday   boolean not null default false,
  marked_at timestamptz not null default now(),
  primary key (member_id, log_date)
);
create index if not exists day_marks_date_idx on public.day_marks (log_date);

alter table public.day_marks enable row level security;
revoke all on public.day_marks from public, anon, authenticated;
-- everyone may read a verdict once it exists; only the passcode-gated function
-- below can write one, so a verdict can never come from the browser
grant select on public.day_marks to anon, authenticated;
drop policy if exists day_marks_read on public.day_marks;
create policy day_marks_read on public.day_marks for select to anon, authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'day_marks') then
    alter publication supabase_realtime add table public.day_marks;
  end if;
end $$;

/**
 * Set, change or clear one person's verdict for one day. A null category
 * removes it, which puts them back to "not judged yet" and hides the colour
 * from the board again.
 */
create or replace function public.admin_set_mark(
  p_pass text, p_member uuid, p_date date,
  p_category text, p_overtime boolean, p_holiday boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_passcode(p_pass);
  if p_category is null then
    delete from public.day_marks where member_id = p_member and log_date = p_date;
    return;
  end if;
  insert into public.day_marks (member_id, log_date, category, overtime, holiday)
  values (p_member, p_date, p_category,
          coalesce(p_overtime, false), coalesce(p_holiday, false))
  on conflict (member_id, log_date) do update
    set category  = excluded.category,
        overtime  = excluded.overtime,
        holiday   = excluded.holiday,
        marked_at = now();
end $$;

revoke all on function public.admin_set_mark(text, uuid, date, text, boolean, boolean) from public;
grant execute on function public.admin_set_mark(text, uuid, date, text, boolean, boolean)
  to anon, authenticated;

-- ---------- 3. the rollup loses its score ----------
-- daily_scores stays as the per-person per-day tally of work done; it simply no
-- longer carries points, because points no longer exist.
create or replace function public.refresh_daily_score(p_member uuid, p_date date)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.daily_scores (member_id, log_date, tasks, done, minutes, updated_at)
  select p_member, p_date, count(*),
         count(*) filter (where status = 'done'),
         coalesce(sum(minutes), 0), now()
    from public.entries
   where member_id = p_member and log_date = p_date
  on conflict (member_id, log_date) do update set
    tasks      = excluded.tasks,
    done       = excluded.done,
    minutes    = excluded.minutes,
    updated_at = now();

  delete from public.daily_scores
   where member_id = p_member and log_date = p_date and tasks = 0;
end $$;

-- ---------- 4. the old ratings go ----------
create or replace function public.admin_update_entry(p_pass text, p_id uuid, p_patch jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.require_passcode(p_pass);
  update public.entries set
    title      = coalesce(p_patch->>'title', title),
    details    = case when p_patch ? 'details'    then nullif(btrim(p_patch->>'details'), '')  else details    end,
    status     = coalesce(p_patch->>'status', status),
    minutes    = case when p_patch ? 'minutes'    then (p_patch->>'minutes')::integer          else minutes    end,
    remarks    = case when p_patch ? 'remarks'    then nullif(btrim(p_patch->>'remarks'), '')  else remarks    end,
    status_by  = case when p_patch ? 'status_by'  then (p_patch->>'status_by')::uuid           else status_by  end,
    status_at  = case when p_patch ? 'status_at'  then (p_patch->>'status_at')::timestamptz    else status_at  end,
    attachment_path = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_path'), '') else attachment_path end,
    attachment_name = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_name'), '') else attachment_name end,
    attachment_type = case when p_patch ? 'attachment_path'
                           then nullif(btrim(p_patch->>'attachment_type'), '') else attachment_type end,
    attachment_size = case when p_patch ? 'attachment_path'
                           then (p_patch->>'attachment_size')::integer         else attachment_size end
  where id = p_id;
  if not found then raise exception 'No such entry.' using errcode = 'P0002'; end if;
end $function$;
revoke all on function public.admin_update_entry(text, uuid, jsonb) from public;
grant execute on function public.admin_update_entry(text, uuid, jsonb) to anon, authenticated;

drop function if exists public.set_efficiency(text, uuid, integer);
drop function if exists public.set_impact(text, uuid, integer);

alter table public.entries drop column if exists efficiency;
alter table public.entries drop column if exists impact;

-- the averages are generated from `rated`, so they go first
alter table public.daily_scores drop column if exists avg_impact;
alter table public.daily_scores drop column if exists avg_efficiency;
alter table public.daily_scores drop column if exists score;
alter table public.daily_scores drop column if exists rated;
alter table public.daily_scores drop column if exists impact_sum;
alter table public.daily_scores drop column if exists efficiency_sum;

-- ---------- 5. leave the tally consistent ----------
select public.rebuild_daily_scores();
