"""CHSP-1 v1 slice: Commonwealth Home Support Programme Tooling.

Scope (per CHSP-1-v1.md):
  * Section B.1 ChspProfile with 8-status enum.
  * Section B.2 ChspServiceEntry with 14 service types.
  * Section B.3 ChspFeeCheck with variance tolerances ($5/2% within, 2-5% minor, >5% material).
  * Section B.4 ChspTransitionConsideration with 6-step walkthrough.
  * Section D endpoints for profile/service/fee/transition CRUD.
  * Section F.6 dispute case creation to LOOP-1 on material variance.

Deferred to CHSP-1 v2:
  * CHSP provider comparison with quality context (PPC-3 analogue).
  * CHSP-specific LF-2 correspondence templates.
  * Cross-tool activation on transition completion.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field

from lib.chsp1.fee_check import run_fee_check

logger = logging.getLogger("wayly.chsp1")

chsp1_router = APIRouter(prefix="/chsp1", tags=["chsp1"])

_db = None
_user_dep = None
_loop1_open_case: Optional[Callable] = None


def init_chsp1_routes(*, db, user_dep, loop1_open_case=None):
    global _db, _user_dep, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("CHSP1_ENABLED", "1") != "0"


def _ws1_enabled() -> bool:
    """CHSP-TOOLS-1 WS-1 feature flag (`chsp_tools_v1`). Defaulted OFF in
    production per the spec; enabled elsewhere so it is testable."""
    return os.environ.get("CHSP_TOOLS_V1", "1") != "0"


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


def _chsp_upload_guard(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """Guard a CHSP tool upload. A CHSP invoice IS an invoice, so we never
    bounce invoice-like docs to the generic Invoice Checker — we only reject
    a clear care plan or a clear HCP / Support-at-Home statement uploaded to
    the wrong tool. Returns a block verdict to surface, or None to proceed."""
    try:
        from lib.upload_guard import classify_content
        g = classify_content("chsp-tools", text or "")
    except Exception:  # pragma: no cover - never block on a guard bug
        return None
    if g.get("reason") == "wrong_tool":
        wt = (g.get("wrong_tool") or {}).get("slug")
        if wt in ("care-plan-reviewer", "statement-decoder"):
            return g
    return None


async def _user_id(request) -> str:
    user = await _user_dep(request)
    uid = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Auth required")
    return str(uid)


async def ensure_chsp1_indexes(db) -> None:
    try:
        await db.chsp_profiles.create_index([("user_id", 1)], unique=True)
        await db.chsp_service_entries.create_index([("chsp_profile_id", 1), ("is_active", 1)])
        await db.chsp_fee_checks.create_index([("chsp_profile_id", 1), ("reviewed_at", -1)])
        await db.chsp_transition_considerations.create_index([("chsp_profile_id", 1)])
        await db.chsp_invoices.create_index([("user_id", 1), ("created_at", -1)])
    except Exception as e:  # pragma: no cover
        logger.warning("chsp1 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class ChspProfileIn(BaseModel):
    represents_participant_id: Optional[str] = None
    current_chsp_status: str = "on_chsp"
    chsp_start_date: Optional[str] = None


def _view_profile(p: dict) -> Dict[str, Any]:
    p = {k: v for k, v in p.items() if k != "_id"}
    for k in ("created_at", "updated_at", "retention_expires_at", "promoted_at", "transition_consideration_started_at"):
        if p.get(k):
            p[k] = _iso(p[k])
    return p


@chsp1_router.post("/profile")
async def create_or_update_profile(body: ChspProfileIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    existing = await _db.chsp_profiles.find_one({"user_id": uid})
    now = _now()
    if existing:
        upd = {k: v for k, v in body.dict().items() if v is not None}
        upd["updated_at"] = now
        await _db.chsp_profiles.update_one({"user_id": uid}, {"$set": upd})
        existing.update(upd)
        return {"profile": _view_profile(existing)}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "represents_participant_id": body.represents_participant_id,
        "current_chsp_status": body.current_chsp_status,
        "ras_assessment_history": [],
        "chsp_start_date": body.chsp_start_date,
        "chsp_end_date": None,
        "end_reason": None,
        "active_service_entries": [],
        "transition_being_considered": False,
        "transition_consideration_started_at": None,
        "transition_assessment_scheduled_date": None,
        "promoted_to_sah_participant_id": None,
        "promoted_at": None,
        "created_at": now,
        "updated_at": now,
        "retention_expires_at": now + timedelta(days=365),
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_profiles.insert_one(doc)
    return {"profile": _view_profile(doc)}


@chsp1_router.get("/profile")
async def get_profile(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.chsp_profiles.find_one({"user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {"profile": _view_profile(doc)}


# ---------------------------------------------------------------------------
# Service entries
# ---------------------------------------------------------------------------


class ServiceEntryIn(BaseModel):
    service_type: str
    provider_name: str
    hourly_rate_or_fee: float
    fee_structure_note: str = ""
    weekly_frequency: str = ""
    client_contribution_per_unit: float = 0.0
    start_date: str


@chsp1_router.post("/service-entries")
async def add_service(body: ServiceEntryIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "service_type": body.service_type,
        "provider_name": body.provider_name,
        "provider_contact_details": {},
        "hourly_rate_or_fee": {"amount": body.hourly_rate_or_fee, "currency": "AUD"},
        "fee_structure_note": body.fee_structure_note,
        "weekly_frequency": body.weekly_frequency,
        "client_contribution_per_unit": {"amount": body.client_contribution_per_unit, "currency": "AUD"},
        "client_contribution_notes": None,
        "start_date": body.start_date,
        "end_date": None,
        "is_active": True,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_service_entries.insert_one(doc)
    await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$push": {"active_service_entries": doc["id"]}})
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    doc["updated_at"] = _iso(doc["updated_at"])
    return {"service_entry": doc}


@chsp1_router.get("/service-entries")
async def list_services(request: Request, is_active: Optional[bool] = None):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        return {"service_entries": []}
    q: Dict[str, Any] = {"chsp_profile_id": profile["id"]}
    if is_active is not None:
        q["is_active"] = is_active
    cur = _db.chsp_service_entries.find(q).sort("start_date", -1)
    items = await cur.to_list(length=100)
    for it in items:
        it.pop("_id", None)
        for k in ("created_at", "updated_at"):
            if it.get(k):
                it[k] = _iso(it[k])
    return {"service_entries": items}


class ServiceEntryPatch(BaseModel):
    hourly_rate_or_fee: Optional[float] = None
    client_contribution_per_unit: Optional[float] = None
    fee_structure_note: Optional[str] = None
    weekly_frequency: Optional[str] = None
    start_date: Optional[str] = None


async def _owned_service_entry(uid: str, entry_id: str) -> Dict[str, Any]:
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    row = await _db.chsp_service_entries.find_one({"id": entry_id, "chsp_profile_id": profile["id"]})
    if not row:
        raise HTTPException(status_code=404, detail="Service entry not found")
    return row


@chsp1_router.patch("/service-entries/{entry_id}")
async def update_service(entry_id: str, body: ServiceEntryPatch, request: Request):
    """Agreed Rate Schedule management, edit a saved provider's per-unit rate
    and related fields."""
    await _assert_flag()
    uid = await _user_id(request)
    await _owned_service_entry(uid, entry_id)
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.hourly_rate_or_fee is not None:
        update["hourly_rate_or_fee"] = {"amount": body.hourly_rate_or_fee, "currency": "AUD"}
    if body.client_contribution_per_unit is not None:
        update["client_contribution_per_unit"] = {"amount": body.client_contribution_per_unit, "currency": "AUD"}
    if body.fee_structure_note is not None:
        update["fee_structure_note"] = body.fee_structure_note
    if body.weekly_frequency is not None:
        update["weekly_frequency"] = body.weekly_frequency
    if body.start_date is not None:
        update["start_date"] = body.start_date
    await _db.chsp_service_entries.update_one({"id": entry_id}, {"$set": update})
    row = await _db.chsp_service_entries.find_one({"id": entry_id})
    row.pop("_id", None)
    for k in ("created_at", "updated_at"):
        if row.get(k):
            row[k] = _iso(row[k])
    return {"service_entry": row}


@chsp1_router.post("/service-entries/{entry_id}/expire")
async def expire_service(entry_id: str, request: Request):
    """Expire (deactivate) a saved rate so it stops pre-filling the Fee Check
    without deleting the history."""
    await _assert_flag()
    uid = await _user_id(request)
    await _owned_service_entry(uid, entry_id)
    now = _now()
    await _db.chsp_service_entries.update_one(
        {"id": entry_id},
        {"$set": {"is_active": False, "status": "expired", "end_date": _iso(now), "updated_at": now}},
    )
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if profile:
        await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$pull": {"active_service_entries": entry_id}})
    return {"entry_id": entry_id, "status": "expired"}


# ---------------------------------------------------------------------------
# Fee checks
# ---------------------------------------------------------------------------


class FeeCheckIn(BaseModel):
    chsp_service_entry_id: Optional[str] = None
    invoice_or_statement_reference: str
    service_type: str
    provider_name: str
    billed_period_start: str
    billed_period_end: str
    billed_amount: float
    units_billed: str
    expected_amount: float


def _variance_status(pct: float, abs_diff: float) -> str:
    if abs_diff < 5.0 or pct < 2.0:
        return "within_tolerance"
    if pct <= 5.0:
        return "minor_variance"
    return "material_variance"


@chsp1_router.post("/fee-checks")
async def submit_fee_check(body: FeeCheckIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    variance_amt = round(body.billed_amount - body.expected_amount, 2)
    pct = round(abs(variance_amt) / body.expected_amount * 100, 2) if body.expected_amount > 0 else 0
    status = _variance_status(pct, abs(variance_amt))
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "chsp_service_entry_id": body.chsp_service_entry_id,
        "invoice_or_statement_reference": body.invoice_or_statement_reference,
        "service_type": body.service_type,
        "provider_name": body.provider_name,
        "billed_period_start": body.billed_period_start,
        "billed_period_end": body.billed_period_end,
        "billed_amount": {"amount": body.billed_amount, "currency": "AUD"},
        "units_billed": body.units_billed,
        "expected_amount": {"amount": body.expected_amount, "currency": "AUD"},
        "expected_calculation_source": "user_provided_rate_from_service_entry",
        "variance_amount": {"amount": variance_amt, "currency": "AUD"},
        "variance_percentage": pct,
        "variance_status": status,
        "variance_explanation_offered_by_provider": None,
        "case_id": None,
        "reviewed_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_fee_checks.insert_one(doc)
    doc.pop("_id", None)
    doc["reviewed_at"] = _iso(doc["reviewed_at"])
    return {"fee_check": doc, "requires_explanation": status == "material_variance"}


class FeeCheckDisputeIn(BaseModel):
    fee_check_id: str
    explanation_received: Optional[str] = None
    open_dispute_case: bool = True


@chsp1_router.post("/fee-checks/{fc_id}/dispute")
async def open_fee_dispute(fc_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    fc = await _db.chsp_fee_checks.find_one({"id": fc_id})
    if not fc:
        raise HTTPException(status_code=404, detail="Not found")
    case_id = None
    if _loop1_open_case:
        try:
            profile = await _db.chsp_profiles.find_one({"id": fc["chsp_profile_id"]})
            case = await _loop1_open_case(
                participant_id=profile.get("represents_participant_id") or uid,
                case_type="invoice_error", source_tool="chsp1",
                subject=f"CHSP fee variance dispute: {fc['provider_name']} · ${fc['variance_amount']['amount']}",
                metadata={"fee_check_id": fc_id, "variance_pct": fc.get("variance_percentage")})
            case_id = case.get("id") if isinstance(case, dict) else None
        except Exception as e:  # pragma: no cover
            logger.warning("loop1 case open failed: %s", e)
    if case_id:
        await _db.chsp_fee_checks.update_one({"id": fc_id}, {"$set": {"case_id": case_id}})
    return {"case_id": case_id}


# ---------------------------------------------------------------------------
# WS-1 · Per-unit Fee Check (CHSP-TOOLS-1) + WS-3 access/hardship letters
# ---------------------------------------------------------------------------


@chsp1_router.get("/config")
async def chsp_config():
    """Feature-flag state so the frontends can gate the WS-1 experience."""
    return {"chsp_tools_v1": _ws1_enabled(), "chsp1_enabled": _flag_enabled()}


class FeeCheckPreviewIn(BaseModel):
    invoice_reference: Optional[str] = None
    provider_name: Optional[str] = None
    service_type: Optional[str] = None
    units_billed: float
    units_received: float
    billed_amount: float
    agreed_rate: Optional[float] = None
    rate_effective_date: Optional[str] = None
    billed_period_start: Optional[str] = None
    billed_period_end: Optional[str] = None
    spans_contribution_change: bool = False


@chsp1_router.post("/fee-check/preview")
async def fee_check_preview(body: FeeCheckPreviewIn, request: Request):
    """Stateless WS-1 per-unit Fee Check. Requires auth but persists nothing;
    the caller decides whether to act on the verdict."""
    await _assert_flag()
    if not _ws1_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    await _user_id(request)
    result = run_fee_check(
        agreed_rate=body.agreed_rate,
        units_received=body.units_received,
        units_billed=body.units_billed,
        billed_amount=body.billed_amount,
        rate_effective_date=body.rate_effective_date,
        billed_period_start=body.billed_period_start,
        spans_contribution_change=body.spans_contribution_change,
    )
    result["invoice_reference"] = body.invoice_reference
    result["provider_name"] = body.provider_name
    result["service_type"] = body.service_type
    _attach_ws1_explanations(result)
    return {"result": result}


_WS1_TIER_LABEL = {"within": "Looks right", "minor": "Slightly off", "material": "Too high"}


def _attach_ws1_explanations(result: dict) -> None:
    """Turn the raw within/minor/material tiers into clear, plain-English guidance
    both the web and mobile clients can show verbatim."""
    if result.get("degraded"):
        return
    rt = result.get("rate_tier")
    ut = result.get("units_tier")
    overall = result.get("overall_verdict")
    is_over = result.get("is_overcharge")
    result["rate_tier_label"] = _WS1_TIER_LABEL.get(rt, "—")
    result["units_tier_label"] = _WS1_TIER_LABEL.get(ut, "—")
    result["rate_explanation"] = {
        "within": "You were charged your agreed per-unit rate (or less).",
        "minor": "You were billed a little above your agreed per-unit rate.",
        "material": "You were billed well above your agreed per-unit rate.",
    }.get(rt, "")
    result["units_explanation"] = {
        "within": "You were billed for the hours or visits you actually received.",
        "minor": "You were billed for slightly more than you received.",
        "material": "You were billed for noticeably more than you received.",
    }.get(ut, "")
    if overall == "within":
        result["verdict_headline"] = "This invoice looks right"
        result["verdict_explanation"] = "What you were billed matches your agreed rate and the services you received. No action needed."
        result["action_label"] = None
    elif overall == "minor":
        result["verdict_headline"] = "This invoice is slightly off"
        result["verdict_explanation"] = "The difference is small, but it is worth a quick check. Ask your provider to confirm the rate and the units billed."
        result["action_label"] = "Draft a query letter"
    elif overall == "material":
        result["verdict_headline"] = "This invoice looks overcharged" if is_over else "This invoice does not add up"
        result["verdict_explanation"] = "You appear to have been billed more than your agreed rate and units allow. It is worth querying this with your provider."
        result["action_label"] = "Draft a query letter"
    else:
        result["verdict_headline"] = result.get("verdict_label") or "Checked"
        result["verdict_explanation"] = ""
        result["action_label"] = None


CHSP_PARSE_SYSTEM = (
    "You are a careful billing assistant for the Australian Commonwealth Home Support Programme (CHSP). "
    "You read the text of ONE CHSP invoice or statement and extract billing facts as STRICT JSON. "
    "Return ONLY a JSON object, no prose, no code fences. "
    "Use null when a value is not present. Money values are plain numbers (no $ or commas). "
    "Dates are DD/MM/YYYY. service_type must be one of: domestic_assistance, personal_care, meals, "
    "transport, social_support_individual, social_support_group, allied_health, nursing, home_maintenance, "
    "home_modifications_minor, goods_equipment_assistive_technology, respite, specialised_support_services, other. "
    "Keys: provider_name (string|null), invoice_reference (string|null), service_type (string|null), "
    "agreed_rate (number|null, the per-unit/hourly rate), units_billed (number|null), units_received (number|null), "
    "billed_amount (number|null, total billed for this service), billed_period_start (string|null), "
    "billed_period_end (string|null), plain_summary (string, 2 short plain-English sentences a family carer can "
    "understand about what this invoice charges), next_steps (array of up to 4 short plain-English action strings). "
    "If units_received is not stated, set it equal to units_billed."
)


def _strip_json_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1] if s.count("```") >= 2 else s.strip("`")
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    return s.strip()


@chsp1_router.post("/fee-check/parse-invoice")
async def parse_chsp_invoice(request: Request, file: UploadFile = File(...)):
    """Read an uploaded CHSP invoice and return pre-fill options for the Fee
    Check. Multi-line invoices return a ``line_options`` array so the caller
    can pick the service to check; ``fields`` holds the primary (first flagged,
    else first) line for one-tap pre-fill. Persists nothing."""
    await _assert_flag()
    if not _ws1_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    uid = await _user_id(request)

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        import document_extract  # type: ignore
    except Exception:  # pragma: no cover
        from backend import document_extract  # type: ignore
    try:
        text, _input_method, _pages, _warnings = await document_extract.extract_document(file.filename or "invoice", raw)
    except Exception as e:
        logger.warning("chsp invoice extract failed: %s", e)
        raise HTTPException(status_code=422, detail="Could not read that file. Try a clearer PDF or photo.")
    if not (text or "").strip():
        raise HTTPException(status_code=422, detail="No readable text found in that file.")

    guard = _chsp_upload_guard(text)
    if guard is not None:
        return {"upload_guard": guard, "fields": {}, "line_options": [], "plain_summary": "", "next_steps": [], "extracted": False}

    analysis = await _analyse_invoice_text(text, uid)
    header = analysis.get("header") or {}
    lines = analysis.get("line_items") or []

    def _line_option(li: Dict[str, Any], i: int) -> Dict[str, Any]:
        agreed = li.get("agreed_rate")
        if agreed in (None, "", 0):
            agreed = li.get("unit_rate")
        units = li.get("units")
        return {
            "index": i,
            "label": li.get("description") or (li.get("service_type") or "service").replace("_", " ").title(),
            "service_type": li.get("service_type") or "other",
            "provider_name": header.get("provider_name"),
            "invoice_reference": header.get("invoice_reference"),
            "agreed_rate": agreed,
            "units_billed": units,
            "units_received": units,
            "billed_amount": li.get("amount"),
            "billed_period_start": header.get("period_start"),
            "billed_period_end": header.get("period_end"),
            "unit_label": li.get("unit_label"),
            "variance_status": li.get("variance_status"),
        }

    line_options = [_line_option(li, i) for i, li in enumerate(lines)]

    # Primary line for one-tap prefill: prefer a flagged (over-rate) line.
    primary = next((o for o in line_options if o.get("variance_status") in ("minor", "material")), None)
    primary = primary or (line_options[0] if line_options else None)

    if primary:
        fields = {
            "provider_name": primary.get("provider_name"),
            "invoice_reference": primary.get("invoice_reference"),
            "service_type": primary.get("service_type"),
            "agreed_rate": primary.get("agreed_rate"),
            "units_billed": primary.get("units_billed"),
            "units_received": primary.get("units_received"),
            "billed_amount": primary.get("billed_amount"),
            "billed_period_start": primary.get("billed_period_start"),
            "billed_period_end": primary.get("billed_period_end"),
        }
    else:
        fields = {
            "provider_name": header.get("provider_name"),
            "invoice_reference": header.get("invoice_reference"),
            "service_type": None, "agreed_rate": None, "units_billed": None,
            "units_received": None, "billed_amount": None,
            "billed_period_start": header.get("period_start"),
            "billed_period_end": header.get("period_end"),
        }

    summary = analysis.get("plain_summary") or "We read your invoice. Pick the service to check, review the pre-filled figures, then run the fee check."
    next_steps = analysis.get("next_steps") or [
        "Pick the service line you want to check below.",
        "Check the pre-filled provider, rate and amounts against your invoice.",
        "Run the fee check to see whether the amount looks right.",
    ]
    if len(line_options) > 1:
        next_steps = ["This invoice has several service lines — pick the one to check."] + [
            s for s in next_steps if not s.lower().startswith("pick the service")
        ]
    return {
        "fields": fields,
        "line_options": line_options,
        "plain_summary": str(summary),
        "next_steps": [str(s) for s in next_steps][:4],
        "extracted": bool(line_options),
    }


CHSP_INVOICE_SYSTEM = (
    "You are a careful billing assistant for the Australian Commonwealth Home Support "
    "Programme (CHSP). Read the text of ONE CHSP invoice or statement and extract ALL "
    "billing facts as STRICT JSON. Return ONLY one JSON object — no prose, no code fences. "
    "Money values are plain numbers (no dollar sign or commas). Dates are DD/MM/YYYY or null. "
    "Include EVERY service row you can see. Use null when a value is absent.\n"
    "service_type must be one of: domestic_assistance, personal_care, meals, transport, "
    "social_support_individual, social_support_group, allied_health, nursing, home_maintenance, "
    "home_modifications_minor, goods_equipment_assistive_technology, respite, "
    "specialised_support_services, other.\n"
    "Keys:\n"
    "header: {provider_name, invoice_reference, invoice_date, due_date, period_start, "
    "period_end, client_name, client_id, programme}\n"
    "line_items: array; each item {service_type, description (the service name exactly as "
    "printed), sub_programme (code or null), dates (string as printed or null), units (number "
    "or null), unit_label (e.g. 'hrs','trips','meals' or null), unit_rate (number or null, the "
    "billed per-unit rate), gst (number or null), amount (number, the line total)}\n"
    "totals: {subtotal, gst_total, grand_total, government_subsidy, client_contribution}\n"
    "plain_summary: 2-3 short plain-English sentences a family carer can understand about what "
    "this invoice charges.\n"
    "next_steps: array of up to 4 short plain-English action strings."
)

_SERVICE_CATEGORY = {
    "nursing": ("clinical", "Clinical care"),
    "allied_health": ("clinical", "Clinical care"),
    "personal_care": ("personal", "Personal care & respite"),
    "respite": ("personal", "Personal care & respite"),
    "domestic_assistance": ("everyday", "Everyday living"),
    "meals": ("everyday", "Everyday living"),
    "home_maintenance": ("everyday", "Everyday living"),
    "home_modifications_minor": ("everyday", "Everyday living"),
    "goods_equipment_assistive_technology": ("everyday", "Everyday living"),
    "social_support_individual": ("social", "Social & transport"),
    "social_support_group": ("social", "Social & transport"),
    "transport": ("social", "Social & transport"),
    "specialised_support_services": ("other", "Other"),
    "other": ("other", "Other"),
}
_CATEGORY_ORDER = [
    ("clinical", "Clinical care"), ("personal", "Personal care & respite"),
    ("everyday", "Everyday living"), ("social", "Social & transport"), ("other", "Other"),
]


def _num(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


async def _analyse_invoice_text(text: str, uid: str) -> Dict[str, Any]:
    """Read a full CHSP invoice (all line items), flag per-line variance against
    the user's saved agreed rates, and build graphics + a plain-English summary."""
    import json as _json
    parsed: Dict[str, Any] = {}
    try:
        from lib import llm_wrapper
        reply = await llm_wrapper.chat_send(
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
            system=CHSP_INVOICE_SYSTEM,
            user_text=f"CHSP invoice/statement text:\n\n{text[:12000]}\n\nReturn the JSON object now.",
            apply_tone_rules=False,
        )
        obj = _json.loads(_strip_json_fences(str(reply or "")))
        if isinstance(obj, dict):
            parsed = obj
        elif isinstance(obj, list):
            # Model returned only the line-items array — wrap it so we still work.
            parsed = {"line_items": obj}
    except Exception as e:
        logger.warning("chsp invoice analyse llm failed: %s", e)
        parsed = {}

    header = parsed.get("header") if isinstance(parsed.get("header"), dict) else {}
    raw_items = parsed.get("line_items") if isinstance(parsed.get("line_items"), list) else []
    totals = parsed.get("totals") if isinstance(parsed.get("totals"), dict) else {}

    # Saved agreed per-unit rates for this user (keyed by service_type) so we can
    # flag likely overcharges. We compare against the SAVED rate, never a value
    # the model guessed off the invoice.
    saved_rates: Dict[str, float] = {}
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if profile:
        async for s in _db.chsp_service_entries.find({"chsp_profile_id": profile["id"], "is_active": True}):
            st = s.get("service_type")
            amt = ((s.get("hourly_rate_or_fee") or {}).get("amount"))
            if st and amt and st not in saved_rates:
                saved_rates[st] = float(amt)

    line_items: List[Dict[str, Any]] = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        st = it.get("service_type") or "other"
        cat_key, cat_label = _SERVICE_CATEGORY.get(st, ("other", "Other"))
        amount = _num(it.get("amount")) or 0.0
        unit_rate = _num(it.get("unit_rate"))
        row: Dict[str, Any] = {
            "service_type": st,
            "description": it.get("description") or st.replace("_", " ").title(),
            "sub_programme": it.get("sub_programme"),
            "dates": it.get("dates"),
            "units": _num(it.get("units")),
            "unit_label": it.get("unit_label"),
            "unit_rate": unit_rate,
            "gst": _num(it.get("gst")),
            "amount": amount,
            "category": cat_key,
            "category_label": cat_label,
        }
        agreed = saved_rates.get(st)
        if agreed and unit_rate:
            delta = round(unit_rate - agreed, 2)
            pct = (delta / agreed * 100) if agreed else 0
            if abs(delta) <= max(0.01, agreed * 0.02):
                status = "within"
            elif abs(pct) <= 5:
                status = "minor"
            else:
                status = "material"
            row["agreed_rate"] = agreed
            row["variance_delta"] = delta
            row["variance_status"] = status
        line_items.append(row)

    line_total = round(sum((li["amount"] or 0) for li in line_items), 2)
    grand_total = _num(totals.get("grand_total"))
    if grand_total is None:
        grand_total = line_total
    subtotal = _num(totals.get("subtotal"))
    if subtotal is None:
        subtotal = line_total

    cat_totals: Dict[str, float] = {}
    for li in line_items:
        cat_totals[li["category"]] = round(cat_totals.get(li["category"], 0) + (li["amount"] or 0), 2)
    by_category = [
        {"key": k, "label": lbl, "amount": cat_totals[k]}
        for (k, lbl) in _CATEGORY_ORDER if cat_totals.get(k)
    ]

    flags_count = sum(1 for li in line_items if li.get("variance_status") in ("minor", "material"))

    next_steps = [str(s) for s in (parsed.get("next_steps") or []) if s][:4]
    if not next_steps:
        next_steps = [
            "Read each line and check the service, dates and amount against your records.",
            "Add your provider's agreed per-unit rates so Wayly can flag overcharges.",
            "Save this invoice to keep a history you can filter later.",
        ]

    return {
        "header": {
            "provider_name": header.get("provider_name"),
            "invoice_reference": header.get("invoice_reference"),
            "invoice_date": header.get("invoice_date"),
            "due_date": header.get("due_date"),
            "period_start": header.get("period_start"),
            "period_end": header.get("period_end"),
            "client_name": header.get("client_name"),
            "client_id": header.get("client_id"),
            "programme": header.get("programme") or "CHSP",
        },
        "line_items": line_items,
        "totals": {
            "subtotal": subtotal,
            "gst_total": _num(totals.get("gst_total")),
            "grand_total": grand_total,
            "government_subsidy": _num(totals.get("government_subsidy")),
            "client_contribution": _num(totals.get("client_contribution")),
        },
        "by_category": by_category,
        "flags_count": flags_count,
        "plain_summary": str(parsed.get("plain_summary") or "We read your invoice below. Check each line against your paper copy, then save it to your history."),
        "next_steps": next_steps,
        "extracted": bool(line_items),
    }


@chsp1_router.post("/invoice/analyse")
async def analyse_chsp_invoice(request: Request, file: UploadFile = File(...)):
    """CHSP-INV-1 — read the WHOLE invoice: every line item, totals, a plain
    summary, per-line variance flags and category graphics. Persists nothing."""
    await _assert_flag()
    if not _ws1_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    uid = await _user_id(request)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        import document_extract  # type: ignore
    except Exception:  # pragma: no cover
        from backend import document_extract  # type: ignore
    try:
        text, *_rest = await document_extract.extract_document(file.filename or "invoice", raw)
    except Exception as e:
        logger.warning("chsp invoice extract failed: %s", e)
        raise HTTPException(status_code=422, detail="Could not read that file. Try a clearer PDF or photo.")
    if not (text or "").strip():
        raise HTTPException(status_code=422, detail="No readable text found in that file.")
    guard = _chsp_upload_guard(text)
    if guard is not None:
        return {"upload_guard": guard, "analysis": {"extracted": False}}
    analysis = await _analyse_invoice_text(text, uid)
    return {"analysis": analysis}


class InvoiceSaveIn(BaseModel):
    participant_id: Optional[str] = None
    force: bool = False
    header: Dict[str, Any] = Field(default_factory=dict)
    line_items: List[Dict[str, Any]] = Field(default_factory=list)
    totals: Dict[str, Any] = Field(default_factory=dict)
    by_category: List[Dict[str, Any]] = Field(default_factory=list)
    plain_summary: Optional[str] = None
    next_steps: List[str] = Field(default_factory=list)
    flags_count: int = 0


@chsp1_router.post("/invoice/save")
async def save_chsp_invoice(body: InvoiceSaveIn, request: Request):
    """Persist an analysed invoice so the user can revisit and filter history."""
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    header = body.header or {}
    totals = body.totals or {}
    ref = header.get("invoice_reference")
    prov = header.get("provider_name")
    # Save de-dupe: warn (do not save) if the same invoice already exists.
    if not body.force and (ref or prov):
        dq: Dict[str, Any] = {"user_id": uid}
        if body.participant_id:
            dq["participant_id"] = body.participant_id
        if ref:
            dq["invoice_reference"] = ref
        if prov:
            dq["provider_name"] = prov
        existing = await _db.chsp_invoices.find_one(dq)
        if existing:
            return {"duplicate": True, "existing": {
                "id": existing["id"],
                "provider_name": existing.get("provider_name"),
                "invoice_reference": existing.get("invoice_reference"),
                "grand_total": (existing.get("totals") or {}).get("grand_total"),
                "created_at": _iso(existing["created_at"]) if existing.get("created_at") else None,
            }}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "participant_id": body.participant_id,
        "header": header,
        "line_items": body.line_items,
        "totals": totals,
        "by_category": body.by_category,
        "plain_summary": body.plain_summary,
        "next_steps": body.next_steps,
        "flags_count": body.flags_count,
        # Denormalised columns for the filterable history table.
        "provider_name": header.get("provider_name"),
        "invoice_reference": header.get("invoice_reference"),
        "invoice_date": header.get("invoice_date"),
        "period_start": header.get("period_start"),
        "period_end": header.get("period_end"),
        "grand_total": totals.get("grand_total"),
        "client_contribution": totals.get("client_contribution"),
        "line_count": len(body.line_items or []),
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_invoices.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(now)
    return {"invoice": doc, "duplicate": False}


@chsp1_router.get("/invoices")
async def list_chsp_invoices(request: Request, participant_id: Optional[str] = None):
    await _assert_flag()
    uid = await _user_id(request)
    q: Dict[str, Any] = {"user_id": uid}
    if participant_id:
        q["participant_id"] = participant_id
    cur = _db.chsp_invoices.find(q).sort("created_at", -1)
    rows = await cur.to_list(length=200)
    out = []
    for r in rows:
        r.pop("_id", None)
        if r.get("created_at"):
            r["created_at"] = _iso(r["created_at"])
        out.append(r)
    return {"invoices": out}


@chsp1_router.get("/invoices/{invoice_id}")
async def get_chsp_invoice(invoice_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.chsp_invoices.find_one({"id": invoice_id, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    if doc.get("created_at"):
        doc["created_at"] = _iso(doc["created_at"])
    return {"invoice": doc}


@chsp1_router.delete("/invoices/{invoice_id}")
async def delete_chsp_invoice(invoice_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    res = await _db.chsp_invoices.delete_one({"id": invoice_id, "user_id": uid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


@chsp1_router.get("/invoice-trends")
async def chsp_invoice_trends(request: Request, participant_id: Optional[str] = None):
    """Monthly client-contribution + total spend across saved invoices, so a
    family can spot their CHSP costs creeping up. Strictly scoped to this user."""
    import re as _re
    await _assert_flag()
    uid = await _user_id(request)
    q: Dict[str, Any] = {"user_id": uid}
    if participant_id:
        q["participant_id"] = participant_id
    buckets: Dict[str, Dict[str, Any]] = {}
    async for r in _db.chsp_invoices.find(q):
        d = str(r.get("invoice_date") or "")
        key = None
        m = _re.match(r"^(\d{2})/(\d{2})/(\d{4})$", d)
        if m:
            key = f"{m.group(3)}-{m.group(2)}"
        elif r.get("created_at"):
            ca = r["created_at"]
            key = ca.strftime("%Y-%m") if hasattr(ca, "strftime") else str(ca)[:7]
        if not key:
            continue
        b = buckets.setdefault(key, {"month": key, "contribution": 0.0, "total": 0.0, "count": 0})
        t = r.get("totals") or {}
        b["contribution"] += float(t.get("client_contribution") or 0)
        b["total"] += float(t.get("grand_total") or 0)
        b["count"] += 1
    out = [
        {**v, "contribution": round(v["contribution"], 2), "total": round(v["total"], 2)}
        for _k, v in sorted(buckets.items())
    ]
    return {"trends": out}


OVERCHARGE_LETTER_SYSTEM = (
    "You write short, polite but firm query letters for a family carer to send to their aged-care "
    "(CHSP) provider about a billing error. Plain English, warm and respectful, no legal jargon, no "
    "threats. Australian spelling. Return ONLY the letter body text (greeting to sign-off), no preamble, "
    "no code fences, no placeholders in [brackets] unless a fact is genuinely missing. Structure: a "
    "greeting, one sentence stating the invoice and service, a clear statement of the agreed rate vs what "
    "was billed and the difference, a polite request to review and correct/credit the difference and to "
    "confirm in writing, and a courteous sign-off. Keep it under 180 words."
)


class OverchargeLetterIn(BaseModel):
    provider_name: Optional[str] = None
    client_name: Optional[str] = None
    invoice_reference: Optional[str] = None
    service_description: Optional[str] = None
    period: Optional[str] = None
    units: Optional[float] = None
    unit_label: Optional[str] = None
    billed_unit_rate: Optional[float] = None
    agreed_rate: Optional[float] = None
    billed_amount: Optional[float] = None
    expected_amount: Optional[float] = None


@chsp1_router.post("/overcharge-letter")
async def chsp_overcharge_letter(body: OverchargeLetterIn, request: Request):
    """Generate a ready-to-send query letter for a flagged / overcharged line."""
    import json as _json
    await _assert_flag()
    await _user_id(request)
    diff = None
    if body.billed_amount is not None and body.expected_amount is not None:
        diff = round(body.billed_amount - body.expected_amount, 2)
    facts = {
        "provider_name": body.provider_name or "the provider",
        "client_name": body.client_name or "the client",
        "invoice_reference": body.invoice_reference,
        "service_description": body.service_description,
        "billed_period": body.period,
        "units": body.units,
        "unit_label": body.unit_label,
        "agreed_per_unit_rate": body.agreed_rate,
        "billed_per_unit_rate": body.billed_unit_rate,
        "billed_amount": body.billed_amount,
        "expected_amount": body.expected_amount,
        "difference_overcharged": diff,
    }
    letter = ""
    try:
        from lib import llm_wrapper
        reply = await llm_wrapper.chat_send(
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
            system=OVERCHARGE_LETTER_SYSTEM,
            user_text="Write the letter using these facts (omit any that are null):\n" + _json.dumps(facts),
            apply_tone_rules=False,
        )
        letter = str(reply or "").strip()
    except Exception as e:  # pragma: no cover
        logger.warning("overcharge letter generation failed: %s", e)
    if not letter:
        raise HTTPException(status_code=502, detail="Could not draft the letter right now. Please try again.")
    return {"letter": letter}


FINDINGS_LETTER_SYSTEM = (
    "You write ONE short, polite but firm query letter for a family carer to send to their aged-care "
    "(CHSP) provider about SEVERAL billing lines on the same invoice that look overcharged. Plain English, "
    "warm and respectful, no legal jargon, no threats. Australian spelling. Return ONLY the letter body text "
    "(greeting to sign-off), no preamble, no code fences, no placeholders in [brackets] unless a fact is "
    "genuinely missing. Structure: a greeting, one sentence naming the invoice, then a short bulleted list "
    "with one line per flagged service (service, the agreed rate vs what was billed, and the difference), "
    "then a polite request to review and correct/credit the differences and confirm in writing, and a "
    "courteous sign-off. Keep it under 240 words."
)


class FindingsLetterLine(BaseModel):
    service_description: Optional[str] = None
    units: Optional[float] = None
    unit_label: Optional[str] = None
    billed_unit_rate: Optional[float] = None
    agreed_rate: Optional[float] = None
    billed_amount: Optional[float] = None
    expected_amount: Optional[float] = None


class FindingsLetterIn(BaseModel):
    provider_name: Optional[str] = None
    client_name: Optional[str] = None
    invoice_reference: Optional[str] = None
    period: Optional[str] = None
    lines: List[FindingsLetterLine] = Field(default_factory=list)


@chsp1_router.post("/findings-letter")
async def chsp_findings_letter(body: FindingsLetterIn, request: Request):
    """Draft ONE consolidated query letter covering every flagged / overcharged
    line from an invoice analysis."""
    import json as _json
    await _assert_flag()
    await _user_id(request)
    if not body.lines:
        raise HTTPException(status_code=400, detail="No flagged lines to raise.")
    lines_facts = []
    for ln in body.lines:
        diff = None
        if ln.billed_amount is not None and ln.expected_amount is not None:
            diff = round(ln.billed_amount - ln.expected_amount, 2)
        lines_facts.append({
            "service": ln.service_description,
            "units": ln.units,
            "unit_label": ln.unit_label,
            "agreed_per_unit_rate": ln.agreed_rate,
            "billed_per_unit_rate": ln.billed_unit_rate,
            "billed_amount": ln.billed_amount,
            "expected_amount": ln.expected_amount,
            "difference_overcharged": diff,
        })
    facts = {
        "provider_name": body.provider_name or "the provider",
        "client_name": body.client_name or "the client",
        "invoice_reference": body.invoice_reference,
        "billed_period": body.period,
        "flagged_lines": lines_facts,
    }
    letter = ""
    try:
        from lib import llm_wrapper
        reply = await llm_wrapper.chat_send(
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
            system=FINDINGS_LETTER_SYSTEM,
            user_text="Write the letter using these facts (omit any that are null):\n" + _json.dumps(facts),
            apply_tone_rules=False,
        )
        letter = str(reply or "").strip()
    except Exception as e:  # pragma: no cover
        logger.warning("findings letter generation failed: %s", e)
    if not letter:
        raise HTTPException(status_code=502, detail="Could not draft the letter right now. Please try again.")
    return {"letter": letter}


def _safe_slug(s: Optional[str], fallback: str = "chsp") -> str:
    import re as _re
    out = _re.sub(r"[^\w.\-]+", "-", (s or "").strip()).strip("-")
    return out[:40] or fallback


class FindingsLetterPdfIn(BaseModel):
    letter: str
    provider_name: Optional[str] = None
    client_name: Optional[str] = None
    invoice_reference: Optional[str] = None
    period: Optional[str] = None


@chsp1_router.post("/findings-letter/pdf")
async def chsp_findings_letter_pdf(body: FindingsLetterPdfIn, request: Request):
    """Render a branded PDF of the consolidated Findings letter for download."""
    await _assert_flag()
    await _user_id(request)
    if not (body.letter or "").strip():
        raise HTTPException(status_code=400, detail="There is no letter to download yet.")
    from lib.chsp1 import chsp_pdf
    try:
        pdf = chsp_pdf.render_findings_letter_pdf(body.dict())
    except Exception as e:  # pragma: no cover
        logger.warning("chsp findings letter pdf render failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not build the PDF right now.")
    prov = _safe_slug(body.provider_name, "provider")
    fn = f"Wayly-CHSP-Findings-Letter_{prov}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


class InvoicePdfIn(BaseModel):
    header: Dict[str, Any] = Field(default_factory=dict)
    line_items: List[Dict[str, Any]] = Field(default_factory=list)
    totals: Dict[str, Any] = Field(default_factory=dict)
    by_category: List[Dict[str, Any]] = Field(default_factory=list)
    plain_summary: Optional[str] = None
    next_steps: List[str] = Field(default_factory=list)
    flags_count: int = 0


@chsp1_router.post("/invoice/pdf")
async def chsp_invoice_pdf(body: InvoicePdfIn, request: Request):
    """Render a branded PDF of a CHSP invoice analysis. Persists nothing."""
    await _assert_flag()
    await _user_id(request)
    from lib.chsp1 import chsp_pdf
    try:
        pdf = chsp_pdf.render_invoice_pdf(body.dict())
    except Exception as e:  # pragma: no cover
        logger.warning("chsp invoice pdf render failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not build the PDF right now.")
    prov = _safe_slug((body.header or {}).get("provider_name"), "invoice")
    ref = _safe_slug((body.header or {}).get("invoice_reference"), "")
    fn = f"Wayly-CHSP-Invoice_{prov}{('_' + ref) if ref else ''}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


class FeeCheckPdfIn(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    result: Dict[str, Any] = Field(default_factory=dict)


@chsp1_router.post("/fee-check/pdf")
async def chsp_fee_check_pdf(body: FeeCheckPdfIn, request: Request):
    """Render a branded PDF of a single per-unit Fee Check result."""
    await _assert_flag()
    await _user_id(request)
    from lib.chsp1 import chsp_pdf
    try:
        pdf = chsp_pdf.render_fee_check_pdf(body.dict())
    except Exception as e:  # pragma: no cover
        logger.warning("chsp fee check pdf render failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not build the PDF right now.")
    prov = _safe_slug((body.fields or {}).get("provider_name"), "fee-check")
    fn = f"Wayly-CHSP-Fee-Check_{prov}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


class SavedCheckIn(BaseModel):
    invoice_reference: Optional[str] = None
    provider_name: Optional[str] = None
    service_type: Optional[str] = None
    agreed_rate: Optional[float] = None
    units_billed: Optional[float] = None
    units_received: Optional[float] = None
    billed_amount: Optional[float] = None
    rate_effective_date: Optional[str] = None
    billed_period_start: Optional[str] = None
    billed_period_end: Optional[str] = None
    result: Dict[str, Any] = Field(default_factory=dict)


@chsp1_router.post("/fee-check/save")
async def save_fee_check(body: SavedCheckIn, request: Request):
    """Persist a WS-1 fee check so the user can revisit it under Past checks."""
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        **body.dict(),
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_saved_checks.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    return {"saved_check": doc}


@chsp1_router.get("/fee-check/saved")
async def list_saved_checks(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    cur = _db.chsp_saved_checks.find({"user_id": uid}).sort("created_at", -1)
    rows = await cur.to_list(length=100)
    for r in rows:
        r.pop("_id", None)
        if r.get("created_at"):
            r["created_at"] = _iso(r["created_at"])
    return {"saved_checks": rows}


@chsp1_router.delete("/fee-check/saved/{check_id}")
async def delete_saved_check(check_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    res = await _db.chsp_saved_checks.delete_one({"id": check_id, "user_id": uid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}



class ChspLetterIn(BaseModel):
    kind: str = "service_continuity"  # or "hardship"
    provider_name: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


@chsp1_router.post("/letter")
async def create_chsp_letter(body: ChspLetterIn, request: Request):
    """WS-3 · Create an LF-1 correspondence draft for a CHSP access/hardship
    situation and return the editor path. ``service_continuity`` asks the
    provider to keep services running (situation 6); ``hardship`` raises a
    fee-waiver / contribution-hardship notification (situation 9)."""
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    participant_id = (profile or {}).get("represents_participant_id")
    # Fall back to the household's primary participant when there is no CHSP
    # profile row, so the letter's participant_name is populated (otherwise
    # /lf1/.../generate 422s on participant_name -> blank letter).
    if not participant_id:
        udoc = await _db.users.find_one({"id": uid}, {"_id": 0, "household_id": 1})
        hid = (udoc or {}).get("household_id")
        if hid:
            pp = (await _db.participants.find_one({"household_id": hid, "is_primary": True, "status": {"$ne": "REMOVED"}}, {"_id": 0})
                  or await _db.participants.find_one({"household_id": hid, "status": {"$ne": "REMOVED"}}, {"_id": 0}))
            if pp:
                participant_id = pp.get("id")

    if body.kind == "hardship":
        situation_id, archetype, recipient = 9, "notification", "services_australia_aged_care"
    else:
        situation_id, archetype, recipient = 6, "request", "provider_cm"

    # Populate the intake so the draft generates real content (an empty intake
    # previously made /lf1/.../generate 422 -> blank letter).
    pname = ""
    if participant_id:
        p = await _db.participants.find_one(
            {"id": participant_id},
            {"_id": 0, "first_name": 1, "last_name": 1, "display_name": 1, "name": 1},
        )
        if p:
            full = f"{(p.get('first_name') or '').strip()} {(p.get('last_name') or '').strip()}".strip()
            pname = full or (p.get("display_name") or p.get("name") or "").strip()
    subject_who = f" for {pname}" if pname else ""
    person = pname or "the person I care for"
    intake: Dict[str, Any] = {"participant_name": pname}
    if body.provider_name:
        intake["provider_name"] = body.provider_name
        intake["recipient_name"] = body.provider_name
    if body.kind == "hardship":
        intake["subject"] = f"Financial hardship and contribution support{subject_who}"
        intake["notification_summary"] = (
            f"I am writing about {person} and their Commonwealth Home Support Programme services. "
            f"We are experiencing financial hardship that is making the current contributions difficult to sustain. "
            f"I would like to understand what fee-waiver, reduced-contribution or hardship options are available, and how to apply for them."
        )
    else:
        intake["subject"] = f"Continuity of Commonwealth Home Support Programme services{subject_who}"
        intake["change_summary"] = (
            f"I am writing to ask that {person}'s current Commonwealth Home Support Programme services continue without interruption. "
            f"Please confirm these services will keep running as they are now, and let me know in advance of any change to them."
        )
        intake.setdefault("change_type", "care_plan_amendment")

    entry_id = str(uuid.uuid4())
    now = _iso(_now())
    entry = {
        "id": entry_id,
        "user_id": uid,
        "participant_id": participant_id,
        "situation_id": situation_id,
        "archetype": archetype,
        "direction": "outbound",
        "recipient_type": recipient,
        "sender_identity": None,
        "sender_authority_basis": None,
        "complaint_mode": None,
        "atsi_preference": False,
        "source_import": {
            "tool": "chsp-tools",
            "letter_kind": body.kind,
            "provider_name": body.provider_name,
            **body.context,
        },
        "intake": intake,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    await _db.lf1_correspondence.insert_one(entry)
    return {
        "entry_id": entry_id,
        "situation_id": situation_id,
        "kind": body.kind,
        "editor_path": f"/tools/letters-and-follow-ups/{entry_id}",
    }



# ---------------------------------------------------------------------------
# Transition consideration
# ---------------------------------------------------------------------------


class TransitionIn(BaseModel):
    reasons_for_considering_transition: List[str] = Field(default_factory=list)
    reasons_notes: Optional[str] = None
    considerations_reviewed: Dict[str, bool] = Field(default_factory=dict)
    decision: Optional[str] = None
    decision_notes: Optional[str] = None


@chsp1_router.post("/transition-considerations")
async def submit_transition(body: TransitionIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    now = _now()
    # Cross-tool context snapshot
    services = await _db.chsp_service_entries.count_documents({"chsp_profile_id": profile["id"], "is_active": True})
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "actor_user_id": uid,
        "reasons_for_considering_transition": body.reasons_for_considering_transition,
        "reasons_notes": body.reasons_notes,
        "cross_tool_context_snapshot": {"active_services_count": services, "typical_hours_per_week": None, "caregiver_burnout_indicators_from_cs_1": None},
        "considerations_reviewed": body.considerations_reviewed,
        "decision": body.decision,
        "decision_notes": body.decision_notes,
        "completed_at": now if body.decision else None,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_transition_considerations.insert_one(doc)
    # Mark profile if user chose to proceed
    profile_upd: Dict[str, Any] = {"updated_at": now}
    if body.decision in {"proceed_with_transition_seek_ras_reassessment", "proceed_with_transition_seek_iat_directly"}:
        profile_upd["transition_being_considered"] = True
        profile_upd["transition_consideration_started_at"] = now
        profile_upd["current_chsp_status"] = "transitioning_to_sah"
    await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$set": profile_upd})
    doc.pop("_id", None)
    doc["completed_at"] = _iso(doc["completed_at"])
    return {"transition_consideration": doc}
