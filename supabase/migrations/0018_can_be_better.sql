-- ============================================================
-- "Rework" becomes "Can be better".
--
-- The fourth verdict read like the task status of the same name, which is a
-- different thing entirely: a task can need rework while the person's day was
-- simply short of the mark. The new wording says what it means.
--
-- The stored value changes with it, so nothing anywhere still says rework when
-- it means the verdict. Any existing verdict is carried over.
-- ============================================================

alter table public.day_marks drop constraint if exists day_marks_category_check;

update public.day_marks set category = 'can_be_better' where category = 'rework';

alter table public.day_marks add constraint day_marks_category_check
  check (category in
    ('not_upto_mark', 'can_be_better', 'upto_mark', 'over_performed', 'extraordinary'));
