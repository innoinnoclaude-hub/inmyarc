-- Optional: fills a day with sample entries so you can see the board populated.
-- Clear it again with:  delete from public.entries; delete from public.day_logs;
\set day '2026-08-22'

insert into public.day_logs (member_id, log_date, attendance, note)
select m.id, :'day', v.att, v.note from public.members m
join (values
  ('Veni','full_day',null), ('Harsh','wfh','On calls till 4'),
  ('Ashish','half_day','Left at 2 for a clinic visit'),
  ('Amogh','full_day',null), ('Japneet','week_off',null), ('Mahi','leave',null)
) as v(nm,att,note) on v.nm = m.name
on conflict (member_id, log_date) do update
  set attendance = excluded.attendance, note = excluded.note;

-- created_by = the person  -> they logged it themselves
-- created_by = null        -> it was assigned to them
insert into public.entries (log_date, member_id, created_by, title, details, status, minutes, efficiency, impact, remarks)
select :'day', me.id, case when v.self then me.id else null end,
       v.title, v.details, v.status, v.minutes, v.efficiency, v.impact, v.remarks
from (values
 ('Veni',   true,  'Closed out the Q3 activation deck','Final numbers are in slide 9','done', 150, 5, 5, 'Board-ready, no changes needed.'),
 ('Veni',   true,  'Interviewed two design candidates', null,                          'done', 45, null, null, null),
 ('Harsh',  true,  'Shipped the billing migration','Backfilled ~40k rows, zero downtime','done', 485, 4, 4, null),
 ('Harsh',  true,  'Started on webhook retry handling','Capped at six attempts',       'rework', 90, null, null, 'Needs a dead-letter path before merge.'),
 ('Ashish', true,  'Fixed the mobile nav overlap',null,                                'done', 60, null, null, null),
 ('Amogh',  false, 'Pull the churn numbers for the board deck','Split by plan tier',   'not_done', null, null, null, null)
) as v(owner,self,title,details,status,minutes,efficiency,impact,remarks)
join public.members me on me.name = v.owner;
