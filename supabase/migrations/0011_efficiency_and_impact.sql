-- ============================================================
-- Two ratings per task instead of one.
--
--   efficiency  1-5 slider   how well it was done
--   impact      1-5 stars    how much it mattered
--
-- score = minutes x (efficiency / 5) x (impact / 5)
--
-- Both at 5 keeps the full time; every point below 5 removes 20% of it. A task
-- missing either rating scores nothing, exactly as an unrated task did before.
--
-- The old `rating` column held stars, so it becomes `impact` and no history is
-- lost. `efficiency` starts null and has to be filled in.
-- ============================================================

alter table public.entries rename column rating to impact;
alter table public.entries add column if not exists efficiency smallint;

alter table public.entries drop constraint if exists entries_rating_check;
alter table public.entries drop constraint if exists entries_impact_check;
alter table public.entries add  constraint entries_impact_check
  check (impact is null or impact between 1 and 5);
alter table public.entries drop constraint if exists entries_efficiency_check;
alter table public.entries add  constraint entries_efficiency_check
  check (efficiency is null or efficiency between 1 and 5);

-- ---------- rollup ----------
alter table public.daily_scores drop column if exists avg_rating;
alter table public.daily_scores rename column rating_sum to impact_sum;
alter table public.daily_scores add column if not exists efficiency_sum integer not null default 0;

alter table public.daily_scores
  add column if not exists avg_impact numeric(3,2)
    generated always as (case when rated > 0 then round(impact_sum::numeric / rated, 2) end) stored;
alter table public.daily_scores
  add column if not exists avg_efficiency numeric(3,2)
    generated always as (case when rated > 0 then round(efficiency_sum::numeric / rated, 2) end) stored;

-- `rated` now means "has both ratings", the only state that can score
create or replace function public.refresh_daily_score(p_member uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.daily_scores
    (member_id, log_date, tasks, done, minutes, rated, impact_sum, efficiency_sum, score, updated_at)
  select
    p_member,
    p_date,
    count(*),
    count(*) filter (where status = 'done'),
    coalesce(sum(minutes), 0),
    count(*) filter (where impact is not null and efficiency is not null),
    coalesce(sum(impact)     filter (where impact is not null and efficiency is not null), 0),
    coalesce(sum(efficiency) filter (where impact is not null and efficiency is not null), 0),
    coalesce(
      round(
        sum(
          coalesce(minutes, 0)::numeric
          * coalesce(efficiency, 0)
          * coalesce(impact, 0)
          / 25.0
        )
      ),
      0
    ),
    now()
  from public.entries
  where member_id = p_member and log_date = p_date
  on conflict (member_id, log_date) do update set
    tasks          = excluded.tasks,
    done           = excluded.done,
    minutes        = excluded.minutes,
    rated          = excluded.rated,
    impact_sum     = excluded.impact_sum,
    efficiency_sum = excluded.efficiency_sum,
    score          = excluded.score,
    updated_at     = now();

  delete from public.daily_scores
   where member_id = p_member and log_date = p_date and tasks = 0;
end $$;
revoke all on function public.refresh_daily_score(uuid, date) from public, anon, authenticated;

-- ---------- write paths ----------
drop function if exists public.set_rating(text, uuid, integer);

create or replace function public.set_impact(p_pass text, p_id uuid, p_value integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_passcode(p_pass);
  if p_value is not null and (p_value < 1 or p_value > 5) then
    raise exception 'Impact must be between 1 and 5.' using errcode = '22023';
  end if;
  update public.entries set impact = p_value where id = p_id;
  if not found then raise exception 'No such entry.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.set_efficiency(p_pass text, p_id uuid, p_value integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_passcode(p_pass);
  if p_value is not null and (p_value < 1 or p_value > 5) then
    raise exception 'Efficiency must be between 1 and 5.' using errcode = '22023';
  end if;
  update public.entries set efficiency = p_value where id = p_id;
  if not found then raise exception 'No such entry.' using errcode = 'P0002'; end if;
end $$;

-- the admin editor may set either alongside the other fields
create or replace function public.admin_update_entry(p_pass text, p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_passcode(p_pass);
  update public.entries set
    title      = coalesce(p_patch->>'title', title),
    details    = case when p_patch ? 'details'    then nullif(btrim(p_patch->>'details'), '')  else details    end,
    status     = coalesce(p_patch->>'status', status),
    minutes    = case when p_patch ? 'minutes'    then (p_patch->>'minutes')::integer          else minutes    end,
    impact     = case when p_patch ? 'impact'     then (p_patch->>'impact')::integer           else impact     end,
    efficiency = case when p_patch ? 'efficiency' then (p_patch->>'efficiency')::integer       else efficiency end,
    remarks    = case when p_patch ? 'remarks'    then nullif(btrim(p_patch->>'remarks'), '')  else remarks    end,
    status_by  = case when p_patch ? 'status_by'  then (p_patch->>'status_by')::uuid           else status_by  end,
    status_at  = case when p_patch ? 'status_at'  then (p_patch->>'status_at')::timestamptz    else status_at  end
  where id = p_id;
  if not found then raise exception 'No such entry.' using errcode = 'P0002'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_impact(text, uuid, integer)',
    'public.set_efficiency(text, uuid, integer)',
    'public.admin_update_entry(text, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- neither rating is writable directly by the browser
revoke all on public.entries from anon, authenticated;
grant select on public.entries to anon, authenticated;
grant insert (log_date, member_id, created_by, title, details, status, minutes)
  on public.entries to anon, authenticated;
grant update (title, details, status, minutes, remarks, status_by, status_at)
  on public.entries to anon, authenticated;
grant delete on public.entries to anon, authenticated;

select public.rebuild_daily_scores();
