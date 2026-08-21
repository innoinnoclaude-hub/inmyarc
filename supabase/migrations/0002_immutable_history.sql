-- Members are referenced by the acknowledgement trail, so deleting one would
-- either destroy history or leave a validated entry with no validator (which
-- the validated_needs_actor check forbids). Every reference becomes RESTRICT;
-- retire people with `active = false` instead.
alter table public.day_logs drop constraint if exists day_logs_member_id_fkey;
alter table public.day_logs add  constraint day_logs_member_id_fkey
  foreign key (member_id) references public.members(id) on delete restrict;

alter table public.entries  drop constraint if exists entries_member_id_fkey;
alter table public.entries  add  constraint entries_member_id_fkey
  foreign key (member_id) references public.members(id) on delete restrict;

alter table public.entries  drop constraint if exists entries_validated_by_fkey;
alter table public.entries  add  constraint entries_validated_by_fkey
  foreign key (validated_by) references public.members(id) on delete restrict;
