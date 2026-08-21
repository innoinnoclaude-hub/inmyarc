-- Optional: generates several months of fake history so the Graph dialog has
-- something to draw. It attributes invented work to real people, so treat it as
-- a demo only and wipe it before the team uses the board for real:
--
--   delete from public.entries;      -- daily_scores follows automatically
--
-- Change the dates to move the window.
insert into public.entries (log_date, member_id, created_by, title, status, minutes, rating)
select
  d::date, m.id, m.id,
  'Sample task ' || g || ' — ' || to_char(d, 'DD Mon'),
  (array['done','done','done','rework','not_done'])[1 + (h % 5)],
  30 + (h % 210),
  1 + ((h / 7) % 5)
from generate_series(current_date - interval '5 months', current_date, '1 day') d
cross join public.members m
cross join generate_series(1, 3) g
cross join lateral (
  select ('x' || substr(md5(m.name || d::text || g::text), 1, 7))::bit(28)::int as h
) x
where extract(dow from d) between 1 and 5   -- weekdays only
  and (h % 4) <> 0;                          -- not everyone logs every day
