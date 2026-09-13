# Deployment

A step-by-step guide to taking Arcadedu from a local checkout to a live
Vercel + Supabase deployment. See [.env.local.example](.env.local.example)
for the full variable list and [README.md](README.md#ai-architecture) for how
the pieces fit together.

## 1. Create and configure Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run the migrations in [supabase/migrations/](supabase/migrations/)
   **in order**, `0001` through `0007`:
   ```
   0001_init_progress.sql
   0002_study_missions.sql
   0003_calendar_routines.sql
   0004_mission_artifacts.sql
   0005_onboarding.sql
   0006_routine_cadence.sql
   0007_calendar_time.sql
   ```
   Or, if you have the Supabase CLI linked to the project: `supabase db push`.
3. Confirm every table landed with Row-Level Security **enabled** — each
   migration turns it on for the tables it creates. Spot-check in
   **Table Editor** → a table → RLS toggle.
4. Note your **Project URL** and **anon (publishable) key**
   (**Project Settings → API**) — you'll need them in step 3.
5. Note your **service role key** from the same page — server-only, never
   put this behind a `VITE_` prefix or in client code.

## 2. Configure authentication

1. **Authentication → Providers**: enable **Email** (magic link). No other
   provider is wired up in the app.
2. **Authentication → URL Configuration**: add every origin the app will run
   from to **Redirect URLs**, for example:
   - `http://localhost:5173/**` (local dev)
   - `https://<your-project>.vercel.app/**` (Vercel preview/prod)
   - your custom domain, if any, with `/**`

Without a matching redirect URL, magic-link sign-in will silently fail to
return the user to the app.

## 3. Set environment variables in Vercel

Import the repository into Vercel, then in **Project Settings → Environment
Variables** set:

| Variable | Scope | Source |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | client | Supabase → Project Settings → API (anon/publishable key) |
| `GEMINI_API_KEY` | server | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | server (optional) | defaults to `gemini-3.6-flash` |
| `GEMINI_FALLBACK_MODEL` | server (optional) | defaults to `gemini-2.5-flash`; set to `""` to disable |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase → Project Settings → API (service role) |
| `CRON_SECRET` | server | generate your own random string (e.g. `openssl rand -hex 32`) |
| `AWS_ACCESS_KEY_ID` | server (Python) | IAM user/role with Bedrock invoke permission |
| `AWS_SECRET_ACCESS_KEY` | server (Python) | same IAM credential |
| `AWS_REGION` | server (Python) | the region your Bedrock model access is enabled in |
| `BEDROCK_MODEL_ID` | server (Python, optional) | must be a model your account has enabled in Bedrock |

Never commit any of these values — `.env.local` is gitignored, and only
`.env.local.example` (placeholders) is tracked. Set them in the Vercel
dashboard, not in a file in the repo.

## 4. Deploy the repository to Vercel

1. Push the repository to GitHub and import it in Vercel, or run `vercel` /
   `vercel --prod` from the CLI.
2. Vercel builds with `npm run build` (see [vercel.json](vercel.json) and
   [package.json](package.json)) and serves `api/*` as serverless functions —
   Node for the `.ts` functions, Python for `api/agent/decide.py` (pinned by
   [api/agent/requirements.txt](api/agent/requirements.txt)).
3. Confirm the deployment builds cleanly and the app loads at the assigned
   `*.vercel.app` URL.

## 5. Configure and verify the daily cron

`vercel.json` already registers the schedule:

```json
{ "crons": [{ "path": "/api/agent/daily", "schedule": "0 6 * * *" }] }
```

Vercel Cron calls this path once a day and sends
`Authorization: Bearer <CRON_SECRET>` — [api/agent/daily.ts](api/agent/daily.ts)
rejects any request that doesn't match. To verify without waiting for 06:00:

```bash
curl -X POST https://<your-deployment>/api/agent/daily \
  -H "Authorization: Bearer <CRON_SECRET>"
```

A healthy response is `{ "processed": <n>, "date": "...", "results": [...] }`.
`401` means `CRON_SECRET` doesn't match; `500` means Supabase env vars are
missing.

## 6. Verify Gemini

In the deployed app, open any subject → topic → node and answer a generated
question (or use **Learn** for a hint). If `GEMINI_API_KEY` is missing or
invalid, `/api/ai` returns a `500`/`502` and the UI shows *"the AI is busy,
try again."* Check the Vercel function logs for the underlying Gemini error
if that persists.

## 7. Verify Bedrock / Strands

Create a Study Mission, complete a session (or use **Re-plan now** on the
Study Plan screen) to fire a tick. If Bedrock credentials are missing, wrong,
or the model in `BEDROCK_MODEL_ID` isn't enabled for your account,
`/api/agent/tick` returns a recoverable `503` and the plan is left unchanged
— nothing else in the app breaks. Check Vercel function logs for
`api/agent/decide.py`'s error to confirm the exact Bedrock failure (common
ones: model not enabled in that region, IAM policy missing
`bedrock:InvokeModel`).

## 8. Test the Study Agent end to end

1. Create a mission with a near-term exam date and a few topics.
2. Run the diagnostic.
3. Complete a session and confirm `SESSION_COMPLETED` fires a tick
   (check **Inbox** for a fresh entry in the activity feed, or the
   `agent_events` table in Supabase).
4. Manually trigger the daily cron (step 5) and confirm it processes the
   mission without erroring.
5. Confirm a rejected or off-contract decision leaves the plan untouched —
   the gate should never partially apply a change.

## 9. Confirm no secrets are exposed publicly

Before sharing the deployment or the repository:

- Open the deployed app, DevTools → Network, and check that no request or
  response body contains `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`, or any `AWS_*` value. Only `VITE_`-prefixed variables should
  ever reach the browser bundle.
- Confirm `.env.local` is not tracked: `git ls-files | grep env` should only
  show `.env.local.example` and `supabase/.env.local.example`.
- If any real key was ever pasted into a commit, a chat log, or a shared
  screenshot, rotate it (Gemini: regenerate at aistudio.google.com; AWS:
  rotate the IAM access key; Supabase: regenerate the service role key in
  Project Settings → API) before treating the deployment as safe to share.
