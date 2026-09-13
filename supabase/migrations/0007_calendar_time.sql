-- Arcadedu · time-of-day for calendar events and recurring routines
--
-- Dates only ever captured a day, never a time. Stored as plain "HH:MM"
-- (24-hour) text, matching the existing YYYY-MM-DD string convention used
-- for dates throughout the app, rather than introducing timestamptz/timezone
-- handling for something the user always enters as a local wall-clock time.

alter table public.calendar_events
  add column if not exists event_time text;

alter table public.calendar_events drop constraint if exists calendar_events_event_time_format;
alter table public.calendar_events add constraint calendar_events_event_time_format
  check (event_time is null or event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.routines
  add column if not exists time_of_day text;

alter table public.routines drop constraint if exists routines_time_of_day_format;
alter table public.routines add constraint routines_time_of_day_format
  check (time_of_day is null or time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
