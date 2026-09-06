# Arcadedu

An AI learning universe. The AI **teaches** — it never does the student's work for them.

The student never gets a free prompt box. They pick from a **closed set of actions**
(Explain, Hint, Show the steps, Check my answer, Explain my mistake, …) and a
server-side registry decides what the model is allowed to do for each one. The same
AI then generates and grades RPG challenges, and a deterministic game engine turns
those grades into XP, HP, levels and world progression.

## What's in this MVP

| Piece | Where | Proves |
| --- | --- | --- |
| **The Atlas** | [src/screens/Atlas.tsx](src/screens/Atlas.tsx) | A pannable world map; each country is a subject that unlocks the next |
| **Level path** | [src/screens/LevelPath.tsx](src/screens/LevelPath.tsx) | Candy-Crush-style node path; the traveller advances as challenges clear |
| **Challenge** | [src/screens/Challenge.tsx](src/screens/Challenge.tsx) | The same AI generates & grades each node (boss = 3-phase mastery) |
| **Learn mode** | [src/screens/LearnMode.tsx](src/screens/LearnMode.tsx) | AI can teach without handing over answers |
| **Game engine** | [src/game/engine.ts](src/game/engine.ts) | Grades become an XP / level progression system |
| **Auth + progress** | [src/auth/](src/auth/) · [src/lib/progress.ts](src/lib/progress.ts) | Per-user progress in Supabase (Google / magic-link), RLS-scoped |
| **AI edge function** | [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts) | The Gemini key stays server-side; actions are a closed set |

The atlas content model lives in [src/game/atlas.ts](src/game/atlas.ts) — six subjects
across four continents, two open from the start, the rest gated behind a prerequisite.

## Architecture

```
React (Vite) ──POST { action, context }──▶ Supabase Edge Function ──▶ Gemini API
     ▲                                          (holds GEMINI_API_KEY,
     └──────────── typed AiResponse ────────────  owns the prompt registry)
```

- The browser only ever sends an `action` from a fixed enum plus structured
  `context` (subject, topic, level, the problem, the student's work). No raw prompt.
- [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts) maps each action to
  a system instruction with explicit guardrails (e.g. `hint` → "exactly ONE nudge,
  never the answer").
- Battle actions (`generate_enemy_question`, `grade_battle_answer`,
  `generate_boss_challenge`, `grade_boss_answer`) use Gemini structured output and
  return JSON the game engine consumes.

## Setup

### 1. Frontend

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

With no Supabase env vars set, the app calls `VITE_AI_ENDPOINT`
(default `http://localhost:54321/functions/v1/ai`) — i.e. a locally served function.

### 2. AI edge function (local)

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker running.

```bash
npm install -g supabase          # or scoop/brew
cp supabase/.env.local.example supabase/.env.local   # then add your Gemini key
supabase functions serve --env-file supabase/.env.local
```

> **Rotate the Gemini key first.** Any key that has been pasted into a chat, commit,
> or screenshot is burned. Create a fresh one at
> <https://aistudio.google.com/apikey> and put it only in `supabase/.env.local`
> (gitignored) — never in the frontend or a committed file.

### 3. Auth + progress persistence

1. Run [supabase/migrations/0001_init_progress.sql](supabase/migrations/0001_init_progress.sql)
   — Dashboard → SQL editor, or `supabase db push`. It creates `profiles`,
   `subject_progress`, `topic_progress`, their RLS policies, and the new-user trigger.
2. Dashboard → **Authentication → Providers**: enable **Google** (add an OAuth client).
3. Dashboard → **Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:5173` and your deployed origin.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
   (the `sb_publishable_…` key is the browser-safe anon/publishable key).

Without these the app still runs in **local mode**: no sign-in, progress kept only in
memory for the session.

### 4. Deploy the AI function (optional)

```bash
supabase link --project-ref <ref>
supabase secrets set GEMINI_API_KEY=<rotated-key>
supabase functions deploy ai --no-verify-jwt
```

## Stack

React 19 · Vite · TypeScript · React Router · Tailwind v4 · Framer Motion ·
lucide-react · Zustand · Supabase (Auth + Postgres + Edge Functions) · Gemini API

Player progress persists to Supabase ([src/lib/progress.ts](src/lib/progress.ts)),
hydrated into a Zustand cache on sign-in ([src/store.ts](src/store.ts)).

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run lint` | ESLint |
