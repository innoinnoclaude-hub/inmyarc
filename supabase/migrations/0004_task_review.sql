-- The old split between `status` (pending/in_progress/done) and a `validated`
-- boolean became one three-way verdict per task: Done / Not Done / Rework
-- required. Tasks also carry time taken, a 1-5 rating and free-text remarks.
-- Assigned tasks no longer record who assigned them, so `created_by` is
-- nullable: NULL means "assigned by someone", non-NULL means self-logged.

alter table public.entries add column if not exists minutes  integer;
alter table public.entries add column if not exists rating   smallint;
alter table public.entries add column if not exists remarks  text;
alter table public.entries add column if not exists status_by uuid references public.members(id) on delete restrict;
alter table public.entries add column if not exists status_at timestamptz;

-- fold the old validation trail into the new one before dropping it
update public.entries set status = case when validated then 'done' else 'not_done' end
  where status is not null;
update public.entries set status_by = validated_by, status_at = validated_at
  where validated_by is not null;

alter table public.entries drop constraint if exists validated_needs_actor;
alter table public.entries drop column if exists validated;
alter table public.entries drop column if exists validated_by;
alter table public.entries drop column if exists validated_at;

alter table public.entries drop constraint if exists entries_status_check;
alter table public.entries alter column status set default 'not_done';
alter table public.entries add  constraint entries_status_check
  check (status in ('done','not_done','rework'));

alter table public.entries drop constraint if exists entries_rating_check;
alter table public.entries add  constraint entries_rating_check
  check (rating is null or rating between 1 and 5);

alter table public.entries drop constraint if exists entries_minutes_check;
alter table public.entries add  constraint entries_minutes_check
  check (minutes is null or (minutes >= 0 and minutes <= 1440));

alter table public.entries drop constraint if exists entries_remarks_check;
alter table public.entries add  constraint entries_remarks_check
  check (remarks is null or length(remarks) <= 500);

-- a recorded author for a status change implies a recorded time
alter table public.entries drop constraint if exists entries_status_trail_check;
alter table public.entries add  constraint entries_status_trail_check
  check (status_by is null or status_at is not null);

alter table public.entries alter column created_by drop not null;
