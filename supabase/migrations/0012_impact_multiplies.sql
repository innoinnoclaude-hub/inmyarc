-- Impact multiplies rather than discounts:
--
--   score = minutes x (efficiency / 5) x impact
--
-- Efficiency is still a discount — every point below 5 removes 20% of the time
-- — but impact scales the result by its own value, so the top of the range is
-- 5x the minutes, the same magnitude as the original stars scoring.
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
          / 5.0
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

select public.rebuild_daily_scores();
