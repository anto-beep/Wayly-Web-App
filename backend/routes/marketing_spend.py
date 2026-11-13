"""Phase 5A — Marketing Spend & Investment Register.

An admin-only register for ALL marketing/advertising investment, including
manually-purchased media that no advertising API exposes. Feeds the Founder
Command Centre and (later) the Phase 4 Growth Engine.

Access: super_admin + operations_admin only (financial data).
Currency: AUD only (per founder decision) — no FX. GST is explicit.
Money is never deleted: records are voided/cancelled with an audit trail.

Collections:
  marketing_expense_categories  configurable categories (5 groups + custom)
  marketing_campaigns           campaign grouping + recorded outcomes
  marketing_expenses            the expense ledger (source-tracked)
  marketing_expense_audit       append-only who/what/when/approval trail
  marketing_counters            atomic MKT-#### reference sequence

Mounted at /api/admin/marketing/*.
"""
from __future__ import annotations

import os
import csv
import io
import base64
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from bos_core import to_decimal128, to_aud, expense_financials, dsum, D, compute_gst
try:
    from bson.decimal128 import Decimal128
except Exception:  # pragma: no cover
    Decimal128 = None  # type: ignore

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

CURRENCY = "AUD"

# Five founder-defined groups (+ "other" fallback).
GROUPS: Dict[str, str] = {
    "paid_media": "Paid media investment",
    "creative_production": "Creative and production",
    "agency_service": "Agency and service costs",
    "marketing_technology": "Marketing technology",
    "events_sponsorships": "Events, sponsorships and partnerships",
    "other": "Other",
}

# (name, group) — seeded once, idempotently, by slug.
DEFAULT_CATEGORIES: List[tuple] = [
    ("Google Ads", "paid_media"),
    ("Meta Ads", "paid_media"),
    ("Microsoft Advertising", "paid_media"),
    ("LinkedIn Ads", "paid_media"),
    ("Other digital advertising", "paid_media"),
    ("EDM campaigns", "paid_media"),
    ("Solus email campaigns", "paid_media"),
    ("Paid newsletter placements", "paid_media"),
    ("Advertorials", "paid_media"),
    ("Sponsored articles", "paid_media"),
    ("Media placements", "paid_media"),
    ("Content production", "creative_production"),
    ("Creative and design", "creative_production"),
    ("SEO services", "agency_service"),
    ("Marketing agencies", "agency_service"),
    ("Marketing software", "marketing_technology"),
    ("Events and exhibitions", "events_sponsorships"),
    ("Sponsorships", "events_sponsorships"),
    ("Influencer and creator campaigns", "events_sponsorships"),
    ("Other marketing expenses", "other"),
]

LIFECYCLE_STATUS = ("planned", "approved", "booked", "invoiced", "cancelled")
PAYMENT_STATUS = ("unpaid", "partially_paid", "paid", "refunded")
GST_TREATMENT = ("gst_inclusive", "gst_exclusive", "gst_free", "no_gst_overseas")
DATA_SOURCE = ("manual", "csv_import", "api_integration", "other")

MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
ALLOWED_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"}

OUTCOME_METRICS = (
    "impressions", "clicks", "visits", "enquiries",
    "registrations", "trial_customers", "paid_subscribers", "revenue_aud",
)

# Phase 5A.1 — outcome source classification (publisher-reported vs verified).
OUTCOME_SOURCE_CLASS = (
    "publisher_reported", "admin_recorded", "first_party", "ga4", "verified_api",
)

# New monetary fields (persisted as Decimal128; legacy cost_* stay as-is).
NEW_MONEY_FIELDS = {
    "planned_amount_aud", "committed_amount_aud", "incurred_amount_aud",
    "amount_paid_aud", "credit_amount_aud",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in (name or "").strip())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "category"


def _strip(d: Optional[dict]) -> Optional[dict]:
    if d:
        d.pop("_id", None)
    return d


async def _next_reference() -> str:
    doc = await db.marketing_counters.find_one_and_update(
        {"_id": "expense_ref"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    seq = (doc or {}).get("seq") or 1
    return f"MKT-{seq:04d}"


async def ensure_indexes() -> None:
    try:
        await db.marketing_expense_categories.create_index("slug", unique=True)
        await db.marketing_campaigns.create_index("status")
        await db.marketing_campaigns.create_index("created_at")
        await db.marketing_expenses.create_index("expense_id", unique=True)
        await db.marketing_expenses.create_index("campaign_id")
        await db.marketing_expenses.create_index("category_slug")
        await db.marketing_expenses.create_index("channel")
        await db.marketing_expenses.create_index("vendor")
        await db.marketing_expenses.create_index("status")
        await db.marketing_expenses.create_index("payment_status")
        await db.marketing_expenses.create_index("data_source")
        await db.marketing_expenses.create_index("source_id", sparse=True)
        await db.marketing_expenses.create_index("expense_reporting_date")
        await db.marketing_expenses.create_index("booking_date")
        await db.marketing_expense_audit.create_index([("expense_id", 1), ("ts", 1)])
    except Exception as exc:  # pragma: no cover
        logger.warning("marketing_* index create skipped: %s", exc)


async def seed_categories() -> None:
    """Idempotent: insert any missing default categories. Never overwrites
    an existing one (so renames / deactivations survive)."""
    for name, group in DEFAULT_CATEGORIES:
        slug = _slugify(name)
        existing = await db.marketing_expense_categories.find_one({"slug": slug}, {"_id": 1})
        if existing:
            continue
        await db.marketing_expense_categories.insert_one({
            "id": uuid.uuid4().hex,
            "slug": slug,
            "name": name,
            "group": group,
            "is_custom": False,
            "active": True,
            "created_at": _now(),
            "created_by": "system_seed",
        })


async def _audit(expense_id: str, actor: dict, action: str,
                 changes: Optional[dict] = None, note: Optional[str] = None) -> None:
    await db.marketing_expense_audit.insert_one({
        "id": uuid.uuid4().hex,
        "expense_id": expense_id,
        "actor_id": actor.get("id"),
        "actor_email": actor.get("email"),
        "action": action,
        "changes": changes or {},
        "note": note,
        "ts": _now(),
    })


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------
class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    group: str = "other"


class CategoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    active: Optional[bool] = None
    group: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    planned_budget_aud: Optional[float] = Field(default=None, ge=0)
    owner: Optional[str] = Field(default=None, max_length=120)


class CampaignPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    planned_budget_aud: Optional[float] = Field(default=None, ge=0)
    owner: Optional[str] = Field(default=None, max_length=120)
    status: Optional[Literal["active", "completed", "archived"]] = None


class OutcomeBody(BaseModel):
    metric: Literal[OUTCOME_METRICS] = "visits"  # type: ignore
    value: float = Field(ge=0)
    source: str = Field(min_length=2, max_length=120)
    source_class: Literal[OUTCOME_SOURCE_CLASS] = "admin_recorded"  # type: ignore
    as_of_date: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)


class ExpenseCreate(BaseModel):
    activity_name: str = Field(min_length=2, max_length=200)
    channel: str = Field(min_length=1, max_length=80)
    category_slug: str = Field(min_length=1, max_length=80)
    vendor: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=4000)
    internal_notes: Optional[str] = Field(default=None, max_length=4000)
    owner: Optional[str] = Field(default=None, max_length=120)
    campaign_id: Optional[str] = None
    # Financial (AUD)
    cost_ex_gst: Optional[float] = Field(default=None, ge=0)
    gst_amount: Optional[float] = Field(default=None, ge=0)
    cost_inc_gst: float = Field(ge=0)
    gst_treatment: Literal[GST_TREATMENT] = "gst_inclusive"  # type: ignore
    planned_budget_aud: Optional[float] = Field(default=None, ge=0)
    refund_amount_aud: Optional[float] = Field(default=None, ge=0)
    invoice_reference: Optional[str] = Field(default=None, max_length=120)
    # Dates
    booking_date: Optional[str] = None
    service_start_date: Optional[str] = None
    service_end_date: Optional[str] = None
    invoice_date: Optional[str] = None
    payment_date: Optional[str] = None
    expense_reporting_date: Optional[str] = None
    # Status
    status: Literal[LIFECYCLE_STATUS] = "planned"  # type: ignore
    payment_status: Literal[PAYMENT_STATUS] = "unpaid"  # type: ignore
    # Evidence links
    publisher_url: Optional[str] = Field(default=None, max_length=500)
    published_url: Optional[str] = Field(default=None, max_length=500)
    placement_confirmation: Optional[str] = Field(default=None, max_length=500)
    # Source / reconciliation
    data_source: Literal[DATA_SOURCE] = "manual"  # type: ignore
    source_system: Optional[str] = Field(default=None, max_length=80)
    source_id: Optional[str] = Field(default=None, max_length=160)
    # Phase 5A.1 — distinct financial lenses (AUD; optional, never assumed)
    planned_amount_aud: Optional[float] = Field(default=None, ge=0)
    committed_amount_aud: Optional[float] = Field(default=None, ge=0)
    incurred_amount_aud: Optional[float] = Field(default=None, ge=0)
    amount_paid_aud: Optional[float] = Field(default=None, ge=0)
    credit_amount_aud: Optional[float] = Field(default=None, ge=0)
    # Phase 5A.1 — publisher / media placement (EDM, Solus, newsletter, advertorial)
    publisher_name: Optional[str] = Field(default=None, max_length=160)
    publication_name: Optional[str] = Field(default=None, max_length=160)
    placement_format: Optional[str] = Field(default=None, max_length=120)
    placement_objective: Optional[str] = Field(default=None, max_length=200)
    audience_description: Optional[str] = Field(default=None, max_length=500)
    quoted_audience_size: Optional[int] = Field(default=None, ge=0)
    booked_distribution_date: Optional[str] = None
    actual_distribution_date: Optional[str] = None
    tracking_link: Optional[str] = Field(default=None, max_length=500)
    utm_source: Optional[str] = Field(default=None, max_length=120)
    utm_medium: Optional[str] = Field(default=None, max_length=120)
    utm_campaign: Optional[str] = Field(default=None, max_length=120)
    performance_report_url: Optional[str] = Field(default=None, max_length=500)
    performance_notes: Optional[str] = Field(default=None, max_length=2000)


class ExpensePatch(BaseModel):
    activity_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    channel: Optional[str] = Field(default=None, min_length=1, max_length=80)
    category_slug: Optional[str] = None
    vendor: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=4000)
    internal_notes: Optional[str] = Field(default=None, max_length=4000)
    owner: Optional[str] = Field(default=None, max_length=120)
    campaign_id: Optional[str] = None
    cost_ex_gst: Optional[float] = Field(default=None, ge=0)
    gst_amount: Optional[float] = Field(default=None, ge=0)
    cost_inc_gst: Optional[float] = Field(default=None, ge=0)
    gst_treatment: Optional[Literal[GST_TREATMENT]] = None  # type: ignore
    planned_budget_aud: Optional[float] = Field(default=None, ge=0)
    refund_amount_aud: Optional[float] = Field(default=None, ge=0)
    invoice_reference: Optional[str] = Field(default=None, max_length=120)
    booking_date: Optional[str] = None
    service_start_date: Optional[str] = None
    service_end_date: Optional[str] = None
    invoice_date: Optional[str] = None
    payment_date: Optional[str] = None
    expense_reporting_date: Optional[str] = None
    status: Optional[Literal[LIFECYCLE_STATUS]] = None  # type: ignore
    payment_status: Optional[Literal[PAYMENT_STATUS]] = None  # type: ignore
    publisher_url: Optional[str] = Field(default=None, max_length=500)
    published_url: Optional[str] = Field(default=None, max_length=500)
    placement_confirmation: Optional[str] = Field(default=None, max_length=500)
    planned_amount_aud: Optional[float] = Field(default=None, ge=0)
    committed_amount_aud: Optional[float] = Field(default=None, ge=0)
    incurred_amount_aud: Optional[float] = Field(default=None, ge=0)
    amount_paid_aud: Optional[float] = Field(default=None, ge=0)
    credit_amount_aud: Optional[float] = Field(default=None, ge=0)
    publisher_name: Optional[str] = Field(default=None, max_length=160)
    publication_name: Optional[str] = Field(default=None, max_length=160)
    placement_format: Optional[str] = Field(default=None, max_length=120)
    placement_objective: Optional[str] = Field(default=None, max_length=200)
    audience_description: Optional[str] = Field(default=None, max_length=500)
    quoted_audience_size: Optional[int] = Field(default=None, ge=0)
    booked_distribution_date: Optional[str] = None
    actual_distribution_date: Optional[str] = None
    tracking_link: Optional[str] = Field(default=None, max_length=500)
    utm_source: Optional[str] = Field(default=None, max_length=120)
    utm_medium: Optional[str] = Field(default=None, max_length=120)
    utm_campaign: Optional[str] = Field(default=None, max_length=120)
    performance_report_url: Optional[str] = Field(default=None, max_length=500)
    performance_notes: Optional[str] = Field(default=None, max_length=2000)


class VoidBody(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class BudgetBody(BaseModel):
    approved_budget_aud: Optional[float] = Field(default=None, ge=0)
    planned_budget_aud: Optional[float] = Field(default=None, ge=0)


def _d128_to_float(v):
    if Decimal128 is not None and isinstance(v, Decimal128):
        return to_aud(v)
    return v


def _expense_public(e: dict) -> dict:
    out = {k: _d128_to_float(v) for k, v in e.items() if k not in ("_id", "attachments")}
    atts = e.get("attachments") or []
    out["attachments"] = [{
        "id": a.get("id"), "filename": a.get("filename"),
        "mime_type": a.get("mime_type"), "size_bytes": a.get("size_bytes"),
        "uploaded_at": a.get("uploaded_at"),
    } for a in atts]
    # Phase 5A.1 — distinct planned/committed/incurred/paid lenses (honest basis).
    out["financials"] = expense_financials(e)
    return out


def _campaign_public(c: dict) -> dict:
    """Serialise a campaign doc — converts Decimal128 (e.g. approved_budget_aud)."""
    return {k: _d128_to_float(v) for k, v in c.items() if k != "_id"}


# ===========================================================================
# Router
# ===========================================================================
def build_marketing_spend_router():
    from admin_auth import require_super_or_ops, get_current_admin  # noqa: WPS433
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
            loop.create_task(seed_categories())
    except Exception as exc:  # pragma: no cover
        logger.warning("marketing_spend init skipped: %s", exc)

    r = APIRouter(prefix="/admin/marketing", tags=["marketing-spend"])

    # ------------------------------------------------------------- CATEGORIES
    @r.get("/categories")
    async def list_categories(include_inactive: bool = False,
                              admin: dict = Depends(require_super_or_ops)):
        q = {} if include_inactive else {"active": True}
        rows = []
        async for c in db.marketing_expense_categories.find(q, {"_id": 0}).sort("name", 1):
            rows.append(c)
        return {"categories": rows, "groups": GROUPS}

    @r.post("/categories")
    async def create_category(body: CategoryCreate, admin: dict = Depends(require_super_or_ops)):
        if body.group not in GROUPS:
            raise HTTPException(400, f"group must be one of {list(GROUPS)}")
        slug = _slugify(body.name)
        if await db.marketing_expense_categories.find_one({"slug": slug}, {"_id": 1}):
            raise HTTPException(409, "A category with this name already exists")
        doc = {
            "id": uuid.uuid4().hex, "slug": slug, "name": body.name.strip(),
            "group": body.group, "is_custom": True, "active": True,
            "created_at": _now(), "created_by": admin.get("id"),
        }
        await db.marketing_expense_categories.insert_one(doc)
        return {"ok": True, "category": _strip(doc)}

    @r.patch("/categories/{cat_id}")
    async def patch_category(cat_id: str, body: CategoryPatch,
                             admin: dict = Depends(require_super_or_ops)):
        update: dict = {}
        if body.name is not None:
            update["name"] = body.name.strip()
        if body.active is not None:
            update["active"] = body.active
        if body.group is not None:
            if body.group not in GROUPS:
                raise HTTPException(400, f"group must be one of {list(GROUPS)}")
            update["group"] = body.group
        if not update:
            return {"ok": True, "unchanged": True}
        res = await db.marketing_expense_categories.update_one({"id": cat_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Category not found")
        return {"ok": True, "updated": update}

    # -------------------------------------------------------------- CAMPAIGNS
    @r.get("/campaigns")
    async def list_campaigns(admin: dict = Depends(require_super_or_ops)):
        rows = []
        async for c in db.marketing_campaigns.find({}, {"_id": 0}).sort("created_at", -1):
            agg = await _campaign_totals(c["id"])
            rows.append({**_campaign_public(c), **agg})
        return {"campaigns": rows}

    @r.post("/campaigns")
    async def create_campaign(body: CampaignCreate, admin: dict = Depends(require_super_or_ops)):
        doc = {
            "id": uuid.uuid4().hex,
            "name": body.name.strip(),
            "description": body.description,
            "start_date": body.start_date,
            "end_date": body.end_date,
            "planned_budget_aud": body.planned_budget_aud,
            "owner": body.owner,
            "status": "active",
            "outcomes": [],
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": admin.get("id"),
        }
        await db.marketing_campaigns.insert_one(doc)
        return {"ok": True, "campaign": _strip(doc)}

    @r.get("/campaigns/{campaign_id}")
    async def get_campaign(campaign_id: str, admin: dict = Depends(require_super_or_ops)):
        c = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        expenses = []
        async for e in db.marketing_expenses.find(
            {"campaign_id": campaign_id}, {"_id": 0}
        ).sort("created_at", -1):
            expenses.append(_expense_public(e))
        totals = await _campaign_totals(campaign_id)
        return {"campaign": _campaign_public(c), "expenses": expenses, **totals}

    @r.patch("/campaigns/{campaign_id}")
    async def patch_campaign(campaign_id: str, body: CampaignPatch,
                             admin: dict = Depends(require_super_or_ops)):
        update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if not update:
            return {"ok": True, "unchanged": True}
        update["updated_at"] = _now()
        res = await db.marketing_campaigns.update_one({"id": campaign_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Campaign not found")
        return {"ok": True, "updated": update}

    @r.post("/campaigns/{campaign_id}/outcomes")
    async def add_outcome(campaign_id: str, body: OutcomeBody,
                          admin: dict = Depends(require_super_or_ops)):
        c = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 1})
        if not c:
            raise HTTPException(404, "Campaign not found")
        outcome = {
            "id": uuid.uuid4().hex, "metric": body.metric, "value": body.value,
            "source": body.source.strip(), "source_class": body.source_class,
            "as_of_date": body.as_of_date or _now()[:10],
            "note": body.note, "recorded_at": _now(), "recorded_by": admin.get("id"),
        }
        await db.marketing_campaigns.update_one(
            {"id": campaign_id},
            {"$push": {"outcomes": outcome}, "$set": {"updated_at": _now()}},
        )
        return {"ok": True, "outcome": outcome}

    # --------------------------------------------------------------- EXPENSES
    @r.get("/expenses")
    async def list_expenses(
        campaign_id: Optional[str] = Query(None),
        channel: Optional[str] = Query(None),
        category_slug: Optional[str] = Query(None),
        vendor: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        payment_status: Optional[str] = Query(None),
        data_source: Optional[str] = Query(None),
        date_from: Optional[str] = Query(None),
        date_to: Optional[str] = Query(None),
        q: Optional[str] = Query(None, max_length=200),
        include_voided: bool = Query(False),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        admin: dict = Depends(require_super_or_ops),
    ):
        query: Dict[str, Any] = {}
        if not include_voided:
            query["voided"] = {"$ne": True}
        if campaign_id:
            query["campaign_id"] = campaign_id
        if channel:
            query["channel"] = channel
        if category_slug:
            query["category_slug"] = category_slug
        if vendor:
            query["vendor"] = vendor
        if status:
            query["status"] = status
        if payment_status:
            query["payment_status"] = payment_status
        if data_source:
            query["data_source"] = data_source
        if date_from or date_to:
            rng: Dict[str, Any] = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to
            query["expense_reporting_date"] = rng
        if q:
            import re as _re
            pat = {"$regex": _re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"activity_name": pat}, {"vendor": pat},
                            {"expense_id": pat}, {"invoice_reference": pat}]
        total = await db.marketing_expenses.count_documents(query)
        rows = []
        cursor = (db.marketing_expenses.find(query, {"_id": 0})
                  .sort("created_at", -1).skip((page - 1) * page_size).limit(page_size))
        async for e in cursor:
            rows.append(_expense_public(e))
        return {"expenses": rows, "total": total, "page": page, "page_size": page_size}

    @r.post("/expenses")
    async def create_expense(body: ExpenseCreate, admin: dict = Depends(require_super_or_ops)):
        cat = await db.marketing_expense_categories.find_one(
            {"slug": body.category_slug}, {"_id": 0, "name": 1, "group": 1, "slug": 1})
        if not cat:
            raise HTTPException(400, "Unknown category_slug")
        if body.campaign_id:
            if not await db.marketing_campaigns.find_one({"id": body.campaign_id}, {"_id": 1}):
                raise HTTPException(400, "Unknown campaign_id")

        # Duplicate guard for imported records: a source_id must be unique so a
        # manually-entered expense is never double-counted by a later import.
        dup_warning = None
        if body.source_id:
            existing = await db.marketing_expenses.find_one(
                {"source_id": body.source_id, "data_source": body.data_source},
                {"_id": 0, "expense_id": 1})
            if existing:
                raise HTTPException(409, f"An expense with this source_id already exists ({existing['expense_id']})")
        # Soft duplicate heuristic (same vendor + amount + reporting date).
        if body.vendor and body.expense_reporting_date:
            soft = await db.marketing_expenses.find_one({
                "vendor": body.vendor, "cost_inc_gst": body.cost_inc_gst,
                "expense_reporting_date": body.expense_reporting_date,
                "voided": {"$ne": True},
            }, {"_id": 0, "expense_id": 1})
            if soft:
                dup_warning = f"Possible duplicate of {soft['expense_id']} (same vendor, amount and date)."

        expense_id = await _next_reference()
        doc = {
            "id": uuid.uuid4().hex,
            "expense_id": expense_id,
            "activity_name": body.activity_name.strip(),
            "channel": body.channel.strip(),
            "category_slug": body.category_slug,
            "category_name": cat["name"],
            "category_group": cat["group"],
            "vendor": (body.vendor or "").strip() or None,
            "description": body.description,
            "internal_notes": body.internal_notes,
            "owner": body.owner,
            "campaign_id": body.campaign_id,
            "currency": CURRENCY,
            "cost_ex_gst": body.cost_ex_gst,
            "gst_amount": body.gst_amount,
            "cost_inc_gst": body.cost_inc_gst,
            "gst_treatment": body.gst_treatment,
            "planned_budget_aud": body.planned_budget_aud,
            "refund_amount_aud": body.refund_amount_aud,
            "invoice_reference": body.invoice_reference,
            "booking_date": body.booking_date,
            "service_start_date": body.service_start_date,
            "service_end_date": body.service_end_date,
            "invoice_date": body.invoice_date,
            "payment_date": body.payment_date,
            "expense_reporting_date": body.expense_reporting_date or (body.booking_date or _now()[:10]),
            "status": body.status,
            "payment_status": body.payment_status,
            "publisher_url": body.publisher_url,
            "published_url": body.published_url,
            "placement_confirmation": body.placement_confirmation,
            "data_source": body.data_source,
            "source_system": body.source_system,
            "source_id": body.source_id,
            # Phase 5A.1 — distinct financial lenses (Decimal128; None = not supplied)
            "planned_amount_aud": to_decimal128(body.planned_amount_aud),
            "committed_amount_aud": to_decimal128(body.committed_amount_aud),
            "incurred_amount_aud": to_decimal128(body.incurred_amount_aud),
            "amount_paid_aud": to_decimal128(body.amount_paid_aud),
            "credit_amount_aud": to_decimal128(body.credit_amount_aud),
            # Phase 5A.1 — publisher / media placement
            "publisher_name": (body.publisher_name or "").strip() or None,
            "publication_name": (body.publication_name or "").strip() or None,
            "placement_format": body.placement_format,
            "placement_objective": body.placement_objective,
            "audience_description": body.audience_description,
            "quoted_audience_size": body.quoted_audience_size,
            "booked_distribution_date": body.booked_distribution_date,
            "actual_distribution_date": body.actual_distribution_date,
            "tracking_link": body.tracking_link,
            "utm_source": body.utm_source,
            "utm_medium": body.utm_medium,
            "utm_campaign": body.utm_campaign,
            "performance_report_url": body.performance_report_url,
            "performance_notes": body.performance_notes,
            "voided": False,
            "approved_by": None,
            "approved_at": None,
            "attachments": [],
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": admin.get("id"),
            "created_by_email": admin.get("email"),
        }
        await db.marketing_expenses.insert_one(doc)
        await _audit(doc["id"], admin, "created", note=f"{expense_id} {body.activity_name}")
        return {"ok": True, "expense": _expense_public(doc), "duplicate_warning": dup_warning}

    @r.get("/expenses/duplicates")
    async def find_duplicates(admin: dict = Depends(require_super_or_ops)):
        """Group non-voided expenses by (vendor, amount, reporting date) and
        return any group with more than one record for human review."""
        groups: Dict[str, List[dict]] = {}
        async for e in db.marketing_expenses.find(
            {"voided": {"$ne": True}},
            {"_id": 0, "expense_id": 1, "vendor": 1, "cost_inc_gst": 1,
             "expense_reporting_date": 1, "activity_name": 1, "data_source": 1},
        ):
            key = f"{(e.get('vendor') or '').lower()}|{e.get('cost_inc_gst')}|{e.get('expense_reporting_date')}"
            groups.setdefault(key, []).append(e)
        dups = [v for v in groups.values() if len(v) > 1]
        return {"duplicate_groups": dups, "count": len(dups)}

    @r.get("/expenses/export.csv")
    async def export_csv(
        campaign_id: Optional[str] = Query(None),
        channel: Optional[str] = Query(None),
        category_slug: Optional[str] = Query(None),
        vendor: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        payment_status: Optional[str] = Query(None),
        data_source: Optional[str] = Query(None),
        date_from: Optional[str] = Query(None),
        date_to: Optional[str] = Query(None),
        admin: dict = Depends(require_super_or_ops),
    ):
        query: Dict[str, Any] = {"voided": {"$ne": True}}
        for k, v in (("campaign_id", campaign_id), ("channel", channel),
                     ("category_slug", category_slug), ("vendor", vendor),
                     ("status", status), ("payment_status", payment_status),
                     ("data_source", data_source)):
            if v:
                query[k] = v
        if date_from or date_to:
            rng: Dict[str, Any] = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to
            query["expense_reporting_date"] = rng
        buf = io.StringIO()
        w = csv.writer(buf)

        def _safe(cell):
            if cell is None:
                return ""
            s = str(cell)
            return ("'" + s) if s and s[0] in ("=", "+", "-", "@", "\t", "\r") else s

        w.writerow([
            "expense_id", "activity_name", "channel", "category", "group", "vendor",
            "currency", "cost_ex_gst", "gst_amount", "cost_inc_gst", "gst_treatment",
            "planned_budget_aud", "refund_amount_aud", "status", "payment_status",
            "data_source", "campaign_id", "booking_date", "service_start_date",
            "service_end_date", "invoice_date", "payment_date", "expense_reporting_date",
            "invoice_reference",
            "planned_amount_aud", "committed_amount_aud", "incurred_amount_aud",
            "amount_paid_aud", "credit_amount_aud",
            "publisher_name", "publication_name", "placement_format",
            "booked_distribution_date", "actual_distribution_date",
            "tracking_link", "utm_source", "utm_medium", "utm_campaign",
        ])
        async for e in db.marketing_expenses.find(query, {"_id": 0}).sort("expense_reporting_date", -1):
            w.writerow([_safe(e.get(k)) for k in (
                "expense_id", "activity_name", "channel", "category_name", "category_group", "vendor",
                "currency", "cost_ex_gst", "gst_amount", "cost_inc_gst", "gst_treatment",
                "planned_budget_aud", "refund_amount_aud", "status", "payment_status",
                "data_source", "campaign_id", "booking_date", "service_start_date",
                "service_end_date", "invoice_date", "payment_date", "expense_reporting_date",
                "invoice_reference",
                "planned_amount_aud", "committed_amount_aud", "incurred_amount_aud",
                "amount_paid_aud", "credit_amount_aud",
                "publisher_name", "publication_name", "placement_format",
                "booked_distribution_date", "actual_distribution_date",
                "tracking_link", "utm_source", "utm_medium", "utm_campaign",
            )])
        return Response(content=buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=marketing_expenses.csv"})

    @r.get("/expenses/{expense_id}")
    async def get_expense(expense_id: str, admin: dict = Depends(require_super_or_ops)):
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Expense not found")
        audit = []
        async for a in db.marketing_expense_audit.find(
            {"expense_id": expense_id}, {"_id": 0}).sort("ts", 1):
            audit.append(a)
        return {"expense": _expense_public(e), "audit": audit}

    @r.patch("/expenses/{expense_id}")
    async def patch_expense(expense_id: str, body: ExpensePatch,
                            admin: dict = Depends(require_super_or_ops)):
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Expense not found")
        if e.get("voided"):
            raise HTTPException(409, "This expense is voided and cannot be edited. Create a correction instead.")
        update: Dict[str, Any] = {}
        changes: Dict[str, Any] = {}
        payload = body.model_dump(exclude_unset=True)
        if "category_slug" in payload and payload["category_slug"]:
            cat = await db.marketing_expense_categories.find_one(
                {"slug": payload["category_slug"]}, {"_id": 0, "name": 1, "group": 1})
            if not cat:
                raise HTTPException(400, "Unknown category_slug")
            update["category_name"] = cat["name"]
            update["category_group"] = cat["group"]
        for k, v in payload.items():
            if v is not None and v != e.get(k):
                changes[k] = {"from": e.get(k), "to": v}
                update[k] = v
        for mk in NEW_MONEY_FIELDS:
            if mk in update:
                update[mk] = to_decimal128(update[mk])
        if not update:
            return {"ok": True, "unchanged": True}
        update["updated_at"] = _now()
        await db.marketing_expenses.update_one({"id": expense_id}, {"$set": update})
        await _audit(expense_id, admin, "updated", changes=changes)
        return {"ok": True, "updated": list(update.keys())}

    @r.post("/expenses/{expense_id}/approve")
    async def approve_expense(expense_id: str, admin: dict = Depends(require_super_or_ops)):
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0, "status": 1})
        if not e:
            raise HTTPException(404, "Expense not found")
        await db.marketing_expenses.update_one(
            {"id": expense_id},
            {"$set": {"status": "approved" if e.get("status") == "planned" else e.get("status"),
                      "approved_by": admin.get("id"), "approved_at": _now(), "updated_at": _now()}},
        )
        await _audit(expense_id, admin, "approved")
        return {"ok": True}

    @r.post("/expenses/{expense_id}/void")
    async def void_expense(expense_id: str, body: VoidBody,
                           admin: dict = Depends(require_super_or_ops)):
        """Soft-cancel. Financial history is never hard-deleted."""
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0, "voided": 1})
        if not e:
            raise HTTPException(404, "Expense not found")
        if e.get("voided"):
            return {"ok": True, "already_voided": True}
        await db.marketing_expenses.update_one(
            {"id": expense_id},
            {"$set": {"voided": True, "status": "cancelled", "voided_at": _now(),
                      "voided_by": admin.get("id"), "void_reason": body.reason, "updated_at": _now()}},
        )
        await _audit(expense_id, admin, "voided", note=body.reason)
        return {"ok": True}

    # ------------------------------------------------------------ ATTACHMENTS
    @r.post("/expenses/{expense_id}/attachments")
    async def upload_attachment(expense_id: str, file: UploadFile = File(...),
                                admin: dict = Depends(require_super_or_ops)):
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0, "id": 1})
        if not e:
            raise HTTPException(404, "Expense not found")
        filename_raw = (file.filename or "receipt").strip()
        ext = filename_raw.rsplit(".", 1)[-1].lower() if "." in filename_raw else ""
        mime = (file.content_type or "").lower()
        if ext not in ALLOWED_EXTS and mime not in ALLOWED_MIMES:
            raise HTTPException(415, "Only PNG, JPEG, WebP and PDF files are supported.")
        raw = await file.read()
        if not raw:
            raise HTTPException(400, "The file is empty.")
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(413, f"File too large. Max {MAX_FILE_BYTES // (1024*1024)} MB.")
        safe_stem = "".join(c for c in filename_raw.rsplit(".", 1)[0]
                            if c.isalnum() or c in ("-", "_", " ", "."))[:80] or "receipt"
        att = {
            "id": uuid.uuid4().hex,
            "filename": f"{safe_stem}.{ext}" if ext else safe_stem,
            "mime_type": mime or ("application/pdf" if ext == "pdf" else "application/octet-stream"),
            "size_bytes": len(raw),
            "uploaded_at": _now(),
            "uploaded_by": admin.get("id"),
            "file_b64": base64.b64encode(raw).decode("ascii"),
        }
        await db.marketing_expenses.update_one(
            {"id": expense_id},
            {"$push": {"attachments": att}, "$set": {"updated_at": _now()}})
        await _audit(expense_id, admin, "attachment_added",
                     note=f"{att['filename']} ({att['size_bytes']} bytes)")
        return {"ok": True, "attachment": {k: att[k] for k in
                ("id", "filename", "mime_type", "size_bytes", "uploaded_at")}}

    @r.get("/expenses/{expense_id}/attachments/{att_id}/download")
    async def download_attachment(expense_id: str, att_id: str,
                                  admin: dict = Depends(require_super_or_ops)):
        e = await db.marketing_expenses.find_one({"id": expense_id}, {"_id": 0, "attachments": 1})
        if not e:
            raise HTTPException(404, "Expense not found")
        att = next((a for a in (e.get("attachments") or []) if a.get("id") == att_id), None)
        if not att or not att.get("file_b64"):
            raise HTTPException(404, "Attachment not found")
        raw = base64.b64decode(att["file_b64"])
        return Response(content=raw, media_type=att.get("mime_type") or "application/octet-stream",
                        headers={"Content-Disposition": f'inline; filename="{att.get("filename")}"'})

    # --------------------------------------------------------------- SUMMARY
    @r.get("/summary")
    async def spend_summary(
        period: str = Query("this_month"),
        date_from: Optional[str] = Query(None),
        date_to: Optional[str] = Query(None),
        admin: dict = Depends(require_super_or_ops),
    ):
        lo, hi, label = _resolve_period(period, date_from, date_to)
        return await _build_summary(lo, hi, label)

    @r.post("/campaigns/{campaign_id}/budget")
    async def set_campaign_budget(campaign_id: str, body: BudgetBody,
                                  admin: dict = Depends(require_super_or_ops)):
        c = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 1})
        if not c:
            raise HTTPException(404, "Campaign not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        if body.approved_budget_aud is not None:
            upd["approved_budget_aud"] = to_decimal128(body.approved_budget_aud)
        if body.planned_budget_aud is not None:
            upd["planned_budget_aud"] = body.planned_budget_aud
        await db.marketing_campaigns.update_one({"id": campaign_id}, {"$set": upd})
        return {"ok": True}

    @r.get("/campaigns/{campaign_id}/financials")
    async def campaign_financials(campaign_id: str,
                                  admin: dict = Depends(require_super_or_ops)):
        c = await db.marketing_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        return await _campaign_financials(c)

    @r.get("/placements")
    async def list_placements(campaign_id: Optional[str] = Query(None),
                              admin: dict = Depends(require_super_or_ops)):
        """Media placements = expenses that carry a publisher/publication."""
        q: Dict[str, Any] = {"voided": {"$ne": True},
                             "$or": [{"publisher_name": {"$nin": [None, ""]}},
                                     {"publication_name": {"$nin": [None, ""]}}]}
        if campaign_id:
            q["campaign_id"] = campaign_id
        rows = []
        async for e in db.marketing_expenses.find(q, {"_id": 0}).sort("booked_distribution_date", -1):
            rows.append(_expense_public(e))
        return {"placements": rows, "count": len(rows)}

    return r


# ---------------------------------------------------------------------------
# Summary helpers (module level so the Command Centre can reuse them)
# ---------------------------------------------------------------------------
def _resolve_period(period: str, date_from: Optional[str], date_to: Optional[str]):
    now = datetime.now(timezone.utc)
    if period == "custom" and (date_from or date_to):
        return (date_from or "0000"), (date_to or "9999"), "Custom range"
    y, m = now.year, now.month
    if period == "last_month":
        pm_year = y if m > 1 else y - 1
        pm = m - 1 if m > 1 else 12
        lo = datetime(pm_year, pm, 1, tzinfo=timezone.utc)
        hi = datetime(y, m, 1, tzinfo=timezone.utc)
        return lo.date().isoformat(), hi.date().isoformat(), "Last month"
    if period == "this_quarter":
        q_start_month = 3 * ((m - 1) // 3) + 1
        lo = datetime(y, q_start_month, 1, tzinfo=timezone.utc)
        return lo.date().isoformat(), (now + timedelta(days=1)).date().isoformat(), "This quarter"
    if period == "this_year":
        lo = datetime(y, 1, 1, tzinfo=timezone.utc)
        return lo.date().isoformat(), (now + timedelta(days=1)).date().isoformat(), "This year"
    # default: this_month
    lo = datetime(y, m, 1, tzinfo=timezone.utc)
    return lo.date().isoformat(), (now + timedelta(days=1)).date().isoformat(), "This month"


async def _campaign_totals(campaign_id: str) -> dict:
    from decimal import Decimal as _Dec
    tot = planned = committed = incurred = paid = outstanding = _Dec("0")
    n = 0
    paid_unknown = False
    async for e in db.marketing_expenses.find(
        {"campaign_id": campaign_id, "voided": {"$ne": True}}, {"_id": 0},
    ):
        n += 1
        tot += (D(e.get("cost_inc_gst")) or _Dec("0"))
        f = expense_financials(e)
        planned += (D(f["planned"]) or _Dec("0"))
        committed += (D(f["committed"]) or _Dec("0"))
        incurred += (D(f["incurred"]) or _Dec("0"))
        paid += (D(f["paid"]) or _Dec("0"))
        outstanding += (D(f["outstanding"]) or _Dec("0"))
        if f["basis"]["paid"] == "unknown":
            paid_unknown = True
    return {
        "expense_count": n,
        "total_investment_aud": to_aud(tot) or 0.0,
        "paid_aud": to_aud(paid) or 0.0,
        "committed_unpaid_aud": to_aud(committed) or 0.0,
        "committed_aud": to_aud(committed) or 0.0,
        "incurred_aud": to_aud(incurred) or 0.0,
        "outstanding_aud": to_aud(outstanding) or 0.0,
        "planned_aud": to_aud(planned) or 0.0,
        "paid_amount_unknown": paid_unknown,
    }


def _latest_outcome(c: dict, metric: str):
    """Most recent recorded outcome for a metric: (value, source, source_class)."""
    rows = [o for o in (c.get("outcomes") or []) if o.get("metric") == metric]
    if not rows:
        return None, None, None
    rows.sort(key=lambda o: (o.get("as_of_date") or "", o.get("recorded_at") or ""), reverse=True)
    o = rows[0]
    try:
        return float(o.get("value")), o.get("source"), o.get("source_class")
    except (TypeError, ValueError):
        return None, o.get("source"), o.get("source_class")


async def _campaign_performance(c: dict, totals: dict) -> dict:
    """Cost-efficiency + ROAS/ROI, honest about attribution.

    Formulas (documented): cost basis = total recorded investment (AUD).
      cost_per_X = cost / X (only when X > 0)
      ROAS = attributed_revenue / cost
      marketing_roi = (attributed_revenue - cost) / cost
    Where a required outcome is missing, the metric is null and attribution is
    reported as 'attribution_unavailable' — never a fabricated zero.
    """
    cost = float(totals.get("total_investment_aud") or 0)

    def cpx(count):
        if count and count > 0 and cost > 0:
            return round(cost / count, 2)
        return None

    enquiries, _, enq_src = _latest_outcome(c, "enquiries")
    registrations, _, reg_src = _latest_outcome(c, "registrations")
    trials, _, tr_src = _latest_outcome(c, "trial_customers")
    paid_subs, _, ps_src = _latest_outcome(c, "paid_subscribers")
    revenue, _, rev_src = _latest_outcome(c, "revenue_aud")

    roas = round(revenue / cost, 2) if (revenue is not None and cost > 0) else None
    roi = round((revenue - cost) / cost, 2) if (revenue is not None and cost > 0) else None
    attribution = "recorded" if revenue is not None else "attribution_unavailable"

    return {
        "cost_basis_aud": round(cost, 2),
        "cost_per_enquiry_aud": cpx(enquiries),
        "cost_per_registration_aud": cpx(registrations),
        "cost_per_trial_checkout_aud": cpx(trials),
        "cost_per_paid_subscriber_aud": cpx(paid_subs),
        "attributed_revenue_aud": revenue,
        "roas": roas,
        "marketing_roi": roi,
        "attribution": attribution,
        "outcome_sources": {
            "enquiries": enq_src, "registrations": reg_src,
            "trial_customers": tr_src, "paid_subscribers": ps_src, "revenue_aud": rev_src,
        },
        "formulas": {
            "cost_per_X": "total recorded investment / count of X (X>0)",
            "roas": "attributed revenue / cost",
            "marketing_roi": "(attributed revenue - cost) / cost",
            "note": "ROAS and marketing ROI are separate. Publisher-reported outcomes "
                    "are labelled and not treated as verified conversions.",
        },
    }


async def _campaign_financials(c: dict) -> dict:
    cid = c["id"]
    totals = await _campaign_totals(cid)
    approved_budget = to_aud(D(c.get("approved_budget_aud")))
    planned_budget = c.get("planned_budget_aud")
    budget = approved_budget if approved_budget is not None else planned_budget

    by_channel: Dict[str, float] = {}
    by_category: Dict[str, float] = {}
    by_publisher: Dict[str, float] = {}
    monthly: Dict[str, float] = {}
    async for e in db.marketing_expenses.find(
        {"campaign_id": cid, "voided": {"$ne": True}}, {"_id": 0}):
        amt = float(D(e.get("cost_inc_gst")) or 0)
        by_channel[e.get("channel") or "—"] = by_channel.get(e.get("channel") or "—", 0) + amt
        by_category[e.get("category_name") or "—"] = by_category.get(e.get("category_name") or "—", 0) + amt
        pub = e.get("publisher_name") or e.get("publication_name")
        if pub:
            by_publisher[pub] = by_publisher.get(pub, 0) + amt
        mkey = (e.get("expense_reporting_date") or "")[:7] or "—"
        monthly[mkey] = monthly.get(mkey, 0) + amt

    committed = totals.get("committed_aud") or 0.0
    remaining = round(budget - committed, 2) if budget is not None else None
    variance = round(committed - budget, 2) if budget is not None else None
    perf = await _campaign_performance(c, totals)

    def _lst(d):
        return [{"key": k, "total_aud": round(v, 2)} for k, v in
                sorted(d.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "campaign": {"id": cid, "name": c.get("name"), "status": c.get("status")},
        "budget": {
            "approved_budget_aud": approved_budget,
            "planned_budget_aud": planned_budget,
            "effective_budget_aud": round(budget, 2) if budget is not None else None,
        },
        "totals": totals,
        "remaining_uncommitted_aud": remaining,
        "variance_vs_budget_aud": variance,
        "by_channel": _lst(by_channel),
        "by_category": _lst(by_category),
        "by_publisher": _lst(by_publisher),
        "monthly": [{"month": k, "total_aud": round(v, 2)} for k, v in sorted(monthly.items())],
        "performance": perf,
        "meta": {
            "currency": CURRENCY,
            "note": "Planned/committed/incurred/paid are distinct lenses, never summed. "
                    "Remaining = effective budget − committed.",
        },
    }


async def _build_summary(lo: str, hi: str, label: str) -> dict:
    """All figures use expense_reporting_date as the single, labelled date
    basis. Cash payment dates are NOT mixed into the service-period totals."""
    q = {"voided": {"$ne": True}, "expense_reporting_date": {"$gte": lo, "$lt": hi}}
    from decimal import Decimal as _Dec
    total = planned = committed = incurred = paid = outstanding = refunds = _Dec("0")
    paid_unknown = False
    by_channel: Dict[str, float] = {}
    by_vendor: Dict[str, float] = {}
    by_campaign: Dict[str, float] = {}
    by_category: Dict[str, float] = {}
    by_group: Dict[str, float] = {}
    by_publisher: Dict[str, float] = {}
    n = 0
    last_updated: Optional[str] = None
    async for e in db.marketing_expenses.find(q, {"_id": 0}):
        amt = float(D(e.get("cost_inc_gst")) or 0)
        total += (D(e.get("cost_inc_gst")) or _Dec("0"))
        n += 1
        f = expense_financials(e)
        planned += (D(f["planned"]) or _Dec("0"))
        committed += (D(f["committed"]) or _Dec("0"))
        incurred += (D(f["incurred"]) or _Dec("0"))
        paid += (D(f["paid"]) or _Dec("0"))
        outstanding += (D(f["outstanding"]) or _Dec("0"))
        if f["basis"]["paid"] == "unknown":
            paid_unknown = True
        refunds += (D(f["credit"]) or _Dec("0"))
        by_channel[e.get("channel") or "—"] = by_channel.get(e.get("channel") or "—", 0) + amt
        if e.get("vendor"):
            by_vendor[e["vendor"]] = by_vendor.get(e["vendor"], 0) + amt
        pub = e.get("publisher_name") or e.get("publication_name")
        if pub:
            by_publisher[pub] = by_publisher.get(pub, 0) + amt
        if e.get("campaign_id"):
            by_campaign[e["campaign_id"]] = by_campaign.get(e["campaign_id"], 0) + amt
        by_category[e.get("category_name") or "—"] = by_category.get(e.get("category_name") or "—", 0) + amt
        by_group[e.get("category_group") or "other"] = by_group.get(e.get("category_group") or "other", 0) + amt
        upd = e.get("updated_at")
        if upd and (last_updated is None or upd > last_updated):
            last_updated = upd

    # Monthly trend (last 12 months, by reporting date).
    trend: List[dict] = []
    now = datetime.now(timezone.utc)
    for i in range(11, -1, -1):
        mdt = datetime(now.year, now.month, 1, tzinfo=timezone.utc) - timedelta(days=1)
        # compute month i months ago
        yy = now.year
        mm = now.month - i
        while mm <= 0:
            mm += 12
            yy -= 1
        m_lo = datetime(yy, mm, 1, tzinfo=timezone.utc).date().isoformat()
        nxt_y, nxt_m = (yy + 1, 1) if mm == 12 else (yy, mm + 1)
        m_hi = datetime(nxt_y, nxt_m, 1, tzinfo=timezone.utc).date().isoformat()
        msum = 0.0
        async for e in db.marketing_expenses.find(
            {"voided": {"$ne": True}, "expense_reporting_date": {"$gte": m_lo, "$lt": m_hi}},
            {"_id": 0, "cost_inc_gst": 1},
        ):
            msum += float(e.get("cost_inc_gst") or 0)
        trend.append({"month": m_lo[:7], "total_aud": round(msum, 2)})

    # Campaign names + CPA where attribution exists.
    campaign_rollup = []
    for cid, spend in sorted(by_campaign.items(), key=lambda kv: kv[1], reverse=True):
        c = await db.marketing_campaigns.find_one({"id": cid}, {"_id": 0, "name": 1, "outcomes": 1})
        paid_subs = None
        cpa = None
        attribution = "insufficient_attribution"
        if c:
            subs_outcomes = [o for o in (c.get("outcomes") or []) if o.get("metric") == "paid_subscribers"]
            if subs_outcomes:
                paid_subs = max(float(o.get("value") or 0) for o in subs_outcomes)
                if paid_subs and paid_subs > 0:
                    cpa = round(spend / paid_subs, 2)
                    attribution = "recorded"
        campaign_rollup.append({
            "campaign_id": cid, "name": (c or {}).get("name") or cid,
            "spend_aud": round(spend, 2), "paid_subscribers": paid_subs,
            "cost_per_acquisition_aud": cpa, "attribution": attribution,
        })

    def _top(d: Dict[str, float]):
        return [{"key": k, "total_aud": round(v, 2)} for k, v in
                sorted(d.items(), key=lambda kv: kv[1], reverse=True)]

    planned_budget = 0.0
    async for c in db.marketing_campaigns.find(
        {"status": {"$ne": "archived"}}, {"_id": 0, "planned_budget_aud": 1}):
        planned_budget += float(c.get("planned_budget_aud") or 0)

    paid_media_groups = {"paid_media"}
    paid_media_spend = sum(v for k, v in by_group.items() if k in paid_media_groups)

    total_f = to_aud(total) or 0.0
    committed_f = to_aud(committed) or 0.0
    return {
        "period": {"label": label, "from": lo, "to": hi, "date_basis": "expense_reporting_date"},
        "totals": {
            "total_investment_aud": total_f,
            "paid_media_spend_aud": round(paid_media_spend, 2),
            "other_marketing_aud": round(total_f - paid_media_spend, 2),
            "paid_aud": to_aud(paid) or 0.0,
            "committed_unpaid_aud": committed_f,
            "committed_aud": committed_f,
            "incurred_aud": to_aud(incurred) or 0.0,
            "outstanding_aud": to_aud(outstanding) or 0.0,
            "planned_aud": to_aud(planned) or 0.0,
            "refunds_aud": to_aud(refunds) or 0.0,
            "paid_amount_unknown": paid_unknown,
            "expense_count": n,
            "planned_budget_aud": round(planned_budget, 2),
            "budget_remaining_aud": round(planned_budget - committed_f, 2),
        },
        "by_channel": _top(by_channel),
        "by_vendor": _top(by_vendor)[:20],
        "by_publisher": _top(by_publisher)[:20],
        "by_group": _top(by_group),
        "top_categories": _top(by_category)[:10],
        "by_campaign": campaign_rollup,
        "monthly_trend": trend,
        "meta": {
            "source": "wayly_marketing_register",
            "currency": CURRENCY,
            "last_updated": last_updated,
            "note": "Planned/committed/incurred/paid are distinct lenses on the same "
                    "expenses — never summed together. CPA/ROAS shown only where "
                    "attribution is recorded; otherwise 'attribution unavailable'.",
        },
    }
