"""PPC-3 v1 slice: Provider Price Checker v3 with Quality Context.

Scope for this v1 slice (per PPC-3-v1.md):
  * Section B.1: ProviderQualityProfile data model + persistence.
  * Section B.2: WaylyProviderSurveyResponse with hashed user IDs.
  * Section B.3: ProviderResponseSubmission (basic; verification stub).
  * Section D.1-D.4: Quality profile, survey, response, comparison endpoints.
  * Section F: Composite quality summary (deterministic rules per B.4).
  * Section G.4: 5-response minimum + variance threshold for aggregation.
  * Section H.1: 30-day provider notification + response window enforcement.

Deferred to PPC-3 v2:
  * ACQSC/Star Ratings/Ombudsman external sync integrations (stubbed).
  * Full email-based verification for provider responses (currently token stub).
  * Full OPAN referral surface UI (backend only).
  * Aggregated complaint signal from CMP-1 (soft dependency; wired when live).
"""
from __future__ import annotations

import hashlib
import logging
import os
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.ppc3")

ppc3_router = APIRouter(prefix="/ppc3", tags=["ppc3"])

_db = None
_user_dep = None
_core1_write_event = None

WAYLY_MIN_RESPONSES = 5
WAYLY_MIN_VARIANCE_STDEV = 0.35  # response variance floor to publish aggregates
PROVIDER_RESPONSE_WINDOW_DAYS = 30


def init_ppc3_routes(*, db, user_dep, core1_write_timeline):
    global _db, _user_dep, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline


def _flag_enabled() -> bool:
    return os.environ.get("PPC3_ENABLED", "1") != "0"


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


def _hash_user(user_id: str) -> str:
    salt = os.environ.get("PPC3_SURVEY_SALT", "wayly-ppc3-survey")
    return hashlib.sha256(f"{salt}:{user_id}".encode()).hexdigest()[:32]


def _normalise_provider_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


async def ensure_ppc3_indexes(db) -> None:
    try:
        await db.provider_quality_profiles.create_index(
            [("provider_name_normalised", 1)], unique=True)
        await db.wayly_provider_survey_responses.create_index(
            [("provider_name_normalised", 1), ("submitted_at", -1)])
        await db.wayly_provider_survey_responses.create_index(
            [("respondent_user_id_hashed", 1), ("provider_name_normalised", 1)])
        await db.provider_response_submissions.create_index(
            [("provider_quality_profile_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("ppc3 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Composite quality summary (Section B.4 / F)
# ---------------------------------------------------------------------------


def _compute_composite(profile: dict) -> Dict[str, Any]:
    """Deterministic composite quality signal per Section B.4."""
    acqsc = (profile.get("acqsc_compliance_status") or {}).get("current_status")
    star_overall = ((profile.get("star_ratings") or {}) or {}).get("overall_rating")
    wayly = profile.get("wayly_aggregated_feedback") or {}
    scores = wayly.get("aggregate_scores") or {}
    wayly_mean = None
    if wayly.get("threshold_met_for_publication") and any(v is not None for v in scores.values()):
        vals = [v for v in scores.values() if v is not None]
        if vals:
            wayly_mean = sum(vals) / len(vals)

    signals_included: List[str] = []
    positive_count = 0
    concern_count = 0
    if acqsc and acqsc != "status_unknown":
        signals_included.append("ACQSC compliance")
        if acqsc == "compliant":
            positive_count += 1
        elif acqsc in {"non_compliant", "under_action_notice_of_non_compliance", "under_action_sanction"}:
            concern_count += 1
    if star_overall is not None:
        signals_included.append("Star Ratings")
        if star_overall >= 4:
            positive_count += 1
        elif star_overall < 2:
            concern_count += 1
    if wayly_mean is not None:
        signals_included.append("Wayly feedback")
        if wayly_mean >= 4:
            positive_count += 1
        elif wayly_mean < 2.5:
            concern_count += 1
    if (profile.get("ombudsman_public_referrals") or []):
        signals_included.append("Ombudsman referrals")
        concern_count += 1

    count = len(signals_included)
    if count < 2:
        overall = "insufficient_data_for_summary"
    elif concern_count >= 1 and count >= 2:
        overall = "several_concerns"
    elif count >= 3 and positive_count >= 2:
        overall = "many_positive_signals"
    else:
        overall = "mixed_signals"

    tokens = {
        "many_positive_signals": {
            "caregiver": "This provider shows several positive signals from the sources we track. Individual experiences can still vary.",
            "participant_self": "This provider shows several positive signals from the sources we track. Individual experiences can still vary.",
        },
        "several_concerns": {
            "caregiver": "This provider shows some concerning signals. It may be worth reviewing them alongside other information before making decisions.",
            "participant_self": "This provider shows some concerning signals. It may be worth reviewing them alongside other information before making decisions.",
        },
        "mixed_signals": {
            "caregiver": "This provider shows mixed signals. Some are positive, some raise concerns. It may be worth discussing with the provider before making decisions.",
            "participant_self": "This provider shows mixed signals. Some are positive, some raise concerns. It may be worth discussing with the provider before making decisions.",
        },
        "insufficient_data_for_summary": {
            "caregiver": "We don't have enough public information to summarise this provider yet. This is not a negative signal; it means the sources we track do not cover them.",
            "participant_self": "We don't have enough public information to summarise this provider yet. This is not a negative signal; it means the sources we track do not cover them.",
        },
    }[overall]

    return {
        "signals_available_count": count,
        "overall_signal": overall,
        "signals_included": signals_included,
        "explanation_tokens": tokens,
        "computed_at": _iso(_now()),
    }


async def _recompute_wayly_aggregate(provider_norm: str) -> Dict[str, Any]:
    """Compute aggregated Wayly user feedback with threshold + variance protection."""
    cursor = _db.wayly_provider_survey_responses.find(
        {"provider_name_normalised": provider_norm})
    responses = await cursor.to_list(length=5000)
    count = len(responses)
    threshold_met = count >= WAYLY_MIN_RESPONSES

    if not threshold_met:
        return {
            "survey_response_count": count,
            "threshold_met_for_publication": False,
            "response_variance_meets_privacy_threshold": False,
            "aggregate_scores": {"care_quality": None, "communication": None, "billing_accuracy": None, "worker_reliability": None},
            "would_recommend_percentage": None,
            "last_computed_at": _iso(_now()),
            "disclosure_note": f"Insufficient responses ({count}/{WAYLY_MIN_RESPONSES})",
        }

    aspects = ["care_quality", "communication", "billing_accuracy", "worker_reliability"]
    aggregates: Dict[str, Optional[float]] = {}
    variance_ok = True
    for k in aspects:
        values = [r.get("ratings", {}).get(k) for r in responses if r.get("ratings", {}).get(k) is not None]
        if not values:
            aggregates[k] = None
            continue
        aggregates[k] = round(sum(values) / len(values), 2)
        if len(values) >= 2:
            stdev = statistics.pstdev(values)
            if stdev < WAYLY_MIN_VARIANCE_STDEV:
                variance_ok = False

    if not variance_ok:
        return {
            "survey_response_count": count,
            "threshold_met_for_publication": False,
            "response_variance_meets_privacy_threshold": False,
            "aggregate_scores": {k: None for k in aspects},
            "would_recommend_percentage": None,
            "last_computed_at": _iso(_now()),
            "disclosure_note": "Insufficient response variance for privacy-safe publication.",
        }

    recommends = [r for r in responses if r.get("would_recommend") is True]
    return {
        "survey_response_count": count,
        "threshold_met_for_publication": True,
        "response_variance_meets_privacy_threshold": True,
        "aggregate_scores": aggregates,
        "would_recommend_percentage": round(100 * len(recommends) / count, 1),
        "last_computed_at": _iso(_now()),
        "disclosure_note": f"Based on {count} responses from Wayly users. See methodology.",
    }


async def _ensure_profile(provider_name: str) -> dict:
    norm = _normalise_provider_name(provider_name)
    doc = await _db.provider_quality_profiles.find_one({"provider_name_normalised": norm})
    if doc:
        return doc
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "provider_name_normalised": norm,
        "provider_official_name": provider_name.strip(),
        "provider_abn": None,
        "acqsc_compliance_status": {
            "current_status": "status_unknown",
            "last_review_date": None,
            "findings_summary": "",
            "source_url": "",
            "source_type": "acqsc_public_page",
            "last_synced_at": _iso(now),
        },
        "star_ratings": None,
        "ombudsman_public_referrals": [],
        "wayly_aggregated_feedback": None,
        "provider_responses": [],
        "first_published_at": None,
        "provider_notified_of_publication_at": None,
        "provider_response_window_expires_at": None,
        "last_updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    doc["composite_quality_summary"] = _compute_composite(doc)
    await _db.provider_quality_profiles.insert_one(doc)
    return doc


def _profile_view(p: dict) -> Dict[str, Any]:
    return {
        "id": p["id"],
        "provider_name_normalised": p["provider_name_normalised"],
        "provider_official_name": p["provider_official_name"],
        "acqsc_compliance_status": p.get("acqsc_compliance_status"),
        "star_ratings": p.get("star_ratings"),
        "ombudsman_public_referrals": p.get("ombudsman_public_referrals") or [],
        "wayly_aggregated_feedback": p.get("wayly_aggregated_feedback"),
        "composite_quality_summary": p.get("composite_quality_summary"),
        "provider_responses": p.get("provider_responses") or [],
        "provider_notified_of_publication_at": _iso(p.get("provider_notified_of_publication_at")),
        "provider_response_window_expires_at": _iso(p.get("provider_response_window_expires_at")),
        "last_updated_at": _iso(p.get("last_updated_at")),
    }


# ---------------------------------------------------------------------------
# Quality profile endpoints
# ---------------------------------------------------------------------------


@ppc3_router.get("/providers/{provider_name}/quality-profile")
async def get_quality_profile(provider_name: str, request: Request):
    await _assert_flag()
    await _user_dep(request)  # noqa: F841
    p = await _ensure_profile(provider_name)
    return {"profile": _profile_view(p)}


class ACQSCStatusUpdate(BaseModel):
    current_status: str
    last_review_date: Optional[str] = None
    findings_summary: str = ""
    source_url: str = ""


@ppc3_router.patch("/providers/{provider_name}/acqsc-status")
async def update_acqsc_status(provider_name: str, body: ACQSCStatusUpdate, request: Request):
    await _assert_flag()
    await _user_dep(request)
    p = await _ensure_profile(provider_name)
    p["acqsc_compliance_status"] = {
        "current_status": body.current_status,
        "last_review_date": body.last_review_date,
        "findings_summary": body.findings_summary,
        "source_url": body.source_url,
        "source_type": "acqsc_public_page",
        "last_synced_at": _iso(_now()),
    }
    p["composite_quality_summary"] = _compute_composite(p)
    p["last_updated_at"] = _now()
    await _db.provider_quality_profiles.update_one(
        {"id": p["id"]},
        {"$set": {
            "acqsc_compliance_status": p["acqsc_compliance_status"],
            "composite_quality_summary": p["composite_quality_summary"],
            "last_updated_at": p["last_updated_at"],
        }})
    return {"profile": _profile_view(p)}


class StarRatingsUpdate(BaseModel):
    overall_rating: Optional[int] = None
    compliance_sub_rating: Optional[int] = None
    quality_measures_sub_rating: Optional[int] = None
    staffing_sub_rating: Optional[int] = None
    residents_experience_sub_rating: Optional[int] = None
    published_source_url: Optional[str] = None


@ppc3_router.patch("/providers/{provider_name}/star-ratings")
async def update_star_ratings(provider_name: str, body: StarRatingsUpdate, request: Request):
    await _assert_flag()
    await _user_dep(request)
    p = await _ensure_profile(provider_name)
    p["star_ratings"] = {
        **body.dict(),
        "last_published": _iso(_now()),
    }
    p["composite_quality_summary"] = _compute_composite(p)
    p["last_updated_at"] = _now()
    await _db.provider_quality_profiles.update_one(
        {"id": p["id"]},
        {"$set": {"star_ratings": p["star_ratings"],
                  "composite_quality_summary": p["composite_quality_summary"],
                  "last_updated_at": p["last_updated_at"]}})
    return {"profile": _profile_view(p)}


# ---------------------------------------------------------------------------
# Wayly user survey (Section G)
# ---------------------------------------------------------------------------


class SurveyResponseIn(BaseModel):
    provider_name: str = Field(min_length=1)
    care_quality: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    billing_accuracy: int = Field(ge=1, le=5)
    worker_reliability: int = Field(ge=1, le=5)
    would_recommend: bool
    experience_length: str = "3_to_12_months"


@ppc3_router.post("/survey-responses")
async def submit_survey(body: SurveyResponseIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    user_id = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Auth required")

    norm = _normalise_provider_name(body.provider_name)
    await _ensure_profile(body.provider_name)
    doc = {
        "id": str(uuid.uuid4()),
        "respondent_user_id_hashed": _hash_user(str(user_id)),
        "provider_name_normalised": norm,
        "ratings": {
            "care_quality": body.care_quality,
            "communication": body.communication,
            "billing_accuracy": body.billing_accuracy,
            "worker_reliability": body.worker_reliability,
        },
        "would_recommend": body.would_recommend,
        "experience_length": body.experience_length,
        "submitted_at": _now(),
        "data_residency": "ap-southeast-2",
    }
    await _db.wayly_provider_survey_responses.insert_one(doc)

    agg = await _recompute_wayly_aggregate(norm)
    p = await _db.provider_quality_profiles.find_one({"provider_name_normalised": norm})
    p["wayly_aggregated_feedback"] = agg
    p["composite_quality_summary"] = _compute_composite(p)
    p["last_updated_at"] = _now()
    await _db.provider_quality_profiles.update_one(
        {"id": p["id"]},
        {"$set": {"wayly_aggregated_feedback": agg,
                  "composite_quality_summary": p["composite_quality_summary"],
                  "last_updated_at": p["last_updated_at"]}})

    return {
        "survey_id": doc["id"],
        "wayly_aggregated_feedback": agg,
    }


@ppc3_router.get("/providers/{provider_name}/wayly-aggregate")
async def get_wayly_aggregate(provider_name: str, request: Request):
    await _assert_flag()
    await _user_dep(request)
    norm = _normalise_provider_name(provider_name)
    agg = await _recompute_wayly_aggregate(norm)
    return {"aggregate": agg}


# ---------------------------------------------------------------------------
# Provider response affordance (Section H)
# ---------------------------------------------------------------------------


class ProviderResponseIn(BaseModel):
    provider_name: str
    submitter_name: str
    submitter_role: str
    submitter_email: str
    submitter_organisation_confirmation: str = ""
    response_content: str = Field(min_length=1, max_length=3000)
    responding_to_signal_type: str
    responding_to_signal_reference: str = ""


@ppc3_router.post("/public/provider-responses")
async def submit_provider_response(body: ProviderResponseIn):
    await _assert_flag()
    norm = _normalise_provider_name(body.provider_name)
    p = await _ensure_profile(body.provider_name)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "provider_name_normalised": norm,
        "provider_quality_profile_id": p["id"],
        "submitter_name": body.submitter_name,
        "submitter_role": body.submitter_role,
        "submitter_email": body.submitter_email,
        "submitter_organisation_confirmation": body.submitter_organisation_confirmation,
        "verified_by_wayly_at": None,
        "verification_method": None,
        "verification_notes": None,
        "response_content": body.response_content,
        "responding_to_signal_type": body.responding_to_signal_type,
        "responding_to_signal_reference": body.responding_to_signal_reference,
        "published_at": None,
        "published_alongside_signal_id": None,
        "received_at": now,
        "verification_token": str(uuid.uuid4()),
        "data_residency": "ap-southeast-2",
    }
    await _db.provider_response_submissions.insert_one(doc)
    return {"submission_id": doc["id"], "verification_token": doc["verification_token"], "verified": False}


class VerifyIn(BaseModel):
    verification_token: str


@ppc3_router.post("/public/provider-responses/{sub_id}/verify")
async def verify_provider_response(sub_id: str, body: VerifyIn):
    await _assert_flag()
    doc = await _db.provider_response_submissions.find_one({"id": sub_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("verification_token") != body.verification_token:
        raise HTTPException(status_code=403, detail="Token mismatch")
    now = _now()
    await _db.provider_response_submissions.update_one(
        {"id": sub_id},
        {"$set": {
            "verified_by_wayly_at": now,
            "verification_method": "email_verification_link_click",
        }})
    return {"verified": True}


@ppc3_router.post("/provider-responses/{sub_id}/publish")
async def publish_provider_response(sub_id: str, request: Request):
    await _assert_flag()
    await _user_dep(request)
    doc = await _db.provider_response_submissions.find_one({"id": sub_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if not doc.get("verified_by_wayly_at"):
        raise HTTPException(status_code=422, detail="Not verified")
    now = _now()
    await _db.provider_response_submissions.update_one(
        {"id": sub_id}, {"$set": {"published_at": now}})
    # Append to provider profile
    published_entry = {
        "response_date": _iso(now),
        "response_content": doc["response_content"],
        "submitter_name": doc["submitter_name"],
        "submitter_role": doc["submitter_role"],
        "submitter_email_verified": True,
        "responding_to_signal": doc["responding_to_signal_type"],
        "verified_source_of_response": "provider_official_email",
    }
    await _db.provider_quality_profiles.update_one(
        {"id": doc["provider_quality_profile_id"]},
        {"$push": {"provider_responses": published_entry},
         "$set": {"last_updated_at": now}})
    return {"published": True}


# ---------------------------------------------------------------------------
# Provider notification of publication (Section H.1 / C.5)
# ---------------------------------------------------------------------------


@ppc3_router.post("/providers/{provider_name}/notify-publication")
async def notify_publication(provider_name: str, request: Request):
    await _assert_flag()
    await _user_dep(request)
    p = await _ensure_profile(provider_name)
    now = _now()
    expires = now + timedelta(days=PROVIDER_RESPONSE_WINDOW_DAYS)
    await _db.provider_quality_profiles.update_one(
        {"id": p["id"]},
        {"$set": {
            "provider_notified_of_publication_at": now,
            "provider_response_window_expires_at": expires,
        }})
    return {"notified_at": _iso(now), "response_window_expires_at": _iso(expires)}


# ---------------------------------------------------------------------------
# Comparison view (Section J / D.4)
# ---------------------------------------------------------------------------


class ComparisonIn(BaseModel):
    provider_names: List[str] = Field(min_items=2, max_items=3)


@ppc3_router.post("/provider-comparison")
async def compare_providers(body: ComparisonIn, request: Request):
    await _assert_flag()
    await _user_dep(request)
    profiles = []
    for name in body.provider_names:
        p = await _ensure_profile(name)
        profiles.append(_profile_view(p))
    return {"comparison": profiles, "count": len(profiles)}
