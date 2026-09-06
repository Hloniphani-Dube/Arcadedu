# Autonomous Study Agent

An agentic layer over Arcadedu: given a learning goal and a deadline, it keeps
the study plan feasible as the student's reality drifts, and stays quiet unless a
human decision is actually needed.

The learning principle is unchanged — **the AI teaches, it never does the
student's work** — and it extends: **the agent manages the learning, the student
does the learning.** There is no `solve_this` tool and no unrestricted prompt
channel anywhere in this layer.

## Separation of powers (spec §45)

```
  Strands agent  ──proposes──▶  Deterministic gate  ──approved──▶  Application
  (Bedrock)                     (validator, TS)                    (Supabase)
  interprets state              session cap, dates,                mastery (EWMA),
  chooses strategy              one strategy rung,                 plan sessions,
  proposes plan changes         escalation ≥2 flat,                strategy levels,
  (closed decision JSON)        mission-topic boundary,            agent_events,
                                notification permission,           notifications
                                idempotency
```

The model never writes to the database and never sees an XP or mastery number it
can set. It returns one `AgentDecisionJson` (closed `decision` enum + closed
change-op enum). Everything after that is deterministic TypeScript.

## Pieces

| Path | Role |
| --- | --- |
| `api/agent/decide.py` | **Strands agent.** Bedrock model, five read-only tools over the passed context, returns the structured decision. No DB access. |
| `api/agent/tick.ts` | Single-mission tick (`SESSION_COMPLETED`, `MANUAL`). Auths the caller's Supabase JWT → RLS-scoped. |
| `api/agent/daily.ts` | `DAILY` tick for every active mission. Vercel Cron → service-role client. |
| `src/study/agent/pipeline.ts` | The shared tick pipeline: load context → decide → gate → apply → log → notify. Owns idempotency. |
| `src/study/agent/contract.ts` | Decision + change-op enums and the strict `parseDecision` shape-check. |
| `src/study/agent/validator.ts` | The seven gate rules (spec §22). Pure, unit-tested. |
| `src/study/agent/context.ts` | `MissionSnapshot` → compact `AgentContext` (spec §19) + missed-session / exam-proximity metrics. |
| `src/study/agent/apply.ts` | Applies an approved change set to Supabase. |
| `src/study/agent.ts` | Frontend `runAgentTick()` — best-effort, never blocks the flow that fired it. |
| `src/study/AgentActivity.tsx` | The activity feed (latest ~50 `agent_events`). |
| `src/study/NotificationCard.tsx` | In-app notification with human-decision actions. |

## Triggers (spec §25)

- **`SESSION_COMPLETED`** — fired by `MissionSession` right after mastery is
  recorded. `trigger_id = SESSION_COMPLETED:<plan_session_id>`.
- **`DAILY`** — `vercel.json` cron at 06:00 → `/api/agent/daily`.
  `trigger_id = DAILY:<yyyy-mm-dd>`.
- **`MANUAL`** — the "Re-plan now" button on the Study Plan screen.
  `trigger_id = MANUAL:<3-minute bucket>` (coalesced).

## Idempotency (spec §34)

`agent_events` has `UNIQUE(mission_id, trigger_id)`. Each tick starts by
claim-inserting its event row; a unique-violation means the tick already ran, and
the prior outcome is returned unchanged. So the same session completion, the same
day's DAILY, and a double-clicked "Re-plan now" each apply at most once.

## Failure safety (spec §35)

| Failure | Behaviour |
| --- | --- |
| Strands / decide unreachable | plan unchanged, `agent_events` row logged with `rejected_reason`, `503 retryable` |
| Decision off-contract (bad JSON / enum / op) | plan unchanged, logged, `502` |
| Validator rejects | nothing applied (never partial), rejection logged |
| Supabase write fails mid-apply | `applied=false`, logged, `502` — no success claimed |

## Deployment

### Vercel (works today)

Set in **Project Settings → Environment Variables**:

| Var | For |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | tick auth + RLS reads/writes |
| `SUPABASE_SERVICE_ROLE_KEY` | `daily.ts` mission enumeration |
| `CRON_SECRET` | gates `daily.ts`; Vercel sends it as the cron `Authorization` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Bedrock, for `decide.py` |
| `BEDROCK_MODEL_ID` | optional; must be a model enabled in your Bedrock account |

`api/agent/requirements.txt` pins `strands-agents` + `boto3` for the Python
function. `vercel.json` registers the daily cron.

### Target AWS topology (spec §39)

```
React (Vercel)
   │
   ▼
/api/agent/tick , /api/agent/daily        ← deterministic gate + pipeline
   │
   ▼
Strands Agents SDK  (decide.py)           ← runs on Amazon Bedrock AgentCore
   │                                         when deployed there; the function
   ▼                                         body is unchanged
Amazon Bedrock (Claude)

AWS EventBridge Scheduler ──06:00──▶ /api/agent/daily
```

Moving `decide.py` onto **Bedrock AgentCore** and the schedule onto **EventBridge
Scheduler** is a hosting swap — the decision contract, the gate, and every
database write stay exactly where they are. The functional agent runs on Vercel
first; AgentCore is introduced only once it is stable.
