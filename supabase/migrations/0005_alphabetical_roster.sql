-- The roster is ordered alphabetically by name, so the manual sort_order
-- column no longer decides anything. Drop it rather than leave a dead knob.
alter table public.members drop column if exists sort_order;
