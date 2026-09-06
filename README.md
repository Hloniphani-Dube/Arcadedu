# Arcadedu

An AI learning universe. The AI **teaches** — it never does the student's work for them.

The student never gets a free prompt box. They pick from a **closed set of actions**
(Explain, Hint, Show the steps, Check my answer, Explain my mistake, …) and a
server-side registry decides what the model is allowed to do for each one. The same
AI generates and grades RPG challenges, and a deterministic game engine turns
those grades into XP, HP, levels and world progression.

> **Guiding principle:** the system manages the *learning* — planning, assessment,
> practice, feedback, progression. The student does the *learning* itself.

---

## Project status

Pre-alpha / working MVP. Runs end to end: sign in, cross the map, fight
AI-generated challenges, earn XP, persist progress.

| Area | State | Notes |
| --- | --- | --- |
| Closed-action Learn mode | ✅ Working | 10 actions, server-side guardrail registry |
| RPG challenges (generate + grade) | ✅ Working | Enemy questions, 3-phase boss trials, structured-output JSON |
| Deterministic game engine | ✅ Working | XP curve, damage, crits, skill ranks — AI never touches the math |
| World Atlas + level paths | ✅ Working | 6 subjects, 4 continents, node paths per topic |
| Story Mode ("Story I: The Long Way Round") | ✅ Working | 12 chapters × 3 levels, lateral-thinking puzzles, AI-generated per chapter theme |
| Progression model | ✅ Working | Worlds & topics always open; only levels *within* a topic are sequential |
| Auth + saved progress | ✅ Working | Supabase email magic-link, RLS-scoped; falls back to in-memory local mode |
| Vercel AI function (`/api/ai`) | ✅ Working | Node serverless, holds the Gemini key, owns the prompt registry |
| AI resilience (retry / model failover) | ✅ Working | Backoff on 429/5xx, fallback model, `503 + Retry-After` on genuine overload |
| Icon system (Lucide, no emoji) | ✅ Working | Subject glyphs + avatars via [src/components/icons.tsx](src/components/icons.tsx) |
| Profile picture upload | ✅ Working | Browser-side crop/downscale to a ~20 KB data URL — no storage bucket |
| Supabase Edge Function AI backend | 🗄️ Legacy | Still in repo at [supabase/functions/ai/](supabase/functions/ai/index.ts); superseded by `/api/ai` |
| Autonomous "study agent" layer | 🔭 Planned | See [Where this is heading](#where-this-is-heading) |

---

## What's in the build

| Piece | Where | Does |
| --- | --- | --- |
| **The Atlas** | [src/screens/Atlas.tsx](src/screens/Atlas.tsx) | Pannable/zoomable world map; each country is a subject |
| **Country** | [src/screens/Country.tsx](src/screens/Country.tsx) | Lists a subject's topics |
| **Level path** | [src/screens/LevelPath.tsx](src/screens/LevelPath.tsx) | Candy-Crush-style node path; the traveller advances as nodes clear |
| **Challenge** | [src/screens/Challenge.tsx](src/screens/Challenge.tsx) | AI generates & grades each node; boss nodes run a 3-phase mastery trial |
| **Story Mode** | [src/screens/StoryHome.tsx](src/screens/StoryHome.tsx) · [StoryChapter](src/screens/StoryChapter.tsx) · [StoryChallenge](src/screens/StoryChallenge.tsx) | A separate 12-chapter tale of general-knowledge / lateral-thinking puzzles |
| **Learn mode** | [src/screens/LearnMode.tsx](src/screens/LearnMode.tsx) | Paste a problem, pick an action — the AI helps without handing over the answer |
| **Quests** | [src/screens/Quests.tsx](src/screens/Quests.tsx) | Surfaces your in-progress topics as a to-do list |
| **Profile** | [src/screens/Profile.tsx](src/screens/Profile.tsx) | Name, avatar (icon set or uploaded photo), level, per-subject progress |
| **Game engine** | [src/game/engine.ts](src/game/engine.ts) | Grades → XP / level / damage / crit / skill rank |
| **Atlas content model** | [src/game/atlas.ts](src/game/atlas.ts) | Subjects → topics → node paths; no authored question bank |
| **Story content model** | [src/game/story.ts](src/game/story.ts) | Chapters → levels, each with a theme the AI writes puzzles from |
| **Auth + progress** | [src/auth/](src/auth/) · [src/lib/progress.ts](src/lib/progress.ts) | Per-user progress in Supabase, RLS-scoped |
| **AI function** | [api/ai.ts](api/ai.ts) | The Gemini key stays server-side; actions are a closed set |

### Content

[src/game/atlas.ts](src/game/atlas.ts) — six subjects across four continents:

- **Numeria** — Algebra, Geometry
- **Mechanica** — Physics, Computing
- **Vitalis** — Biology
- **Lexica** — English

Every subject and topic is open from the start. Only the nodes *inside* a topic run
in sequence (`DEFAULT_UNLOCKED` = all subjects). Because the AI generates every
challenge from the `(subject, topic)` strings, a node only carries a title and a
difficulty tier — there is no authored question bank.

[src/game/story.ts](src/game/story.ts) — **Story I: The Long Way Round**: one
traveller, twelve regions, three levels each. The puzzles are *not* school material —
they're counting, geography, calendars, wordplay, logic and pattern teasers written
by the AI from each chapter's premise. Chapter *N* opens when *N‑1* is fully cleared.

---

## How the AI is constrained

The browser can only send an `action` from a fixed enum plus structured `context`
(subject, topic, level, the problem, the student's work). **There is no raw prompt
channel.**

**Learn actions** ([src/lib/types.ts](src/lib/types.ts)):
`explain` · `summarize` · `hint` · `understand` · `steps` · `check_answer` ·
`explain_mistake` · `example` · `simplify` · `similar_problem`

**Battle actions:**
`generate_enemy_question` · `grade_battle_answer` · `generate_boss_challenge` ·
`grade_boss_answer` · `generate_story_question`

[api/ai.ts](api/ai.ts) maps each action to a system instruction with explicit
guardrails — e.g. `hint` → *"exactly ONE nudge, never the answer"*, `steps` →
*"use a different example, don't run the steps on their actual numbers"*. Battle
actions use Gemini structured output and return JSON the game engine consumes.

The engine ([src/game/engine.ts](src/game/engine.ts)) is pure and deterministic:
the AI only decides `correct` / `quality`, and the engine turns that into
progression. The model never sees or sets an XP number.

---

## Architecture

```
React (Vite)  ──POST { action, context }──▶  /api/ai (Vercel, Node)  ──▶  Gemini API
     ▲                                          holds GEMINI_API_KEY
     │                                          owns the prompt registry
     └──────────── typed AiResponse ────────────  retry + model failover
     │
     └──▶  Supabase  (Auth: email magic-link · Postgres: RLS-scoped progress)
```

- **AI endpoint:** [api/ai.ts](api/ai.ts) — Vercel serverless (Node runtime,
  `maxDuration: 60`; Edge would time out on Gemini 3.x "thinking" calls).
  Transient failures (429/500/502/503/504, network) retry with exponential backoff,
  then fail over to `GEMINI_FALLBACK_MODEL`. Genuine upstream overload surfaces to
  the client as `503` + `Retry-After`; the client ([src/lib/ai.ts](src/lib/ai.ts))
  retries once more and then shows *"the AI is busy, try again."*
- **Legacy:** [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts) is
  the original Supabase Edge Function version, kept for reference. The deployed app
  uses `/api/ai`.
- **State:** progress persists to Supabase ([src/lib/progress.ts](src/lib/progress.ts)),
  hydrated into a Zustand store on sign-in ([src/store.ts](src/store.ts)). No
  Supabase env vars → **local mode**: no sign-in, progress kept in memory for the
  session.

---

## Where this is heading

The pieces above (assess → generate → grade → adapt progression) are the building
blocks of an **autonomous study agent**, not just an AI-powered app. The intended
next layer:

```
"I have a Physics exam in 3 weeks — here's my syllabus."
        │
        ▼
   study agent
   ├── parse syllabus  → topic roadmap
   ├── run diagnostics → per-topic student model
   ├── build a plan    → sessions across the days available
   ├── watch progress  → missed sessions, weak areas, exam proximity
   ├── adapt           → redistribute workload, regenerate practice
   └── notify          → only when a human decision is actually needed
```

The closed-action principle stays the hard boundary: the agent can plan, assess,
schedule, generate practice and track progress, but it **cannot solve the
student's actual assignment**. Design work on the agent's tools, triggers, memory
and boundaries comes before any stack changes.

---

## Setup

### 1. Frontend

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

`.env.local` in full:

| Var | Required | Purpose |
| --- | --- | --- |
| `VITE_AI_ENDPOINT` | yes | Where the closed-action AI lives. Default `/api/ai`. |
| `GEMINI_API_KEY` | yes (server) | Read by `api/ai.ts` only. No `VITE_` prefix — never shipped to the browser. |
| `GEMINI_MODEL` | no | Default `gemini-3.6-flash`. |
| `GEMINI_FALLBACK_MODEL` | no | Tried when the primary stays overloaded. Default `gemini-2.5-flash`; set `""` to disable. |
| `VITE_SUPABASE_URL` | no | Enables Supabase Auth + saved progress. |
| `VITE_SUPABASE_ANON_KEY` | no | The browser-safe publishable key (`sb_publishable_…`). |

### 2. Run the AI function locally

The AI endpoint is a Vercel function. For local development use the Vercel CLI so
`/api/ai` is served alongside Vite:

```bash
npm i -g vercel
vercel dev            # serves the app + /api/ai together
```

> **Rotate the Gemini key first.** Any key pasted into a chat, commit or screenshot
> is burned. Create a fresh one at <https://aistudio.google.com/apikey> and put it
> only in `.env.local` (gitignored) for local dev, or in the Vercel dashboard for
> production — never in a `VITE_`-prefixed var or a committed file.

### 3. Auth + progress persistence (optional)

1. Run [supabase/migrations/0001_init_progress.sql](supabase/migrations/0001_init_progress.sql)
   — Dashboard → SQL editor, or `supabase db push`. Creates `profiles`,
   `subject_progress`, `topic_progress`, their RLS policies, and the new-user trigger.
2. Dashboard → **Authentication → Providers**: enable **Email** (magic-link is the
   only sign-in method).
3. Dashboard → **Authentication → URL Configuration**: set **Site URL** to your
   deployed origin, and add `http://localhost:5173/**` and
   `https://<your-app>.vercel.app/**` to **Redirect URLs**.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.

Without these the app runs in **local mode** — no sign-in, progress kept in memory
for the session only.

### 4. Deploy

Deploy to Vercel. Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`,
`GEMINI_FALLBACK_MODEL`, `VITE_SUPABASE_*`) in **Project Settings → Environment
Variables**. `api/ai.ts` is picked up automatically as a serverless function.

---

## Stack

React 19 · Vite · TypeScript · React Router 7 · Tailwind v4 · Framer Motion ·
lucide-react · Zustand · Supabase (Auth + Postgres) · Vercel Functions · Gemini API

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server (use `vercel dev` if you also need `/api/ai`) |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |
