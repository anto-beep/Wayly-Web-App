"""SD-3 v1 slice: Care Management explainer + first-run overlay + minimal
cross-statement pair endpoint.

Full SD-3 v1 spec has 48 acceptance tests. This slice ships:
  - Care Management line detection + explainer read API
  - First-run overlay state get/dismiss
  - Statement-pair skeleton (records the pair; duplicate detection is v2 work
    that requires proper fixtures and prompt hardening per spec Section K.7)

All endpoints under /api/sd3.
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger("wayly.sd3")

sd3_router = APIRouter(prefix="/sd3", tags=["sd3"])

_db = None
_user_dep = None
_core1_write_event = None
_core1_assert_access = None
_loop1_open_case = None


def init_sd3(*, db, user_dep, core1_write_timeline_event, core1_assert_access, loop1_open_case=None):
    global _db, _user_dep, _core1_write_event, _core1_assert_access, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline_event
    _core1_assert_access = core1_assert_access
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("SD3_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Care Management explainer
# ---------------------------------------------------------------------------

CM_KEYWORDS = re.compile(r"care\s*management|care\s*coordination|case\s*management", re.IGNORECASE)


def _detect_care_management(statement: dict) -> Optional[dict]:
    """Best-effort detection of the Care Management line in a decoded statement.

    Looks at line_items[] or normalized_lines[] for a matching description or
    known code prefix. Returns a summary dict or None.
    """
    lines = statement.get("line_items") or statement.get("normalized_lines") or statement.get("lines") or []
    for l in lines:
        if not isinstance(l, dict):
            continue
        desc = str(l.get("description") or l.get("item") or l.get("label") or "")
        code = str(l.get("code") or l.get("service_code") or "")
        if CM_KEYWORDS.search(desc) or code.startswith("CM") or code.startswith("CARE_MGMT"):
            units = l.get("units") or l.get("quantity")
            amount = l.get("amount") or l.get("total") or l.get("dollar_amount")
            try:
                units_f = float(units) if units is not None else None
            except Exception:
                units_f = None
            try:
                amount_f = float(amount) if amount is not None else None
            except Exception:
                amount_f = None
            return {
                "detected": True,
                "line_id": l.get("id") or l.get("line_id"),
                "units": units_f,
                "hours_equivalent": units_f,  # v1 assumption 1 unit = 1 hour per spec locked decision 4
                "dollar_amount": amount_f,
            }
    return None


CM_EXPLAINER_CAREGIVER = (
    "This line is {hours_display} of care management for the month. Care management "
    "is the coordination and administration your provider does behind the scenes: "
    "arranging services, monitoring {participant_name}'s plan, and keeping records. "
    "Under Support at Home, care management is capped at 10% of the quarterly budget "
    "and is deducted from the quarterly envelope before services are delivered. It is "
    "not paid separately by the government on top of your services."
)

CM_EXPLAINER_PARTICIPANT_SELF = (
    "This line is {hours_display} of care management for the month. Care management "
    "is the coordination and administration your provider does behind the scenes: "
    "arranging services, monitoring your plan, and keeping records. Under Support "
    "at Home, care management is capped at 10% of your quarterly budget and is "
    "deducted from your envelope before services are delivered. It is not paid "
    "separately by the government on top of your services."
)


@sd3_router.get("/statements/{sid}/care-management")
async def care_management_explainer(sid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    stmt = await _db.statements.find_one({"id": sid}, {"_id": 0})
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    if stmt.get("participant_id"):
        await _core1_assert_access(user, stmt["participant_id"])

    cm = stmt.get("care_management_line")
    if not cm or not cm.get("detected"):
        cm = _detect_care_management(stmt) or {"detected": False}

    # Participant name for the placeholder
    pname = "your loved one"
    if stmt.get("participant_id"):
        p = await _db.participants.find_one({"id": stmt["participant_id"]}, {"_id": 0, "first_name": 1, "preferred_name": 1, "name": 1})
        if p:
            pname = p.get("preferred_name") or p.get("first_name") or p.get("name") or pname

    hours = cm.get("hours_equivalent") or cm.get("units") or 0
    hours_display = f"{hours:g} hour{'s' if hours != 1 else ''}" if hours else "recorded hours"
    if cm.get("units") == 0:
        hours_display = "0 hours (your provider may charge this at other times in the quarter)"

    tokens = {
        "caregiver": CM_EXPLAINER_CAREGIVER.format(hours_display=hours_display, participant_name=pname),
        "participant_self": CM_EXPLAINER_PARTICIPANT_SELF.format(hours_display=hours_display),
    }

    return {
        "detected": cm.get("detected", False),
        "units": cm.get("units"),
        "hours_equivalent": cm.get("hours_equivalent"),
        "dollar_amount": cm.get("dollar_amount"),
        "explanation_tokens": tokens,
        "source_link": "https://www.health.gov.au/our-work/support-at-home/about",
    }


@sd3_router.get("/statements/{sid}/rights-annotations")
async def rights_annotations(sid: str, request: Request):
    """Statement of Rights annotations for a decoded statement: which of the
    participant's rights the findings touch, and what they can do about it."""
    await _assert_flag()
    from services.sor_annotations import annotate_statement

    user = await _user_dep(request)
    stmt = await _db.statements.find_one({"id": sid}, {"_id": 0, "anomalies": 1, "participant_id": 1})
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    if stmt.get("participant_id"):
        await _core1_assert_access(user, stmt["participant_id"])
    result = annotate_statement(stmt.get("anomalies") or [])
    result["statement_id"] = sid
    return result



@sd3_router.post("/statements/{sid}/care-management/mark-shown")
async def mark_cm_shown(sid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    stmt = await _db.statements.find_one({"id": sid}, {"_id": 0, "participant_id": 1})
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    if stmt.get("participant_id"):
        await _core1_assert_access(user, stmt["participant_id"])
    await _db.statements.update_one(
        {"id": sid},
        {"$set": {"care_management_line.explanation_shown_to_user": True}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# First-run overlay
# ---------------------------------------------------------------------------


@sd3_router.get("/first-run-overlay/state")
async def get_overlay_state(request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        return {"should_show": False}
    u = await _db.users.find_one({"id": uid}, {"_id": 0, "ui_state": 1})
    shown = ((u or {}).get("ui_state") or {}).get("statement_first_run_overlay_shown")
    # Show if not shown AND user has at least one decoded statement
    has_stmt = await _db.statements.count_documents({"$or": [{"user_id": uid}, {"uploaded_by_user_id": uid}]}) > 0
    # Broader net: also count via household
    if not has_stmt and (u or {}).get("household_id"):
        has_stmt = await _db.statements.count_documents({"household_id": (u or {}).get("household_id")}) > 0
    return {"should_show": bool(not shown and has_stmt)}


class OverlayDismiss(BaseModel):
    choice: str  # "got_it" | "show_again"


@sd3_router.post("/first-run-overlay/dismiss")
async def dismiss_overlay(body: OverlayDismiss, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="unauthenticated")
    if body.choice not in ("got_it", "show_again"):
        raise HTTPException(status_code=422, detail="bad choice")
    if body.choice == "got_it":
        await _db.users.update_one(
            {"id": uid},
            {"$set": {
                "ui_state.statement_first_run_overlay_shown": True,
                "ui_state.statement_first_run_overlay_dismissed_at": _now(),
            }},
        )
    return {"ok": True, "shown": body.choice == "got_it"}


# ---------------------------------------------------------------------------
# Statement pair (skeleton for cross-statement diff)
# ---------------------------------------------------------------------------


class PairCreate(BaseModel):
    participant_id: str
    statement_a_id: str
    statement_b_id: str
    pair_type: str = "manual_pair"  # changeover_hcp_to_sah | consecutive_same_program | manual_pair
    boundary_date: Optional[str] = None
    use_ai: bool = True  # set False to force the heuristic path (used by tests)


@sd3_router.post("/pairs")
async def create_pair(payload: PairCreate, request: Request):
    """Create a statement pair. When use_ai=True (default) uses the AI-assisted
    detector with the heuristic detector as fallback. Emits a LOOP-1 case on
    finding candidates so caregivers can act via the profile."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, payload.participant_id)

    a = await _db.statements.find_one({"id": payload.statement_a_id}, {"_id": 0})
    b = await _db.statements.find_one({"id": payload.statement_b_id}, {"_id": 0})
    if not a or not b:
        raise HTTPException(status_code=404, detail="One or both statements not found")

    ids_sorted = sorted([payload.statement_a_id, payload.statement_b_id])
    existing = await _db.statement_pairs.find_one({
        "participant_id": payload.participant_id,
        "statement_a_id": ids_sorted[0],
        "statement_b_id": ids_sorted[1],
    }, {"_id": 0})
    if existing:
        return _pair_public(existing)

    # Re-fetch a,b in the sorted order used to store the pair so that the
    # candidate line_ids resolve correctly downstream (draft-letter etc.).
    if ids_sorted[0] != payload.statement_a_id:
        a, b = b, a

    if payload.use_ai:
        candidates = await _ai_detect_duplicates(a, b)
    else:
        candidates = _detect_duplicate_candidates(a, b)

    pair_id = str(uuid.uuid4())
    pair = {
        "id": pair_id,
        "participant_id": payload.participant_id,
        "statement_a_id": ids_sorted[0],
        "statement_b_id": ids_sorted[1],
        "pair_type": payload.pair_type,
        "boundary_date": payload.boundary_date,
        "duplicate_candidate_count": len(candidates),
        "duplicate_candidates_generated": True,
        "cross_boundary_findings_generated": False,
        "estimated_billing_findings_generated": False,
        "user_review_status": "not_started",
        "detector": "ai" if (payload.use_ai and candidates and candidates[0].get("source") == "ai") else "heuristic",
        "created_at": _now(),
        "data_residency": "ap-southeast-2",
    }
    await _db.statement_pairs.insert_one(dict(pair))

    for c in candidates:
        await _db.duplicate_candidates.insert_one({
            "id": str(uuid.uuid4()),
            "statement_pair_id": pair_id,
            "statement_a_line_id": c["a_line_id"],
            "statement_b_line_id": c["b_line_id"],
            "match_type": c["match_type"],
            "confidence": c["confidence"],
            "user_decision": "unconfirmed",
            "suggested_summary_tokens": {
                "caregiver": c["summary"],
                "participant_self": c["summary"],
            },
            "reason": c.get("reason"),
            "source": c.get("source") or "heuristic",
            "created_at": _now(),
        })

    # Emit a LOOP-1 case so the profile's Open follow-ups picks it up
    case_id = None
    try:
        case = await _open_case_for_pair(payload.participant_id, pair_id, len(candidates), user.get("id"))
        if case:
            case_id = case.get("id")
            await _db.statement_pairs.update_one({"id": pair_id}, {"$set": {"case_id": case_id}})
    except Exception:
        pass

    try:
        await _core1_write_event(
            participant_id=payload.participant_id, event_type="statement_pair_created", event_source="sd3",
            actor_type="user", actor_id=user.get("id"),
            summary_tokens={
                "caregiver": f"Statement pair created with {len(candidates)} candidate duplicates.",
                "participant_self": f"Statement pair created with {len(candidates)} candidate duplicates.",
            },
            linked_artefact_id=pair_id,
            linked_artefact_type="statement_pair",
            linked_case_id=case_id,
        )
    except Exception:
        pass

    pair2 = await _db.statement_pairs.find_one({"id": pair_id}, {"_id": 0})
    return _pair_public(pair2 or pair)


@sd3_router.get("/pairs/{pair_id}")
async def get_pair(pair_id: str, request: Request):
    """Return a statement pair with its candidates."""
    await _assert_flag()
    user = await _user_dep(request)
    p = await _db.statement_pairs.find_one({"id": pair_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pair not found")
    await _core1_assert_access(user, p["participant_id"])
    cands = []
    async for c in _db.duplicate_candidates.find({"statement_pair_id": pair_id}, {"_id": 0}).sort("created_at", 1):
        c["created_at"] = _iso(c.get("created_at"))
        cands.append(c)
    return {**_pair_public(p), "candidates": cands, "case_id": p.get("case_id")}


class CandidateDecision(BaseModel):
    decision: str  # confirmed_duplicate | not_duplicate | uncertain


@sd3_router.patch("/candidates/{candidate_id}")
async def resolve_candidate(candidate_id: str, payload: CandidateDecision, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.duplicate_candidates.find_one({"id": candidate_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    p = await _db.statement_pairs.find_one({"id": c["statement_pair_id"]}, {"_id": 0, "participant_id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Pair not found")
    await _core1_assert_access(user, p["participant_id"])
    if payload.decision not in ("confirmed_duplicate", "not_duplicate", "uncertain"):
        raise HTTPException(status_code=422, detail="Bad decision")
    await _db.duplicate_candidates.update_one(
        {"id": candidate_id},
        {"$set": {"user_decision": payload.decision, "user_decided_at": _now(), "user_decided_by_user_id": user.get("id")}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Letter-from-Duplicate export (LF-1 draft prefilled from a confirmed candidate)
# ---------------------------------------------------------------------------


@sd3_router.post("/candidates/{candidate_id}/draft-letter")
async def draft_letter_from_candidate(candidate_id: str, request: Request):
    """Create an LF-1 correspondence draft (archetype='billing_query',
    direction='outbound_to_provider') prefilled with the duplicate candidate's
    statement line references and provider name. Idempotent, if a draft was
    already created for this candidate we return it."""
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    c = await _db.duplicate_candidates.find_one({"id": candidate_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    p = await _db.statement_pairs.find_one({"id": c["statement_pair_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pair not found")
    await _core1_assert_access(user, p["participant_id"])

    if c.get("lf1_entry_id"):
        existing = await _db.lf1_correspondence.find_one({"id": c["lf1_entry_id"], "user_id": uid}, {"_id": 0})
        if existing:
            return {"lf1_entry_id": existing["id"], "already_existed": True}

    # Pull line-item context from both statements
    a = await _db.statements.find_one({"id": p["statement_a_id"]}, {"_id": 0}) or {}
    b = await _db.statements.find_one({"id": p["statement_b_id"]}, {"_id": 0}) or {}
    provider_name = a.get("provider_name") or b.get("provider_name") or "your provider"

    def _line_by_id(stmt, lid):
        for l in (stmt.get("line_items") or stmt.get("lines") or []):
            if isinstance(l, dict) and (l.get("id") == lid or l.get("line_id") == lid):
                return l
        return None
    la = _line_by_id(a, c.get("statement_a_line_id")) or {}
    lb = _line_by_id(b, c.get("statement_b_line_id")) or {}

    part = await _db.participants.find_one({"id": p["participant_id"]}, {"_id": 0, "first_name": 1, "preferred_name": 1, "name": 1}) or {}
    pname = part.get("preferred_name") or part.get("first_name") or part.get("name") or "the participant"

    lines_text = "\n".join([
        f"- Statement {a.get('period_label') or 'A'}: {la.get('description') or la.get('item') or 'line item'}, ${la.get('amount') or la.get('total') or '?'} on {la.get('date') or la.get('service_date') or 'an unknown date'}.",
        f"- Statement {b.get('period_label') or 'B'}: {lb.get('description') or lb.get('item') or 'line item'}, ${lb.get('amount') or lb.get('total') or '?'} on {lb.get('date') or lb.get('service_date') or 'an unknown date'}.",
    ])
    content = (
        f"Dear {provider_name},\n\n"
        f"I am writing on behalf of {pname} to raise a possible duplicate charge across two recent statements. "
        f"The following line items appear in both statements and may reflect a duplicate billing:\n\n"
        f"{lines_text}\n\n"
        f"Could you please review these entries and confirm whether one is a duplicate that should be reversed? "
        f"If it is not a duplicate, could you please explain what each charge covers?\n\n"
        f"Thank you for your help.\n\n"
        f"Kind regards,\n"
    )

    import uuid as _uuid
    from datetime import timedelta as _td
    entry_id = str(_uuid.uuid4())
    doc = {
        "id": entry_id,
        "user_id": uid,
        "participant_id": p["participant_id"],
        "direction": "outbound_to_provider",
        "archetype": "billing_query",
        "situation_id": "duplicate_billing",
        "situation_label": "Duplicate billing enquiry",
        "recipient_type": "provider",
        "recipient_specific": provider_name,
        "sender_identity": "caregiver",
        "sender_authority_basis": None,
        "complaint_mode": False,
        "atsi_preference": False,
        "content_draft": content,
        "content_final": None,
        "draft_versions": [],
        "output_formats_generated": [],
        "status": "draft",
        "sent_at": None,
        "sent_via": None,
        "expected_response_by": (_now() + _td(days=14)).isoformat(),
        "follow_up_date": (_now() + _td(days=14)).isoformat(),
        "response_received_at": None,
        "response_summary": None,
        "next_action_suggested": None,
        "source_import": {
            "source_tool": "sd3",
            "candidate_id": candidate_id,
            "pair_id": p["id"],
            "statement_a_id": p["statement_a_id"],
            "statement_b_id": p["statement_b_id"],
        },
        "intake": {},
        "shared_with": [],
        "sign_off_required": False,
        "sign_off_by": None,
        "sign_off_at": None,
        "replies_to": None,
        "inbound_source": None,
        "inbound_received_at": None,
        "feedback": None,
        "terms_ack": False,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await _db.lf1_correspondence.insert_one(dict(doc))
    await _db.duplicate_candidates.update_one({"id": candidate_id}, {"$set": {"lf1_entry_id": entry_id, "letter_drafted_at": _now()}})

    try:
        await _core1_write_event(
            participant_id=p["participant_id"], event_type="letter_drafted", event_source="sd3",
            actor_type="user", actor_id=uid,
            summary_tokens={
                "caregiver": f"Duplicate billing letter drafted to {provider_name}.",
                "participant_self": f"Duplicate billing letter drafted to {provider_name}.",
            },
            linked_artefact_id=entry_id,
            linked_artefact_type="letter",
            metadata={"pair_id": p["id"], "candidate_id": candidate_id},
        )
    except Exception:
        pass

    return {"lf1_entry_id": entry_id, "already_existed": False, "provider_name": provider_name}


def _pair_public(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "participant_id": p.get("participant_id"),
        "statement_a_id": p.get("statement_a_id"),
        "statement_b_id": p.get("statement_b_id"),
        "pair_type": p.get("pair_type"),
        "boundary_date": p.get("boundary_date"),
        "duplicate_candidate_count": p.get("duplicate_candidate_count") or 0,
        "user_review_status": p.get("user_review_status") or "not_started",
        "created_at": _iso(p.get("created_at")),
    }


def _detect_duplicate_candidates(a: dict, b: dict) -> List[Dict[str, Any]]:
    """Very conservative v1 detector: exact same amount + description similarity
    across the two statements. Confidence: high for exact date+amount match,
    medium for same amount within 7 days, low for same amount only."""
    out: List[Dict[str, Any]] = []
    lines_a = a.get("line_items") or a.get("lines") or []
    lines_b = b.get("line_items") or b.get("lines") or []
    for la in lines_a:
        if not isinstance(la, dict):
            continue
        amt_a = la.get("amount") or la.get("total")
        if amt_a is None:
            continue
        desc_a = str(la.get("description") or la.get("item") or "").strip().lower()
        date_a = la.get("date") or la.get("service_date")
        for lb in lines_b:
            if not isinstance(lb, dict):
                continue
            amt_b = lb.get("amount") or lb.get("total")
            if amt_b is None or abs(float(amt_a) - float(amt_b)) > 0.01:
                continue
            desc_b = str(lb.get("description") or lb.get("item") or "").strip().lower()
            date_b = lb.get("date") or lb.get("service_date")
            confidence = "low"
            match_type = "same_amount_same_date"
            if date_a and date_a == date_b:
                confidence = "high" if desc_a and desc_a == desc_b else "medium"
                match_type = "same_amount_same_date"
            elif desc_a and desc_b and desc_a == desc_b:
                confidence = "medium"
                match_type = "same_service_description"
            out.append({
                "a_line_id": la.get("id") or la.get("line_id") or f"a:{lines_a.index(la)}",
                "b_line_id": lb.get("id") or lb.get("line_id") or f"b:{lines_b.index(lb)}",
                "match_type": match_type,
                "confidence": confidence,
                "summary": f"${amt_a} on {date_a or 'unknown date'} in statement A also appears in statement B, worth reviewing.",
            })
    return out[:50]  # cap


# ---------------------------------------------------------------------------
# AI-assisted candidate detection (SD-3 v1 spec Section K.2/K.7)
# ---------------------------------------------------------------------------

DUPLICATE_DETECTOR_SYSTEM = """You are a duplicate-billing detector for aged care statement comparison.

You will receive two decoded aged care statements (Statement A = older, Statement B = newer).
Your job is to identify LINE ITEMS in Statement B that are also billed in Statement A. These
are potential duplicates, you must be conservative; a false positive costs the caregiver a
letter or a friction call to the provider.

Rules:
- Only flag a candidate if the amount matches within $0.05 AND either the service date matches
  OR the service description matches word-for-word after lowercasing.
- Do NOT flag CHANGES in ongoing services (e.g. same weekly service, same provider, same amount,
  different date, that's not a duplicate, that's an ongoing engagement).
- Do NOT invent line items. Only reference IDs / descriptions that appear in the provided JSON.
- Confidence rubric:
  high  , same amount + same date + same description
  medium, same amount + same date OR same amount + same description
  low   , same amount only
- Return valid JSON ONLY. No markdown, no prose, no commentary.

Output shape:
{
  "candidates": [
    {
      "a_line_id": "<id or 'a:INDEX'>",
      "b_line_id": "<id or 'b:INDEX'>",
      "match_type": "same_amount_same_date" | "same_service_description" | "same_amount_only",
      "confidence": "high" | "medium" | "low",
      "reason": "<one plain-English sentence explaining why this pair may be duplicate>",
      "summary": "<one sentence for the caregiver, no em-dashes>"
    }
  ],
  "notes": "<short summary of what you did / did not find; may be empty>"
}
"""


async def _ai_detect_duplicates(a: dict, b: dict) -> List[Dict[str, Any]]:
    """Call the LLM for AI-assisted duplicate detection. Falls back to the
    heuristic detector if the LLM is unavailable or returns garbage."""
    try:
        from agents import _key, MODEL_PROVIDER, MODEL_NAME, _strip_json
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning("emergent llm not available: %s", e)
        return _detect_duplicate_candidates(a, b)

    key = _key()
    if not key:
        return _detect_duplicate_candidates(a, b)

    # Compact both statements to keep prompt short
    def _compact(s: dict, label: str) -> dict:
        lines = s.get("line_items") or s.get("lines") or []
        out = []
        for i, l in enumerate(lines):
            if not isinstance(l, dict):
                continue
            out.append({
                "id": l.get("id") or l.get("line_id") or f"{label}:{i}",
                "date": l.get("date") or l.get("service_date"),
                "description": l.get("description") or l.get("item") or l.get("label"),
                "amount": l.get("amount") or l.get("total"),
            })
        return {"period_label": s.get("period_label"), "line_items": out[:80]}

    payload = {
        "statement_a": _compact(a, "a"),
        "statement_b": _compact(b, "b"),
    }
    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"sd3-dup-{a.get('id','x')[:8]}-{b.get('id','y')[:8]}",
            system_message=DUPLICATE_DETECTOR_SYSTEM,
        ).with_model(MODEL_PROVIDER, MODEL_NAME)
        msg = UserMessage(text=json.dumps(payload))
        raw = await chat.send_message(msg)
        parsed = json.loads(_strip_json(raw))
        cands = parsed.get("candidates") or []
        out = []
        for c in cands:
            if not isinstance(c, dict):
                continue
            if c.get("confidence") not in ("high", "medium", "low"):
                continue
            out.append({
                "a_line_id": c.get("a_line_id"),
                "b_line_id": c.get("b_line_id"),
                "match_type": c.get("match_type") or "same_amount_same_date",
                "confidence": c.get("confidence"),
                "summary": c.get("summary") or c.get("reason") or "Possible duplicate billing.",
                "reason": c.get("reason"),
                "source": "ai",
            })
        return out[:50]
    except Exception as e:
        logger.warning("AI duplicate detection fallback: %s", e)
        return _detect_duplicate_candidates(a, b)


async def _open_case_for_pair(pid: str, pair_id: str, candidate_count: int, actor_id: Optional[str]):
    """Emit a LOOP-1 case for the pair, wired via injected _loop1_open_case."""
    if not _loop1_open_case or candidate_count == 0:
        return None
    try:
        return await _loop1_open_case(
            participant_id=pid,
            case_type="statement_anomaly_ready",
            title=f"{candidate_count} candidate duplicate{'s' if candidate_count != 1 else ''} across two statements",
            summary="Wayly detected line items that appear in both statements, review each and mark real duplicates.",
            source_tool="sd3",
            source_artefact_id=pair_id,
            source_artefact_type="statement_pair",
            severity="high" if candidate_count >= 3 else "medium",
            actor_type="system",
            actor_id=actor_id,
            metadata={"pair_id": pair_id, "candidate_count": candidate_count, "detector": "sd3"},
            dedupe_key=f"statement_anomaly_ready:statement_pair:{pair_id}",
        )
    except Exception as e:
        logger.warning("SD-3 case emit failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# SD-3 v2, streaming decode with Claude Opus 4.7
#
# Streams the decoded, plain English review of a statement as it is generated,
# with per line confidence scores. Uses Claude Opus 4.7 (task budgets on) for
# high quality reasoning. Falls back to the existing sonnet path if Opus is
# unavailable, so the endpoint never hard fails.
#
# Route: POST /api/sd3/statements/{sid}/decode-v2/stream (SSE)
# Events:
#   phase   { name: "extract"|"audit"|"summarise", note: str }
#   line    { line_id, description, amount, confidence: 0..1, note }
#   alert   { level: "info"|"warning"|"success", text }
#   done    { line_count, overall_confidence, model }
# ---------------------------------------------------------------------------

SD3_V2_SYSTEM = (
    "You are Wayly's senior statement auditor. You review a decoded Australian "
    "Support at Home statement and stream back a friendly, expert overview for "
    "the caregiver, line by line, with a confidence rating for each line. "
    "STRICT RULES: "
    "1. Punctuation is limited to full stops, commas, and semicolons. "
    "   Do NOT use em dashes (U+2014), en dashes (U+2013), or hyphens as sentence separators. "
    "2. Australian English. Never invent numbers, only reference what is present. "
    "3. Emit ONE JSON object PER LINE, no markdown, no prose outside. "
    "4. Event shape: {\"event\":\"phase\",\"name\":\"extract|audit|summarise\",\"note\":\"...\"} "
    "   or {\"event\":\"line\",\"line_id\":\"...\",\"description\":\"...\",\"amount\":123.45,\"confidence\":0.92,\"note\":\"...\"} "
    "   or {\"event\":\"alert\",\"level\":\"info|warning|success\",\"text\":\"...\"} "
    "   or {\"event\":\"done\",\"line_count\":N,\"overall_confidence\":0..1}. "
    "5. Confidence is your own certainty this line is correctly categorised and priced. "
    "6. Keep each note to one short sentence, warm and plain spoken. "
)


class DecodeV2In(BaseModel):
    force_fallback: bool = False


@sd3_router.post("/statements/{sid}/decode-v2/stream")
async def decode_v2_stream(sid: str, payload: DecodeV2In, request: Request):
    """Streaming SSE decode using Claude Opus 4.7 with task budgets.

    We stream JSON events to the client as they arrive from the LLM. The
    frontend can render each `line` event with a confidence pill and each
    `alert` in real time. Falls back to a deterministic replay of the
    already-stored decoded lines if Opus 4.7 is unavailable.
    """
    await _assert_flag()
    user = await _user_dep(request)
    stmt = await _db.statements.find_one({"id": sid}, {"_id": 0})
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")
    if stmt.get("participant_id"):
        await _core1_assert_access(user, stmt["participant_id"])

    line_items = stmt.get("line_items") or stmt.get("lines") or []

    async def _fallback_stream():
        yield _sse_event({"event": "phase", "name": "extract", "note": "Using cached decode, streaming line by line."})
        total = 0
        for i, li in enumerate(line_items[:60]):
            if not isinstance(li, dict):
                continue
            desc = li.get("description") or li.get("item") or "Line item"
            amt = li.get("amount") or li.get("total") or 0
            try:
                amt_f = float(amt)
            except Exception:
                amt_f = 0.0
            yield _sse_event({
                "event": "line",
                "line_id": li.get("id") or li.get("line_id") or f"cached:{i}",
                "description": desc,
                "amount": amt_f,
                "confidence": 0.75,
                "note": "Replayed from your saved decode; open Ask Wayly for a deeper look.",
            })
            total += 1
        yield _sse_event({
            "event": "done",
            "line_count": total,
            "overall_confidence": 0.75,
            "model": "fallback-cached",
        })

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
        from agents import _key as _agent_key
    except Exception as e:
        logger.warning("SD-3 v2 opus unavailable, falling back: %s", e)

        async def _gen_fallback():
            async for chunk in _fallback_stream():
                yield chunk
        return StreamingResponse(
            _gen_fallback(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    key = _agent_key()
    if payload.force_fallback or not key:
        async def _gen_fallback2():
            async for chunk in _fallback_stream():
                yield chunk
        return StreamingResponse(
            _gen_fallback2(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Compact the statement payload for the LLM
    compact = {
        "period_label": stmt.get("period_label"),
        "provider_name": stmt.get("provider_name") or (stmt.get("extracted_json") or {}).get("provider_name"),
        "total_aud": (stmt.get("extracted_json") or {}).get("gross_total") or sum((li.get("amount") or li.get("total") or 0) for li in line_items if isinstance(li, dict)),
        "line_items": [
            {
                "id": li.get("id") or li.get("line_id") or f"a:{i}",
                "date": li.get("date") or li.get("service_date"),
                "description": li.get("description") or li.get("item") or li.get("label"),
                "amount": li.get("amount") or li.get("total"),
                "stream": li.get("stream"),
            }
            for i, li in enumerate(line_items[:60]) if isinstance(li, dict)
        ],
    }

    async def _opus_stream():
        try:
            chat = (
                LlmChat(
                    api_key=key,
                    session_id=f"sd3-v2-{sid[:12]}",
                    system_message=SD3_V2_SYSTEM,
                    custom_headers={"anthropic-beta": "task-budgets-2026-03-13"},
                )
                .with_model("anthropic", "claude-opus-4-7")
                .with_params(
                    extra_body={
                        "output_config": {
                            "task_budget": {"type": "tokens", "total": 20000},
                            "effort": "medium",
                        },
                    },
                    max_tokens=8000,
                )
            )
            yield _sse_event({"event": "phase", "name": "extract", "note": "Reading each line with Claude Opus 4.7."})
            buf = ""
            async for ev in chat.stream_message(UserMessage(text=json.dumps(compact, default=str))):
                if isinstance(ev, TextDelta):
                    buf += ev.content
                    # Try to emit each newline-terminated JSON as it arrives
                    while "\n" in buf:
                        line, _, buf = buf.partition("\n")
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except Exception:
                            continue
                        yield _sse_event(obj)
                elif isinstance(ev, StreamDone):
                    break
            if buf.strip():
                try:
                    yield _sse_event(json.loads(buf.strip()))
                except Exception:
                    pass
        except Exception as e:
            logger.warning("SD-3 v2 opus stream error, falling back: %s", e)
            async for chunk in _fallback_stream():
                yield chunk

    return StreamingResponse(
        _opus_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse_event(obj: Dict[str, Any]) -> str:
    """Format a Server Sent Events data frame."""
    return f"data: {json.dumps(obj, default=str)}\n\n"
