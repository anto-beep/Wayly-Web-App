"""CORE-1 v1: Participant Profile Backbone.

Implements the participant profile aggregate, timeline event ledger, and
internal read APIs per the CORE-1 v1 spec.

Ships behind feature flag `core_1_profile_backbone`. When disabled, every
endpoint here returns 404.

Endpoints (all prefixed with /api/core):
  GET  /participants                       list participants the caller can access
  GET  /participants/{pid}                 single Participant record
  GET  /participants/{pid}/profile         composed ProfileAggregate
  GET  /participants/{pid}/timeline        paginated TimelineEvent[]
  POST /timeline/events                    write a new timeline event (internal)
  PATCH /participants/{pid}                update participant fields

Persona-aware strings are stored as token dicts {caregiver, participant_self}
and resolved at render time by the caller (frontend) or on request via the
?persona= query parameter.

Feature flag:
  CORE1_PROFILE_ENABLED (env, default "1"). Set to "0" to disable.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.core1")

core1_router = APIRouter(prefix="/core", tags=["core1"])

_db = None
_user_dep = None


def init_core1_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _flag_enabled() -> bool:
    return os.environ.get("CORE1_PROFILE_ENABLED", "1") != "0"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _resolve_persona(request: Request, user: dict) -> str:
    """caregiver | participant_self. Query param wins; falls back to user.role."""
    q = (request.query_params.get("persona") or "").strip().lower()
    if q in ("caregiver", "participant_self"):
        return q
    role = (user or {}).get("role", "caregiver")
    return "participant_self" if role == "participant" else "caregiver"


def _pick_token(tokens: Any, persona: str) -> str:
    if isinstance(tokens, dict):
        return tokens.get(persona) or tokens.get("caregiver") or ""
    return str(tokens or "")


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


async def _get_user_account_id(user: dict) -> Optional[str]:
    """Resolve the account this user belongs to. Mirrors batch3's
    _account_for_user but returns just the id, and never auto-creates."""
    uid = user.get("id")
    if not uid:
        return None
    member = await _db.account_members.find_one(
        {"user_id": uid, "status": "ACTIVE"}, {"_id": 0, "account_id": 1}
    )
    if member and member.get("account_id"):
        return member["account_id"]
    acct = await _db.accounts.find_one({"owner_user_id": uid}, {"_id": 0, "id": 1})
    if acct:
        return acct.get("id")
    return None


async def _assert_access(user: dict, pid: str) -> dict:
    """Return the participant doc if the caller can access it, else 404.

    Access rule (aligned with batch3's account model, which is the source of
    truth used by /api/account and the ParticipantSwitcher):
      - Same account_id, OR
      - Legacy fallback: same household_id (for records predating batch3).
    """
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p or p.get("is_archived") or p.get("status") == "REMOVED":
        raise HTTPException(status_code=404, detail="Participant not found")
    user_acct = await _get_user_account_id(user)
    if user_acct and p.get("account_id") == user_acct:
        return p
    user_hid = user.get("household_id")
    if user_hid and p.get("household_id") == user_hid:
        return p
    raise HTTPException(status_code=404, detail="Participant not found")


# ---------------------------------------------------------------------------
# Participant read/patch
# ---------------------------------------------------------------------------


class ParticipantPatch(BaseModel):
    name: Optional[str] = None
    provider_name: Optional[str] = None
    pension_status: Optional[str] = None
    classification: Optional[int] = None
    transition_status: Optional[str] = None


def _participant_public(p: dict) -> dict:
    """Sanitised participant object returned by API."""
    display = p.get("name") or p.get("preferred_name") or p.get("first_name")
    if not display and p.get("last_name"):
        display = f"{p.get('first_name','')} {p.get('last_name','')}".strip()
    return {
        "id": p.get("id"),
        "household_id": p.get("household_id"),
        "display_name": display or "Unnamed",
        "first_name": p.get("first_name"),
        "last_name": p.get("last_name"),
        "preferred_name": p.get("preferred_name"),
        "classification": {
            "band": p.get("classification") or p.get("classification_level"),
            "confidence": None,
            "source": p.get("classification_source") or "unknown",
            "effective_date": p.get("classification_effective_date"),
            "last_updated": _iso(p.get("updated_at")),
        },
        "provider": {
            "primary": p.get("provider_name"),
            "additional": p.get("additional_providers") or [],
            "last_updated": _iso(p.get("updated_at")),
        },
        "pension_status": p.get("pension_status") or "unknown",
        "transition_status": p.get("transition_status") or (
            "grandfathered_hcp" if (p.get("is_grandfathered") or p.get("is_grandfathered_hcp")) else "new_entrant_post_1nov2025"
        ),
        "is_primary": bool(p.get("is_primary")),
        "is_grandfathered": bool(p.get("is_grandfathered") or p.get("is_grandfathered_hcp")),
        "profile_completeness_pct": p.get("profile_completeness_pct"),
        "created_at": _iso(p.get("created_at")),
        "updated_at": _iso(p.get("updated_at")),
        "data_residency": "ap-southeast-2",
    }


@core1_router.get("/participants")
async def list_participants(request: Request):
    """List participants the caller can access.

    Prefers account-scope (batch3 model). Falls back to household-scope
    for legacy records without an account_id link.
    """
    await _assert_flag()
    user = await _user_dep(request)
    acct_id = await _get_user_account_id(user)
    hid = user.get("household_id")
    or_clauses = []
    if acct_id:
        or_clauses.append({"account_id": acct_id})
    if hid:
        or_clauses.append({"household_id": hid})
    if not or_clauses:
        return {"participants": []}
    q = {"$or": or_clauses, "is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}}
    cur = _db.participants.find(q, {"_id": 0}).sort("is_primary", -1).limit(100)
    docs = await cur.to_list(100)
    seen = set()
    unique = []
    for p in docs:
        if p.get("id") in seen:
            continue
        seen.add(p.get("id"))
        unique.append(p)
    return {"participants": [_participant_public(p) for p in unique]}


@core1_router.get("/participants/{pid}")
async def get_participant(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    p = await _assert_access(user, pid)
    return _participant_public(p)


@core1_router.patch("/participants/{pid}")
async def patch_participant(pid: str, payload: ParticipantPatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    p = await _assert_access(user, pid)

    updates: Dict[str, Any] = {"updated_at": _now()}
    events: List[Dict[str, Any]] = []
    if payload.name is not None and payload.name != p.get("name"):
        updates["name"] = payload.name
    if payload.provider_name is not None and payload.provider_name != p.get("provider_name"):
        updates["provider_name"] = payload.provider_name
        events.append({"event_type": "provider_changed", "old": p.get("provider_name"), "new": payload.provider_name})
    if payload.pension_status is not None and payload.pension_status != p.get("pension_status"):
        updates["pension_status"] = payload.pension_status
        events.append({"event_type": "pension_status_changed", "old": p.get("pension_status"), "new": payload.pension_status})
    if payload.classification is not None and payload.classification != p.get("classification"):
        updates["classification"] = payload.classification
        events.append({"event_type": "classification_updated", "old": p.get("classification"), "new": payload.classification})
    if payload.transition_status is not None and payload.transition_status != p.get("transition_status"):
        updates["transition_status"] = payload.transition_status
        events.append({"event_type": "transition_status_changed", "old": p.get("transition_status"), "new": payload.transition_status})

    await _db.participants.update_one({"id": pid}, {"$set": updates})

    # Write timeline events for each change
    for e in events:
        await _write_timeline_event(
            participant_id=pid,
            event_type=e["event_type"],
            event_source="core",
            actor_type="user",
            actor_id=user.get("id"),
            summary_tokens={
                "caregiver": f"{p.get('name','the participant')}'s {e['event_type'].replace('_',' ')}: {e['old']} → {e['new']}",
                "participant_self": f"Your {e['event_type'].replace('_',' ')}: {e['old']} → {e['new']}",
            },
        )

    p2 = await _db.participants.find_one({"id": pid}, {"_id": 0})
    return _participant_public(p2)


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------


async def _write_timeline_event(
    *,
    participant_id: str,
    event_type: str,
    event_source: str,
    actor_type: str = "system",
    actor_id: Optional[str] = None,
    summary_tokens: Optional[Dict[str, str]] = None,
    linked_artefact_id: Optional[str] = None,
    linked_artefact_type: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    linked_case_id: Optional[str] = None,  # reserved for LOOP-1
) -> dict:
    ev = {
        "id": str(uuid.uuid4()),
        "participant_id": participant_id,
        "event_type": event_type,
        "event_source": event_source,
        "event_timestamp": _now(),
        "actor_type": actor_type,
        "actor_id": actor_id,
        "summary_tokens": summary_tokens or {},
        "linked_artefact_id": linked_artefact_id,
        "linked_artefact_type": linked_artefact_type,
        "linked_case_id": linked_case_id,
        "metadata": metadata or {},
        "data_residency": "ap-southeast-2",
    }
    await _db.timeline_events.insert_one(dict(ev))
    return ev


class TimelineEventCreate(BaseModel):
    participant_id: str
    event_type: str
    event_source: str
    summary_tokens: Dict[str, str] = Field(default_factory=dict)
    actor_type: str = "system"
    linked_artefact_id: Optional[str] = None
    linked_artefact_type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


@core1_router.post("/timeline/events")
async def post_timeline_event(payload: TimelineEventCreate, request: Request):
    """Internal endpoint for tools to write timeline events."""
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_access(user, payload.participant_id)
    ev = await _write_timeline_event(
        participant_id=payload.participant_id,
        event_type=payload.event_type,
        event_source=payload.event_source,
        actor_type=payload.actor_type,
        actor_id=user.get("id"),
        summary_tokens=payload.summary_tokens,
        linked_artefact_id=payload.linked_artefact_id,
        linked_artefact_type=payload.linked_artefact_type,
        metadata=payload.metadata,
    )
    ev.pop("_id", None)
    ev["event_timestamp"] = _iso(ev["event_timestamp"])
    return ev


@core1_router.get("/participants/{pid}/timeline")
async def get_timeline(
    pid: str,
    request: Request,
    before: Optional[str] = Query(None, description="ISO timestamp, return events strictly older"),
    limit: int = Query(50, ge=1, le=200),
):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_access(user, pid)
    persona = await _resolve_persona(request, user)

    events = await _compose_timeline(pid, before=before, limit=limit)
    return {
        "events": [_render_timeline_event(e, persona) for e in events],
        "count": len(events),
        "persona": persona,
    }


def _render_timeline_event(ev: dict, persona: str) -> dict:
    return {
        "id": ev.get("id"),
        "participant_id": ev.get("participant_id"),
        "event_type": ev.get("event_type"),
        "event_source": ev.get("event_source"),
        "event_timestamp": _iso(ev.get("event_timestamp")),
        "actor_type": ev.get("actor_type"),
        "summary": _pick_token(ev.get("summary_tokens"), persona),
        "linked_artefact_id": ev.get("linked_artefact_id"),
        "linked_artefact_type": ev.get("linked_artefact_type"),
        "metadata": ev.get("metadata") or {},
    }


async def _compose_timeline(pid: str, *, before: Optional[str] = None, limit: int = 50) -> List[dict]:
    """Compose a timeline from timeline_events plus derived events from source tools.

    v1 strategy: read the native timeline_events collection AND synthesise
    events from each source tool's persistence (statements, invoices, care
    plans, csc runs, contribution estimates, lf1 correspondence, price
    checks). This gives coverage for historical data written before CORE-1
    landed, without requiring a backfill migration.
    """
    q: Dict[str, Any] = {"participant_id": pid}
    if before:
        try:
            ts = datetime.fromisoformat(before.replace("Z", "+00:00"))
            q["event_timestamp"] = {"$lt": ts}
        except Exception:
            pass

    events: List[dict] = []
    # Native timeline_events
    cur = _db.timeline_events.find(q, {"_id": 0}).sort("event_timestamp", -1).limit(limit * 2)
    async for e in cur:
        events.append(e)

    # Derived / synthetic events from source tools (best-effort, per-tool)
    events.extend(await _derived_events_for_participant(pid))

    # Sort merged list by timestamp descending
    def _ts(e: dict) -> datetime:
        v = e.get("event_timestamp")
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v
        if isinstance(v, str):
            try:
                dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                return datetime(1970, 1, 1, tzinfo=timezone.utc)
        return datetime(1970, 1, 1, tzinfo=timezone.utc)

    events.sort(key=_ts, reverse=True)

    if before:
        try:
            cutoff = datetime.fromisoformat(before.replace("Z", "+00:00"))
            events = [e for e in events if _ts(e) < cutoff]
        except Exception:
            pass

    return events[:limit]


async def _derived_events_for_participant(pid: str) -> List[dict]:
    """Synthesise timeline events from source-tool collections for historical
    artefacts written before CORE-1 shipped. Read-only; never persists."""
    out: List[dict] = []
    p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1, "name": 1, "first_name": 1, "preferred_name": 1})
    if not p:
        return out
    hid = p.get("household_id")
    name = p.get("preferred_name") or p.get("name") or p.get("first_name") or "the participant"

    async def _rows(coll: str, q: Dict[str, Any], limit: int = 30):
        try:
            cur = _db[coll].find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
            return await cur.to_list(limit)
        except Exception as e:
            logger.debug("derived %s failed: %s", coll, e)
            return []

    # Statements
    stmt_q = {"$or": [{"participant_id": pid}, {"household_id": hid}]}
    for s in await _rows("statements", stmt_q):
        ts = s.get("uploaded_at") or s.get("created_at")
        n = len(s.get("anomalies") or [])
        out.append({
            "id": f"stmt-{s.get('id')}",
            "participant_id": pid,
            "event_type": "statement_decoded",
            "event_source": "statement_decoder",
            "event_timestamp": ts,
            "actor_type": "user",
            "summary_tokens": {
                "caregiver": f"{name}'s {s.get('period_label') or 'statement'} decoded. {n} anomalies flagged." if n else f"{name}'s {s.get('period_label') or 'statement'} decoded. No issues.",
                "participant_self": f"Your {s.get('period_label') or 'statement'} decoded. {n} anomalies flagged." if n else f"Your {s.get('period_label') or 'statement'} decoded. No issues.",
            },
            "linked_artefact_id": s.get("id"),
            "linked_artefact_type": "statement",
        })

    # Invoices
    for i in await _rows("invoices", {"participant_id": pid}):
        recon = (i.get("reconciliation") or {})
        verdict = recon.get("overall_verdict")
        out.append({
            "id": f"inv-{i.get('id')}",
            "participant_id": pid,
            "event_type": "invoice_checked",
            "event_source": "invoice_checker",
            "event_timestamp": i.get("created_at"),
            "actor_type": "user",
            "summary_tokens": {
                "caregiver": f"Invoice from {i.get('provider_name') or 'provider'} checked: {verdict or 'reviewed'}",
                "participant_self": f"Your invoice from {i.get('provider_name') or 'provider'} checked: {verdict or 'reviewed'}",
            },
            "linked_artefact_id": i.get("id"),
            "linked_artefact_type": "invoice",
        })

    # Care plan reviews
    for r in await _rows("care_plan_review_runs", {"participant_id": pid} if False else {}):
        # Fallback: care_plan_review_runs may not always tag participant; skip if none
        continue

    # CSC runs (by user_id via household)
    users_in_hh = []
    if hid:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1}):
            users_in_hh.append(u.get("id"))
    if users_in_hh:
        for r in await _rows("csc_runs", {"user_id": {"$in": users_in_hh}}, limit=20):
            payload = (r.get("payload") or {})
            band = payload.get("resolved_classification") or payload.get("classification")
            out.append({
                "id": f"csc-{r.get('csc_run_id') or r.get('id')}",
                "participant_id": pid,
                "event_type": "csc_completed",
                "event_source": "csc",
                "event_timestamp": r.get("created_at"),
                "actor_type": "user",
                "summary_tokens": {
                    "caregiver": f"Classification self-check completed. Result: Level {band or '?'}",
                    "participant_self": f"Your classification self-check completed. Result: Level {band or '?'}",
                },
                "linked_artefact_id": r.get("csc_run_id") or r.get("id"),
                "linked_artefact_type": "csc_run",
            })

    # Contribution estimates
    if users_in_hh:
        for r in await _rows("contribution_estimates", {"user_id": {"$in": users_in_hh}}, limit=10):
            out.append({
                "id": f"ce-{r.get('id')}",
                "participant_id": pid,
                "event_type": "contribution_estimated",
                "event_source": "ce",
                "event_timestamp": r.get("created_at"),
                "actor_type": "user",
                "summary_tokens": {
                    "caregiver": f"Contribution estimate saved (Class {r.get('classification')})",
                    "participant_self": f"Your contribution estimate saved (Class {r.get('classification')})",
                },
                "linked_artefact_id": r.get("id"),
                "linked_artefact_type": "contribution_estimate",
            })

    # LF1 correspondence
    for lf in await _rows("lf1_correspondence", {"participant_id": pid}, limit=20):
        arch = lf.get("archetype") or "letter"
        status = lf.get("status") or "drafted"
        out.append({
            "id": f"lf-{lf.get('id')}",
            "participant_id": pid,
            "event_type": "letter_sent" if status == "sent" else "letter_drafted",
            "event_source": "lf1",
            "event_timestamp": lf.get("sent_at") or lf.get("created_at"),
            "actor_type": "user",
            "summary_tokens": {
                "caregiver": f"{arch.replace('_', ' ').title()} {status}",
                "participant_self": f"Your {arch.replace('_', ' ')} {status}",
            },
            "linked_artefact_id": lf.get("id"),
            "linked_artefact_type": "letter",
        })

    return out


# ---------------------------------------------------------------------------
# Profile aggregate
# ---------------------------------------------------------------------------


@core1_router.get("/participants/{pid}/profile")
async def get_profile(pid: str, request: Request):
    """Composed ProfileAggregate for the participant."""
    await _assert_flag()
    user = await _user_dep(request)
    p = await _assert_access(user, pid)
    persona = await _resolve_persona(request, user)

    hid = p.get("household_id")
    acct_id = p.get("account_id")

    # Household / account members. Prefer account_members (batch3) then fall
    # back to users-by-household_id for legacy records.
    household_members = []
    seen_uids = set()
    if acct_id:
        async for m in _db.account_members.find(
            {"account_id": acct_id, "status": "ACTIVE"},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
        ):
            uid = m.get("user_id")
            if not uid or uid in seen_uids:
                continue
            seen_uids.add(uid)
            household_members.append({
                "user_id": uid,
                "name": m.get("name"),
                "email": m.get("email"),
                "role": (m.get("role") or "caregiver").lower(),
                "participant_id": pid,
            })
    if hid and not household_members:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}):
            if u.get("id") in seen_uids:
                continue
            seen_uids.add(u.get("id"))
            household_members.append({
                "user_id": u.get("id"),
                "name": u.get("name"),
                "email": u.get("email"),
                "role": u.get("role") or "caregiver",
                "participant_id": pid,
            })

    # Latest artefacts (best-effort, tolerant of missing tools)
    try:
        latest = await _latest_artefacts(pid, hid)
    except Exception as e:
        logger.warning("core1 latest_artefacts failed pid=%s: %s", pid, e)
        latest = {}

    # Financial position (aggregated from latest statement + estimate + budget)
    try:
        financial = await _financial_position(pid, hid)
    except Exception as e:
        logger.warning("core1 financial_position failed pid=%s: %s", pid, e)
        financial = {
            "quarterly_budget": None,
            "spent_to_date_this_quarter": None,
            "rollover_risk_flag": None,
            "lifetime_cap_total": {"amount": 137917.01, "currency": "AUD", "source": "index1", "effective_date_of_underlying_rule": "2026-03-20"},
            "lifetime_cap_remaining": None,
            "last_statement_date": None,
        }

    # Timeline (top 15 events)
    try:
        timeline = await _compose_timeline(pid, limit=15)
    except Exception as e:
        logger.warning("core1 timeline compose failed pid=%s: %s", pid, e)
        timeline = []

    # Open cases: LOOP-1 populates this from the cases collection
    open_cases_agg = await _open_cases_for_profile(pid)

    return {
        "participant": _participant_public(p),
        "household": household_members,
        "financial_position": financial,
        "latest_artefacts": latest,
        "open_cases": open_cases_agg["preview"],
        "open_cases_total": open_cases_agg["total"],
        "timeline": [_render_timeline_event(e, persona) for e in timeline],
        "freshness": {
            "computed_at": _iso(_now()),
            "stale_after_seconds": 60,
        },
        "persona": persona,
    }


async def _open_cases_for_profile(pid: str) -> Dict[str, Any]:
    """Return open cases (top 10 preview) + true total for the profile page.

    Best-effort, if LOOP-1 hasn't been initialised or the collection is
    empty, returns an empty list. The collection is `cases` (LOOP-1 v1).
    """
    try:
        preview: List[dict] = []
        cur = _db.cases.find(
            {
                "participant_id": pid,
                "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
            },
            {"_id": 0},
        ).sort([("severity", -1), ("created_at", -1)]).limit(10)
        async for c in cur:
            preview.append({
                "id": c.get("id"),
                "case_type": c.get("case_type"),
                "title": c.get("title"),
                "summary": c.get("summary"),
                "severity": c.get("severity") or "medium",
                "status": c.get("status") or "open",
                "source_tool": c.get("source_tool"),
                "created_at": _iso(c.get("created_at")),
            })
        total = await _db.cases.count_documents({
            "participant_id": pid,
            "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
        })
        return {"preview": preview, "total": total}
    except Exception as e:
        logger.warning("core1 open_cases fetch failed: %s", e)
        return {"preview": [], "total": 0}


async def _latest_artefacts(pid: str, hid: Optional[str]) -> dict:
    """Return the most recent artefact card per tool, or None if the tool has
    not been used for this participant."""
    users_in_hh: List[str] = []
    if hid:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1}):
            users_in_hh.append(u.get("id"))

    async def _latest(coll: str, q: Dict[str, Any], sort_field: str = "created_at"):
        try:
            cur = _db[coll].find(q, {"_id": 0}).sort(sort_field, -1).limit(1)
            docs = await cur.to_list(1)
            return docs[0] if docs else None
        except Exception:
            return None

    stmt = await _latest("statements", {"$or": [{"participant_id": pid}, {"household_id": hid}]}, "uploaded_at")
    inv = await _latest("invoices", {"participant_id": pid})
    cpr = await _latest("care_plan_review_runs", {"participant_id": pid}, "triggered_at")
    csc = await _latest("csc_runs", {"user_id": {"$in": users_in_hh}} if users_in_hh else {"_impossible_": True})
    ce = await _latest("contribution_estimates", {"user_id": {"$in": users_in_hh}} if users_in_hh else {"_impossible_": True})
    lf = await _latest("lf1_correspondence", {"participant_id": pid})
    ppc = await _latest("ppc_saved_checks", {"user_id": {"$in": users_in_hh}} if users_in_hh else {"_impossible_": True})

    def _card(doc, atype, summary_fn, url_fn, status_fn=lambda d: None, ts_field="created_at"):
        if not doc:
            return None
        ts = doc.get(ts_field) or doc.get("created_at") or doc.get("uploaded_at") or doc.get("triggered_at")
        return {
            "artefact_type": atype,
            "artefact_id": doc.get("id") or doc.get("csc_run_id"),
            "created_at": _iso(ts),
            "summary_line": summary_fn(doc),
            "status": status_fn(doc),
            "url": url_fn(doc),
        }

    return {
        "statement": _card(
            stmt, "statement",
            lambda d: f"{d.get('period_label') or 'Statement'}, {len(d.get('anomalies') or [])} anomalies",
            lambda d: f"/tools/statement-decoder?statement={d.get('id')}",
            lambda d: f"{len(d.get('anomalies') or [])} anomalies" if d.get('anomalies') else "no issues",
            ts_field="uploaded_at",
        ),
        "invoice_check": _card(
            inv, "invoice",
            lambda d: f"Invoice from {d.get('provider_name') or 'provider'}, {(d.get('reconciliation') or {}).get('overall_verdict') or 'reviewed'}",
            lambda d: f"/ai-tools/invoice-checker?id={d.get('id')}",
            lambda d: (d.get('reconciliation') or {}).get('overall_verdict'),
        ),
        "care_plan_review": _card(
            cpr, "care_plan_review",
            lambda d: f"Care plan review, {d.get('status') or 'complete'}",
            lambda d: f"/tools/care-plan-reviewer?run={d.get('id')}",
            lambda d: d.get('status'),
            ts_field="triggered_at",
        ),
        "classification_check": _card(
            csc, "csc_run",
            lambda d: f"Classification self-check, Level {(d.get('payload') or {}).get('resolved_classification') or '?'}",
            lambda d: f"/ai-tools/classification-self-check?run={d.get('csc_run_id') or d.get('id')}",
            lambda d: (d.get('payload') or {}).get('confidence'),
        ),
        "contribution_estimate": _card(
            ce, "contribution_estimate",
            lambda d: f"Contribution estimate (Class {d.get('classification')})",
            lambda d: f"/ai-tools/contribution-estimator?id={d.get('id')}",
        ),
        "letter": _card(
            lf, "letter",
            lambda d: f"{(d.get('archetype') or 'letter').replace('_',' ').title()}, {d.get('status') or 'draft'}",
            lambda d: f"/tools/letters-and-follow-ups/{d.get('id')}",
            lambda d: d.get('status'),
        ),
        "price_check": _card(
            ppc, "price_check",
            lambda d: f"Price check saved, {d.get('service_category') or 'service'}",
            lambda d: "/ai-tools/provider-price-checker",
        ),
        "budget_projection": None,  # v1: BC-1 has no participant-scoped save yet
    }


async def _financial_position(pid: str, hid: Optional[str]) -> dict:
    """Compose the financial-position summary from the latest statement,
    latest contribution estimate, and INDEX-1 lifetime cap."""
    users_in_hh: List[str] = []
    if hid:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1}):
            users_in_hh.append(u.get("id"))

    # Latest statement
    stmt = None
    try:
        cur = _db.statements.find(
            {"$or": [{"participant_id": pid}, {"household_id": hid}]},
            {"_id": 0, "period_label": 1, "summary": 1, "uploaded_at": 1},
        ).sort("uploaded_at", -1).limit(1)
        docs = await cur.to_list(1)
        stmt = docs[0] if docs else None
    except Exception:
        pass

    spent = None
    last_stmt_date = None
    if stmt:
        summary = stmt.get("summary")
        if isinstance(summary, dict):
            spent = summary.get("total") or summary.get("total_spent") or None
        last_stmt_date = _iso(stmt.get("uploaded_at"))

    # Latest quarterly budget from qp1_schedules aggregate (best-effort)
    quarterly_budget = None
    try:
        agg = await _db.qp1_schedules.find_one({"participant_id": pid}, {"_id": 0, "quarterly_budget": 1})
        if agg:
            quarterly_budget = agg.get("quarterly_budget")
    except Exception:
        pass

    # Lifetime cap from INDEX-1 (fallback constants)
    lifetime_cap_total = 137917.01
    lifetime_cap_remaining = None  # v1: not yet reconciled against actual contributions

    return {
        "quarterly_budget": (
            {"amount": quarterly_budget, "currency": "AUD", "source": "budget_calculator"}
            if quarterly_budget is not None else None
        ),
        "spent_to_date_this_quarter": (
            {"amount": spent, "currency": "AUD", "source": "statement"} if spent is not None else None
        ),
        "rollover_risk_flag": None,  # v1: computed by QP-1 elsewhere
        "lifetime_cap_total": {"amount": lifetime_cap_total, "currency": "AUD", "source": "index1", "effective_date_of_underlying_rule": "2026-03-20"},
        "lifetime_cap_remaining": (
            {"amount": lifetime_cap_remaining, "currency": "AUD", "source": "computed"}
            if lifetime_cap_remaining is not None else None
        ),
        "last_statement_date": last_stmt_date,
    }


# ---------------------------------------------------------------------------
# Feature flag status
# ---------------------------------------------------------------------------


@core1_router.get("/status")
async def core1_status():
    """Public status endpoint for smoke testing."""
    return {
        "core_1_profile_backbone": _flag_enabled(),
        "version": "v1",
        "data_residency": "ap-southeast-2",
    }


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------


async def ensure_core1_indexes():
    """Create indexes on the timeline_events collection. Idempotent."""
    try:
        await _db.timeline_events.create_index([("participant_id", 1), ("event_timestamp", -1)])
        await _db.timeline_events.create_index("id", unique=True, sparse=True)
    except Exception as e:
        logger.warning("core1 index creation failed: %s", e)
