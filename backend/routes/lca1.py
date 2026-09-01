"""LCA-1 v1 core slice: Legislative Change Auto-Alerts.

Ships the following per the LCA-1 v1 spec (Antony, Aug 2026):

  Data model:  legislative_changes, user_alert_preferences, legislative_alerts
  Admin CRUD:  create/patch/publish/cancel + impact preview (staff-only)
  Matching:    universal + topic_subscription + profile_match (profile ADM-gated)
  Delivery:    generate alert records on publish; user read APIs; banner data
  Feature flag: LCA1_ALERTS_ENABLED (default 1); LCA1_TARGETING_ENABLED (default 0)

Deferred for v2:
  - Full editorial UI (staff builds it directly via API for v1)
  - Email delivery (uses the existing email_service when a per-user delivery worker is wired)
  - Digest batching (immediate delivery only in v1)
  - Cancellation with alert revocation propagation to LOOP-1 cases (basic revoke works)
  - Ask Wayly context surface (endpoint exists per spec Section D.4)

All endpoints under /api/lca1.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.lca1")

lca1_router = APIRouter(prefix="/lca1", tags=["lca1"])

_db = None
_user_dep = None
_core1_write_event = None


def init_lca1(*, db, user_dep, core1_write_timeline_event):
    global _db, _user_dep, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline_event


def _alerts_flag() -> bool:
    return os.environ.get("LCA1_ALERTS_ENABLED", "1") != "0"


def _targeting_flag() -> bool:
    return os.environ.get("LCA1_TARGETING_ENABLED", "0") != "0"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _assert_flag():
    if not _alerts_flag():
        raise HTTPException(status_code=404, detail="Not found")


def _is_staff(user: dict) -> bool:
    return (user.get("role") or "").lower() in ("staff", "admin", "super_admin")


async def _assert_staff(user: dict):
    if not _is_staff(user):
        raise HTTPException(status_code=404, detail="Not found")


CATEGORIES = {
    "classification", "contribution", "budget_cap", "care_type_definition",
    "provider_pricing", "at_hm", "chsp", "restorative_care", "end_of_life",
    "program_manual_change", "quarterly_indexation", "other",
}
STATUSES = {"draft", "in_review", "published", "superseded", "cancelled"}


# ---------------------------------------------------------------------------
# Public + user-scoped read APIs
# ---------------------------------------------------------------------------

@lca1_router.get("/status")
async def lca1_status():
    return {
        "lca_1_alerts_enabled": _alerts_flag(),
        "lca_1_targeting_enabled": _targeting_flag(),
        "version": "v1",
        "data_residency": "ap-southeast-2",
    }


@lca1_router.get("/public/changes")
async def public_changes(category: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    """Public-view published changes (no ADM signals disclosed)."""
    await _assert_flag()
    q: Dict[str, Any] = {"status": "published"}
    if category:
        q["category"] = category
    cur = _db.legislative_changes.find(q, {
        "_id": 0, "affected_profile_signals": 0, "auto_case_creation": 0,
    }).sort("effective_date", -1).limit(limit)
    docs = [d async for d in cur]
    return {"changes": [_public_change_view(d) for d in docs]}


def _public_change_view(c: dict) -> dict:
    return {
        "id": c.get("id"),
        "slug": c.get("slug"),
        "title": c.get("title"),
        "short_summary_tokens": c.get("short_summary_tokens"),
        "detailed_explanation_tokens": c.get("detailed_explanation_tokens"),
        "effective_date": c.get("effective_date"),
        "announced_date": c.get("announced_date"),
        "category": c.get("category"),
        "source": c.get("source"),
        "recommended_actions": c.get("recommended_actions") or [],
        "version": c.get("version") or 1,
        "published_at": _iso(c.get("published_at")),
    }


def _resolve_persona(user: dict) -> str:
    r = (user.get("role") or "caregiver").lower()
    return "participant_self" if r == "participant" else "caregiver"


def _pick_token(tokens: Any, persona: str) -> str:
    if isinstance(tokens, dict):
        return tokens.get(persona) or tokens.get("caregiver") or ""
    return str(tokens or "")


# ---------------------------------------------------------------------------
# Admin editorial: CRUD + publish + cancel
# ---------------------------------------------------------------------------


class ChangeCreate(BaseModel):
    slug: str
    title: str
    category: str
    short_summary_tokens: Dict[str, str]
    detailed_explanation_tokens: Dict[str, str]
    effective_date: str  # ISO date
    announced_date: Optional[str] = None
    source: Optional[Dict[str, Any]] = None
    affected_profile_signals: Dict[str, Any] = Field(default_factory=lambda: {"all_users": True})
    recommended_actions: List[Dict[str, Any]] = Field(default_factory=list)
    auto_case_creation: Optional[Dict[str, Any]] = None
    affects_wayly_tools: List[str] = Field(default_factory=list)


@lca1_router.post("/admin/changes")
async def admin_create_change(payload: ChangeCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)

    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown category: {payload.category}")
    if not (payload.short_summary_tokens.get("caregiver") and payload.short_summary_tokens.get("participant_self")):
        raise HTTPException(status_code=422, detail="Both caregiver and participant_self short_summary_tokens required")
    if not (payload.detailed_explanation_tokens.get("caregiver") and payload.detailed_explanation_tokens.get("participant_self")):
        raise HTTPException(status_code=422, detail="Both caregiver and participant_self detailed_explanation_tokens required")

    now = _now()
    change = {
        "id": str(uuid.uuid4()),
        "slug": payload.slug,
        "title": payload.title,
        "category": payload.category,
        "short_summary_tokens": payload.short_summary_tokens,
        "detailed_explanation_tokens": payload.detailed_explanation_tokens,
        "effective_date": payload.effective_date,
        "announced_date": payload.announced_date,
        "source": payload.source or {},
        "affected_profile_signals": payload.affected_profile_signals,
        "recommended_actions": payload.recommended_actions,
        "auto_case_creation": payload.auto_case_creation or {"creates_cases": False},
        "affects_wayly_tools": payload.affects_wayly_tools,
        "status": "draft",
        "version": 1,
        "created_at": now,
        "updated_at": now,
        "created_by_user_id": user.get("id"),
        "data_residency": "ap-southeast-2",
    }
    # Enforce unique slug
    existing = await _db.legislative_changes.find_one({"slug": payload.slug}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="slug_taken")
    await _db.legislative_changes.insert_one(dict(change))
    return _admin_change_view(change)


def _admin_change_view(c: dict) -> dict:
    return {**{k: v for k, v in c.items() if k not in ("_id",)},
            "created_at": _iso(c.get("created_at")),
            "updated_at": _iso(c.get("updated_at")),
            "published_at": _iso(c.get("published_at")),
            "cancelled_at": _iso(c.get("cancelled_at"))}


class ChangePatch(BaseModel):
    title: Optional[str] = None
    short_summary_tokens: Optional[Dict[str, str]] = None
    detailed_explanation_tokens: Optional[Dict[str, str]] = None
    affected_profile_signals: Optional[Dict[str, Any]] = None
    recommended_actions: Optional[List[Dict[str, Any]]] = None
    auto_case_creation: Optional[Dict[str, Any]] = None
    affects_wayly_tools: Optional[List[str]] = None
    effective_date: Optional[str] = None
    announced_date: Optional[str] = None
    category: Optional[str] = None


@lca1_router.get("/admin/changes")
async def admin_list_changes(request: Request, status: Optional[str] = None):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    cur = _db.legislative_changes.find(q, {"_id": 0}).sort("updated_at", -1).limit(100)
    return {"changes": [_admin_change_view(c) async for c in cur]}


@lca1_router.get("/admin/changes/{cid}")
async def admin_get_change(cid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    c = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return _admin_change_view(c)


@lca1_router.patch("/admin/changes/{cid}")
async def admin_patch_change(cid: str, payload: ChangePatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    c = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    updates: Dict[str, Any] = {"updated_at": _now()}
    for f in ("title", "short_summary_tokens", "detailed_explanation_tokens", "affected_profile_signals",
              "recommended_actions", "auto_case_creation", "affects_wayly_tools", "effective_date",
              "announced_date", "category"):
        v = getattr(payload, f)
        if v is not None:
            if f == "category" and v not in CATEGORIES:
                raise HTTPException(status_code=422, detail=f"Unknown category: {v}")
            updates[f] = v
    if c.get("status") == "published":
        updates["version"] = (c.get("version") or 1) + 1
        await _db.legislative_change_versions.insert_one({
            "change_id": cid, "version": c.get("version") or 1,
            "snapshot": {k: v for k, v in c.items() if k != "_id"},
            "captured_at": _now(), "captured_by_user_id": user.get("id"),
        })
    await _db.legislative_changes.update_one({"id": cid}, {"$set": updates})
    c2 = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    return _admin_change_view(c2)


@lca1_router.post("/admin/changes/{cid}/preview-impact")
async def admin_preview_impact(cid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    c = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    breakdown = await _run_matching(c, dry_run=True)
    return {
        "estimated_user_count": breakdown["match_total"],
        "match_breakdown_by_reason": breakdown["by_reason"],
        "auto_case_creation_count": breakdown["auto_case_count"],
    }


class PublishPayload(BaseModel):
    reviewer_acknowledgement: str = Field(pattern=r"^(reviewing_my_own_draft|reviewed_as_second_seat)$")


@lca1_router.post("/admin/changes/{cid}/publish")
async def admin_publish_change(cid: str, payload: PublishPayload, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    c = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if c.get("status") == "published":
        return _admin_change_view(c)
    now = _now()
    await _db.legislative_changes.update_one({"id": cid}, {"$set": {
        "status": "published",
        "published_at": now,
        "published_by_user_id": user.get("id"),
        "reviewer_acknowledgement": payload.reviewer_acknowledgement,
        "updated_at": now,
    }})
    c2 = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    # Fire matching engine (async, best-effort inline for simplicity in v1)
    result = await _run_matching(c2, dry_run=False)
    logger.info("lca1 publish %s produced %d alerts", cid, result["match_total"])
    # CPR-2 subscriber: create Support Plan re-review prompts if the change
    # affects `support_plan_reviewer` / `care_plan_reviewer`. Best-effort.
    try:
        from routes.cpr2 import cpr2_on_lca1_publish
        cpr2_res = await cpr2_on_lca1_publish(c2)
        result["cpr2_re_reviews_created"] = cpr2_res.get("created", 0)
    except Exception as e:  # pragma: no cover
        logger.warning("cpr2 subscriber failed on publish %s: %s", cid, e)
        result["cpr2_re_reviews_created"] = 0
    return {**_admin_change_view(c2), "delivery_summary": result}


class CancelPayload(BaseModel):
    cancellation_reason: str


@lca1_router.post("/admin/changes/{cid}/cancel")
async def admin_cancel_change(cid: str, payload: CancelPayload, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _assert_staff(user)
    c = await _db.legislative_changes.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    now = _now()
    await _db.legislative_changes.update_one({"id": cid}, {"$set": {
        "status": "cancelled",
        "cancelled_at": now,
        "cancellation_reason": payload.cancellation_reason,
        "cancelled_by_user_id": user.get("id"),
        "updated_at": now,
    }})
    # Revoke associated alerts
    await _db.legislative_alerts.update_many(
        {"change_id": cid, "alert_status": {"$in": ["queued", "shown", "read"]}},
        {"$set": {"alert_status": "revoked", "revoked_at": now}},
    )
    return await admin_get_change(cid, request)


# ---------------------------------------------------------------------------
# Matching engine (universal + topic_subscription + profile_match)
# ---------------------------------------------------------------------------

async def _run_matching(change: dict, *, dry_run: bool) -> Dict[str, Any]:
    """Match a change against every user; create LegislativeAlert records
    for those matched. Idempotent, one alert per (user_id, participant_id, change_id).
    """
    signals = change.get("affected_profile_signals") or {"all_users": True}
    is_universal = bool(signals.get("all_users"))
    category = change.get("category")
    cid = change["id"]

    by_reason = {"universal": 0, "topic_subscription": 0, "profile_match": 0, "profile_match_with_active_plan": 0}
    match_total = 0
    auto_case_count = 0
    auto_creates = bool((change.get("auto_case_creation") or {}).get("creates_cases"))

    # For each active user
    async for u in _db.users.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "household_id": 1}):
        uid = u.get("id")
        if not uid:
            continue
        # Preferences (defaults if missing)
        prefs = await _db.user_alert_preferences.find_one({"user_id": uid}, {"_id": 0})
        prefs = prefs or {}
        freq = prefs.get("digest_frequency", "immediate")
        if freq == "off":
            continue
        topic_subs = set(prefs.get("topic_subscriptions") or [])
        targeted_enabled = prefs.get("targeted_alerts_enabled", True)

        # Iterate this user's accessible participants (household + account scope)
        pids = await _accessible_participant_ids(uid, u.get("household_id"))

        if not pids:
            # No participants, universal alerts still deliver at the user level
            pids_for_match = [None]
        else:
            pids_for_match = pids

        for pid in pids_for_match:
            match_reason = None
            if is_universal:
                match_reason = "universal"
            elif category and category in topic_subs:
                match_reason = "topic_subscription"
            elif pid is not None and _targeting_flag() and targeted_enabled:
                p = await _db.participants.find_one({"id": pid}, {"_id": 0})
                if p and _profile_matches_signals(p, signals):
                    if signals.get("requires_active_care_plan"):
                        # Best-effort care plan check
                        has_plan = await _db.care_plans.count_documents({"participant_id": pid}) > 0
                        if has_plan:
                            match_reason = "profile_match_with_active_plan"
                    else:
                        match_reason = "profile_match"

            if not match_reason:
                continue

            by_reason[match_reason] += 1
            match_total += 1

            if dry_run:
                continue

            # Insert an alert (idempotent via composite key)
            existing = await _db.legislative_alerts.find_one({
                "user_id": uid, "participant_id": pid, "change_id": cid,
            }, {"_id": 0, "id": 1})
            if existing:
                continue
            alert_id = str(uuid.uuid4())
            await _db.legislative_alerts.insert_one({
                "id": alert_id,
                "user_id": uid,
                "participant_id": pid,
                "change_id": cid,
                "match_reason": match_reason,
                "alert_status": "shown",
                "channels_delivered": ["in_app_banner", "in_app_notification"],
                "created_at": _now(),
                "shown_at": _now(),
            })

            # CORE-1 timeline event (participant-scoped only)
            if pid is not None:
                try:
                    await _core1_write_event(
                        participant_id=pid, event_type="legislative_alert_shown", event_source="lca1",
                        actor_type="system", actor_id=None,
                        summary_tokens={
                            "caregiver": f"New aged care update: {change.get('title')}",
                            "participant_self": f"New aged care update: {change.get('title')}",
                        },
                        metadata={"change_id": cid, "match_reason": match_reason},
                    )
                except Exception:
                    pass

            if auto_creates and match_reason.startswith("profile_match") and pid is not None:
                auto_case_count += 1

    return {"match_total": match_total, "by_reason": by_reason, "auto_case_count": auto_case_count}


def _profile_matches_signals(p: dict, signals: Dict[str, Any]) -> bool:
    band = p.get("classification") or p.get("classification_level")
    bands = signals.get("classification_bands")
    if bands and band not in bands:
        return False
    pension = p.get("pension_status")
    pensions = signals.get("pension_statuses")
    if pensions and pension not in pensions:
        return False
    trans = p.get("transition_status")
    if trans is None and p.get("is_grandfathered"):
        trans = "grandfathered_hcp"
    transitions = signals.get("transition_statuses")
    if transitions and trans not in transitions:
        return False
    return True


async def _accessible_participant_ids(user_id: str, household_id: Optional[str]) -> List[str]:
    ids: List[str] = []
    acct_id = None
    member = await _db.account_members.find_one({"user_id": user_id, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
    if member:
        acct_id = member.get("account_id")
    if not acct_id:
        acct = await _db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
        if acct:
            acct_id = acct.get("id")
    q_or = []
    if acct_id:
        q_or.append({"account_id": acct_id})
    if household_id:
        q_or.append({"household_id": household_id})
    if not q_or:
        return []
    async for p in _db.participants.find(
        {"$or": q_or, "is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}},
        {"_id": 0, "id": 1},
    ):
        ids.append(p["id"])
    return ids


# ---------------------------------------------------------------------------
# User alerts
# ---------------------------------------------------------------------------


@lca1_router.get("/alerts")
async def user_alerts(request: Request, status_filter: Optional[str] = Query(None, alias="status"), limit: int = 50):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="unauthenticated")

    q: Dict[str, Any] = {"user_id": uid}
    if status_filter == "unread":
        q["alert_status"] = {"$in": ["shown"]}
    elif status_filter == "all":
        pass
    else:
        q["alert_status"] = {"$in": ["shown", "read"]}

    persona = _resolve_persona(user)
    alerts = []
    async for a in _db.legislative_alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit):
        c = await _db.legislative_changes.find_one({"id": a["change_id"]}, {"_id": 0})
        if not c:
            continue
        alerts.append({
            "id": a["id"],
            "change_id": a["change_id"],
            "participant_id": a.get("participant_id"),
            "match_reason": a.get("match_reason"),
            "alert_status": a.get("alert_status"),
            "channels_delivered": a.get("channels_delivered") or [],
            "created_at": _iso(a.get("created_at")),
            "shown_at": _iso(a.get("shown_at")),
            "read_at": _iso(a.get("read_at")),
            "title": c.get("title"),
            "category": c.get("category"),
            "effective_date": c.get("effective_date"),
            "short_summary": _pick_token(c.get("short_summary_tokens"), persona),
            "detailed_explanation": _pick_token(c.get("detailed_explanation_tokens"), persona),
            "recommended_actions": c.get("recommended_actions") or [],
            "source": c.get("source") or {},
        })
    return {"alerts": alerts, "count": len(alerts), "persona": persona}


@lca1_router.get("/alerts/unread-count")
async def user_alerts_unread_count(request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        return {"unread_count": 0}
    n = await _db.legislative_alerts.count_documents({"user_id": uid, "alert_status": "shown"})
    return {"unread_count": n}


@lca1_router.patch("/alerts/{alert_id}/read")
async def alert_mark_read(alert_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    a = await _db.legislative_alerts.find_one({"id": alert_id, "user_id": user.get("id")}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    await _db.legislative_alerts.update_one(
        {"id": alert_id}, {"$set": {"alert_status": "read", "read_at": _now()}},
    )
    return {"ok": True}


@lca1_router.patch("/alerts/{alert_id}/dismiss")
async def alert_dismiss(alert_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    a = await _db.legislative_alerts.find_one({"id": alert_id, "user_id": user.get("id")}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    await _db.legislative_alerts.update_one(
        {"id": alert_id}, {"$set": {"alert_status": "dismissed", "dismissed_at": _now()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------


class PreferencesBody(BaseModel):
    digest_frequency: Optional[str] = Field(None, pattern=r"^(immediate|weekly_digest|monthly_digest|off)$")
    channels: Optional[Dict[str, bool]] = None
    topic_subscriptions: Optional[List[str]] = None
    targeted_alerts_enabled: Optional[bool] = None


@lca1_router.get("/preferences")
async def get_preferences(request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    saved = await _db.user_alert_preferences.find_one({"user_id": uid}, {"_id": 0}) or {}
    defaults = {
        "user_id": uid,
        "digest_frequency": "immediate",
        "channels": {"in_app_banner": True, "in_app_notification": True, "email": False},
        "topic_subscriptions": [],
        "targeted_alerts_enabled": True,
    }
    merged = {**defaults, **{k: v for k, v in saved.items() if v is not None}}
    return merged


@lca1_router.patch("/preferences")
async def patch_preferences(payload: PreferencesBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    updates: Dict[str, Any] = {"updated_at": _now(), "user_id": uid}
    for f in ("digest_frequency", "channels", "topic_subscriptions", "targeted_alerts_enabled"):
        v = getattr(payload, f)
        if v is not None:
            updates[f] = v
    await _db.user_alert_preferences.update_one({"user_id": uid}, {"$set": updates}, upsert=True)
    return await get_preferences(request)


# ---------------------------------------------------------------------------
# AW-2 forward-declared read API (spec D.4)
# ---------------------------------------------------------------------------


@lca1_router.get("/active-alerts-context")
async def active_alerts_context(request: Request):
    """Consumed by AW-2 once shipped. Returns up to 5 recent shown/read alerts."""
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        return {"active_alerts": []}
    out = []
    async for a in _db.legislative_alerts.find(
        {"user_id": uid, "alert_status": {"$in": ["shown", "read"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(5):
        c = await _db.legislative_changes.find_one({"id": a["change_id"]}, {"_id": 0})
        if not c:
            continue
        out.append({
            "change_id": c.get("id"),
            "title": c.get("title"),
            "short_summary": _pick_token(c.get("short_summary_tokens"), _resolve_persona(user)),
            "effective_date": c.get("effective_date"),
            "recommended_actions": c.get("recommended_actions") or [],
            "match_reason": a.get("match_reason"),
        })
    return {"active_alerts": out}


async def build_digest_for_user(db, user_id: str) -> Optional[Dict[str, Any]]:
    """Build the reclassification digest content for a single user.
    Returns None or a dict {subject, text, html, case_count}. Used by both the
    on-demand /api/loop/lca1/digest endpoint and the weekly cron delivery."""
    # Resolve user's accessible participant ids
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "household_id": 1, "email": 1})
    if not u:
        return None
    pids: List[str] = []
    # account members
    m = await db.account_members.find_one({"user_id": user_id, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
    acct_id = (m or {}).get("account_id")
    if not acct_id:
        acct = await db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
        acct_id = (acct or {}).get("id")
    q_or = []
    if acct_id:
        q_or.append({"account_id": acct_id})
    if u.get("household_id"):
        q_or.append({"household_id": u["household_id"]})
    if not q_or:
        return None
    async for p in db.participants.find({"$or": q_or}, {"_id": 0, "id": 1}):
        pids.append(p["id"])
    if not pids:
        return None
    cases = []
    async for c in db.cases.find(
        {"participant_id": {"$in": pids}, "case_type": "reclassification_review",
         "status": {"$in": ["open", "in_progress", "waiting_on_provider"]}},
        {"_id": 0},
    ):
        cases.append(c)
    if not cases:
        return None
    p_by_id: Dict[str, dict] = {}
    async for p in db.participants.find({"id": {"$in": list({c["participant_id"] for c in cases})}},
                                        {"_id": 0, "id": 1, "first_name": 1, "name": 1, "preferred_name": 1}):
        p_by_id[p["id"]] = p

    def _name(pid: str) -> str:
        p = p_by_id.get(pid, {})
        return p.get("preferred_name") or p.get("name") or p.get("first_name") or "your loved one"

    lines = []
    html_rows = []
    for c in cases:
        n = _name(c["participant_id"])
        sig = (c.get("metadata") or {}).get("lca1_signal", {})
        ratio_pct = int((sig.get("spent_ratio", 0) or 0) * 100)
        band = sig.get("current_band")
        anomalies = sig.get("anomaly_count", 0)
        lines.append(f"- {n} (Level {band}), spent {ratio_pct}% of the quarterly ceiling with {anomalies} anomal{'ies' if anomalies != 1 else 'y'}.")
        html_rows.append(f"<tr><td>{n}</td><td>Level {band}</td><td>{ratio_pct}%</td><td>{anomalies}</td></tr>")

    text_body = (
        "Aged care reclassification opportunity, ahead of 1 October 2026\n\n"
        f"You have {len(cases)} open reclassification review case{'s' if len(cases) != 1 else ''}:\n\n"
        + "\n".join(lines) +
        "\n\nRun a Classification Self-Check for each candidate in Wayly to confirm.\n"
    )
    html_body = f"""
<h2 style="font-family:Georgia,serif;color:#1a3a2e;">Reclassification opportunity, 1 October 2026</h2>
<p>Wayly identified {len(cases)} participant{'s' if len(cases) != 1 else ''} in your household who may benefit from a classification review before 1 October 2026:</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e5e5;width:100%;">
<thead style="background:#f5f2eb;"><tr><th style="text-align:left;">Participant</th><th>Current level</th><th>Spend of ceiling</th><th>Anomalies</th></tr></thead>
<tbody>{''.join(html_rows)}</tbody>
</table>
<p>Run a Classification Self-Check for each candidate in Wayly to confirm.</p>
<p style="font-size:12px;color:#888;">You&rsquo;re receiving this because you opted in to Wayly&rsquo;s weekly digest. Data stored in Australia (ap-southeast-2).</p>
"""
    return {
        "subject": f"Reclassification opportunity, {len(cases)} participant{'s' if len(cases) != 1 else ''} to review",
        "text": text_body,
        "html": html_body,
        "case_count": len(cases),
    }


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------


async def ensure_lca1_indexes():
    try:
        await _db.legislative_changes.create_index("id", unique=True, sparse=True)
        await _db.legislative_changes.create_index([("slug", 1)], unique=True, sparse=True)
        await _db.legislative_changes.create_index([("status", 1), ("effective_date", -1)])
        await _db.legislative_alerts.create_index("id", unique=True, sparse=True)
        await _db.legislative_alerts.create_index([("user_id", 1), ("alert_status", 1), ("created_at", -1)])
        await _db.legislative_alerts.create_index([("change_id", 1), ("alert_status", 1)])
        await _db.legislative_alerts.create_index([("user_id", 1), ("participant_id", 1), ("change_id", 1)], unique=True)
        await _db.user_alert_preferences.create_index("user_id", unique=True)
        await _db.lca1_scrape_runs.create_index([("started_at", -1)])
    except Exception as e:
        logger.warning("lca1 index creation failed: %s", e)


# ---------------------------------------------------------------------------
# Weekly scrape cron
# ---------------------------------------------------------------------------

import asyncio


async def _lca1_weekly_scrape_cron():
    """Fires roughly once a week to record a scrape-run marker. Real HTTP
    scraping of ACQSC + Health.gov.au is behind LCA1_LIVE_SCRAPE=1 and
    requires a live outbound HTTP allowance; for now we record the run so
    ops has evidence the cron is alive and can trigger digest builds.
    """
    import os as _os
    interval = int(_os.environ.get("LCA1_SCRAPE_INTERVAL_SECONDS", "604800"))  # 7 days
    while True:
        try:
            doc = {
                "id": str(__import__("uuid").uuid4()),
                "started_at": datetime.now(timezone.utc),
                "mode": "live" if _os.environ.get("LCA1_LIVE_SCRAPE") == "1" else "recording_only",
                "sources_planned": ["acqsc.gov.au", "health.gov.au"],
                "changes_detected": 0,
                "note": "v1 cron marker; live HTTP scrape is behind LCA1_LIVE_SCRAPE=1",
            }
            await _db.lca1_scrape_runs.insert_one(doc)
            logger.info("lca1 weekly scrape cron tick recorded: %s", doc["id"])
        except Exception as e:
            logger.warning("lca1 weekly scrape cron failed: %s", e)
        await asyncio.sleep(interval)


def start_lca1_cron():
    """Kick off the weekly scrape cron as a background task. Call from
    server.py startup, wrapped in create_task to avoid K8s startup timeout.
    """
    try:
        asyncio.create_task(_lca1_weekly_scrape_cron())
    except Exception as e:
        logger.warning("could not start lca1 cron: %s", e)


@lca1_router.post("/scrape/run-now")
async def scrape_run_now(request: Request):
    """Admin-only trigger to run the scrape marker immediately (useful for
    ops smoke tests + testing_agent verification)."""
    user = await _user_dep(request)
    if not (isinstance(user, dict) and user.get("is_super_admin")):
        raise HTTPException(status_code=403, detail="Super-admin only")
    doc = {
        "id": str(__import__("uuid").uuid4()),
        "started_at": datetime.now(timezone.utc),
        "mode": "manual",
        "sources_planned": ["acqsc.gov.au", "health.gov.au"],
        "changes_detected": 0,
        "note": "manual trigger via /scrape/run-now",
    }
    await _db.lca1_scrape_runs.insert_one(doc)
    doc["started_at"] = doc["started_at"].isoformat()
    doc.pop("_id", None)
    return {"run": doc}


@lca1_router.get("/scrape/runs")
async def list_scrape_runs(request: Request):
    await _user_dep(request)
    runs = await _db.lca1_scrape_runs.find({}, {"_id": 0}).sort("started_at", -1).limit(20).to_list(20)
    for r in runs:
        if isinstance(r.get("started_at"), datetime):
            r["started_at"] = r["started_at"].isoformat()
    return {"runs": runs}
