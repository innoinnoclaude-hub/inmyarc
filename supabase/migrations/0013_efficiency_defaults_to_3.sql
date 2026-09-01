-- Efficiency starts at the midpoint rather than empty. Most tasks are ordinary,
-- so an admin now only touches the slider to say "better than usual" or "worse
-- than usual" — and a task is never stuck at zero score just because nobody got
-- round to rating it.
--
-- Impact is deliberately left blank: that is a judgement about what the work was
-- worth, and defaulting it would put a number on work nobody has looked at.
alter table public.entries alter column efficiency set default 3;
