-- ============================================================
-- One month of demo data for the whole team.
-- Deterministic (md5-seeded), so re-running gives the same board.
-- Covers every attendance type, all three verdicts, rated and unrated
-- tasks, timed and untimed tasks, self-logged and assigned work, remarks,
-- and days where somebody logged nothing at all.
--
-- To wipe it:   delete from public.entries; delete from public.day_logs;
--               (daily_scores follows automatically)
--
-- Dates are resolved in Asia/Kolkata, matching the app. Postgres `current_date`
-- is UTC and can be a day behind, which would leave the board looking empty.
-- ============================================================

delete from public.entries  where log_date >= ((now() at time zone 'Asia/Kolkata')::date - 31);
delete from public.day_logs where log_date >= ((now() at time zone 'Asia/Kolkata')::date - 31);

-- ---------- attendance ----------
insert into public.day_logs (member_id, log_date, attendance, note)
select
  m.id,
  d::date,
  case
    -- most of the team is off at the weekend, a few catch up from home
    when extract(dow from d) in (0, 6) and h % 3 <> 0 then 'week_off'
    when extract(dow from d) in (0, 6) then 'wfh'
    when h % 23 = 0 then 'leave'
    when h % 11 = 0 then 'half_day'
    when h % 4  = 0 then 'wfh'
    else 'full_day'
  end,
  case when h % 17 = 0 then (array[
    'On calls till 4', 'Left early for a clinic visit',
    'Working from the Pune office', 'Back-to-back reviews today'
  ])[1 + (h % 4)] end
from generate_series(
  (now() at time zone 'Asia/Kolkata')::date - 30,
  (now() at time zone 'Asia/Kolkata')::date,
  '1 day') d
cross join public.members m
cross join lateral (
  select ('x' || substr(md5('att' || m.name || d::text), 1, 7))::bit(28)::int as h
) x
where h % 9 <> 0   -- a few people simply never marked that day
on conflict (member_id, log_date) do update
  set attendance = excluded.attendance, note = excluded.note;

-- ---------- tasks ----------
insert into public.entries
  (log_date, member_id, created_by, title, details, status, minutes, efficiency, impact, remarks, status_by, status_at)
select
  d::date,
  m.id,
  case when h % 7 = 0 then null else m.id end,                    -- 1 in 7 is assigned
  (array[
    'Shipped the billing migration', 'Reviewed pull requests',
    'Fixed the mobile nav overlap', 'Drafted the pricing page copy',
    'QA pass on the checkout flow', 'Pulled churn numbers for the board deck',
    'Reworked the onboarding empty state', 'Set up the staging environment',
    'Interviewed a design candidate', 'Cleaned up the analytics events',
    'Wrote the release notes', 'Triaged the support backlog'
  ])[1 + (h % 12)],
  case when h % 3 = 0 then (array[
    'Zero downtime, old columns stay until the next release',
    'Split by plan tier before Friday',
    'Three edge cases logged around expired cards',
    'Ties into the Q3 activation push'
  ])[1 + (h % 4)] end,                                            -- 1 in 3 has detail
  case
    when h % 7 = 0 and h % 2 = 0 then 'not_done'                  -- assigned, untouched
    when h % 13 = 0 then 'rework'
    when h % 19 = 0 then 'not_done'
    else 'done'
  end,
  case when h % 8 = 0 then null else 15 + (h % 300) end,          -- 1 in 8 untimed
  case when h % 5 = 0 then null else 1 + ((h / 7) % 5) end,       -- 1 in 5 unrated
  case when h % 9 = 0 then null else 1 + ((h / 11) % 5) end,
  case when h % 6 = 0 then (array[
    'Looks good, ship it after the copy review.',
    'Needs a dead-letter path before merge.',
    'Nice turnaround on this one.',
    'Please add a test before closing.'
  ])[1 + (h % 4)] end,                                            -- 1 in 6 has a remark
  case when h % 4 = 0 then r.id end,                              -- some verdicts attributed
  case when h % 4 = 0 then d::timestamptz + interval '16 hours' end
from generate_series(
  (now() at time zone 'Asia/Kolkata')::date - 30,
  (now() at time zone 'Asia/Kolkata')::date,
  '1 day') d
cross join public.members m
cross join generate_series(1, 4) g
cross join lateral (
  select ('x' || substr(md5(m.name || d::text || g::text), 1, 7))::bit(28)::int as h
) x
cross join lateral (
  select id from public.members
   order by md5(id::text || d::text || g::text) limit 1           -- whoever set the verdict
) r
where g <= 1 + (h % 4)                                             -- 1-4 tasks per person per day
  and h % 12 <> 0                                                  -- some quiet days
  and not exists (            -- nobody logs work on leave or a week off, so
                              -- weekends thin out to whoever marked themselves wfh
    select 1 from public.day_logs dl
     where dl.member_id = m.id and dl.log_date = d::date
       and dl.attendance in ('week_off', 'leave')
  );
