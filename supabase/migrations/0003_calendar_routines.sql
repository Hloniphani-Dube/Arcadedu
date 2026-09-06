-- Arcadedu · Academic Calendar + recurring routines
--
-- Feeds the Study Agent the rest of a student's routine load: fixed academic
-- dates (exams, assignments, deadlines) and recurring commitments (a weekly
-- problem set, a lab report). The agent reads these; the Inbox screen turns
-- them into reminders. In-app only, RLS-scoped, independent of 0001/0002.

-- ------------------------------------------------------- calendar_events ---

create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  mission_id  uuid references public.study_missions on delete set null,
  topic_id    text,                                   -- optional Atlas topic id
  title       text not null,
  kind        text not null default 'deadline'
                check (kind in ('exam', 'assignment', 'quiz', 'deadline', 'lecture', 'other')),
  event_date  date not null,
  notes       text,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "own calendar_events" on public.calendar_events;
create policy "own calendar_events" on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists calendar_events_user_idx
  on public.calendar_events (user_id, event_date);

drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- routines ---

create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  mission_id   uuid references public.study_missions on delete set null,
  title        text not null,
  cadence      text not null default 'weekly'
                 check (cadence in ('weekly', 'biweekly')),
  weekday      integer not null default 1 check (weekday between 0 and 6), -- 0 = Sunday
  anchor_date  date not null default (now() at time zone 'utc')::date,     -- biweekly parity anchor
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.routines enable row level security;

drop policy if exists "own routines" on public.routines;
create policy "own routines" on public.routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists routines_user_idx on public.routines (user_id, active);

drop trigger if exists routines_updated_at on public.routines;
create trigger routines_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

-- -------------------------------------------------- routine_occurrences ---
-- Materialised instances of a routine so "done / missed" has somewhere to live.
-- Filled lazily by the app (Inbox load) and by the daily agent tick.

create table if not exists public.routine_occurrences (
  id           uuid primary key default gen_random_uuid(),
  routine_id   uuid not null references public.routines on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  due_date     date not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'done', 'missed')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (routine_id, due_date)
);

alter table public.routine_occurrences enable row level security;

drop policy if exists "own routine_occurrences" on public.routine_occurrences;
create policy "own routine_occurrences" on public.routine_occurrences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists routine_occurrences_user_idx
  on public.routine_occurrences (user_id, due_date, status);
