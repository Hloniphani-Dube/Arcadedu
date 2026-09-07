-- Arcadedu · progressive onboarding
--
-- Tracks whether a student has completed the first-time onboarding wizard
-- (name + avatar, optional syllabus paste). Null = not yet onboarded.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
