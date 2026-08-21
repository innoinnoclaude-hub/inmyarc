-- ============================================================
-- Team roster for the dropdown.
-- Edit the list, run it, done. Re-running is safe.
-- Rows are shown alphabetically by name, so order here does not matter.
-- `title` is optional (shown as a small line under the name).
-- ============================================================

insert into public.members (name, title) values
  ('Akarshan', null),
  ('Amogh',    null),
  ('Anshuman', null),
  ('Aryaman',  null),
  ('Ashish',   null),
  ('Deeksha',  null),
  ('Harsh',    null),
  ('Hitesh',   null),
  ('Japneet',  null),
  ('Lakshay',  null),
  ('Mahi',     null),
  ('Pooja',    null),
  ('Rahul',    null),
  ('Veni',     null),
  ('Yash',     null)
on conflict (name) do update
  set title  = excluded.title,
      active = true;

-- Members are never deleted -- entries reference who logged and who last set
-- each verdict, so the roster is append-only. To retire someone:
--   update public.members set active = false where name = 'Veni';
