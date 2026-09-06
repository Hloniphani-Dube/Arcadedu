-- Arcadedu · player progress schema
--
-- Run this once against your Supabase project:
--   • Dashboard → SQL editor → paste → Run, OR
--   • supabase db push   (if you've linked the project with the CLI)
--
-- Dashboard steps that are NOT sql (do these too):
--   1. Authentication → Providers → make sure "Email" is enabled
--      (magic-link sign-in is the only method).
--   2. Authentication → URL Configuration → set "Site URL" to your deployed
--      origin, and add to "Redirect URLs":
--        http://localhost:5173/**
--        <your deployed origin, e.g. https://arcadedu.example.app/**>
--   3. Frontend env → copy .env.local.example to .env.local and set
--        VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   (the sb_publishable_… key
--        is the publishable/anon key and is safe to ship to the browser).

-- ---------------------------------------------------------------- profiles ---

create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null default 'Adventurer',
  avatar        text not null default '🧑‍🎓',
  xp            integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile write"  on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile write"  on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- auto-create a profile row for every new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Adventurer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------- subject_progress ---

create table if not exists public.subject_progress (
  user_id     uuid not null references auth.users on delete cascade,
  subject_id  text not null,
  unlocked    boolean not null default false,
  clears      integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, subject_id)
);

alter table public.subject_progress enable row level security;

drop policy if exists "own subjects" on public.subject_progress;
create policy "own subjects" on public.subject_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------- topic_progress ---

create table if not exists public.topic_progress (
  user_id         uuid not null references auth.users on delete cascade,
  subject_id      text not null,
  topic_id        text not null,
  completed_nodes text[] not null default '{}',
  current_node    text,
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, subject_id, topic_id)
);

alter table public.topic_progress enable row level security;

drop policy if exists "own topics" on public.topic_progress;
create policy "own topics" on public.topic_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
