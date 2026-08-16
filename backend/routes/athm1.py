"""ATHM-1 v1 slice: Assistive Technology and Home Modifications.

Scope (per ATHM-1-v1.md):
  * Section B.1 AthmProject with 14-status lifecycle.
  * Section B.2 AthmItem with quotes + trial + warranty.
  * Section B.3 AthmModification with quote comparison.
  * Section B.4 AthmCatalogEntry (seeded with common items).
  * Section D endpoints: project CRUD, item + modification CRUD, catalog browse, quote comparison.
  * Section F.4 price context (within/above/below typical range).
  * Section H.3 variance analysis for HM.
  * Section J.1 trial period reminder scheduling (records only, no cron).

Deferred to ATHM-1 v2:
  * Trial period reminder cron scheduler.
  * S3 signed-URL document storage for quotes / prescriptions.
  * Deep BC-2 / CE-3 wiring beyond linkage endpoints.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.athm1")

athm1_router = APIRouter(prefix="/athm1", tags=["athm1"])

_db = None
_user_dep = None
_core1_assert_access = None

CATALOG_SEED = [
    {"slug": "walking_frame", "category": "mobility_aid", "item_name": "Walking Frame",
     "description": "Standard four-legged walking frame with height adjustment.",
     "typical_price_range": {"low": {"amount": 80, "currency": "AUD"}, "high": {"amount": 250, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription typical.",
     "funding_notes": "Usually within standard SAH budget.", "common_supplier_types": "Aged-care equipment suppliers"},
    {"slug": "shower_chair", "category": "bathing_aid", "item_name": "Shower Chair",
     "description": "Non-slip shower chair with adjustable legs.",
     "typical_price_range": {"low": {"amount": 60, "currency": "AUD"}, "high": {"amount": 220, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription typical.", "funding_notes": "Standard SAH budget.",
     "common_supplier_types": "Bathroom equipment suppliers"},
    {"slug": "grab_rail", "category": "home_safety", "item_name": "Grab Rail",
     "description": "Wall-mounted grab rail for bathroom or hallway use.",
     "typical_price_range": {"low": {"amount": 40, "currency": "AUD"}, "high": {"amount": 180, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription and installation.", "funding_notes": "Standard SAH budget.",
     "common_supplier_types": "Bathroom equipment, HM builders"},
    {"slug": "electric_hospital_bed", "category": "bed_and_bedding", "item_name": "Electric Hospital Bed",
     "description": "Height-adjustable electric hospital bed with side rails.",
     "typical_price_range": {"low": {"amount": 1800, "currency": "AUD"}, "high": {"amount": 4500, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription required.", "funding_notes": "May require dedicated AT/HM funding.",
     "common_supplier_types": "Aged-care equipment suppliers"},
    {"slug": "bathroom_modification", "category": "bathroom", "item_name": "Bathroom Modification",
     "description": "Modifications for accessibility (grab rails, non-slip flooring, walk-in shower).",
     "typical_price_range": {"low": {"amount": 3000, "currency": "AUD"}, "high": {"amount": 18000, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription with structural specifications.",
     "funding_notes": "Dedicated AT/HM funding for larger projects.",
     "common_supplier_types": "Licensed HM builders"},
    {"slug": "ramp", "category": "ramp", "item_name": "Access Ramp",
     "description": "Permanent or portable ramp for wheelchair or mobility aid access.",
     "typical_price_range": {"low": {"amount": 500, "currency": "AUD"}, "high": {"amount": 6000, "currency": "AUD"}},
     "typical_ot_prescription_notes": "OT prescription for permanent ramps.",
     "funding_notes": "Standard SAH budget for small ramps; dedicated funding for permanent.",
     "common_supplier_types": "Aged-care builders"},
]


def init_athm1_routes(*, db, user_dep, core1_assert_access):
    global _db, _user_dep, _core1_assert_access
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access


def _flag_enabled() -> bool:
    return os.environ.get("ATHM1_ENABLED", "1") != "0"


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


async def ensure_athm1_indexes(db) -> None:
    try:
        await db.athm_projects.create_index([("participant_id", 1), ("status", 1)])
        await db.athm_items.create_index([("athm_project_id", 1)])
        await db.athm_modifications.create_index([("athm_project_id", 1)])
        await db.athm_catalog_entries.create_index([("slug", 1)], unique=True)
        for entry in CATALOG_SEED:
            doc = {**entry, "id": entry.get("id", str(uuid.uuid4())),
                   "last_verified_at": datetime.now(timezone.utc),
                   "data_residency": "ap-southeast-2"}
            await db.athm_catalog_entries.update_one({"slug": entry["slug"]}, {"$set": doc}, upsert=True)
    except Exception as e:  # pragma: no cover
        logger.warning("athm1 index/seed skipped: %s", e)


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectIn(BaseModel):
    project_type: str = Field(pattern="^(assistive_technology_only|home_modification_only|combined_at_and_hm)$")
    title: str
    description: str = ""
    primary_need_summary: str = ""


def _view_project(p: dict) -> Dict[str, Any]:
    p = {k: v for k, v in p.items() if k != "_id"}
    for k in ("created_at", "updated_at"):
        if p.get(k):
            p[k] = _iso(p[k])
    return p


@athm1_router.post("/participants/{pid}/projects")
async def create_project(pid: str, body: ProjectIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "initiated_by_user_id": user["id"] if isinstance(user, dict) else None,
        "project_type": body.project_type,
        "title": body.title,
        "description": body.description,
        "primary_need_summary": body.primary_need_summary,
        "ot_assessment_status": "not_yet_started",
        "prescribing_ot_details": None,
        "estimated_total_cost": None,
        "budget_source": "not_yet_determined",
        "expected_contribution": None,
        "status": "initiating",
        "status_history": [{"status": "initiating", "entered_at": _iso(now), "exited_at": None, "notes": None}],
        "target_completion_date": None,
        "actual_completion_date": None,
        "at_item_ids": [],
        "hm_modification_ids": [],
        "related_case_ids": [],
        "bc_2_budget_projection_id": None,
        "ce_3_contribution_projection_id": None,
        "cpr_2_care_plan_integration_id": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.athm_projects.insert_one(doc)
    return {"project": _view_project(doc)}


@athm1_router.get("/participants/{pid}/projects")
async def list_projects(pid: str, request: Request, status: Optional[str] = None):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if status:
        q["status"] = status
    cur = _db.athm_projects.find(q).sort("created_at", -1)
    items = await cur.to_list(length=100)
    return {"projects": [_view_project(p) for p in items]}


class StageAdvanceIn(BaseModel):
    to_status: str
    notes: Optional[str] = None


@athm1_router.post("/projects/{pid}/advance-status")
async def advance_status(pid: str, body: StageAdvanceIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.athm_projects.find_one({"id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()
    history = doc.get("status_history") or []
    if history and history[-1].get("exited_at") is None:
        history[-1]["exited_at"] = _iso(now)
    history.append({"status": body.to_status, "entered_at": _iso(now), "exited_at": None, "notes": body.notes})
    await _db.athm_projects.update_one({"id": pid}, {"$set": {"status": body.to_status, "status_history": history, "updated_at": now}})
    doc.update({"status": body.to_status, "status_history": history, "updated_at": now})
    return {"project": _view_project(doc)}


# ---------------------------------------------------------------------------
# OT referral documents (linked from Document Vault)
# ---------------------------------------------------------------------------


class OtReferralAttachIn(BaseModel):
    document_id: str
    notes: str = ""


@athm1_router.post("/projects/{pid}/ot-referrals/attach")
async def attach_ot_referral(pid: str, body: OtReferralAttachIn, request: Request):
    """Attach a pre-uploaded Document Vault file (with category=ot_referral)
    to an ATHM project. Client uploads via POST /api/documents with
    category='ot_referral' first, then calls this to link the doc to the
    project. Keeps a single source of truth for file storage.
    """
    await _assert_flag()
    user = await _user_dep(request)
    project = await _db.athm_projects.find_one({"id": pid})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, project["participant_id"])

    # Verify the document exists and belongs to the same household as the user.
    doc = await _db.documents.find_one({"id": body.document_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    user_hh = user.get("household_id") if isinstance(user, dict) else None
    if user_hh and doc.get("household_id") != user_hh:
        raise HTTPException(status_code=403, detail="Document is not in your household")

    now = _now()
    referral = {
        "document_id": doc["id"],
        "filename": doc.get("title") or doc.get("filename") or "OT referral",
        "file_mimetype": doc.get("file_mimetype"),
        "file_size_bytes": doc.get("file_size_bytes"),
        "notes": body.notes[:2000],
        "attached_at": _iso(now),
        "attached_by_user_id": user.get("id") if isinstance(user, dict) else None,
    }
    referrals = list(project.get("ot_referral_documents") or [])
    # Ignore double-attach of the same doc.
    if any(r.get("document_id") == doc["id"] for r in referrals):
        return {"referrals": referrals, "already_attached": True}
    referrals.append(referral)
    await _db.athm_projects.update_one(
        {"id": pid},
        {"$set": {"ot_referral_documents": referrals, "updated_at": now}},
    )
    return {"referrals": referrals, "attached": referral}


@athm1_router.get("/projects/{pid}/ot-referrals")
async def list_ot_referrals(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    project = await _db.athm_projects.find_one({"id": pid})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, project["participant_id"])
    return {"referrals": list(project.get("ot_referral_documents") or [])}


@athm1_router.delete("/projects/{pid}/ot-referrals/{document_id}")
async def detach_ot_referral(pid: str, document_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    project = await _db.athm_projects.find_one({"id": pid})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, project["participant_id"])
    referrals = [r for r in (project.get("ot_referral_documents") or []) if r.get("document_id") != document_id]
    await _db.athm_projects.update_one(
        {"id": pid},
        {"$set": {"ot_referral_documents": referrals, "updated_at": _now()}},
    )
    return {"referrals": referrals}


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


class ItemIn(BaseModel):
    item_category: str
    item_name: str
    item_description: str = ""
    catalog_reference_slug: Optional[str] = None


@athm1_router.post("/projects/{pid}/items")
async def add_item(pid: str, body: ItemIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    project = await _db.athm_projects.find_one({"id": pid})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, project["participant_id"])
    catalog_ref = None
    typical = None
    if body.catalog_reference_slug:
        entry = await _db.athm_catalog_entries.find_one({"slug": body.catalog_reference_slug})
        if entry:
            catalog_ref = entry["id"]
            typical = entry.get("typical_price_range")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "athm_project_id": pid,
        "participant_id": project["participant_id"],
        "item_category": body.item_category,
        "item_name": body.item_name,
        "item_description": body.item_description,
        "ot_prescription_notes": None,
        "catalog_reference_id": catalog_ref,
        "typical_price_range": typical,
        "quoted_prices": [],
        "selected_supplier": None,
        "final_price": None,
        "trial_available": False,
        "trial_period_days": None,
        "trial_start_date": None,
        "trial_end_date": None,
        "trial_outcome": None,
        "warranty_period_months": None,
        "warranty_expires_at": None,
        "delivery_date": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.athm_items.insert_one(doc)
    await _db.athm_projects.update_one({"id": pid}, {"$push": {"at_item_ids": doc["id"]}, "$set": {"updated_at": now}})
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    doc["updated_at"] = _iso(doc["updated_at"])
    return {"item": doc}


@athm1_router.get("/items/{item_id}")
async def get_item(item_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    item = await _db.athm_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, item["participant_id"])
    item.pop("_id", None)
    for k in ("created_at", "updated_at"):
        if item.get(k):
            item[k] = _iso(item[k])
    return {"item": item}


@athm1_router.get("/modifications/{mid}")
async def get_modification(mid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    mod = await _db.athm_modifications.find_one({"id": mid})
    if not mod:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, mod["participant_id"])
    mod.pop("_id", None)
    for k in ("created_at", "updated_at"):
        if mod.get(k):
            mod[k] = _iso(mod[k])
    return {"modification": mod}


class QuoteIn(BaseModel):
    supplier_name: str
    quote_amount: float
    quote_date: str
    quote_valid_until: Optional[str] = None


def _price_context(amount: float, typical: Optional[Dict[str, Any]]) -> str:
    if not typical:
        return "no_catalog_reference"
    low = (typical.get("low") or {}).get("amount") or 0
    high = (typical.get("high") or {}).get("amount") or 0
    if amount < low * 0.9:
        return "below_range"
    if amount > high * 1.2:
        return "well_above_range"
    if amount > high:
        return "above_range"
    return "within_range"


@athm1_router.post("/items/{item_id}/quotes")
async def add_quote(item_id: str, body: QuoteIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    item = await _db.athm_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, item["participant_id"])
    quote = {
        "supplier_name": body.supplier_name,
        "quote_amount": {"amount": body.quote_amount, "currency": "AUD"},
        "quote_date": body.quote_date,
        "quote_valid_until": body.quote_valid_until,
        "price_context": _price_context(body.quote_amount, item.get("typical_price_range")),
    }
    await _db.athm_items.update_one({"id": item_id}, {"$push": {"quoted_prices": quote}, "$set": {"updated_at": _now()}})
    return {"quote": quote}


class TrialStartIn(BaseModel):
    trial_start_date: str
    trial_period_days: int = Field(ge=1, le=90)


@athm1_router.post("/items/{item_id}/start-trial")
async def start_trial(item_id: str, body: TrialStartIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    item = await _db.athm_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, item["participant_id"])
    start_dt = datetime.fromisoformat(body.trial_start_date.replace("Z", "+00:00")) if "T" in body.trial_start_date else datetime.fromisoformat(body.trial_start_date + "T00:00:00+00:00")
    end_dt = start_dt + timedelta(days=body.trial_period_days)
    upd = {
        "trial_available": True,
        "trial_start_date": body.trial_start_date,
        "trial_period_days": body.trial_period_days,
        "trial_end_date": end_dt.date().isoformat(),
        "updated_at": _now(),
    }
    await _db.athm_items.update_one({"id": item_id}, {"$set": upd})
    # Schedule reminders 7 / 3 / 1 days before
    for days_before in (7, 3, 1):
        rem = {
            "id": str(uuid.uuid4()),
            "athm_item_id": item_id,
            "participant_id": item["participant_id"],
            "trial_end_date": end_dt.date().isoformat(),
            "days_before_end_reminder_scheduled": days_before,
            "surfaced_at": None,
            "user_response": None,
            "created_at": _now(),
            "data_residency": "ap-southeast-2",
        }
        await _db.trial_period_reminders.insert_one(rem)
    return {"trial_end_date": upd["trial_end_date"], "reminders_scheduled": [7, 3, 1]}


@athm1_router.get("/participants/{pid}/trial-reminders/due")
async def list_due_trial_reminders(pid: str, request: Request):
    """Return trial-period reminders that are due for the participant.
    A reminder is 'due' when today >= trial_end_date - days_before_end_reminder_scheduled.
    Callers should acknowledge each reminder via the ack endpoint.
    """
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    today = datetime.now(timezone.utc).date()
    reminders: list = []
    async for r in _db.trial_period_reminders.find({"participant_id": pid, "user_response": None}, {"_id": 0}):
        try:
            end = datetime.fromisoformat(r["trial_end_date"]).date()
        except Exception:
            continue
        surface_on = end - timedelta(days=int(r.get("days_before_end_reminder_scheduled") or 0))
        if today >= surface_on:
            r["surface_on"] = surface_on.isoformat()
            r["days_until_trial_end"] = (end - today).days
            reminders.append(r)
    return {"reminders": reminders}


class TrialReminderAckIn(BaseModel):
    user_response: str = Field(..., pattern="^(keep|return|extend_trial|acknowledged)$")
    note: str = Field("", max_length=1000)


@athm1_router.post("/trial-reminders/{reminder_id}/acknowledge")
async def acknowledge_trial_reminder(reminder_id: str, body: TrialReminderAckIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    reminder = await _db.trial_period_reminders.find_one({"id": reminder_id})
    if not reminder:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, reminder["participant_id"])
    await _db.trial_period_reminders.update_one(
        {"id": reminder_id},
        {"$set": {
            "user_response": body.user_response,
            "user_response_note": body.note.strip(),
            "surfaced_at": _now(),
        }},
    )
    return {"acknowledged": True}


# ---------------------------------------------------------------------------
# Modifications
# ---------------------------------------------------------------------------


class ModificationIn(BaseModel):
    modification_category: str
    modification_name: str
    location_in_home: str
    description: str = ""


@athm1_router.post("/projects/{pid}/modifications")
async def add_modification(pid: str, body: ModificationIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    project = await _db.athm_projects.find_one({"id": pid})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, project["participant_id"])
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "athm_project_id": pid,
        "participant_id": project["participant_id"],
        "modification_category": body.modification_category,
        "modification_name": body.modification_name,
        "location_in_home": body.location_in_home,
        "description": body.description,
        "ot_prescription_notes": None,
        "quotes": [],
        "cheapest_quote_amount": None,
        "most_expensive_quote_amount": None,
        "quote_variance_percentage": None,
        "selected_supplier": None,
        "selected_quote_amount": None,
        "work_start_date": None,
        "work_completion_date": None,
        "workmanship_warranty_months": None,
        "warranty_expires_at": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.athm_modifications.insert_one(doc)
    await _db.athm_projects.update_one({"id": pid}, {"$push": {"hm_modification_ids": doc["id"]}})
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    doc["updated_at"] = _iso(doc["updated_at"])
    return {"modification": doc}


class HmQuoteIn(BaseModel):
    supplier_name: str
    quote_amount: float
    quote_date: str
    quote_details_summary: str = ""


@athm1_router.post("/modifications/{mid}/quotes")
async def add_mod_quote(mid: str, body: HmQuoteIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    mod = await _db.athm_modifications.find_one({"id": mid})
    if not mod:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, mod["participant_id"])
    quotes = mod.get("quotes") or []
    quotes.append({
        "supplier_name": body.supplier_name,
        "quote_amount": {"amount": body.quote_amount, "currency": "AUD"},
        "quote_date": body.quote_date,
        "quote_details_summary": body.quote_details_summary,
    })
    amounts = [q["quote_amount"]["amount"] for q in quotes]
    cheapest = min(amounts) if amounts else None
    dearest = max(amounts) if amounts else None
    variance_pct = round(((dearest - cheapest) / cheapest) * 100, 1) if cheapest else None
    await _db.athm_modifications.update_one(
        {"id": mid},
        {"$set": {
            "quotes": quotes,
            "cheapest_quote_amount": {"amount": cheapest, "currency": "AUD"} if cheapest else None,
            "most_expensive_quote_amount": {"amount": dearest, "currency": "AUD"} if dearest else None,
            "quote_variance_percentage": variance_pct,
            "updated_at": _now(),
        }})
    return {"quotes_count": len(quotes), "cheapest": cheapest, "most_expensive": dearest,
            "variance_percentage": variance_pct, "high_variance_flag": bool(variance_pct and variance_pct > 30)}


@athm1_router.get("/modifications/{mid}/quote-comparison")
async def quote_comparison(mid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    mod = await _db.athm_modifications.find_one({"id": mid})
    if not mod:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, mod["participant_id"])
    return {
        "quotes": mod.get("quotes") or [],
        "cheapest_quote_amount": mod.get("cheapest_quote_amount"),
        "most_expensive_quote_amount": mod.get("most_expensive_quote_amount"),
        "quote_variance_percentage": mod.get("quote_variance_percentage"),
        "high_variance_flag": bool((mod.get("quote_variance_percentage") or 0) > 30),
    }


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


@athm1_router.get("/catalog")
async def list_catalog(category: Optional[str] = None, search: Optional[str] = None):
    await _assert_flag()
    q: Dict[str, Any] = {}
    if category:
        q["category"] = category
    if search:
        q["item_name"] = {"$regex": search, "$options": "i"}
    cur = _db.athm_catalog_entries.find(q)
    items = await cur.to_list(length=200)
    for it in items:
        it.pop("_id", None)
        if it.get("last_verified_at"):
            it["last_verified_at"] = _iso(it["last_verified_at"])
    return {"catalog": items}
