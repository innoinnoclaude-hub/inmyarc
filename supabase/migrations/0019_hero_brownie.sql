-- ============================================================
-- A third brownie: Hero.
--
-- Overtime is for the length of the day and holiday for the day it fell on;
-- hero is for the day somebody pulled the team out of trouble. Still entirely
-- the admin's call, and still independent of the verdict.
--
-- `p_hero` carries a default, so a browser left open on the previous build —
-- which calls this function with six arguments — keeps working until it
-- reloads.
-- ============================================================

alter table public.day_marks add column if not exists hero boolean not null default false;

drop function if exists public.admin_set_mark(text, uuid, date, text, boolean, boolean);

create or replace function public.admin_set_mark(
  p_pass text, p_member uuid, p_date date, p_category text,
  p_overtime boolean, p_holiday boolean, p_hero boolean default false)
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
  insert into public.day_marks (member_id, log_date, category, overtime, holiday, hero)
  values (p_member, p_date, p_category,
          coalesce(p_overtime, false), coalesce(p_holiday, false),
          coalesce(p_hero, false))
  on conflict (member_id, log_date) do update
    set category  = excluded.category,
        overtime  = excluded.overtime,
        holiday   = excluded.holiday,
        hero      = excluded.hero,
        marked_at = now();
end $$;

revoke all on function public.admin_set_mark(text, uuid, date, text, boolean, boolean, boolean) from public;
grant execute on function public.admin_set_mark(text, uuid, date, text, boolean, boolean, boolean)
  to anon, authenticated;
