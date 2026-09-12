# Arcadedu

An AI learning universe with an autonomous study agent on top of it.

Two principles hold the whole system together:

> **The AI teaches — it never does the student's work.**
> The student never gets a free prompt box. Every model call is a fixed `action`
> from a closed set, and a server-side registry decides what the model may do for
> that action.

> **The agent manages the learning — the student does the learning.**
> Given a goal and a deadline, the study agent keeps the plan feasible as the
> student's week drifts, and stays quiet unless a human decision is genuinely
> required. It can plan, assess, schedule, and adapt. It cannot solve the
> student's actual assignment, invent XP, or write a mastery score.

The codebase has two layers:

| Layer | What it is | Where |
| --- | --- | --- |
| **The learning game** | Atlas of subjects → topics → Candy-Crush node paths of AI‑generated challenges, a Story mode, a closed-action Study Hall, a deterministic progression engine. | `src/game/`, `src/screens/`, `api/ai.ts` |
| **The Autonomous Study Agent** | Study Missions with a diagnostic, a deterministic mastery + plan-confidence engine, an **academic calendar** and **recurring routines**, a Strands agent that proposes plan changes, and a deterministic gate that validates and applies them. Everything routine surfaces in one **Inbox**; the agent only interrupts for a real decision. | `src/study/`, `api/agent/`, migrations `0002` + `0003` |

---

## Table of contents

- [Part I — The learning game](#part-i--the-learning-game)
  - [Screens and how they connect](#screens-and-how-they-connect)
  - [The deterministic game engine](#the-deterministic-game-engine)
  - [How the AI is constrained (`/api/ai`)](#how-the-ai-is-constrained-apiai)
- [Part II — The Autonomous Study Agent](#part-ii--the-autonomous-study-agent)
  - [The core loop](#the-core-loop)
  - [Concepts and the math behind them](#concepts-and-the-math-behind-them)
  - [Three-layer separation of powers](#three-layer-separation-of-powers)
  - [Data model (migration `0002`)](#data-model-migration-0002)
  - [The deterministic engine (`src/study/`)](#the-deterministic-engine-srcstudy)
  - [The agent (`api/agent/decide.py`)](#the-agent-apiagentdecidepy)
  - [The decision contract](#the-decision-contract)
  - [The deterministic gate (`src/study/agent/`)](#the-deterministic-gate-srcstudyagent)
  - [The tick pipeline](#the-tick-pipeline)
  - [Endpoints and triggers](#endpoints-and-triggers)
  - [Idempotency and failure safety](#idempotency-and-failure-safety)
  - [Academic Calendar, Inbox and routines](#academic-calendar-inbox-and-routines)
  - [Study Agent screens](#study-agent-screens)
  - [How the agent reuses the game](#how-the-agent-reuses-the-game)
- [How AI is used, end to end](#how-ai-is-used-end-to-end)
- [How Supabase is used, end to end](#how-supabase-is-used-end-to-end)
- [Walkthroughs](#walkthroughs)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Scripts](#scripts)
- [Stack](#stack)
- [Status and roadmap](#status-and-roadmap)

---

# Part I — The learning game

## Screens and how they connect

Navigation is an expand-on-hover sidebar ([src/components/AppShell.tsx](src/components/AppShell.tsx)):
**Atlas · Inbox · Calendar · Missions · Learn · Story · Quests · Profile**. The
**Inbox** carries a live badge — unread agent decisions plus anything overdue or
due today.

```
Atlas  (/)                       pannable SVG world map; each country = a subject
  └─ Country  (/s/:subjectId)    lists that subject's topics
       └─ Level path  (/s/:subjectId/:topicId)   Candy-Crush node path
            └─ Challenge  (/play/:subjectId/:topicId/:nodeId)
                 AI generates the question, you answer, AI grades,
                 the engine turns the grade into XP / progression

Story  (/story)                  "Story I: The Long Way Round"
  └─ Chapter  (/story/:chapterId)      12 chapters, unlock in order
       └─ Story challenge  (/story/:chapterId/:levelId)
            AI-generated general-knowledge / lateral-thinking puzzles

Learn  (/learn)                   "Study Hall" — paste a problem, pick one of ten
                                  fixed actions, ARIA helps without answering

Quests (/quests)                  your in-progress topics as a to-do list
Profile (/profile)               name, avatar, level, per-subject progress
```

### The Atlas content model — [src/game/atlas.ts](src/game/atlas.ts)

`SUBJECTS: Subject[]` is the entire content model. There is **no authored
question bank** — because the AI generates and grades every challenge from the
`(subject, topic)` strings, a node only carries a `title` and a difficulty
`tier` (`trivial → easy → medium → hard`, last node of a topic is a `boss`).

Six subjects across four continents:

- **Numeria** — Algebra (Linear Equations, Inequalities), Geometry (Triangles, Circles)
- **Mechanica** — Physics (Kinematics, Forces), Computing (Algorithms, Data Structures)
- **Vitalis** — Biology (Cell Biology, Genetics)
- **Lexica** — English (Close Reading, Argument & Rhetoric)

Lookups `getSubject(id)`, `getTopic(subjectId, topicId)`, `getNode(...)` are used
everywhere, including by the Study Agent.

### Progression model

Gated at exactly **one** layer: the nodes inside a topic run in sequence
(`selectNodeUnlocked` in [src/store.ts](src/store.ts), guarded on direct URLs in
[src/screens/Challenge.tsx](src/screens/Challenge.tsx)). **Worlds and topics are
never locked** — a learner who wants inequalities before linear equations, or
Geometry before Algebra, goes straight there. Story chapters unlock in order;
levels within a chapter are sequential.

### The Challenge loop — [src/screens/Challenge.tsx](src/screens/Challenge.tsx)

1. `generateEnemyQuestion` (or `generateBossChallenge` for a boss node — one
   harder, single question testing the whole topic, not a multi-phase fight) →
   `{ guidance, question, expectedConcept, difficulty }`. The **guidance** (a
   short, direct pointer to the method — no story framing) is kept strictly
   apart from the **question** (the bare problem) —
   [QuestionCard](src/components/QuestionCard.tsx) renders them separately and
   only `question` is ever sent to the grader. Story Mode is the only place
   that still uses narrative flavour (`generate_story_question`, unchanged).
2. Student types an answer. Optional help: **Hint** (`hint`) or, after a wrong
   answer, **Explain my mistake** (`explain_mistake`) — both closed actions.
3. `gradeBattleAnswer` / `gradeBossAnswer` → `{ correct, quality, feedback }`.
4. The deterministic engine ([src/game/engine.ts](src/game/engine.ts)) turns
   `{ correct, quality, tier }` into XP. `addXp` and `completeNode` update the
   Zustand store and fire-and-forget upserts to Supabase.

There's no HP/battle framing or enemy imagery in the Atlas challenge screen —
that's what Story Mode still carries (see below).

## The deterministic game engine — [src/game/engine.ts](src/game/engine.ts)

Pure functions. The AI decides `correct` / `quality` **only**; the engine owns
every number the player sees:

- `xpForLevel` / `levelForXp` / `levelProgress` — a gentle quadratic XP curve.
- `xpReward(tier, graded)`, `skillRank(clears)`.

The model never sees or sets an XP number. This same "AI judges, deterministic
code computes" split is the backbone of the Study Agent.

## How the AI is constrained — [`/api/ai`](api/ai.ts)

A single Vercel **Node** serverless function ( `maxDuration: 60` — Edge would
time out on "thinking" calls). It is the **only** place the Gemini key lives and
the **only** AI channel for the whole game. The browser sends:

```jsonc
{ "action": "<one of a closed enum>", "context": { subject, topic, level, problem?, studentAnswer?, question?, expectedConcept?, difficulty?, chapter? } }
```

There is **no raw prompt field.**

**Learn actions** (free-text prose back, rendered as ARIA speech):
`explain` · `summarize` · `hint` · `understand` · `steps` · `check_answer` ·
`explain_mistake` · `example` · `simplify` · `similar_problem`

**Challenge actions** (Gemini structured-output JSON the engine consumes):
`generate_enemy_question` · `grade_battle_answer` · `generate_boss_challenge` ·
`grade_boss_answer` · `generate_story_question` (the last one is Story Mode's
own narrator persona — the others return `guidance`, a plain instructional
lead-in, not story flavour)

Each action maps to a system instruction with explicit guardrails in the
`LEARN_RULES` / handler registry — e.g. `hint` → *"exactly ONE nudge, never the
method in full, never the answer"*; `steps` → *"use a DIFFERENT example, do not
run the steps on their actual numbers"*; `similar_problem` → *"problem statement
only — no solution"*.

**Resilience:** transient failures (429 / 500 / 502 / 503 / 504 / network) retry
with exponential backoff (≈0.5 s, 1 s), then fail over to
`GEMINI_FALLBACK_MODEL`. Genuine upstream overload surfaces as `503` +
`Retry-After`; the client ([src/lib/ai.ts](src/lib/ai.ts)) retries once more,
then shows *"the AI is busy, try again."*

A legacy Supabase Edge Function version lives at
[supabase/functions/ai/index.ts](supabase/functions/ai/index.ts); the deployed
app uses `/api/ai` via `VITE_AI_ENDPOINT`.

---

# Part II — The Autonomous Study Agent

A student creates a **Study Mission** — a subject, a set of Atlas topics, an exam
date, and a weekly cadence. A short diagnostic seeds a per-topic **mastery**
model. A deterministic generator lays out a **study plan** of practice sessions.
As the student completes sessions (or misses them, or the exam gets closer), the
agent re-evaluates and quietly adjusts the plan — escalating scaffolding on a
stuck topic, redistributing missed work, flagging the student only when the plan
can no longer be made feasible on its own.

## The core loop

```
   MISSION → DIAGNOSTIC → MASTERY MODEL → PLAN
                                            │
        ┌───────────────────────────────────┘
        ▼
   STUDY SESSION → ASSESSMENT → MASTERY UPDATE (deterministic EWMA)
        │
        ▼
   AGENT TICK ──▶ Strands proposes a decision (closed JSON)
        │
        ▼
   DETERMINISTIC GATE ──▶ validate (7 rules) ──▶ apply approved changes
        │                        │
        │                        └─▶ rejected → logged, plan unchanged
        ▼
   NEXT SESSION → repeat

   Plan still feasible → adapt silently.
   Plan infeasible     → FLAG_FOR_HUMAN + one in-app notification.
```

## Concepts and the math behind them

All constants live in one file — [src/study/config.ts](src/study/config.ts) —
and are explicitly MVP calibration values, not permanent.

### Mastery — deterministic rolling EWMA · [src/study/mastery.ts](src/study/mastery.ts)

The grader returns the same `{ correct, quality }` the game uses. Per graded
item:

```
q_obs      = correct ? quality : quality * 0.4      // a wrong answer still carries partial signal
mastery_n  = clamp01( mastery_(n-1) + 0.4 * (q_obs - mastery_(n-1)) )   // alpha = 0.4
```

Items in a session are folded through this one at a time.
`seedMastery(items)` folds from `0` — that is the diagnostic.
The **LLM never computes or writes mastery**; `applySession` does.

### Flat-session detection

After a session:

```
delta = mastery_after - mastery_before
flat  = delta < 0.03  AND  mastery_after < 0.75(target)
consecutive_flat_sessions = flat ? prev + 1 : 0
```

Two consecutive flat sessions is the evidence the gate requires before the agent
may escalate scaffolding.

### Plan confidence · [src/study/confidence.ts](src/study/confidence.ts)

Entirely deterministic — this is the number the agent exists to protect.

```
days_remaining     = max(0, whole days from today to exam_date)
required_sessions  = Σ over topics  ceil( max(0, target - mastery) / 0.08 )   // 0.08 = expected gain/session
available_sessions = floor( days_remaining / 7 * sessions_per_week )
ratio              = available_sessions / max(required_sessions, 1)

ratio >= 1.15  → ON_TRACK
ratio >= 0.90  → AT_RISK
else           → OFF_TRACK

override: days_remaining <= 2 AND any topic mastery < 0.50 → OFF_TRACK
```

Returns `{ confidence, days_remaining, required_sessions, available_sessions,
ratio, weak_topics[] }`. The Study Plan screen shows all of it.

### Strategy ladder · [src/study/strategy.ts](src/study/strategy.ts)

Each mission topic sits at one level. The level sets the difficulty of the graded
item and how much closed-action scaffolding a session shows first:

| Level | Item difficulty | Scaffolding shown before each item | Also |
| --- | --- | --- | --- |
| `NORMAL` | base tier (`medium`) | — | — |
| `STRUGGLING` | one tier lower | `example`, `hint` | — |
| `PERSISTENT` | one tier lower | `steps` (on an analogous problem), `hint` | adds a `prerequisite_review` session |

`strategyStepIsLegal(from, to)` allows **one rung per tick** only
(`NORMAL ↔ STRUGGLING ↔ PERSISTENT`); `NORMAL → PERSISTENT` in a single tick is
rejected. None of the scaffolding actions solve the student's problem — they are
the same guarded `/api/ai` Learn actions the game uses.

### Study plan generator · [src/study/plan.ts](src/study/plan.ts)

`generatePlan({ exam_date, sessions_per_week, topics, current_date })` →
`PlanDraft[]`:

1. **Slots** — for each calendar week from today to the exam, pick
   `sessions_per_week` days spread evenly across that week. Never before today,
   never after the exam.
2. **Assignment** — one slot per topic first, weakest first; then each remaining
   slot goes to the topic with the greatest *need*
   (`max(0.0001, target - mastery) + priority*0.01`), decremented by `0.08` per
   assignment. Once every topic is projected to reach its target, switch to
   balanced coverage (fewest sessions so far, ties broken by the larger gap).
3. Sessions in the final 3 days before the exam are `kind: 'revision'`, the rest
   `kind: 'practice'`. `item_count = 4`.

## Three-layer separation of powers

Spec §45, implemented literally:

```
  Strands agent  ──proposes──▶  Deterministic gate  ──approved──▶  Application
  (Bedrock)                     (TypeScript, tested)              (Supabase)

  interprets state              weekly session cap                mastery (EWMA)
  chooses strategy              date bounds                       plan_sessions
  proposes plan changes         one strategy rung / tick          strategy_level
  → one closed decision JSON    escalation needs ≥2 flat          agent_events log
                                mission-topic boundary            notifications
                                notification permission
                                idempotency
```

The model returns **one `AgentDecisionJson`** (closed `decision` enum + closed
change-op enum) and nothing else. It has no database access. Everything after the
decision is deterministic TypeScript that can be unit-tested without a model.

> **Deviation from spec §17.** §17 sketches `tick → Strands → tools → services →
> Supabase`, i.e. the agent calling mutating tools. We implemented §45's three
> layers as hard boundaries instead: [api/agent/decide.py](api/agent/decide.py)
> is Strands-only with read-only tools and no DB; the gate and every write live
> in [src/study/agent/pipeline.ts](src/study/agent/pipeline.ts). This keeps the
> confidence/validator math single-sourced and testable, and makes the eventual
> move to Bedrock AgentCore a pure hosting swap.

## Data model (migration `0002`)

[supabase/migrations/0002_study_missions.sql](supabase/migrations/0002_study_missions.sql)
adds seven tables. It never touches the `0001` game-progress tables or their
policies. UUID PKs, `timestamptz`, FK cascades, and an
`updated_at` trigger (`set_updated_at()`) on the mutable tables.

| Table | Key columns | Notes |
| --- | --- | --- |
| `study_missions` | `user_id → auth.users`, `subject_id`, `title`, `exam_date`, `sessions_per_week` (1–21, def 4), `minutes_per_session` (5–240, def 30), `syllabus_source` (`atlas`\|`freetext`), `status` (`active`\|`completed`\|`paused`\|`archived`) | `syllabus_source` is stored from day 1; only `atlas` is exposed in the UI. |
| `mission_topics` | `mission_id`, `topic_id` (Atlas id), `priority`, `target_mastery` (0–1, def 0.75) | `UNIQUE(mission_id, topic_id)`. |
| `topic_mastery` | `mission_id`, `topic_id`, `attempts`, `correct`, `quality_avg`, `mastery_score` (0–1), `strategy_level`, `consecutive_flat_sessions`, `last_attempt_at` | `UNIQUE(mission_id, topic_id)`. **Written only by application code.** |
| `plan_sessions` | `mission_id`, `topic_id`, `scheduled_date`, `kind` (`practice`\|`diagnostic`\|`prerequisite_review`\|`revision`), `strategy_level`, `item_count` (def 4), `status` (`pending`\|`done`\|`missed`), `completed_at` | The plan the student and agent both act on. |
| `session_log` | `mission_id`, `plan_session_id → set null`, `topic_id`, `items`, `correct`, `quality_avg`, `mastery_before`, `mastery_after` | One row per completed session / diagnostic seed. |
| `agent_events` | `trigger`, `trigger_id`, `decision`, `observations` (jsonb), `reason`, `changes` (jsonb), `applied`, `rejected_reason`, `notified`, `confidence` | **`UNIQUE(mission_id, trigger_id)`** — the idempotency key. Product telemetry, never chain-of-thought. |
| `notifications` | `user_id`, `mission_id`, `kind`, `message`, `actions` (jsonb), `read` | In-app only. No email / SMS / push. |

### RLS

Every table is `enable row level security`. `study_missions` and `notifications`
scope directly:

```sql
for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
```

The five child tables scope through mission ownership:

```sql
for all
using      (exists (select 1 from public.study_missions m
                    where m.id = mission_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.study_missions m
                    where m.id = mission_id and m.user_id = auth.uid()))
```

User A can never read or write User B's mission, topics, mastery, sessions,
events, or notifications — from the browser or from an endpoint using the user's
JWT. Only [api/agent/daily.ts](api/agent/daily.ts) bypasses RLS, with the service
role key, to enumerate every active mission for the scheduled tick.

### Migration `0003` — calendar + routines

[supabase/migrations/0003_calendar_routines.sql](supabase/migrations/0003_calendar_routines.sql)
adds three tables, all scoped directly on `auth.uid() = user_id`:

| Table | Key columns | Notes |
| --- | --- | --- |
| `calendar_events` | `user_id`, `mission_id → set null` (opt), `topic_id` (opt Atlas id), `title`, `kind` (`exam`\|`assignment`\|`quiz`\|`deadline`\|`lecture`\|`other`), `event_date`, `notes`, `completed` | Fixed academic dates. Read by the agent, turned into reminders by the Inbox. |
| `routines` | `user_id`, `mission_id` (opt), `title`, `cadence` (`weekly`\|`biweekly`), `weekday` (0–6), `anchor_date` (biweekly parity), `active` | A recurring commitment (weekly problem set, lab report). |
| `routine_occurrences` | `routine_id → cascade`, `user_id`, `due_date`, `status` (`pending`\|`done`\|`missed`), `completed_at` | `UNIQUE(routine_id, due_date)`. Materialised instances so "done / missed" has somewhere to live — filled lazily on Inbox load and by the daily tick. |

## The deterministic engine (`src/study/`)

| Module | Responsibility | Tested |
| --- | --- | --- |
| [config.ts](src/study/config.ts) | Every tunable constant in one place. | — |
| [types.ts](src/study/types.ts) | Row types + derived shapes (`MissionSnapshot`, `MasteryUpdate`, `PlanConfidenceResult`, …). | — |
| [dates.ts](src/study/dates.ts) | Whole-day arithmetic on `YYYY-MM-DD` (UTC-anchored, timezone-safe). | ✓ |
| [mastery.ts](src/study/mastery.ts) | `observedQuality`, `nextMastery`, `applySession`, `seedMastery`, `rollQualityAvg`. | ✓ |
| [confidence.ts](src/study/confidence.ts) | `planConfidence` (pure core) + `calculatePlanConfidence` (row-type adapter). | ✓ |
| [plan.ts](src/study/plan.ts) | `scheduleSlots`, `generatePlan`. | ✓ |
| [strategy.ts](src/study/strategy.ts) | Ladder mapping + `strategyStepIsLegal` + `difficultyForStrategy`. | ✓ |
| [calendar.ts](src/study/calendar.ts) | `routineOccurrenceDates`, `buildReminders` (sessions + events + routines → one sorted list), `deadlineCrossings`, `upcomingCalendar`, `routinesBehind`. | ✓ |
| [db.ts](src/study/db.ts) | All browser-side Supabase IO: missions (`createMission`, `fetchMissionSnapshot`, `regeneratePlan`, `recordMissionSession`, …), calendar (`fetchCalendarEvents`, `createCalendarEvent`, …), routines (`createRoutine`, `ensureRoutineOccurrences`, `setRoutineOccurrenceStatus`), and the `fetchInbox` / `fetchInboxCount` aggregates. | — |
| [agent.ts](src/study/agent.ts) | Frontend `runAgentTick(missionId, trigger, triggerId?)` — best-effort, never blocks. | — |
| [useInboxCount.ts](src/study/useInboxCount.ts) | Sidebar-badge hook — polls `fetchInboxCount` every 60 s. | — |

`db.ts` and the screens use extensionless imports (bundled by Vite). The
test-reachable pure modules use explicit `.ts` extensions so Node's built-in test
runner can load them without Vite (see [Testing](#testing)).

## The agent (`api/agent/decide.py`)

A **Vercel Python** function running the real **Strands Agents SDK** against
**Amazon Bedrock**. It receives the compact context, reasons with six
**read-only** tools, and returns exactly one structured decision. It has no
Supabase client and cannot apply anything.

```python
Agent(
  model=BedrockModel(model_id=BEDROCK_MODEL_ID, temperature=0.2),
  system_prompt=SYSTEM_PROMPT,           # the principle + the gate rules, so it proposes legal changes
  tools=[
    get_student_model,     # level, cadence, deadline, days remaining
    get_topic_mastery,     # per-topic mastery / target / strategy / flat-session count
    get_current_plan,      # upcoming + recent plan sessions
    get_recent_sessions,   # last completed sessions with mastery before/after
    analyze_weakness,      # deterministic plan_confidence + missed count + proximity crossing
    get_calendar,          # upcoming academic dates, deadline crossings, routines the student is behind on
  ],
)
decision = agent.structured_output(AgentDecision, prompt)   # pydantic model mirroring the contract
```

Dependencies are pinned in [api/agent/requirements.txt](api/agent/requirements.txt)
(`strands-agents`, `boto3`, `pydantic`). The `trigger` on the returned decision
is overwritten server-side from the request — never trusted from the model.

## The decision contract

[src/study/agent/contract.ts](src/study/agent/contract.ts) defines the closed
shape and `parseDecision(raw)`, which throws `DecisionParseError` on anything
off-contract (unknown enum value, unknown op, missing required field, malformed
date, non-object). Example:

```jsonc
{
  "decision": "ESCALATE_STRATEGY",            // one of 9 — no arbitrary strings
  "trigger":  "SESSION_COMPLETED",
  "observations": [
    "forces flat for 2 sessions (0.46 -> 0.47)",
    "kinematics on track"
  ],
  "reason": "Two flat sessions on forces; one rung of extra scaffolding is warranted.",
  "changes": [                                 // ops from a closed set of 6
    { "op": "set_strategy",   "topic": "forces", "level": "STRUGGLING" },        // NORMAL -> STRUGGLING, one rung
    { "op": "insert_session", "topic": "forces", "kind": "prerequisite_review", "before": "2026-09-10" }
  ],
  "notify": false
}
```

The gate then re-checks this: `forces` is a mission topic ✓, `STRUGGLING` is one
rung from `NORMAL` ✓, `forces` has `consecutive_flat_sessions >= 2` ✓, the target
week still has capacity ✓ → **approved and applied**. Had the model asked for
`PERSISTENT` in the same tick, or named a topic outside the mission, the whole
decision would be rejected and logged, and the plan left untouched.

**Decisions (9):** `KEEP`, `REPRIORITIZE`, `REDISTRIBUTE`, `ADVANCE_DIFFICULTY`,
`ESCALATE_STRATEGY`, `DE_ESCALATE_STRATEGY`, `INSERT_REMEDIATION`, `REPLAN`,
`FLAG_FOR_HUMAN`.

**Change ops (6):** `set_strategy`, `set_priority`, `insert_session`,
`drop_session`, `move_session`, `replan`.

## The deterministic gate (`src/study/agent/`)

| Module | Role |
| --- | --- |
| [contract.ts](src/study/agent/contract.ts) | Enums, `AgentContext` shape, `parseDecision`. |
| [context.ts](src/study/agent/context.ts) | `buildAgentContext` — `MissionSnapshot` (+ the student's calendar events and routine occurrences) → compact snapshot (spec §19): mission, student model, topics + mastery + strategy, current plan, recent sessions, `missed_sessions`, `days_remaining`, `exam_proximity_crossing` (14 / 7 / 3 / 1), `calendar` (upcoming academic dates), `deadline_crossings`, `routines_behind`, `plan_confidence`. |
| [validator.ts](src/study/agent/validator.ts) | `validateDecision` — the seven rules below. **All-or-nothing**: any violation rejects the whole change set (never a partial apply). Notification permission is resolved independently. |
| [schedule.ts](src/study/agent/schedule.ts) | `pickInsertDate` / week bucketing, shared by validate (simulate) and apply (persist) so they always agree. |
| [apply.ts](src/study/agent/apply.ts) | `applyChanges(db, missionId, changes, context)` — turns approved ops into Supabase writes. |
| [pipeline.ts](src/study/agent/pipeline.ts) | `runTick(...)` — the shared pipeline, used by both endpoints. Owns idempotency. |

### The seven validator rules (spec §22)

| # | Rule | Effect |
| --- | --- | --- |
| 1 | **Weekly session cap** — simulate pending sessions + the change deltas per 7-day bucket from today; no week may exceed `sessions_per_week`. | reject |
| 2 | **Date bounds** — any explicit `before` / `to_date` must be in `[today, exam_date]`. | reject |
| 3 | **One strategy rung** — `set_strategy` from the topic's current level must be a legal single step. | reject |
| 4 | **Escalation threshold** — `ESCALATE_STRATEGY` / `INSERT_REMEDIATION` require some topic with `consecutive_flat_sessions >= 2`. | reject |
| 5 | **Mission-topic boundary** — a change naming a topic not in the mission, or an unknown `session_id`, rejects the **entire** decision. | reject, `changes = []` |
| 6 | **Notification permission** — `notify: true` is honoured only when `confidence == OFF_TRACK`, **or** `days_remaining <= 3 && weak_topics > 0 && missed_sessions >= 2`. Otherwise `notify = false`, note `notify_suppressed`. | downgrade notify |
| 7 | **Notification frequency** — at most one proactive notification per mission per rolling 24 h (checked against the DB). Otherwise `notify = false`, note `notify_rate_limited`. | downgrade notify |

Result: `{ approved, rejected_reason, changes, notify, notes[] }`.

### `applyChanges` — op → write

| Op | Write |
| --- | --- |
| `set_strategy` | `topic_mastery.strategy_level` + all that topic's `pending` `plan_sessions.strategy_level`. |
| `set_priority` | `mission_topics.priority`. |
| `insert_session` | one `plan_sessions` row at `before` (or the earliest week with capacity), `item_count = 4`, inheriting the topic's strategy. |
| `drop_session` | delete one `pending` session by id, or the furthest-out pending session for the given topic/kind. |
| `move_session` | `plan_sessions.scheduled_date` of a `pending` session. |
| `replan` | delete all `pending` sessions, run `generatePlan` from the current context, insert. |

## The tick pipeline

[src/study/agent/pipeline.ts](src/study/agent/pipeline.ts) · `runTick(args)`:

```
1. loadSnapshot(db, missionId)                          mission + topics + mastery + plan + recent logs
2. claim agent_events row  INSERT (mission_id, trigger_id)     ← idempotency
     └─ unique-violation (23505) → return the prior row's outcome, do nothing
3. buildAgentContext(snapshot, …)                       compact snapshot + deterministic metrics
4. decide(context, trigger)                             → raw decision object  (httpDecide → /api/agent/decide)
5. parseDecision(raw)                                   → AgentDecisionJson  |  DecisionParseError
6. check notifications table for one in the last 24 h
7. validateDecision({ decision, context, recentNotificationWithin24h })
8. if approved && changes → applyChanges(db, …)
9. if verdict.notify      → insert one notifications row
10. finalize the agent_events row  (decision, observations, reason, changes, applied, rejected_reason, notified, confidence)
11. return TickOutcome  { status, http, decision, applied, rejected_reason, confidence, notified, changes, notes }
```

`decide` is injected — [httpDecide(baseUrl)](src/study/agent/pipeline.ts) calls
the Python function; a test can pass a stub.

## Endpoints and triggers

| Endpoint | Auth | Triggers | Client |
| --- | --- | --- | --- |
| [api/agent/tick.ts](api/agent/tick.ts) | caller's **Supabase JWT** → RLS-scoped `createClient(url, anon, { headers: { Authorization } })`, then `auth.getUser()` | `SESSION_COMPLETED`, `MANUAL` | one mission |
| [api/agent/daily.ts](api/agent/daily.ts) | `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it) → **service role** client | `DAILY` | every `active` mission |

### The three triggers (spec §25)

| Trigger | Fired by | `trigger_id` |
| --- | --- | --- |
| `SESSION_COMPLETED` | [MissionSession](src/screens/MissionSession.tsx) right after `recordMissionSession` | `SESSION_COMPLETED:<plan_session_id>` |
| `DAILY` | `vercel.json` cron `0 6 * * *` → `/api/agent/daily` | `DAILY:<yyyy-mm-dd>` |
| `MANUAL` | "Re-plan now" on the Study Plan screen | `MANUAL:<3-minute bucket>` |

The `DAILY` context carries `missed_sessions`, `plan_confidence`, and
`exam_proximity_crossing` (set when `days_remaining ∈ {14,7,3,1}`) for the agent
to react to. `markMissedSessions` (called on Study Plan load and available to the
tick) flips overdue `pending` sessions to `missed`.

## Idempotency and failure safety

**Idempotency** (spec §34) — `agent_events` has `UNIQUE(mission_id,
trigger_id)`. Each tick claim-inserts its event row before doing anything; a
unique violation means the tick already ran and the prior outcome is returned
unchanged. So the same session completion, the same day's `DAILY`, and a
double-clicked "Re-plan now" (3-minute bucket) each apply **at most once**.

**Failure safety** (spec §35) — the plan is never left half-changed:

| Failure | Behaviour |
| --- | --- |
| Strands / `decide` unreachable | plan unchanged; `agent_events` logged with `rejected_reason`; `503 retryable`. |
| Decision off-contract (bad JSON / enum / op) | plan unchanged; logged; `502`. |
| Validator rejects | nothing applied (never partial); rejection + reason logged. |
| Supabase write fails mid-apply | `applied = false`; logged; `502` — success is never claimed. |
| `/api/ai` retry/failover | unchanged — the game's AI resilience is independent. |

## Academic Calendar, Inbox and routines

The theme is *"an agent that handles routine work in the background and only
surfaces when there's a real decision."* These three pieces make that concrete.

### Academic Calendar — [Calendar.tsx](src/screens/Calendar.tsx) · `/calendar`

A month grid ([MonthCalendar.tsx](src/study/MonthCalendar.tsx)) with chips on the
day — academic dates **and** upcoming study sessions — plus prev/next/Today
navigation. Click a day for its agenda and a quick "add on this date". Below it,
**recurring routines** (a weekly problem set, a bi-weekly lab report). A compact
read-only copy of the same grid sits at the top of the [Inbox](src/screens/Inbox.tsx).
These are not decoration:

- `buildAgentContext` feeds every upcoming `calendar_event` into the agent's
  context (`calendar[]`), and `deadlineCrossings` flags any event sitting exactly
  on a 14 / 7 / 3 / 1-day milestone *today*.
- The `DAILY` tick uses these to `REPRIORITIZE` / `REDISTRIBUTE` toward a topic
  that has a deadline bearing down on it while still below target.
- `routines_behind` (missed + overdue routine occurrences) is a weakness signal.

Routine instances are materialised into `routine_occurrences` lazily —
`ensureRoutineOccurrences` runs on Inbox load, and `materialiseRoutines` runs at
the top of the daily tick — so "done / missed" always has a row, and overdue
`pending` occurrences flip to `missed`.

### Inbox — [Inbox.tsx](src/screens/Inbox.tsx) · `/inbox`

One screen, two lanes, plus a digest:

| Part | Source | Meaning |
| --- | --- | --- |
| **Digest** strip | the latest `agent_events` with `trigger = DAILY` | *"the agent ran, here's the one-line result"* — the "surfaces once" moment. |
| **Needs you** | unread `notifications` → [NotificationCard](src/study/NotificationCard.tsx) | the agent could not decide alone — add a session, adjust the target. |
| **On your plate** | `buildReminders({ sessions, events, routineOccurrences })` computed live, grouped **Overdue / Today / This week** | routine work the agent is already tracking for you. A session reminder links straight into the [MissionSession](src/screens/MissionSession.tsx); an event or routine has a **Mark done** button. |

Nothing here is a new notification stream — reminders are **derived** each load
from `plan_sessions` + `calendar_events` + `routine_occurrences`, and "done"
writes back to the underlying row. The sidebar **Inbox badge**
([useInboxCount.ts](src/study/useInboxCount.ts)) is `unread notifications +
overdue/today sessions + overdue/today events + overdue/today routine
occurrences`, polled every 60 s.

## Study Agent screens

| Route | Screen | What it does |
| --- | --- | --- |
| `/inbox` | [Inbox](src/screens/Inbox.tsx) | Digest + "Needs you" (decisions) + "On your plate" (computed reminders). The one place the agent surfaces. |
| `/calendar` | [Calendar](src/screens/Calendar.tsx) | Month grid of dates + study sessions; click a day for its agenda + quick-add; recurring-routine management. |
| `/missions` | [MissionsHome](src/screens/MissionsHome.tsx) | List missions; "New mission" CTA; sign-in notice in local mode. |
| `/missions/new` | [MissionCreate](src/screens/MissionCreate.tsx) | Subject select → Atlas topic checkboxes → exam date (min today) → sessions/week → minutes/session → `createMission` → diagnostic. |
| `/missions/:id/diagnostic` | [MissionDiagnostic](src/screens/MissionDiagnostic.tsx) | `2` AI questions per topic, student answers, AI grades → `seedDiagnosticAndPlan` (deterministic `seedMastery` + `generatePlan`) → Study Plan. |
| `/missions/:id` | [StudyPlan](src/screens/StudyPlan.tsx) | Confidence badge + `days remaining / sessions needed / sessions available`; per-topic cards (mastery bar, strategy pill, flat-session count, next session); the schedule timeline (pending / done / missed / revision); **"Re-plan now"** (agent, `MANUAL`) and **"Rebuild plan"** (deterministic `regeneratePlan`); unread notification cards; the agent activity feed. |
| `/missions/:id/s/:planSessionId` | [MissionSession](src/screens/MissionSession.tsx) | `item_count` (4) practice items on one topic at `difficultyForStrategy(base, level)`; `STRUGGLING` / `PERSISTENT` show closed-action scaffolding first; on finish → `recordMissionSession` (deterministic mastery update + `session_log` + mark session `done`) → fire `SESSION_COMPLETED`. |

Shared UI: [AgentActivity.tsx](src/study/AgentActivity.tsx) (latest ~50
`agent_events` with `applied` / `rejected` / `notified` badges and rejection
reasons), [NotificationCard.tsx](src/study/NotificationCard.tsx) (message +
human-decision action buttons), [ui.tsx](src/study/ui.tsx) /
[labels.ts](src/study/labels.ts).

## How the agent reuses the game

It does **not** fork the question-answering system:

- **`/api/ai`** — the diagnostic and every mission session use
  `generateEnemyQuestion` / `gradeBattleAnswer`; scaffolding uses the same
  `example` / `hint` / `steps` Learn actions. The closed-action registry is the
  boundary for the agent too.
- **Components** — [QuestionCard](src/components/QuestionCard.tsx),
  [AriaSpeech](src/components/AriaSpeech.tsx), `Panel` / `Btn` / `Spinner` are
  reused, so a mission session looks and behaves like a Challenge.
- **Atlas** — mission topics *are* Atlas topics; `getSubject` / `getTopic`
  provide names to the AI context and the UI.
- **Auth** — the same Supabase session; `useAuth()` supplies the user id and the
  JWT for `/api/agent/tick`.
- **The "AI judges, deterministic code computes" split** — identical to
  `src/game/engine.ts`; here the deterministic side is `src/study/` + the gate.

---

# The agent does the work, not you

The learning is yours; everything *around* it is the agent's. What used to be
your clicks and forms is now the agent's job:

| Was your work | Now the agent's | How |
| --- | --- | --- |
| Fill a 6-field form, hand-pick topics, type every exam date into the calendar | **Syllabus intake** — paste a syllabus / brief / topic list | [MissionCreate](src/screens/MissionCreate.tsx) → `createMissionFromSyllabus` → `/api/ai` `map_syllabus` maps the text onto Atlas topic ids, infers cadence + target, and writes the mission, `mission_topics` and every dated item into `calendar_events`. `syllabus_source = 'freetext'`. |
| Sit and wait while each practice item generates | **Session prep** — `prepare_session` | On Study Plan load (and on the agent's tick) the next pending session's 4 items are generated ahead and cached as a `session_items` artifact. [MissionSession](src/screens/MissionSession.tsx) loads them instantly (`Prepped` chip); falls back to live generation if absent. |
| Make your own revision notes | **Revision sheets** — `write_revision_sheet` | `/api/ai` writes a one-page KEY IDEAS / FORMULAS / COMMON MISTAKES / WORKED EXAMPLE sheet per topic. Button on each Study Plan topic card, or the agent does it for a weak/flat topic (max 2/tick). |
| Write a "here's where I am" update; write an email asking for an extension | **Draft-and-approve** — `write_progress_report` / `draft_message` | The agent drafts from *facts only* — never a fabricated reason. Lands as a `draft` artifact with a **Copy** button and **Looks good**. Nothing sends. The agent may draft an extension request only when the plan is `OFF_TRACK` or a deadline is ≤3 days away. |
| Track what the agent changed | **Weekly brief** | `weeklyFacts()` composes "what the agent did lately" from the last 7 days of applied `agent_events` + `session_log` — shown on the Study Plan. |

All of this is produced into **`mission_artifacts`** ([0004](supabase/migrations/0004_mission_artifacts.sql)) via the same deterministic gate, and surfaced by [ArtifactCard](src/study/ArtifactCard.tsx). None of it touches the student's coursework.

# How AI is used, end to end

Two model surfaces, each tightly boxed:

| Surface | Model | Used for | Can it write to the DB? |
| --- | --- | --- | --- |
| [`/api/ai`](api/ai.ts) | Gemini (`GEMINI_MODEL`, fallback `GEMINI_FALLBACK_MODEL`) | Generating and grading challenges (game nodes, boss trials, Story puzzles, Study Hall help, mission **diagnostic** + **session** items + **scaffolding**), and the agent's **producer** actions: `map_syllabus`, `write_revision_sheet`, `write_progress_report`, `draft_message` — extract / assemble / phrase, never solve. Returns prose or structured JSON. | **No.** It returns text/JSON to the caller. |
| [`/api/agent/decide.py`](api/agent/decide.py) | Bedrock (`BEDROCK_MODEL_ID`, Claude) via the Strands Agents SDK | **Decisions**: interpret the mission's deterministic state and propose plan changes + producer ops as one closed-contract JSON. | **No.** No Supabase client; read-only tools; output is validated by the gate, which then calls `/api/ai` and writes the artifacts. |

Hard boundaries that hold for both:

- No free-text prompt channel from the browser. `/api/ai` takes a closed `action`
  + structured `context`; the agent is invoked with a fixed snapshot.
- No `solve_this`. The agent's ops are schedule + admin only —
  `set_strategy` / `set_priority` / `insert_session` / `drop_session` /
  `move_session` / `replan` / `prepare_session` / `write_revision_sheet` /
  `draft_message`. Never an answer.
- No model writes XP, mastery, or a schedule directly. `src/game/engine.ts` and
  `src/study/` own every number; the gate owns every mutation.
- Keys stay server-side: `GEMINI_API_KEY` in `/api/ai` only; `AWS_*` in
  `decide.py` only. Never `VITE_`-prefixed.

# How Supabase is used, end to end

**Auth** — email magic-link ([src/auth/](src/auth/)).
[AuthProvider](src/auth/AuthProvider.tsx) holds the `Session`; on sign-in it
`fetchProgress(userId)` and hydrates the Zustand store
([src/store.ts](src/store.ts)). No env vars → **local mode**: no sign-in,
in-memory progress, Study Missions disabled with a notice.

**Postgres + RLS** — two migrations:

| Migration | Tables |
| --- | --- |
| [0001_init_progress.sql](supabase/migrations/0001_init_progress.sql) | `profiles` (+ new-user trigger), `subject_progress`, `topic_progress` — the game's per-user progress. |
| [0002_study_missions.sql](supabase/migrations/0002_study_missions.sql) | `study_missions`, `mission_topics`, `topic_mastery`, `plan_sessions`, `session_log`, `agent_events`, `notifications` — the Study Agent. |
| [0003_calendar_routines.sql](supabase/migrations/0003_calendar_routines.sql) | `calendar_events`, `routines`, `routine_occurrences` — the academic calendar + recurring routines. |
| [0004_mission_artifacts.sql](supabase/migrations/0004_mission_artifacts.sql) | `mission_artifacts` — things the agent produces for the student (prepped sessions, revision sheets, reports, message drafts). |

Every table has RLS. Game progress and `study_missions` / `notifications` scope
on `auth.uid() = user_id`; the five mission child tables scope through the
mission-ownership subquery shown [above](#rls).

**Three access patterns:**

| Caller | Client | Scope |
| --- | --- | --- |
| Browser | `@supabase/supabase-js` with the anon key + the user's session | RLS → the user's own rows. `src/lib/progress.ts` (game), `src/study/db.ts` (missions). |
| [api/agent/tick.ts](api/agent/tick.ts) | anon key + `Authorization: Bearer <user JWT>` forwarded from the browser | RLS → that user's mission only. Ownership is enforced by RLS, not by trusting `mission_id`. |
| [api/agent/daily.ts](api/agent/daily.ts) | **service role key** | all `active` missions, for the scheduled tick. The only RLS bypass; gated by `CRON_SECRET`. |

**Writes** — game progress is fire-and-forget optimistic upserts
([src/lib/progress.ts](src/lib/progress.ts)). Mission mastery and `session_log`
are written by [src/study/db.ts](src/study/db.ts) after the deterministic
`applySession`. `agent_events`, `plan_sessions` mutations and `notifications` from
a tick are written by the gate in [pipeline.ts](src/study/agent/pipeline.ts) /
[apply.ts](src/study/agent/apply.ts).

**Legacy** — [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts) is
the original Edge Function AI backend, superseded by `/api/ai`.

---

# Walkthroughs

### A. Playing a Challenge node

`LevelPath` → `Challenge` mounts → `generateEnemyQuestion({subject, topic, level, difficulty: node.tier})`
→ student answers → `gradeBattleAnswer(...)` → `{correct, quality}` → `engine.xpReward`
→ `addXp` + `completeNode` update Zustand → `persistProfile` / `persistTopic` upsert to Supabase (RLS).

### B. Creating a mission

`MissionCreate` form → `createMission(...)` inserts `study_missions` + one
`mission_topics` row per selected Atlas topic → navigate to
`/missions/:id/diagnostic` → for each topic, 2× (`generateEnemyQuestion` →
answer → `gradeBattleAnswer`) → `seedDiagnosticAndPlan`:
`seedMastery(items)` per topic → upsert `topic_mastery` + insert `session_log`
seed rows → `generatePlan(...)` → insert `plan_sessions` → Study Plan screen
renders `calculatePlanConfidence(...)`.

### C. Completing a mission session (the autonomous loop)

`MissionSession` runs 4 items → `recordMissionSession`:
`applySession(prevMastery, items, prevFlat, target)` →
update `topic_mastery` (mastery, attempts, `quality_avg` via `rollQualityAvg`,
`consecutive_flat_sessions`) + insert `session_log` + set `plan_sessions.status =
done` → UI shows before→after → `runAgentTick(missionId, 'SESSION_COMPLETED',
'SESSION_COMPLETED:<id>')` fires (best-effort). Server:
`tick.ts` auths the JWT → `runTick` → claim `agent_events` → `buildAgentContext`
→ `POST /api/agent/decide` → Strands returns e.g.
`ESCALATE_STRATEGY` + `set_strategy(forces, STRUGGLING)` +
`insert_session(forces, prerequisite_review)` → `validateDecision`: `forces`
has 2 flat sessions ✓, one rung ✓, week has capacity ✓ → `applyChanges` writes
the strategy + the new session → `agent_events` row finalized (`applied = true`)
→ next Study Plan load shows the new strategy pill, the remediation session, and
the activity-feed line.

### D. The daily tick

Vercel Cron `0 6 * * *` → `/api/agent/daily` (Bearer `CRON_SECRET`) → service
client lists `active` missions → `runTick` each with `trigger_id =
DAILY:<date>`. A mission whose exam is now 7 days out gets
`exam_proximity_crossing = 7` in its context; a mission with 2 missed sessions
and slipped confidence gets `REDISTRIBUTE` (`move_session` ops) — or, if the
plan can't be made feasible, `FLAG_FOR_HUMAN` with `notify: true`, which the gate
allows only if `OFF_TRACK` (or the proximity combo) and no notification has gone
out in 24 h. The student sees one [NotificationCard](src/study/NotificationCard.tsx)
on the Study Plan screen.

---

# Repository layout

```
api/
  ai.ts                     closed-action Gemini function (game + all question gen/grading)
  agent/
    decide.py               Strands agent on Bedrock — proposes a decision, no DB
    tick.ts                 single-mission tick (JWT/RLS) — SESSION_COMPLETED, MANUAL
    daily.ts                DAILY tick for every active mission (cron, service role)
    requirements.txt        strands-agents, boto3, pydantic

src/
  game/
    atlas.ts                SUBJECTS content model + lookups
    engine.ts               deterministic XP / HP / damage / crit / skill rank
    story.ts                Story I: 12 chapters × 3 levels
  lib/
    ai.ts                   client for /api/ai (typed helpers, retry)
    supabase.ts             the browser client (null in local mode)
    progress.ts             game-progress Supabase IO
    types.ts                shared AI + game contracts
  study/
    config.ts               all tunable constants
    types.ts                mission + calendar + routine row types, derived shapes
    dates.ts mastery.ts confidence.ts plan.ts strategy.ts calendar.ts   deterministic engine (unit-tested)
    db.ts                   mission + calendar + routine Supabase IO (browser)
    agent.ts                frontend runAgentTick()
    useInboxCount.ts        sidebar-badge hook
    MonthCalendar.tsx       reusable month grid (full on /calendar, compact in the Inbox)
    ui.tsx labels.ts        Study Mission presentational bits
    AgentActivity.tsx NotificationCard.tsx
    agent/
      contract.ts           decision + change-op enums, parseDecision, AgentContext
      context.ts            buildAgentContext (snapshot + calendar → compact context + metrics)
      validator.ts          the 7 gate rules  (unit-tested)
      schedule.ts           shared insert-date / week-bucket helpers
      apply.ts              approved ops → Supabase writes
      pipeline.ts           runTick — the shared tick pipeline
      *.test.ts             contract + validator tests
  screens/
    Atlas Country LevelPath Challenge            the game
    StoryHome StoryChapter StoryChallenge        Story mode
    LearnMode Quests Profile Login
    MissionsHome MissionCreate MissionDiagnostic StudyPlan MissionSession   missions
    Inbox Calendar                               the routine-load surface + academic calendar
  auth/  components/  theme/  store.ts  App.tsx

supabase/migrations/  0001_init_progress.sql   0002_study_missions.sql   0003_calendar_routines.sql
docs/study-agent.md   architecture + AWS/AgentCore/EventBridge mapping
vercel.json           the daily cron
```

---

# Setup

### 1. Frontend

```bash
npm install
cp .env.local.example .env.local     # fill in as needed
npm run dev
```

### 2. Serverless functions locally

`/api/ai`, `/api/agent/tick`, `/api/agent/daily` are Vercel functions; run them
alongside Vite with the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

`/api/agent/decide` (Python) additionally needs Bedrock credentials and the
`strands-agents` deps installed for the runtime. Without it, `/api/agent/tick`
returns a recoverable `503` and **the plan is left unchanged** — the rest of the
app is unaffected.

### 3. Supabase

1. Run migrations in order — [0001_init_progress.sql](supabase/migrations/0001_init_progress.sql),
   [0002_study_missions.sql](supabase/migrations/0002_study_missions.sql),
   [0003_calendar_routines.sql](supabase/migrations/0003_calendar_routines.sql)
   (Dashboard → SQL editor, or `supabase db push`). `0002` defines the
   `set_updated_at()` trigger function that `0003` reuses.
2. **Authentication → Providers**: enable **Email** (magic link).
3. **Authentication → URL Configuration**: set **Site URL**, add
   `http://localhost:5173/**` and your deployed origin to **Redirect URLs**.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Without Supabase env vars the app runs in **local mode**: no sign-in, in-memory
game progress, Study Missions disabled.

### 4. Deploy

Deploy to Vercel. Set the [environment variables](#environment-variables) in
**Project Settings → Environment Variables**. `api/**` is picked up
automatically; `vercel.json` registers the daily cron (Vercel sends it
`Authorization: Bearer $CRON_SECRET`).

> **Rotate the Gemini key** before any public deploy — anything pasted into a
> chat, commit, or screenshot is burned.

---

# Environment variables

| Var | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_AI_ENDPOINT` | client | yes | Where `/api/ai` lives. Default `/api/ai`. |
| `GEMINI_API_KEY` | server | yes | Read by `api/ai.ts` only. No `VITE_` prefix. |
| `GEMINI_MODEL` | server | no | Default `gemini-3.6-flash`. |
| `GEMINI_FALLBACK_MODEL` | server | no | Default `gemini-2.5-flash`; `""` disables. |
| `VITE_SUPABASE_URL` | client + functions | for auth / missions | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | client + functions | for auth / missions | Publishable/anon key. |
| `VITE_AGENT_ENDPOINT` | client | no | Where `runAgentTick` posts. Default `/api/agent/tick`. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | for the daily tick | `daily.ts` enumerates every active mission (RLS bypass). |
| `CRON_SECRET` | server | for the daily tick | Gates `daily.ts`; Vercel Cron sends it as the `Authorization` header. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | server (Python) | for the agent | Bedrock credentials for `decide.py`. |
| `BEDROCK_MODEL_ID` | server (Python) | no | Default `us.anthropic.claude-sonnet-4-5-20250929-v1:0`; must be enabled in your Bedrock account. |

---

# Testing

```bash
npm test           # node --test  (run once)
npm run test:watch
```

Tests run on **Node's built-in test runner** with native TypeScript type
stripping — no Vitest. Rollup's native binary does not install cleanly in every
Windows environment here, which breaks Vitest/Vite-based test runs; `node --test`
has zero extra dependencies. Because of this the test-reachable modules use
explicit `.ts` import extensions, and [tsconfig.node.json](tsconfig.node.json)
type-checks them (`*.test.ts` + `testkit.ts` are excluded from the app build in
[tsconfig.app.json](tsconfig.app.json)).

**75 tests, all deterministic logic:**

| File | Covers |
| --- | --- |
| `src/study/mastery.test.ts` | `observedQuality`, EWMA step, `applySession` (correct/low-q/wrong, boundaries, flat detection, streak reset), diagnostic seed, `rollQualityAvg`, `clamp01`. |
| `src/study/confidence.test.ts` | `ON_TRACK` / `AT_RISK` / `OFF_TRACK` bands, the 2-day emergency override, past-exam clamp, no-gap case, the row-type adapter join. |
| `src/study/plan.test.ts` | weekly cadence cap, date bounds, full topic coverage, weakest-topic weighting, the revision window, empty plan when the exam has passed, strategy/`item_count` pass-through. |
| `src/study/strategy.test.ts` | one-rung transitions, two-rung rejection, tier drop + floor, scaffold ladder. |
| `src/study/agent/contract.test.ts` | `parseDecision` accepts a well-formed decision; rejects an out-of-enum decision/trigger/op, bad `set_strategy` level, malformed date, missing `move_session` date, bare `drop_session`, non-objects; caps observations; coerces `notify`. |
| `src/study/agent/validator.test.ts` | each of the 7 rules — session cap (reject + allow-when-room), move-before-today, insert-after-exam, `NORMAL → PERSISTENT` jump, escalation with 1 flat session, non-mission topic + unknown session id (whole-decision reject), notify suppressed on `ON_TRACK`, notify allowed on `OFF_TRACK`, 24 h rate-limit, the exam-proximity notify combo. |
| `src/study/calendar.test.ts` | `routineOccurrenceDates` (weekly / biweekly parity / empty), `buildReminders` (window filtering, completed-event skip, overdue-first sort, action refs), `deadlineCrossings` (14/7/3/1 only), `upcomingCalendar` (future non-completed, nearest first), `routinesBehind` (missed + overdue-pending, recent only). |

The Python agent and the Supabase-touching pipeline are not unit-tested here (no
Bedrock creds / DB in this environment); `runTick` takes an injectable `decide`
fn and any Supabase client for future integration tests.

Pre-existing lint errors in [src/components/icons.tsx](src/components/icons.tsx)
(`react-hooks/static-components`) are unrelated to this work and are on `main`.

---

# Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server (use `vercel dev` to also serve `/api/*`). |
| `npm run build` | `tsc -b` (app + node projects) then `vite build`. |
| `npm run lint` | ESLint. |
| `npm test` / `npm run test:watch` | `node --test` over `src/**/*.test.ts`. |
| `npm run preview` | Serve the production build. |

---

# Look & feel

Arcade-only, Codecademy-inspired: a deep-navy ground, **indigo** primary
(`--mana`), **chartreuse** highlight (`--xp`), pink danger, mint success. Press
Start 2P for headings and buttons, VT323 for body; every corner squared, chunky
2px pixel frames with an offset shadow, faint animated CRT scanlines. One theme
axis only — `data-theme` `light` | `dark` on `<html>` (`system` resolved live);
`data-skin` is always `arcade` and there is no skin toggle. All colour is CSS
variables in [src/index.css](src/index.css) mapped to Tailwind utilities
(`bg-void`, `text-mana`, `border-edge`, …). Shared primitives —
`Panel` · `Btn` · `Bar` · `PageHeader` · `SectionTitle` · `Chip` · `Stat` ·
`EmptyState` — live in [src/components/ui.tsx](src/components/ui.tsx); the
persistent left rail is [src/components/AppShell.tsx](src/components/AppShell.tsx).

# Stack

React 19 · Vite · TypeScript · React Router 7 · Tailwind v4 · Framer Motion ·
lucide-react · Zustand · Supabase (Auth + Postgres + RLS) · Vercel Functions
(Node + Python) · Gemini API · **Strands Agents SDK** · **Amazon Bedrock** ·
Vercel Cron (→ AWS EventBridge Scheduler in the target topology).

---

# Status and roadmap

| Area | State |
| --- | --- |
| Learning game (Atlas, Challenge, Story, Study Hall, engine) | ✅ Working |
| Closed-action AI (`/api/ai`, retry/failover) | ✅ Working |
| Auth + game progress (Supabase, RLS, local-mode fallback) | ✅ Working |
| Study Missions: create, Atlas topic selection, diagnostic (2 Q/topic) | ✅ Working |
| Deterministic engine: EWMA mastery, flat detection, plan confidence, plan generator | ✅ Working, unit-tested |
| Mission sessions (4 items, strategy-aware, reuse Challenge components) | ✅ Working |
| Study Plan screen, Agent Activity feed, in-app notifications | ✅ Working |
| Academic Calendar (dates + recurring routines), fed into the agent context | ✅ Working |
| Inbox (digest + decisions + computed reminders) + sidebar badge | ✅ Working, calendar engine unit-tested |
| Strands agent (`decide.py`) + decision contract + parser + `get_calendar` tool | ✅ Built (needs Bedrock creds to run) |
| Deterministic gate: 7 validator rules, `applyChanges`, pipeline | ✅ Working, unit-tested |
| Triggers: `SESSION_COMPLETED`, `MANUAL`, `DAILY` (Vercel Cron; also materialises routines) | ✅ Wired |
| Idempotency (`agent_events` unique key) + fail-safe error handling | ✅ Working |
| Bedrock **AgentCore** hosting, **EventBridge Scheduler** | 📄 Documented ([docs/study-agent.md](docs/study-agent.md)), not wired |
| `student_model.level` in the agent context | ⚠️ Hardcoded to `1` in the pipeline |
| Notification action buttons (`add_session`, `adjust_target`) | ⚠️ Stubs (mark-read + best-effort rebuild) |
| Atlas Physics topics | ⚠️ Only Kinematics / Forces — the full demo script wants 4 |
| Free-text syllabus (`syllabus_source = 'freetext'`) | 🔭 Schema ready, UI deferred |
| Email / SMS / push notifications | ❌ Out of scope (in-app only) |
