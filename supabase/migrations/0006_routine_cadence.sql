-- Arcadedu · daily / monthly recurring routines
--
-- Routines previously supported only weekly/biweekly (weekday-anchored)
-- cadences. Adds 'daily' (every day) and 'monthly' (same day-of-month as
-- anchor_date, clamped to the shorter month where needed).

alter table public.routines drop constraint if exists routines_cadence_check;
alter table public.routines add constraint routines_cadence_check
  check (cadence in ('daily', 'weekly', 'biweekly', 'monthly'));
