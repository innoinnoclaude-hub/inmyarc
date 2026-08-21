-- ============================================================
-- The only routes through which locked data can change.
-- Every one verifies the passcode inside the database first.
-- SECURITY DEFINER, so they run as the table owner and bypass the RLS that
-- keeps the anon role pinned to today.
-- ============================================================

-- ---------- ratings (the /rating page) ----------
-- `rating` is not in anon's column grants, so this is the ONLY way it moves.
create or replace function public.set_rating(p_pass text, p_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_passcode(p_pass);
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5.' using errcode = '22023';
  end if;
  update public.entries set rating = p_rating where id = p_id;
  if not found then
    raise exception 'No such entry.' using errcode = 'P0002';
  end if;
end $$;

-- ---------- editing a locked (past) day ----------
create or replace function public.admin_update_entry(p_pass text, p_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_passcode(p_pass);
  -- only these keys are honoured; anything else in the payload is ignored,
  -- so a caller cannot move a row to another person, day or member
  update public.entries set
    title     = coalesce(p_patch->>'title', title),
    details   = case when p_patch ? 'details'   then nullif(btrim(p_patch->>'details'), '')   else details   end,
    status    = coalesce(p_patch->>'status', status),
    minutes   = case when p_patch ? 'minutes'   then (p_patch->>'minutes')::integer           else minutes   end,
    rating    = case when p_patch ? 'rating'    then (p_patch->>'rating')::integer            else rating    end,
    remarks   = case when p_patch ? 'remarks'   then nullif(btrim(p_patch->>'remarks'), '')   else remarks   end,
    status_by = case when p_patch ? 'status_by' then (p_patch->>'status_by')::uuid            else status_by end,
    status_at = case when p_patch ? 'status_at' then (p_patch->>'status_at')::timestamptz     else status_at end
  where id = p_id;
  if not found then
    raise exception 'No such entry.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.admin_delete_entry(p_pass text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_passcode(p_pass);
  delete from public.entries where id = p_id;
  if not found then
    raise exception 'No such entry.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.admin_insert_entry(
  p_pass text, p_log_date date, p_member uuid, p_created_by uuid,
  p_title text, p_details text, p_status text, p_minutes integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_id uuid;
begin
  perform public.require_passcode(p_pass);
  insert into public.entries (log_date, member_id, created_by, title, details, status, minutes)
  values (p_log_date, p_member, p_created_by, p_title,
          nullif(btrim(coalesce(p_details, '')), ''),
          coalesce(p_status, 'not_done'), p_minutes)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.admin_set_day(
  p_pass text, p_member uuid, p_date date, p_attendance text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_passcode(p_pass);
  insert into public.day_logs (member_id, log_date, attendance, note)
  values (p_member, p_date, p_attendance, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (member_id, log_date) do update
    set attendance = excluded.attendance, note = excluded.note;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_rating(text, uuid, integer)',
    'public.admin_update_entry(text, uuid, jsonb)',
    'public.admin_delete_entry(text, uuid)',
    'public.admin_insert_entry(text, date, uuid, uuid, text, text, text, integer)',
    'public.admin_set_day(text, uuid, date, text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
