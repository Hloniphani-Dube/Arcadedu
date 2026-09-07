-- Arcadedu · mission_artifacts
--
-- Things the Study Agent produces FOR the student — the admin work around
-- learning, never the learning itself: pre-built practice sessions, one-page
-- revision sheets, progress reports, message drafts, the weekly brief. The
-- agent writes these through the deterministic gate; the screens surface them.

create table if not exists public.mission_artifacts (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references public.study_missions on delete cascade,
  topic_id        text,
  plan_session_id uuid references public.plan_sessions on delete set null,
  kind            text not null
                    check (kind in ('session_items', 'revision_sheet',
                                    'progress_report', 'message_draft', 'weekly_brief')),
  title           text not null,
  content         jsonb not null default '{}'::jsonb,
  status          text not null default 'ready'
                    check (status in ('preparing', 'ready', 'draft', 'archived')),
  created_by      text not null default 'agent'
                    check (created_by in ('agent', 'you')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.mission_artifacts enable row level security;

drop policy if exists "own mission_artifacts" on public.mission_artifacts;
create policy "own mission_artifacts" on public.mission_artifacts
  for all using (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.study_missions m
            where m.id = mission_id and m.user_id = auth.uid())
  );

create index if not exists mission_artifacts_mission_idx
  on public.mission_artifacts (mission_id, kind, created_at desc);
create index if not exists mission_artifacts_session_idx
  on public.mission_artifacts (plan_session_id);

drop trigger if exists mission_artifacts_updated_at on public.mission_artifacts;
create trigger mission_artifacts_updated_at
  before update on public.mission_artifacts
  for each row execute function public.set_updated_at();
