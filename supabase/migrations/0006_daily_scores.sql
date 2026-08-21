-- Per-person, per-day rollup so performance can be charted over weeks and
-- months without walking every entry.
--
-- It is maintained by a trigger on `entries`, never by the client: the browser
-- has SELECT and nothing else. Anything that changes a task — insert, edit,
-- re-rating, delete, or moving it to another person or day — recomputes the
-- affected day from scratch, so the rollup cannot drift out of step.

create table if not exists public.daily_scores (
  member_id   uuid not null references public.members(id) on delete restrict,
  log_date    date not null,
  tasks       integer not null default 0,
  done        integer not null default 0,
  minutes     integer not null default 0,
  rated       integer not null default 0,
  rating_sum  integer not null default 0,
  score       integer not null default 0,   -- sum(minutes x rating)
  avg_rating  numeric(3,2)
              generated always as (
                case when rated > 0
                  then round(rating_sum::numeric / rated, 2)
                end
              ) stored,
  updated_at  timestamptz not null default now(),
  primary key (member_id, log_date)
);

create index if not exists daily_scores_date_idx on public.daily_scores (log_date);

-- Recompute one member-day from the entries themselves. SECURITY DEFINER so
-- the trigger can write a table the caller is not allowed to touch.
create or replace function public.refresh_daily_score(p_member uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.daily_scores
    (member_id, log_date, tasks, done, minutes, rated, rating_sum, score, updated_at)
  select
    p_member,
    p_date,
    count(*),
    count(*) filter (where status = 'done'),
    coalesce(sum(minutes), 0),
    count(*) filter (where rating is not null),
    coalesce(sum(rating), 0),
    coalesce(sum(coalesce(minutes, 0) * coalesce(rating, 0)), 0),
    now()
  from public.entries
  where member_id = p_member and log_date = p_date
  on conflict (member_id, log_date) do update set
    tasks      = excluded.tasks,
    done       = excluded.done,
    minutes    = excluded.minutes,
    rated      = excluded.rated,
    rating_sum = excluded.rating_sum,
    score      = excluded.score,
    updated_at = now();

  -- the last task of a day was removed; drop the empty rollup row
  delete from public.daily_scores
   where member_id = p_member and log_date = p_date and tasks = 0;
end $$;

create or replace function public.entries_sync_scores()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_daily_score(new.member_id, new.log_date);
  end if;
  -- an edit that moves a task to another person or day must fix the old side too
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old.member_id <> new.member_id or old.log_date <> new.log_date)) then
    perform public.refresh_daily_score(old.member_id, old.log_date);
  end if;
  return null;
end $$;

drop trigger if exists entries_sync_scores on public.entries;
create trigger entries_sync_scores
  after insert or update or delete on public.entries
  for each row execute function public.entries_sync_scores();

-- Rebuild everything from entries. Safe to run at any time.
create or replace function public.rebuild_daily_scores()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
  r record;
begin
  delete from public.daily_scores;
  for r in select distinct member_id, log_date from public.entries loop
    perform public.refresh_daily_score(r.member_id, r.log_date);
    n := n + 1;
  end loop;
  return n;
end $$;

select public.rebuild_daily_scores();

-- read-only from the browser
alter table public.daily_scores enable row level security;
drop policy if exists daily_scores_read on public.daily_scores;
create policy daily_scores_read on public.daily_scores
  for select to anon, authenticated using (true);

revoke all on public.daily_scores from anon, authenticated;
grant select on public.daily_scores to anon, authenticated;

revoke all on function public.refresh_daily_score(uuid, date) from anon, authenticated;
revoke all on function public.rebuild_daily_scores() from anon, authenticated;
