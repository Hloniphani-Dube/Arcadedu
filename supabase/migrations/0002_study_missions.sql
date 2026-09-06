-- Arcadedu · Autonomous Study Agent schema
--
-- Adds Study Missions and every table the agent reads or writes. Independent of
-- the game-progress tables in 0001_init_progress.sql — this migration never
-- touches or weakens those policies.
--
-- Run once against your Supabase project:
--   • Dashboard → SQL editor → paste → Run, OR
--   • supabase db push   (if the project is linked with the CLI)
--
-- Every table below is row-level-security protected: a user can only ever see or
-- change rows that belong to one of their own missions.

-- --------------------------------------------------------------- helpers ---

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------- study_missions ---

create table if not exists public.study_missions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  subject_id          text not null,                       -- Atlas subject id
  title               text not null default 'Study Mission',
  exam_date           date not null,
  sessions_per_week   integer not null default 4  check (sessions_per_week between 1 and 21),
  minutes_per_session integer not null default 30 check (minutes_per_session between 5 and 240),
  syllabus_source     text not null default 'atlas'
                        check (syllabus_source in ('atlas', 'freetext')),
  status              text not null default 'active'
                        check (status in ('active', 'completed', 'paused', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.study_missions enable row level security;

drop policy if exists "own missions" on public.study_missions;
create policy "own missions" on public.study_missions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists study_missions_user_idx
  on public.study_missions (user_id, status);

drop trigger if exists study_missions_updated_at on public.study_missions;
create trigger study_missions_updated_at
  before update on public.study_missions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- mission_topics ---

create table if not exists public.mission_topics (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references public.study_missions on delete cascade,
  topic_id       text not null,                              -- Atlas topic id
  priority       integer not null default 0,
  target_mastery real not null default 0.75 check (target_mastery between 0 and 1),
  created_at     timestamptz not null default now(),
  unique (mission_id, topic_id)
);

alter table public.mission_topics enable row level security;

drop policy if exists "own mission_topics" on public.mission_topics;
create policy "own mission_topics" on public.mission_topics
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists mission_topics_mission_idx
  on public.mission_topics (mission_id);

-- -------------------------------------------------------- topic_mastery ---
-- Mastery is written ONLY by application code (deterministic EWMA). The LLM
-- never has a path to this table.

create table if not exists public.topic_mastery (
  id                        uuid primary key default gen_random_uuid(),
  mission_id                uuid not null references public.study_missions on delete cascade,
  topic_id                  text not null,
  attempts                  integer not null default 0,
  correct                   integer not null default 0,
  quality_avg               real not null default 0,
  mastery_score             real not null default 0 check (mastery_score between 0 and 1),
  strategy_level            text not null default 'NORMAL'
                              check (strategy_level in ('NORMAL', 'STRUGGLING', 'PERSISTENT')),
  consecutive_flat_sessions integer not null default 0,
  last_attempt_at           timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (mission_id, topic_id)
);

alter table public.topic_mastery enable row level security;

drop policy if exists "own topic_mastery" on public.topic_mastery;
create policy "own topic_mastery" on public.topic_mastery
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists topic_mastery_mission_idx
  on public.topic_mastery (mission_id);

drop trigger if exists topic_mastery_updated_at on public.topic_mastery;
create trigger topic_mastery_updated_at
  before update on public.topic_mastery
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- plan_sessions ---

create table if not exists public.plan_sessions (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references public.study_missions on delete cascade,
  topic_id       text not null,
  scheduled_date date not null,
  kind           text not null default 'practice'
                   check (kind in ('practice', 'diagnostic', 'prerequisite_review', 'revision')),
  strategy_level text not null default 'NORMAL'
                   check (strategy_level in ('NORMAL', 'STRUGGLING', 'PERSISTENT')),
  item_count     integer not null default 4 check (item_count between 1 and 20),
  status         text not null default 'pending'
                   check (status in ('pending', 'done', 'missed')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.plan_sessions enable row level security;

drop policy if exists "own plan_sessions" on public.plan_sessions;
create policy "own plan_sessions" on public.plan_sessions
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists plan_sessions_mission_idx
  on public.plan_sessions (mission_id);
create index if not exists plan_sessions_schedule_idx
  on public.plan_sessions (mission_id, scheduled_date, status);

drop trigger if exists plan_sessions_updated_at on public.plan_sessions;
create trigger plan_sessions_updated_at
  before update on public.plan_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- session_log ---

create table if not exists public.session_log (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references public.study_missions on delete cascade,
  plan_session_id uuid references public.plan_sessions on delete set null,
  topic_id        text not null,
  items           integer not null default 0,
  correct         integer not null default 0,
  quality_avg     real not null default 0,
  mastery_before  real not null default 0,
  mastery_after   real not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.session_log enable row level security;

drop policy if exists "own session_log" on public.session_log;
create policy "own session_log" on public.session_log
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists session_log_mission_idx
  on public.session_log (mission_id, created_at desc);

-- ---------------------------------------------------------- agent_events ---
-- Product-level telemetry for the autonomous loop. Concise observations /
-- decision / reason / changes only — never hidden chain-of-thought.
-- `trigger_id` is the idempotency key (e.g. 'SESSION_COMPLETED:<plan_session_id>')
-- so /api/agent/tick can be called repeatedly without double-applying a change.

create table if not exists public.agent_events (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references public.study_missions on delete cascade,
  trigger         text not null,                    -- SESSION_COMPLETED | DAILY | MANUAL
  trigger_id      text,                             -- idempotency key
  decision        text,                             -- decision enum, or null on hard failure
  observations    jsonb not null default '[]'::jsonb,
  reason          text,
  changes         jsonb not null default '[]'::jsonb,
  applied         boolean not null default false,
  rejected_reason text,                             -- set when the validator rejected the decision
  notified        boolean not null default false,
  confidence      text,                             -- ON_TRACK | AT_RISK | OFF_TRACK
  created_at      timestamptz not null default now(),
  unique (mission_id, trigger_id)
);

alter table public.agent_events enable row level security;

drop policy if exists "own agent_events" on public.agent_events;
create policy "own agent_events" on public.agent_events
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists agent_events_mission_idx
  on public.agent_events (mission_id, created_at desc);

-- --------------------------------------------------------- notifications ---
-- In-app only for the MVP. No email / SMS / push.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  mission_id uuid references public.study_missions on delete cascade,
  kind       text not null,
  message    text not null,
  actions    jsonb not null default '[]'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notifications_user_idx
  on public.notifications (user_id, read, created_at desc);
