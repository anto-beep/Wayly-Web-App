"""SDL-1 v1 · Service Delivery Attendance Log.

A log of expected vs observed care visits. Caregivers/participants confirm each
service happened as expected, flag variances, or dispute a visit that was billed
but did not occur. Disputes open a LOOP-1 case. Decoded statements are reconciled
against attendance records to surface billed-but-no-attendance / attendance-but-
not-billed mismatches. Simple pattern detection surfaces (never auto-discloses)
repeated concerns to the user with resource pathways.

Ships behind feature flag SDL1_ENABLED. Evidence in v1 is metadata + text notes
(EvidenceAttachment records); binary object storage in ap-southeast-2 (S3 Sydney)
is a documented v2 deferral per spec risk #2. FC-2 calendar seed degrades to
manual-entry-only until FC-2 v1 calendar entries exist.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.sdl1")

sdl1_router = APIRouter(prefix="/sdl1", tags=["sdl1"])

_db = None
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None
_core1_write_event: Optional[Callable] = None
_loop1_open_case: Optional[Callable] = None

EVIDENCE_RETENTION_YEARS = 2


def init_sdl1_routes(*, db, user_dep, core1_assert_access, core1_write_timeline, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _core1_write_event, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("SDL1_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _user(request):
    return await _user_dep(request)


async def _uid(request) -> str:
    u = await _user_dep(request)
    return (u.get("id") if isinstance(u, dict) else getattr(u, "id", None)) or ""


async def _assert_access(request, pid: str):
    u = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(u, pid)
    return u


async def ensure_sdl1_indexes(db) -> None:
    try:
        await db.attendance_records.create_index(
            [("participant_id", 1), ("expected.expected_start_datetime", -1)])
        await db.attendance_records.create_index([("participant_id", 1), ("confirmation_status", 1)])
        await db.evidence_attachments.create_index([("attendance_record_id", 1)])
        await db.pattern_detections.create_index([("participant_id", 1), ("detected_at", -1)])
        await db.reconciliation_events.create_index([("participant_id", 1), ("triggered_at", -1)])
    except Exception as e:  # pragma: no cover
        logger.warning("sdl1 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Evidentiary quality (Section K) — from confirmation timing
# ---------------------------------------------------------------------------

def _evidentiary_quality(expected_start: Optional[str], confirmed_at: Optional[datetime]) -> str:
    if not confirmed_at:
        return "unconfirmed"
    if not expected_start:
        return "moderate"
    try:
        exp = datetime.fromisoformat(str(expected_start).replace("Z", "+00:00"))
    except Exception:
        return "moderate"
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    delta = confirmed_at - exp
    if delta <= timedelta(hours=24):
        return "strong"
    if delta <= timedelta(days=7):
        return "moderate"
    if delta <= timedelta(days=30):
        return "weaker"
    return "weaker"


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

def _view(r: dict, evidence_count: int = 0) -> dict:
    return {
        "id": r["id"],
        "participant_id": r["participant_id"],
        "household_id": r.get("household_id"),
        "calendar_entry_id": r.get("calendar_entry_id"),
        "expected": r.get("expected") or {},
        "observed": r.get("observed"),
        "confirmation_status": r.get("confirmation_status", "unconfirmed"),
        "confirmation_variance_type": r.get("confirmation_variance_type"),
        "confirmation_variance_notes": r.get("confirmation_variance_notes"),
        "dispute_reason": r.get("dispute_reason"),
        "dispute_details": r.get("dispute_details"),
        "evidence_attachment_ids": r.get("evidence_attachment_ids") or [],
        "evidence_count": evidence_count,
        "confirmed_by_user_id": r.get("confirmed_by_user_id"),
        "confirmed_at": _iso(r.get("confirmed_at")),
        "entered_at": _iso(r.get("entered_at")),
        "updated_at": _iso(r.get("updated_at")),
        "reconciliation_status": r.get("reconciliation_status", "not_yet_billed"),
        "reconciliation_notes": r.get("reconciliation_notes"),
        "evidentiary_quality": r.get("evidentiary_quality", "unconfirmed"),
        "case_id": r.get("case_id"),
        "audit_log": [
            {**a, "timestamp": _iso(a.get("timestamp"))} for a in (r.get("audit_log") or [])
        ],
    }


async def _evidence_count(rid: str) -> int:
    return await _db.evidence_attachments.count_documents(
        {"attendance_record_id": rid, "deleted_at": None})


async def _load_or_404(rid: str, request) -> dict:
    r = await _db.attendance_records.find_one({"id": rid, "deleted_at": None}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    await _assert_access(request, r["participant_id"])
    return r


def _audit(action: str, uid: str, details: Any = None) -> dict:
    return {"timestamp": _now(), "user_id": uid, "action": action, "details": details}


# ---------------------------------------------------------------------------
# D.1 CRUD
# ---------------------------------------------------------------------------

class ExpectedIn(BaseModel):
    service_type: str
    service_code: Optional[str] = None
    provider_name: str
    expected_worker_name: Optional[str] = None
    expected_start_datetime: str
    expected_end_datetime: Optional[str] = None
    expected_duration_minutes: Optional[int] = None


class RecordCreate(BaseModel):
    calendar_entry_id: Optional[str] = None
    expected: ExpectedIn


@sdl1_router.get("/participants/{pid}/attendance-records")
async def list_records(pid: str, request: Request, start_date: Optional[str] = None,
                       end_date: Optional[str] = None, status: Optional[str] = None,
                       provider: Optional[str] = None, limit: int = 200):
    await _assert_flag()
    await _assert_access(request, pid)
    q: Dict[str, Any] = {"participant_id": pid, "deleted_at": None}
    if status:
        q["confirmation_status"] = status
    if provider:
        q["expected.provider_name"] = provider
    if start_date:
        q.setdefault("expected.expected_start_datetime", {})["$gte"] = start_date
    if end_date:
        q.setdefault("expected.expected_start_datetime", {})["$lte"] = end_date + "T23:59:59"
    rows = []
    async for r in _db.attendance_records.find(q, {"_id": 0}).sort(
            "expected.expected_start_datetime", -1).limit(min(limit, 500)):
        rows.append(_view(r, await _evidence_count(r["id"])))
    return {"records": rows, "count": len(rows)}


@sdl1_router.post("/participants/{pid}/attendance-records")
async def create_record(pid: str, body: RecordCreate, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _assert_access(request, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "calendar_entry_id": body.calendar_entry_id,
        "expected": body.expected.dict(),
        "observed": None,
        "confirmation_status": "unconfirmed",
        "confirmation_variance_type": None,
        "confirmation_variance_notes": None,
        "dispute_reason": None,
        "dispute_details": None,
        "evidence_attachment_ids": [],
        "confirmed_by_user_id": None,
        "confirmed_at": None,
        "entered_by_user_id": uid,
        "entered_at": now,
        "updated_at": now,
        "audit_log": [_audit("created", uid)],
        "reconciled_with_statement_ids": [],
        "reconciliation_status": "not_yet_billed",
        "reconciliation_notes": None,
        "evidentiary_quality": "unconfirmed",
        "evidentiary_quality_calculated_at": now,
        "case_id": None,
        "contributes_to_patterns": [],
        "deleted_at": None,
        "data_residency": "ap-southeast-2",
    }
    await _db.attendance_records.insert_one(doc)
    return {"record": _view(doc, 0)}


class RecordPatch(BaseModel):
    expected: Optional[ExpectedIn] = None
    observed: Optional[Dict[str, Any]] = None


@sdl1_router.patch("/attendance-records/{rid}")
async def patch_record(rid: str, body: RecordPatch, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.expected is not None:
        update["expected"] = body.expected.dict()
    if body.observed is not None:
        update["observed"] = body.observed
    audit = (r.get("audit_log") or []) + [_audit("edited", uid, list(update.keys()))]
    update["audit_log"] = audit
    await _db.attendance_records.update_one({"id": rid}, {"$set": update})
    fresh = await _db.attendance_records.find_one({"id": rid}, {"_id": 0})
    return {"record": _view(fresh, await _evidence_count(rid))}


@sdl1_router.delete("/attendance-records/{rid}")
async def delete_record(rid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    audit = (r.get("audit_log") or []) + [_audit("deleted", uid)]
    await _db.attendance_records.update_one(
        {"id": rid}, {"$set": {"deleted_at": _now(), "audit_log": audit}})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# D.2 Confirmation & dispute
# ---------------------------------------------------------------------------

class ConfirmIn(BaseModel):
    confirmation_status: str  # confirmed_as_expected | confirmed_with_variance | provider_no_show | participant_absent
    observed: Optional[Dict[str, Any]] = None
    confirmation_variance_type: Optional[str] = None
    confirmation_variance_notes: Optional[str] = None


_CONFIRM_STATUSES = {
    "confirmed_as_expected", "confirmed_with_variance", "provider_no_show",
    "participant_absent", "unknown_declined_to_answer",
}


@sdl1_router.post("/attendance-records/{rid}/confirm")
async def confirm_record(rid: str, body: ConfirmIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    if body.confirmation_status not in _CONFIRM_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid confirmation_status")
    now = _now()
    quality = _evidentiary_quality(r.get("expected", {}).get("expected_start_datetime"), now)
    update = {
        "confirmation_status": body.confirmation_status,
        "observed": body.observed,
        "confirmation_variance_type": body.confirmation_variance_type,
        "confirmation_variance_notes": body.confirmation_variance_notes,
        "confirmed_by_user_id": uid,
        "confirmed_at": now,
        "updated_at": now,
        "evidentiary_quality": quality,
        "evidentiary_quality_calculated_at": now,
        "audit_log": (r.get("audit_log") or []) + [_audit("confirmed", uid, body.confirmation_status)],
    }
    await _db.attendance_records.update_one({"id": rid}, {"$set": update})
    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=r["participant_id"], event_type="attendance_confirmed",
                event_source="sdl1", actor_type="user", actor_id=uid,
                linked_artefact_id=rid, linked_artefact_type="attendance_record",
                metadata={"status": body.confirmation_status})
        except Exception:
            pass
    await _detect_patterns(r["participant_id"])
    fresh = await _db.attendance_records.find_one({"id": rid}, {"_id": 0})
    return {"record": _view(fresh, await _evidence_count(rid))}


class DisputeIn(BaseModel):
    dispute_reason: str
    dispute_details: str = Field("", max_length=2000)


@sdl1_router.post("/participants/{pid}/attendance-records/bulk-confirm")
async def bulk_confirm_week(pid: str, request: Request):
    """Confirm all unconfirmed records in the last 7 days as expected (Section E.6)."""
    await _assert_flag()
    uid = await _uid(request)
    await _assert_access(request, pid)
    cutoff = (_now() - timedelta(days=7)).isoformat()
    now = _now()
    count = 0
    async for r in _db.attendance_records.find(
            {"participant_id": pid, "confirmation_status": "unconfirmed", "deleted_at": None,
             "expected.expected_start_datetime": {"$gte": cutoff}}, {"_id": 0}):
        quality = _evidentiary_quality(r.get("expected", {}).get("expected_start_datetime"), now)
        await _db.attendance_records.update_one({"id": r["id"]}, {"$set": {
            "confirmation_status": "confirmed_as_expected", "confirmed_by_user_id": uid,
            "confirmed_at": now, "updated_at": now, "evidentiary_quality": quality,
            "audit_log": (r.get("audit_log") or []) + [_audit("confirmed", uid, {"bulk_confirmation": True})],
        }})
        count += 1
    return {"confirmed": count}


@sdl1_router.post("/attendance-records/{rid}/dispute")
async def dispute_record(rid: str, body: DisputeIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    now = _now()
    case_id = r.get("case_id")
    if _loop1_open_case:
        try:
            case = await _loop1_open_case(
                participant_id=r["participant_id"],
                case_type="service_delivery_dispute",
                title=f"Disputed service: {r.get('expected', {}).get('service_type', 'visit')} on {str(r.get('expected', {}).get('expected_start_datetime', ''))[:10]}",
                summary=body.dispute_details or None,
                source_tool="sdl1",
                source_artefact_id=rid,
                source_artefact_type="attendance_record",
                severity="high",
                actor_type="user",
                actor_id=uid,
                metadata={"dispute_reason": body.dispute_reason},
                dedupe_key=f"service_delivery_dispute:attendance_record:{rid}",
            )
            case_id = (case or {}).get("id") or case_id
        except Exception as e:
            logger.warning("sdl1 dispute case open failed: %s", e)
    update = {
        "confirmation_status": "disputed",
        "dispute_reason": body.dispute_reason,
        "dispute_details": body.dispute_details,
        "confirmed_by_user_id": uid,
        "confirmed_at": now,
        "updated_at": now,
        "case_id": case_id,
        "evidentiary_quality": _evidentiary_quality(r.get("expected", {}).get("expected_start_datetime"), now),
        "audit_log": (r.get("audit_log") or []) + [_audit("disputed", uid, body.dispute_reason)],
    }
    await _db.attendance_records.update_one({"id": rid}, {"$set": update})
    await _detect_patterns(r["participant_id"])
    fresh = await _db.attendance_records.find_one({"id": rid}, {"_id": 0})
    return {"record": _view(fresh, await _evidence_count(rid))}


class ReopenIn(BaseModel):
    reopen_reason: str = Field("", max_length=1000)


@sdl1_router.post("/attendance-records/{rid}/reopen")
async def reopen_record(rid: str, body: ReopenIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    now = _now()
    update = {
        "confirmation_status": "unconfirmed",
        "confirmed_at": None,
        "confirmed_by_user_id": None,
        "updated_at": now,
        "evidentiary_quality": "weaker",  # downgraded on reopen per C.5
        "audit_log": (r.get("audit_log") or []) + [_audit("reopened", uid, body.reopen_reason)],
    }
    await _db.attendance_records.update_one({"id": rid}, {"$set": update})
    fresh = await _db.attendance_records.find_one({"id": rid}, {"_id": 0})
    return {"record": _view(fresh, await _evidence_count(rid))}


# ---------------------------------------------------------------------------
# D.3 Evidence (v1: metadata + text note; binary object storage deferred to v2)
# ---------------------------------------------------------------------------

class EvidenceIn(BaseModel):
    attachment_type: str = "text_note"  # photo | voice_note | video | document | text_note
    description: Optional[str] = None
    text_content: Optional[str] = None
    filename: Optional[str] = None


def _view_evidence(e: dict) -> dict:
    return {
        "id": e["id"],
        "attendance_record_id": e["attendance_record_id"],
        "attachment_type": e.get("attachment_type"),
        "description": e.get("description"),
        "text_content": e.get("text_content"),
        "filename": e.get("filename"),
        "uploaded_at": _iso(e.get("uploaded_at")),
        "uploaded_by_user_id": e.get("uploaded_by_user_id"),
    }


@sdl1_router.post("/attendance-records/{rid}/evidence")
async def add_evidence(rid: str, body: EvidenceIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    r = await _load_or_404(rid, request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "attendance_record_id": rid,
        "participant_id": r["participant_id"],
        "attachment_type": body.attachment_type,
        "content_type": "text/plain",
        "size_bytes": len((body.text_content or "").encode("utf-8")),
        "storage_url": None,  # v2: S3 Sydney signed URL
        "filename": body.filename,
        "description": body.description,
        "text_content": body.text_content,
        "captured_at": None,
        "uploaded_at": now,
        "uploaded_by_user_id": uid,
        "hash_sha256": None,
        "gps_stripped": False,
        "audit_log": [{"timestamp": now, "user_id": uid, "action": "uploaded"}],
        "deleted_at": None,
        "data_residency": "ap-southeast-2",
    }
    await _db.evidence_attachments.insert_one(doc)
    await _db.attendance_records.update_one(
        {"id": rid}, {"$addToSet": {"evidence_attachment_ids": doc["id"]},
                      "$set": {"updated_at": now},
                      "$push": {"audit_log": _audit("evidence_added", uid, doc["id"])}})
    return {"evidence": _view_evidence(doc)}


@sdl1_router.get("/attendance-records/{rid}/evidence")
async def list_evidence(rid: str, request: Request):
    await _assert_flag()
    await _load_or_404(rid, request)
    rows = []
    async for e in _db.evidence_attachments.find(
            {"attendance_record_id": rid, "deleted_at": None}, {"_id": 0}).sort("uploaded_at", 1):
        rows.append(_view_evidence(e))
    return {"evidence": rows}


@sdl1_router.delete("/evidence-attachments/{eid}")
async def delete_evidence(eid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    e = await _db.evidence_attachments.find_one({"id": eid, "deleted_at": None}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Evidence not found")
    await _assert_access(request, e["participant_id"])
    await _db.evidence_attachments.update_one({"id": eid}, {"$set": {"deleted_at": _now()}})
    await _db.attendance_records.update_one(
        {"id": e["attendance_record_id"]},
        {"$pull": {"evidence_attachment_ids": eid},
         "$push": {"audit_log": _audit("evidence_removed", uid, eid)}})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# D.4 Reconciliation against decoded statements (Section H)
# ---------------------------------------------------------------------------

def _parse_date(v) -> Optional[datetime]:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d.replace(tzinfo=None)
    except Exception:
        return None


@sdl1_router.post("/participants/{pid}/reconcile")
async def reconcile(pid: str, request: Request, body: Optional[Dict[str, Any]] = None):
    await _assert_flag()
    await _assert_access(request, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    body = body or {}
    statement_id = body.get("statement_id")
    sq: Dict[str, Any] = {"household_id": p.get("household_id")}
    if statement_id:
        sq["id"] = statement_id
    # Gather billed line items across the participant's statements.
    billed: List[dict] = []
    async for s in _db.statements.find(sq, {"_id": 0, "id": 1, "line_items": 1}):
        for li in (s.get("line_items") or []):
            billed.append({"statement_id": s.get("id"), **li})

    records = []
    async for r in _db.attendance_records.find(
            {"participant_id": pid, "deleted_at": None}, {"_id": 0}):
        records.append(r)

    matched_record_ids: List[str] = []
    matched_statement_ids: set = set()
    billed_matched = [False] * len(billed)

    for r in records:
        exp = _parse_date(r.get("expected", {}).get("expected_start_datetime"))
        if not exp:
            continue
        found = False
        for i, li in enumerate(billed):
            if billed_matched[i]:
                continue
            ld = _parse_date(li.get("date"))
            if ld and abs((ld.date() - exp.date()).days) <= 2:
                billed_matched[i] = True
                found = True
                if li.get("statement_id"):
                    matched_statement_ids.add(li["statement_id"])
                break
        if found:
            matched_record_ids.append(r["id"])
            disputed = r.get("confirmation_status") == "disputed"
            new_status = "billed_but_disputed_by_user" if disputed else "billed_and_matched"
            await _db.attendance_records.update_one({"id": r["id"]}, {"$set": {
                "reconciliation_status": new_status,
                "reconciled_with_statement_ids": list(matched_statement_ids),
            }})
        else:
            # Attendance confirmed but no billing found.
            if r.get("confirmation_status", "").startswith("confirmed"):
                await _db.attendance_records.update_one({"id": r["id"]}, {"$set": {
                    "reconciliation_status": "attendance_but_never_billed"}})

    mismatches_billed_no_attendance = sum(1 for m in billed_matched if not m)
    mismatches_attendance_not_billed = sum(
        1 for r in records if r.get("confirmation_status", "").startswith("confirmed")
        and r["id"] not in matched_record_ids)
    mismatches_billed_disputed = sum(
        1 for r in records if r.get("confirmation_status") == "disputed" and r["id"] in matched_record_ids)

    ev = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "statement_id": statement_id,
        "triggered_at": _now(),
        "triggered_by": body.get("triggered_by", "user"),
        "matches_found": len(matched_record_ids),
        "mismatches_billed_but_no_attendance": mismatches_billed_no_attendance,
        "mismatches_attendance_but_not_billed": mismatches_attendance_not_billed,
        "mismatches_billed_but_disputed": mismatches_billed_disputed,
        "matched_attendance_record_ids": matched_record_ids,
        "mismatch_report_url": None,
        "case_ids_created": [],
        "data_residency": "ap-southeast-2",
    }
    await _db.reconciliation_events.insert_one(dict(ev))
    ev.pop("_id", None)
    ev["triggered_at"] = _iso(ev["triggered_at"])
    return {"reconciliation": ev}


@sdl1_router.get("/participants/{pid}/reconciliation-events")
async def list_reconciliations(pid: str, request: Request):
    await _assert_flag()
    await _assert_access(request, pid)
    rows = []
    async for e in _db.reconciliation_events.find(
            {"participant_id": pid}, {"_id": 0}).sort("triggered_at", -1).limit(50):
        e["triggered_at"] = _iso(e.get("triggered_at"))
        rows.append(e)
    return {"events": rows}


# ---------------------------------------------------------------------------
# D.5 Pattern detection (Section I) — surfaces, never auto-discloses
# ---------------------------------------------------------------------------

async def _detect_patterns(pid: str) -> None:
    """Recompute simple concern patterns for a participant. Idempotent per
    (participant, pattern_type, provider) — upserts on that key."""
    try:
        records = []
        async for r in _db.attendance_records.find(
                {"participant_id": pid, "deleted_at": None}, {"_id": 0}):
            records.append(r)

        by_provider: Dict[str, List[dict]] = {}
        for r in records:
            prov = (r.get("expected") or {}).get("provider_name") or "Unknown"
            by_provider.setdefault(prov, []).append(r)

        def _incident_dates(recs):
            ds = [str((x.get("expected") or {}).get("expected_start_datetime", ""))[:10] for x in recs]
            ds = [d for d in ds if d]
            return (min(ds) if ds else None, max(ds) if ds else None)

        candidates = []
        for prov, recs in by_provider.items():
            disputes = [r for r in recs if r.get("confirmation_status") == "disputed"]
            no_shows = [r for r in recs if r.get("confirmation_status") == "provider_no_show"]
            subs = [r for r in recs if r.get("confirmation_variance_type") == "different_worker"]
            if len(disputes) >= 2:
                candidates.append(("multiple_disputes_same_provider", prov, disputes,
                                   "elevated_concern" if len(disputes) >= 3 else "informational"))
            if len(no_shows) >= 2:
                candidates.append(("confirmed_missed_visits_despite_billing", prov, no_shows,
                                   "elevated_concern"))
            if len(subs) >= 3:
                candidates.append(("repeated_worker_substitution", prov, subs, "informational"))

        for ptype, prov, recs, severity in candidates:
            first, last = _incident_dates(recs)
            existing = await _db.pattern_detections.find_one(
                {"participant_id": pid, "pattern_type": ptype, "involved_provider_name": prov})
            payload = {
                "participant_id": pid,
                "pattern_type": ptype,
                "involved_provider_name": prov,
                "involved_attendance_record_ids": [r["id"] for r in recs],
                "first_incident_date": first,
                "last_incident_date": last,
                "incident_count": len(recs),
                "severity": severity,
                "data_residency": "ap-southeast-2",
            }
            if existing:
                await _db.pattern_detections.update_one(
                    {"id": existing["id"]}, {"$set": payload})
            else:
                payload.update({
                    "id": str(uuid.uuid4()),
                    "detected_at": _now(),
                    "surfaced_to_user_at": None,
                    "surfaced_to_user_id": None,
                    "resources_offered_at": None,
                    "user_response": None,
                })
                await _db.pattern_detections.insert_one(dict(payload))
    except Exception as e:  # pragma: no cover
        logger.warning("sdl1 pattern detection failed: %s", e)


def _view_pattern(p: dict) -> dict:
    return {
        "id": p["id"],
        "participant_id": p["participant_id"],
        "pattern_type": p.get("pattern_type"),
        "involved_provider_name": p.get("involved_provider_name"),
        "involved_attendance_record_ids": p.get("involved_attendance_record_ids") or [],
        "detected_at": _iso(p.get("detected_at")),
        "first_incident_date": p.get("first_incident_date"),
        "last_incident_date": p.get("last_incident_date"),
        "incident_count": p.get("incident_count", 0),
        "severity": p.get("severity"),
        "surfaced_to_user_at": _iso(p.get("surfaced_to_user_at")),
        "user_response": p.get("user_response"),
    }


@sdl1_router.get("/participants/{pid}/pattern-detections")
async def list_patterns(pid: str, request: Request, since: Optional[str] = None):
    await _assert_flag()
    await _assert_access(request, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if since:
        q["detected_at"] = {"$gte": since}
    rows = []
    async for p in _db.pattern_detections.find(q, {"_id": 0}).sort("detected_at", -1):
        rows.append(_view_pattern(p))
    return {"patterns": rows}


@sdl1_router.post("/pattern-detections/{patid}/mark-surfaced")
async def mark_surfaced(patid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    p = await _db.pattern_detections.find_one({"id": patid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pattern not found")
    await _assert_access(request, p["participant_id"])
    await _db.pattern_detections.update_one({"id": patid}, {"$set": {
        "surfaced_to_user_at": _now(), "surfaced_to_user_id": uid,
        "resources_offered_at": _now()}})
    fresh = await _db.pattern_detections.find_one({"id": patid}, {"_id": 0})
    return {"pattern": _view_pattern(fresh)}


class PatternResponseIn(BaseModel):
    response: str  # dismissed | took_resource_pathway | took_cmp_pathway


@sdl1_router.post("/pattern-detections/{patid}/user-response")
async def pattern_response(patid: str, body: PatternResponseIn, request: Request):
    await _assert_flag()
    p = await _db.pattern_detections.find_one({"id": patid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pattern not found")
    await _assert_access(request, p["participant_id"])
    await _db.pattern_detections.update_one({"id": patid}, {"$set": {"user_response": body.response}})
    fresh = await _db.pattern_detections.find_one({"id": patid}, {"_id": 0})
    return {"pattern": _view_pattern(fresh)}


# ---------------------------------------------------------------------------
# D.6 Seed from FC-2 calendar
# ---------------------------------------------------------------------------

class SeedIn(BaseModel):
    start_date: str
    end_date: str


@sdl1_router.post("/participants/{pid}/attendance-records/seed-from-calendar")
async def seed_from_calendar(pid: str, body: SeedIn, request: Request):
    """Create attendance records from FC-2 calendar entries in the date range.
    Degrades gracefully when FC-2 v1 calendar entries do not exist yet."""
    await _assert_flag()
    uid = await _uid(request)
    await _assert_access(request, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    created = []
    entries = []
    # Read the household calendar (db.visits) in the date range. FC-2 v1 will
    # add a participant-scoped calendar; until then we seed from household visits.
    try:
        cur = _db.visits.find({
            "household_id": p.get("household_id"),
            "starts_at": {"$gte": body.start_date, "$lte": body.end_date + "T23:59:59"},
        }, {"_id": 0})
        entries = await cur.to_list(length=500)
    except Exception:
        entries = []

    now = _now()
    for ce in entries:
        # Skip if already seeded.
        exists = await _db.attendance_records.find_one(
            {"participant_id": pid, "calendar_entry_id": ce.get("id"), "deleted_at": None})
        if exists:
            continue
        start = ce.get("starts_at")
        dur = ce.get("duration_minutes")
        end = None
        try:
            if start and dur:
                sdt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
                end = (sdt + timedelta(minutes=int(dur))).isoformat()
        except Exception:
            end = None
        doc = {
            "id": str(uuid.uuid4()),
            "participant_id": pid,
            "household_id": p.get("household_id"),
            "calendar_entry_id": ce.get("id"),
            "expected": {
                "service_type": ce.get("title") or ce.get("kind") or "Service",
                "service_code": None,
                "provider_name": ce.get("provider") or p.get("provider_name") or "Provider",
                "expected_worker_name": None,
                "expected_start_datetime": start,
                "expected_end_datetime": end,
                "expected_duration_minutes": dur,
            },
            "observed": None,
            "confirmation_status": "unconfirmed",
            "evidence_attachment_ids": [],
            "entered_by_user_id": uid,
            "entered_at": now,
            "updated_at": now,
            "audit_log": [_audit("created", uid, {"seeded_from_calendar": True})],
            "reconciled_with_statement_ids": [],
            "reconciliation_status": "not_yet_billed",
            "evidentiary_quality": "unconfirmed",
            "evidentiary_quality_calculated_at": now,
            "case_id": None,
            "contributes_to_patterns": [],
            "deleted_at": None,
            "data_residency": "ap-southeast-2",
        }
        await _db.attendance_records.insert_one(doc)
        created.append(_view(doc, 0))

    return {"created": created, "count": len(created),
            "calendar_available": len(entries) > 0,
            "note": None if entries else "No calendar entries found for this range. Add services manually or connect the calendar."}


@sdl1_router.get("/status")
async def status():
    return {"sdl1_enabled": _flag_enabled(), "spec": "SDL-1 v1",
            "evidence_object_storage": "deferred_to_v2"}
