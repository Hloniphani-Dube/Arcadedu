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
| **Learn mode** | [src/screens/LearnMode.tsx](src/screens/LearnMode.tsx) | AI can teach without handing over answers |
| **RPG mode — Algebra Forest** | [src/screens/RpgMode.tsx](src/screens/RpgMode.tsx) | The same AI generates & adapts challenges |
| **Game engine** | [src/game/engine.ts](src/game/engine.ts) | Grades become an RPG progression system |
| **AI edge function** | [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts) | The Gemini key stays server-side; actions are a closed set |

`Practice` and `Exam` modes are stubbed on the home screen as the next build targets.
Five more worlds are defined as locked stubs in [src/game/worlds.ts](src/game/worlds.ts).

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

### 3. Deploy (optional)

```bash
supabase link --project-ref <ref>
supabase secrets set GEMINI_API_KEY=<rotated-key>
supabase functions deploy ai --no-verify-jwt
```

Then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` and the
app will call the deployed function via `supabase-js` instead of the local URL.

## Stack

React 19 · Vite · TypeScript · Tailwind v4 · Framer Motion · Zustand ·
Supabase Edge Functions (Deno) · Gemini API

Profile/XP currently persists to `localStorage` ([src/store.ts](src/store.ts));
moving it to a Supabase `profiles` table + Auth is the next step.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run lint` | ESLint |
