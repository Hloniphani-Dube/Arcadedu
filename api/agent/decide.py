"""Arcadedu Study Agent · the Strands decision layer.

This is the ONLY place a model reasons about the plan. It runs the Strands
Agents SDK against Amazon Bedrock, reads the compact mission snapshot through
read-only tools, and returns a single structured decision.

It does not touch Supabase and it cannot apply anything. /api/agent/tick.ts is
the deterministic gate that validates this decision and performs every write.

Runtime env (Vercel Project Settings → Environment Variables):
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION   Bedrock credentials
  BEDROCK_MODEL_ID   optional — defaults to a cross-region Claude Sonnet profile;
                     must be a model your account has enabled in Bedrock.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
)

SYSTEM_PROMPT = """You are the Arcadedu Study Agent.

Your one job: keep a student's exam-prep plan feasible as their reality drifts,
and stay quiet unless a human decision is genuinely required.

Hard boundaries:
- You manage the learning. The student does the learning. You NEVER solve or
  answer the student's actual work.
- You may only change the plan through the allowed operations below. A separate
  deterministic gate re-checks everything you propose and will reject anything
  off-contract, so propose the smallest correct change.

What the deterministic gate enforces (respect it, or your decision is dropped):
- Weekly sessions never exceed the mission's sessions_per_week.
- No session before today or after the exam date.
- Strategy moves at most ONE rung per tick: NORMAL <-> STRUGGLING <-> PERSISTENT.
- ESCALATE_STRATEGY / INSERT_REMEDIATION require a topic with at least 2
  consecutive flat sessions.
- Every change must reference a topic that belongs to this mission.
- notify=true is honoured only when the plan is OFF_TRACK, or the exam is <=3
  days away with a weak topic and >=2 missed sessions. At most one notification
  per 24h. When in doubt, notify=false.

Routine load:
- The student also has an academic calendar (exams, assignments, deadlines) and
  recurring routines. A deadline within ~7 days on a weak or below-target topic
  is a strong reason to REPRIORITIZE or REDISTRIBUTE toward that topic. Do NOT
  invent calendar entries or routines — you only read them.

Decision guide:
- Plan ON_TRACK and mastery moving: KEEP, changes=[].
- A topic improving well: ADVANCE_DIFFICULTY / DE_ESCALATE_STRATEGY (one rung
  toward NORMAL) with evidence.
- A topic flat for 2+ sessions and below target: ESCALATE_STRATEGY (one rung
  toward PERSISTENT) and/or INSERT_REMEDIATION (a prerequisite_review session).
- Missed sessions: REDISTRIBUTE (move_session) remaining work within the cap.
- Confidence slipped but still recoverable: REPRIORITIZE or REPLAN.
- The plan cannot reach the target without more time/lower target: FLAG_FOR_HUMAN
  with notify=true and no invented sessions.

Allowed change operations (JSON objects in `changes`):
- {"op":"set_strategy","topic":"<id>","level":"NORMAL|STRUGGLING|PERSISTENT"}
- {"op":"set_priority","topic":"<id>","priority":<int>}
- {"op":"insert_session","topic":"<id>","kind":"practice|prerequisite_review|revision","before":"YYYY-MM-DD"}
- {"op":"drop_session","topic":"<id>"}  or  {"op":"drop_session","session_id":"<uuid>"}
- {"op":"move_session","session_id":"<uuid>","to_date":"YYYY-MM-DD"}
- {"op":"replan"}

Keep `observations` to 2-4 short factual bullets. Keep `reason` to one sentence.
Use topic ids exactly as given by the tools.
"""

# --- structured decision contract (mirrors src/study/agent/contract.ts) --------

Decision = Literal[
    "KEEP",
    "REPRIORITIZE",
    "REDISTRIBUTE",
    "ADVANCE_DIFFICULTY",
    "ESCALATE_STRATEGY",
    "DE_ESCALATE_STRATEGY",
    "INSERT_REMEDIATION",
    "REPLAN",
    "FLAG_FOR_HUMAN",
]


class Change(BaseModel):
    op: Literal[
        "set_strategy",
        "set_priority",
        "insert_session",
        "drop_session",
        "move_session",
        "replan",
    ]
    topic: Optional[str] = None
    level: Optional[Literal["NORMAL", "STRUGGLING", "PERSISTENT"]] = None
    priority: Optional[int] = None
    kind: Optional[
        Literal["practice", "diagnostic", "prerequisite_review", "revision"]
    ] = None
    before: Optional[str] = None
    session_id: Optional[str] = None
    to_date: Optional[str] = None


class AgentDecision(BaseModel):
    decision: Decision
    observations: list[str] = Field(default_factory=list)
    reason: str = ""
    changes: list[Change] = Field(default_factory=list)
    notify: bool = False


# --- per-request context + read-only tools -----------------------------------

_CTX: dict[str, Any] = {}


def _run_agent(context: dict[str, Any], trigger: str) -> dict[str, Any]:
    global _CTX
    _CTX = context

    from strands import Agent, tool
    from strands.models import BedrockModel

    @tool
    def get_student_model() -> dict:
        """The student's level and the mission's cadence / deadline."""
        return {
            "student_model": _CTX.get("student_model", {}),
            "mission": _CTX.get("mission", {}),
            "current_date": _CTX.get("current_date"),
            "days_remaining": _CTX.get("days_remaining"),
        }

    @tool
    def get_topic_mastery() -> list:
        """Per-topic mastery, target, strategy level and consecutive flat sessions."""
        return _CTX.get("topics", [])

    @tool
    def get_current_plan() -> list:
        """Upcoming and recent plan sessions (id, topic, date, kind, status)."""
        return _CTX.get("current_plan", [])

    @tool
    def get_recent_sessions() -> list:
        """The most recent completed practice sessions with mastery before/after."""
        return _CTX.get("recent_sessions", [])

    @tool
    def analyze_weakness() -> dict:
        """Deterministic plan-confidence: band, sessions required vs available,
        weak topics, and how many sessions have been missed."""
        return {
            "plan_confidence": _CTX.get("plan_confidence", {}),
            "missed_sessions": _CTX.get("missed_sessions", 0),
            "exam_proximity_crossing": _CTX.get("exam_proximity_crossing"),
        }

    @tool
    def get_calendar() -> dict:
        """The student's upcoming academic dates (exam / assignment / quiz /
        deadline), any deadline sitting exactly on a 14/7/3/1-day milestone
        today, and how many recurring routines they have fallen behind on."""
        return {
            "calendar": _CTX.get("calendar", []),
            "deadline_crossings": _CTX.get("deadline_crossings", []),
            "routines_behind": _CTX.get("routines_behind", 0),
        }

    agent = Agent(
        model=BedrockModel(model_id=BEDROCK_MODEL_ID, temperature=0.2),
        system_prompt=SYSTEM_PROMPT,
        tools=[
            get_student_model,
            get_topic_mastery,
            get_current_plan,
            get_recent_sessions,
            analyze_weakness,
            get_calendar,
        ],
    )

    prompt = (
        f"Trigger: {trigger}. Inspect the mission with the tools, then decide. "
        "Return exactly one decision. Prefer KEEP with no changes when the plan "
        "is on track."
    )
    decision: AgentDecision = agent.structured_output(AgentDecision, prompt)

    out = decision.model_dump(exclude_none=True)
    out["trigger"] = trigger  # authoritative from the caller, not the model
    return out


# --- Vercel Python handler --------------------------------------------------


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("content-length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "invalid JSON body"})

        context = payload.get("context")
        trigger = payload.get("trigger", "MANUAL")
        if not isinstance(context, dict):
            return self._send(400, {"error": "context object is required"})

        try:
            decision = _run_agent(context, trigger)
        except Exception as exc:  # noqa: BLE001 — surface as a recoverable error
            return self._send(502, {"error": f"agent failed: {exc}"[:400]})

        return self._send(200, {"decision": decision})
