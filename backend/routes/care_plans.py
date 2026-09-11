"""CPR-1 · Care Plan Reviewer routes.

Endpoints:

  * POST   /api/care-plans/upload           , text-paste or file upload
  * GET    /api/care-plans                   , register (list)
  * GET    /api/care-plans/{id}              , detail
  * POST   /api/care-plans/{id}/analyse      , trigger a review run
  * PATCH  /api/care-plans/{id}/notes        , edit notes
  * PATCH  /api/care-plans/{id}/preview      , update the preview
                                                (classification / budget /
                                                add-missed / remove-not-mine)
  * DELETE /api/care-plans/{id}              , soft delete
  * POST   /api/care-plans/{id}/restore      , restore from soft delete
  * GET    /api/care-plans/archived          , archived + soft-deleted list
  * POST   /api/care-plans/public/review     , anonymous text-paste
                                                (legacy Care Plan Reviewer surface)

All authenticated endpoints require the caller to own the care plan (via
`uploaded_by_user_id`) or to be a household member. Household membership
is currently checked via participant_id → participants.household_id.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Body, File, Form, HTTPException, Query, Request, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from care_plan_models import (
    CarePlan, CarePlanFinding, CarePlanReviewRun, StructuredExtraction,
    utcnow_iso, compute_hard_delete_at,
)
from services.care_plan_ingestion import (
    ingest_care_plan_text, redact_plan_text, structure_plan_text,
    UploadValidationError, validate_submission,
)
from services.care_plan_analysis import analyse_care_plan
from prompts.care_plan_reviewer import CPR1_SYSTEM_PROMPT
from document_extract import extract_document, UnsupportedFormatError, CorruptFileError
from lib.upload_guard import classify_content


def cpr_mitigate(findings):
    """CPR-FINDINGS-UX-1 v2: the interim citation mitigation (M1-M4) is
    RETIRED following solicitor category-level sign-off of every Rule Registry
    category (see registry/cpr-categories-v1.yaml). Registry-bound citations
    are now trusted; freeform findings still carry no cited authority and
    banned claims are still stripped upstream in lib.cpr_rules.enrich_findings.
    Kept as a pass-through so call sites stay stable."""
    return findings, None

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

# Collection names
COLL_PLANS = "care_plans"
COLL_FINDINGS = "care_plan_findings"
COLL_RUNS = "care_plan_review_runs"
COLL_EXTRACTIONS = "care_plan_structured_extractions"

REFERENCE_SNAPSHOT_ID = "static-v1-2026-07-01"     # CPR-1 iteration 1 snapshot


# ---------------------------------------------------------------------------
# Request / response bodies
# ---------------------------------------------------------------------------

class TextUploadBody(BaseModel):
    """Text-paste upload (the initial supported ingestion path).

    File-upload multi-part support lands in the next iteration when the
    frontend drop zone ships.
    """
    text: str = Field(min_length=50, max_length=200_000)
    participant_id: Optional[str] = None
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    quarterly_budget: Optional[float] = Field(default=None, ge=0)
    provider_name: Optional[str] = Field(default=None, max_length=200)
    redact: bool = False        # spec §B.4, defaults off


class PreviewPatchBody(BaseModel):
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    quarterly_budget: Optional[float] = Field(default=None, ge=0)
    provider_name: Optional[str] = Field(default=None, max_length=200)
    add_service: Optional[dict] = None      # inline service add
    remove_service_index: Optional[int] = None    # remove a mis-detected service


class NotePatchBody(BaseModel):
    notes: str = Field(default="", max_length=4000)


class PublicReviewBody(BaseModel):
    """Anonymous / public-endpoint variant. No storage."""
    text: str = Field(min_length=50, max_length=50_000)
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    quarterly_budget: Optional[float] = Field(default=None, ge=0)


class FindingLetterBody(BaseModel):
    """C1 · draft-a-letter-from-a-finding. Works for both saved and unsaved
    reviews — the finding context is passed in the body so no persisted plan
    is required."""
    finding: Dict[str, Any]
    addressee: Optional[str] = None          # override; else finding.addressee_primary
    provider_name: Optional[str] = None
    participant_id: Optional[str] = None
    source_tool: Optional[str] = None        # e.g. "statement-decoder"; labels the carried-issues panel


class FindingsLetterBody(BaseModel):
    """Consolidated draft-a-letter: ONE letter covering EVERY finding, auto-filled
    from all detected issues (single-button flow)."""
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    addressee: Optional[str] = None
    provider_name: Optional[str] = None
    participant_id: Optional[str] = None
    source_tool: Optional[str] = None


class SummaryPdfBody(BaseModel):
    """B9 · downloadable summary PDF for an (un)saved review."""
    extraction: Dict[str, Any] = Field(default_factory=dict)
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    verification_panel: Optional[Dict[str, Any]] = None
    plan_summary: Optional[str] = None
    provider_name: Optional[str] = None
    participant_name: Optional[str] = None
    safety_notice: Optional[Dict[str, Any]] = None


# C1 addressee → LF-1 (situation_id, recipient_type). The user can switch the
# addressee inside the LF-1 editor; this picks a sensible default per finding.
_ADDRESSEE_TO_LF1 = {
    "provider": (6, "provider_cm"),
    "named_care_partner": (6, "provider_cm"),
    "nominated_representative": (6, "provider_cm"),
    "my_aged_care": (8, "mac"),
    "acqsc": (10, "acqsc"),
    "opan": (10, "opan"),
    "services_australia": (9, "services_australia_aged_care"),
    "ombudsman": (10, "ombudsman"),
    "elder_abuse": (11, "elder_abuse_helpline"),
}

# Regulators / agencies drive the letter type from the addressee. Provider-
# directed findings instead pick the letter type from the SOURCE TOOL, so a
# billing finding becomes a "dispute" not a generic "request" (this is what
# fixes the wrong "Type of request").
_REGULATOR_ADDRESSEES = {"my_aged_care", "acqsc", "opan", "services_australia", "ombudsman", "elder_abuse"}

# source_tool → (situation_id, recipient_type) for provider-directed findings.
_SOURCE_TOOL_TO_LF1 = {
    "statement-decoder": (3, "provider_cm"),        # charge dispute
    "invoice-checker": (3, "provider_cm"),          # charge dispute
    "provider-price-checker": (3, "provider_cm"),   # rate dispute
    "care-plan-reviewer": (6, "provider_cm"),       # plan-change request
    "support-plan-reviewer": (6, "provider_cm"),    # plan-change request
}

# Source-aware lead-in so the letter never claims a finding "came out of a
# review of the support plan" when it actually came from a statement, invoice,
# or price check. `{who}` is a possessive like "Sam's " or "the ".
_SOURCE_LEADIN = {
    "statement-decoder": "reviewing {who}Support at Home statement",
    "invoice-checker": "checking {who}invoice",
    "provider-price-checker": "comparing {who}service rates against the market",
    "care-plan-reviewer": "reviewing {who}support plan",
    "support-plan-reviewer": "reviewing {who}support plan",
}


def _resolve_situation(source_tool, addressee):
    """Pick the LF-1 situation + recipient from the finding's addressee and the
    tool it came from, so the letter TYPE matches the finding."""
    from lib.lf1 import get_situation
    addr = (addressee or "provider").strip().lower()
    if addr in _REGULATOR_ADDRESSEES:
        situation_id, recipient_type = _ADDRESSEE_TO_LF1.get(addr, (6, "provider_cm"))
    else:
        situation_id, recipient_type = _SOURCE_TOOL_TO_LF1.get(
            (source_tool or "").strip().lower(),
            _ADDRESSEE_TO_LF1.get(addr, (6, "provider_cm")),
        )
    archetype = (get_situation(situation_id) or {}).get("archetype") or "request"
    return situation_id, recipient_type, archetype


async def _compose_letter_intake(db, participant_id, archetype, issues, provider_name, source_tool=None):
    """Build a ready-to-generate intake from carried-over tool issues so the
    letter drafts with real content and the intake form shows pre-filled
    fields (fixes empty-form / no-letter). Mirrors the required-field map in
    services.lf1_generate so generation never 422s on a tool hand-off."""
    pname = ""
    if participant_id:
        p = await db.participants.find_one(
            {"id": participant_id},
            {"_id": 0, "display_name": 1, "first_name": 1, "last_name": 1, "name": 1},
        )
        if p:
            full = f"{(p.get('first_name') or '').strip()} {(p.get('last_name') or '').strip()}".strip()
            pname = full or (p.get("display_name") or p.get("name") or "").strip()
    named = bool(pname)
    who = f" for {pname}" if named else ""
    who_poss = f"{pname}'s " if named else "the "

    lines = []
    ref = ""
    for i, it in enumerate(issues or [], 1):
        title = (it.get("title") or "").strip()
        ask = (it.get("suggested_question") or it.get("detail") or "").strip()
        if title and ask and ask != title:
            lines.append(f"{i}. {title} — {ask}")
        elif title or ask:
            lines.append(f"{i}. {title or ask}")
        if not ref:
            ref = (it.get("reference_number") or it.get("statement_number") or "").strip()

    st = (source_tool or "").strip().lower()
    leadin_tmpl = _SOURCE_LEADIN.get(st)
    if leadin_tmpl:
        leadin = f"These points came out of {leadin_tmpl.format(who=who_poss)}, and I would like them addressed:"
    else:
        leadin = "I would like to raise the following points:"
    summary = (leadin + "\n" + "\n".join(lines)) if lines else ""

    intake: dict = {"participant_name": pname}
    if provider_name:
        intake["provider_name"] = provider_name
        intake["recipient_name"] = provider_name
    dispute_default = "charge_disputed" if st in ("statement-decoder", "invoice-checker", "provider-price-checker") else "other"
    field_map = {
        "request": ("change_summary", f"Request about the support plan{who}", {"change_type": "care_plan_amendment"}),
        "dispute": ("disputed_charge_summary", f"Query about charges{who}", {"dispute_type": dispute_default}),
        "complaint": ("complaint_summary", f"Concerns about care{who}", {"category": "service_delivery"}),
        "escalation": ("escalation_summary", f"Escalation about care{who}", {"prior_attempts": [{"date": "", "recipient": provider_name or "the provider", "summary": "Raised directly with the provider."}]}),
        "notification": ("notification_summary", f"Notification about the support plan{who}", {}),
    }
    field, subject, extras = field_map.get(archetype, (None, f"About the support plan{who}", {}))
    if field and summary:
        intake[field] = summary
    intake["subject"] = subject
    if ref and archetype == "dispute":
        intake["reference_number"] = ref
    for k, v in extras.items():
        intake.setdefault(k, v)
    return intake


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip(d: dict | None) -> dict | None:
    if d:
        d.pop("_id", None)
    return d


async def _load_plan_or_404(plan_id: str, user_id: str) -> dict:
    plan = await db[COLL_PLANS].find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Care plan not found.")
    # Owner or household member can view
    if plan.get("uploaded_by_user_id") != user_id:
        # Try household membership via participant
        pid = plan.get("participant_id")
        if pid:
            p = await db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1})
            if p:
                hh = p.get("household_id")
                member = await db.household_members.find_one({
                    "household_id": hh, "user_id": user_id,
                }, {"_id": 0}) if hh else None
                if not member:
                    raise HTTPException(status_code=403, detail="Forbidden.")
            else:
                raise HTTPException(status_code=403, detail="Forbidden.")
        else:
            raise HTTPException(status_code=403, detail="Forbidden.")
    return _strip(plan)


async def _get_llm_client():
    """Return a callable (system, user, session_id) → str that hits
    Claude Sonnet 4.5 via the shared llm_wrapper. Kept as a factory so
    tests can inject a stub.
    """
    from lib import llm_wrapper

    async def _client(system: str, user_text: str, session_id: str) -> str:
        return await llm_wrapper.chat_send(
            model="claude-sonnet-4-5-20250929",
            system=system,
            user_text=user_text,
            session_id=session_id,
        )
    return _client


# ---------------------------------------------------------------------------
# Async review jobs (ASYNC-REVIEW-1) — the LLM review takes ~40-55s which
# exceeds the ingress read-timeout and 502s (and piles up stuck coroutines
# that poison the whole worker). So the review runs as a background job: the
# HTTP request returns a job_id instantly and the client polls for the result.
# ---------------------------------------------------------------------------

# Caps concurrent background reviews (each holds an LLM thread ~40-60s).
_REVIEW_SEMAPHORE = asyncio.Semaphore(int(os.environ.get("CPR_REVIEW_CONCURRENCY", "4")))


async def _text_review_core(text: str, classification, quarterly_budget) -> Dict[str, Any]:
    # UPLOAD-GUARD-1 (STRICT): block unless clearly a care plan.
    _guard = classify_content("care-plan-reviewer", text)
    if _guard["decision"] != "accept":
        return {"upload_guard": _guard}
    care_plan_id = f"anon-{uuid4()}"
    extraction = structure_plan_text(text, care_plan_id)
    client = await _get_llm_client()
    result = await analyse_care_plan(
        text,
        extraction=extraction,
        classification=classification,
        quarterly_budget=quarterly_budget,
        reference_snapshot_id=REFERENCE_SNAPSHOT_ID,
        llm_client=client,
    )
    _findings, _notice = cpr_mitigate(result["findings"])
    from lib import cpr_rules as _cpr
    return {
        "findings": _findings,
        "safety_notice": _notice,
        "verification_panel": result.get("verification_panel"),
        "plan_summary": _cpr.plan_summary(extraction.model_dump(), result.get("verification_panel")),
        "review_run": result["review_run"],
        "extraction": extraction.model_dump(),
    }


async def _files_review_core(payloads, classification, quarterly_budget) -> Dict[str, Any]:
    try:
        validate_submission(payloads)
    except UploadValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    combined_text_parts: List[str] = []
    per_file_meta: List[Dict[str, Any]] = []
    unread: List[str] = []
    for name, raw, _ct in payloads:
        try:
            text, method, page_count, warnings = await extract_document(name, raw)
        except UnsupportedFormatError as e:
            raise HTTPException(status_code=400, detail=f"{name}: {e}")
        except CorruptFileError as e:
            raise HTTPException(status_code=400, detail=f"{name}: {e}")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"{name} could not be read: {e}")
        combined_text_parts.append(f"--- {name} ---\n{text}")
        per_file_meta.append({
            "filename": name, "input_method": method, "page_count": page_count,
            "warnings": warnings, "text_length": len(text or ""),
        })
        if warnings:
            unread.extend([f"{name}: {w}" for w in warnings])

    combined_text = "\n\n".join(combined_text_parts).strip()
    if len(combined_text) < 50:
        raise HTTPException(status_code=400, detail="Could not read enough text from the uploaded files.")

    _guard = classify_content("care-plan-reviewer", combined_text)
    if _guard["decision"] != "accept":
        return {"upload_guard": _guard}

    care_plan_id = f"anon-{uuid4()}"
    extraction = structure_plan_text(combined_text, care_plan_id)
    extraction.unread_sections = list(dict.fromkeys(unread))[:20]
    extraction.extraction_engine = "multi-file: " + ", ".join({m["input_method"] for m in per_file_meta})

    client = await _get_llm_client()
    result = await analyse_care_plan(
        combined_text, extraction=extraction, classification=classification,
        quarterly_budget=quarterly_budget, reference_snapshot_id=REFERENCE_SNAPSHOT_ID,
        llm_client=client,
    )
    _findings, _notice = cpr_mitigate(result["findings"])
    from lib import cpr_rules as _cpr
    return {
        "findings": _findings, "safety_notice": _notice,
        "verification_panel": result.get("verification_panel"),
        "plan_summary": _cpr.plan_summary(extraction.model_dump(), result.get("verification_panel")),
        "review_run": result["review_run"], "extraction": extraction.model_dump(),
        "per_file_meta": per_file_meta,
    }


async def _run_review_job(job_id: str, coro) -> None:
    """Await a review coroutine and persist its result/error to the job doc.
    A semaphore caps concurrent reviews so a burst can't saturate the LLM
    executor / event loop and stall unrelated requests."""
    try:
        async with _REVIEW_SEMAPHORE:
            result = await coro
        await db.cpr_review_jobs.update_one(
            {"id": job_id}, {"$set": {"status": "done", "result": result, "updated_at": utcnow_iso()}}
        )
    except HTTPException as e:
        await db.cpr_review_jobs.update_one(
            {"id": job_id}, {"$set": {"status": "error", "error": str(e.detail), "updated_at": utcnow_iso()}}
        )
    except Exception as e:  # noqa: BLE001
        await db.cpr_review_jobs.update_one(
            {"id": job_id}, {"$set": {"status": "error", "error": str(e), "updated_at": utcnow_iso()}}
        )


async def _create_review_job(coro) -> str:
    job_id = str(uuid4())
    now = utcnow_iso()
    await db.cpr_review_jobs.insert_one(
        {"id": job_id, "status": "processing", "result": None, "error": None, "created_at": now, "updated_at": now}
    )
    asyncio.create_task(_run_review_job(job_id, coro))
    return job_id


def build_care_plans_router() -> APIRouter:
    """Build and return the CPR-1 router. Called from `server.py` after
    the auth dependencies are defined (matches the pattern used by
    routes/participant_contacts.py).
    """
    from server import get_current_user_id, _require_paid_plan   # lazy

    r = APIRouter(tags=["care-plans"])

    # ---------------- Public (anonymous) endpoint -------------------
    @r.post("/public/care-plans/review")
    async def public_care_plans_review(body: PublicReviewBody, request: Request, response: Response):
        """Anonymous review, no storage, mirrors the legacy
        /public/care-plan-review shape but uses the new analysis engine.
        Rate-limited via _require_paid_plan (falls through for anon).
        """
        await _require_paid_plan(request, response, "Support Plan Reviewer")

        # UPLOAD-GUARD-1 (STRICT): block unless clearly a care plan.
        _guard = classify_content("care-plan-reviewer", body.text)
        if _guard["decision"] != "accept":
            return {"upload_guard": _guard}

        # Structure the plan (no persistence) then analyse
        care_plan_id = f"anon-{uuid4()}"
        extraction = structure_plan_text(body.text, care_plan_id)
        client = await _get_llm_client()
        result = await analyse_care_plan(
            body.text,
            extraction=extraction,
            classification=body.classification,
            quarterly_budget=body.quarterly_budget,
            reference_snapshot_id=REFERENCE_SNAPSHOT_ID,
            llm_client=client,
        )
        _findings, _notice = cpr_mitigate(result["findings"])
        from lib import cpr_rules as _cpr
        return {
            "findings": _findings,
            "safety_notice": _notice,
            "verification_panel": result.get("verification_panel"),
            "plan_summary": _cpr.plan_summary(extraction.model_dump(), result.get("verification_panel")),
            "review_run": result["review_run"],
            "extraction": extraction.model_dump(),
        }

    # ---------------- Public: multi-file review (no persistence) ----------------
    @r.post("/public/care-plans/review-files")
    async def public_review_files(
        request: Request,
        response: Response,
        files: List[UploadFile] = File(...),
        classification: Optional[int] = Form(None),
        quarterly_budget: Optional[float] = Form(None),
    ):
        """Anonymous / trial multi-file review. No persistence, mirrors
        the shape of /public/care-plans/review. Rate-limited via
        _require_paid_plan (same paywall as the text-paste variant)."""
        await _require_paid_plan(request, response, "Support Plan Reviewer")

        payloads: List[tuple[str, bytes, str]] = []
        for f in files:
            raw = await f.read()
            payloads.append((f.filename or "unnamed", raw, f.content_type or ""))

        try:
            validate_submission(payloads)
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

        combined_text_parts: List[str] = []
        per_file_meta: List[Dict[str, Any]] = []
        unread: List[str] = []

        for name, raw, _ct in payloads:
            try:
                text, method, page_count, warnings = await extract_document(name, raw)
            except UnsupportedFormatError as e:
                raise HTTPException(status_code=400, detail=f"{name}: {e}")
            except CorruptFileError as e:
                raise HTTPException(status_code=400, detail=f"{name}: {e}")
            except Exception as e:                    # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"{name} could not be read: {e}")

            combined_text_parts.append(f"--- {name} ---\n{text}")
            per_file_meta.append({
                "filename": name,
                "input_method": method,
                "page_count": page_count,
                "warnings": warnings,
                "text_length": len(text or ""),
            })
            if warnings:
                unread.extend([f"{name}: {w}" for w in warnings])

        combined_text = "\n\n".join(combined_text_parts).strip()
        if len(combined_text) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not read enough text from the uploaded files.",
            )

        # UPLOAD-GUARD-1 (STRICT): block unless the document is clearly a care
        # plan. Anything ambiguous, unrelated, or belonging to another tool is
        # blocked so no extracted numbers are ever shown for the wrong file.
        _guard = classify_content("care-plan-reviewer", combined_text)
        if _guard["decision"] != "accept":
            return {"upload_guard": _guard}

        care_plan_id = f"anon-{uuid4()}"
        extraction = structure_plan_text(combined_text, care_plan_id)
        extraction.unread_sections = list(dict.fromkeys(unread))[:20]
        extraction.extraction_engine = "multi-file: " + ", ".join(
            {m["input_method"] for m in per_file_meta}
        )

        client = await _get_llm_client()
        result = await analyse_care_plan(
            combined_text,
            extraction=extraction,
            classification=classification,
            quarterly_budget=quarterly_budget,
            reference_snapshot_id=REFERENCE_SNAPSHOT_ID,
            llm_client=client,
        )
        _findings, _notice = cpr_mitigate(result["findings"])
        from lib import cpr_rules as _cpr
        return {
            "findings": _findings,
            "safety_notice": _notice,
            "verification_panel": result.get("verification_panel"),
            "plan_summary": _cpr.plan_summary(extraction.model_dump(), result.get("verification_panel")),
            "review_run": result["review_run"],
            "extraction": extraction.model_dump(),
            "per_file_meta": per_file_meta,
        }

    # ---------------- Async review jobs (submit + poll) ------------------
    @r.post("/public/care-plans/review-async")
    async def public_review_async(body: PublicReviewBody, request: Request, response: Response):
        """Submit a text review as a background job; returns {job_id} instantly.
        Poll GET /public/care-plans/review-jobs/{job_id} for the result."""
        await _require_paid_plan(request, response, "Support Plan Reviewer")
        job_id = await _create_review_job(
            _text_review_core(body.text, body.classification, body.quarterly_budget)
        )
        return {"job_id": job_id, "status": "processing"}

    @r.post("/public/care-plans/review-files-async")
    async def public_review_files_async(
        request: Request,
        response: Response,
        files: List[UploadFile] = File(...),
        classification: Optional[int] = Form(None),
        quarterly_budget: Optional[float] = Form(None),
    ):
        """Submit a multi-file review as a background job; returns {job_id}."""
        await _require_paid_plan(request, response, "Support Plan Reviewer")
        payloads: List[tuple[str, bytes, str]] = []
        for f in files:
            raw = await f.read()
            payloads.append((f.filename or "unnamed", raw, f.content_type or ""))
        # Validate up-front so obvious errors return immediately (not via poll).
        try:
            validate_submission(payloads)
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        job_id = await _create_review_job(
            _files_review_core(payloads, classification, quarterly_budget)
        )
        return {"job_id": job_id, "status": "processing"}

    @r.get("/public/care-plans/review-jobs/{job_id}")
    async def public_review_job_status(job_id: str):
        doc = await db.cpr_review_jobs.find_one({"id": job_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Review job not found or expired.")
        return doc

    # ---------------- Authenticated: upload -----------------------------
    from fastapi import Depends

    @r.post("/care-plans/upload")
    async def upload_care_plan(
        body: TextUploadBody,
        user_id: str = Depends(get_current_user_id),
    ):
        # UPLOAD-GUARD-1 (STRICT): block unless clearly a care plan.
        _guard = classify_content("care-plan-reviewer", body.text)
        if _guard["decision"] != "accept":
            return {"upload_guard": _guard}
        try:
            ingested = ingest_care_plan_text(
                body.text,
                care_plan_id="pending",       # replaced after we mint the ID
                redact=body.redact,
            )
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

        extraction: StructuredExtraction = ingested["extraction"]

        # Persist the plan
        plan = CarePlan(
            participant_id=body.participant_id or "",
            uploaded_by_user_id=user_id,
            effective_from=extraction.effective_from,
            effective_to=extraction.effective_to,
            provider_name=body.provider_name or extraction.provider_name,
            classification_at_review=body.classification or extraction.classification,
            quarterly_budget_at_review=body.quarterly_budget or extraction.quarterly_budget,
            redaction_applied=body.redact,
            status="uploaded",
        )
        # Repoint the extraction to the real plan id
        extraction.care_plan_id = plan.id

        # Persist the raw extracted text separately for later re-analysis.
        raw_text_doc = {
            "id": str(uuid4()),
            "care_plan_id": plan.id,
            "raw_text": ingested["raw_text"],
            "analysis_text": ingested["analysis_text"],
            "created_at": utcnow_iso(),
        }
        await db["care_plan_extracted_texts"].insert_one(raw_text_doc)
        plan.extracted_text_id = raw_text_doc["id"]

        await db[COLL_PLANS].insert_one(plan.model_dump())
        await db[COLL_EXTRACTIONS].insert_one(extraction.model_dump())
        await db[COLL_PLANS].update_one(
            {"id": plan.id},
            {"$set": {"structured_extraction_id": extraction.id}},
        )
        return {
            "care_plan_id": plan.id,
            "extraction": extraction.model_dump(),
            "next_step": "Confirm the preview and click Analyse to run the review.",
        }

    # ---------------- Multi-file upload -------------------------
    @r.post("/care-plans/upload-files")
    async def upload_care_plan_files(
        files: List[UploadFile] = File(...),
        classification: Optional[int] = Form(None),
        quarterly_budget: Optional[float] = Form(None),
        provider_name: Optional[str] = Form(None),
        participant_id: Optional[str] = Form(None),
        redact: bool = Form(False),
        user_id: str = Depends(get_current_user_id),
    ):
        """Multi-file upload with PDF / DOCX / image / HEIC / txt support.

        Reads all uploaded files, extracts text from each via the existing
        `document_extract.extract_document` router, concatenates in drop
        order, then feeds through the same ingestion pipeline as the
        text-paste path.
        """
        # Validate: read raw bytes + content types
        payloads: List[tuple[str, bytes, str]] = []
        for f in files:
            raw = await f.read()
            payloads.append((f.filename or "unnamed", raw, f.content_type or ""))

        try:
            validate_submission(payloads)
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

        combined_text_parts: List[str] = []
        per_file_meta: List[Dict[str, Any]] = []
        unread_sections: List[str] = []

        for name, raw, _ct in payloads:
            try:
                text, method, page_count, warnings = await extract_document(name, raw)
            except UnsupportedFormatError as e:
                raise HTTPException(status_code=400, detail=f"{name}: {e}")
            except CorruptFileError as e:
                raise HTTPException(status_code=400, detail=f"{name}: {e}")
            except Exception as e:                    # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"{name} could not be read: {e}")

            combined_text_parts.append(f"--- {name} ---\n{text}")
            per_file_meta.append({
                "filename": name,
                "input_method": method,
                "page_count": page_count,
                "warnings": warnings,
                "text_length": len(text or ""),
            })
            if warnings:
                unread_sections.extend([f"{name}: {w}" for w in warnings])

        combined_text = "\n\n".join(combined_text_parts).strip()
        if len(combined_text) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not read enough text from the uploaded files. Try paste-text or re-scan the pages.",
            )

        # UPLOAD-GUARD-1 (STRICT): block unless the document is clearly a care
        # plan. Anything ambiguous, unrelated, or belonging to another tool is
        # blocked so no extracted numbers are ever shown for the wrong file.
        _guard = classify_content("care-plan-reviewer", combined_text)
        if _guard["decision"] != "accept":
            return {"upload_guard": _guard}

        # Ingest as if text-paste
        try:
            ingested = ingest_care_plan_text(
                combined_text,
                care_plan_id="pending",
                redact=redact,
            )
        except UploadValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

        extraction: StructuredExtraction = ingested["extraction"]
        # Surface any unread sections captured from extraction warnings.
        extraction.unread_sections = list(dict.fromkeys(unread_sections))[:20]
        # Provenance
        extraction.extraction_engine = "multi-file: " + ", ".join(
            {m["input_method"] for m in per_file_meta}
        )

        # Persist
        plan = CarePlan(
            participant_id=participant_id or "",
            uploaded_by_user_id=user_id,
            effective_from=extraction.effective_from,
            effective_to=extraction.effective_to,
            provider_name=provider_name or extraction.provider_name,
            classification_at_review=classification or extraction.classification,
            quarterly_budget_at_review=quarterly_budget or extraction.quarterly_budget,
            redaction_applied=redact,
            status="uploaded",
        )
        extraction.care_plan_id = plan.id

        raw_text_doc = {
            "id": str(uuid4()),
            "care_plan_id": plan.id,
            "raw_text": ingested["raw_text"],
            "analysis_text": ingested["analysis_text"],
            "per_file_meta": per_file_meta,
            "created_at": utcnow_iso(),
        }
        await db["care_plan_extracted_texts"].insert_one(raw_text_doc)
        plan.extracted_text_id = raw_text_doc["id"]

        await db[COLL_PLANS].insert_one(plan.model_dump())
        await db[COLL_EXTRACTIONS].insert_one(extraction.model_dump())
        await db[COLL_PLANS].update_one(
            {"id": plan.id},
            {"$set": {"structured_extraction_id": extraction.id}},
        )
        return {
            "care_plan_id": plan.id,
            "extraction": extraction.model_dump(),
            "per_file_meta": per_file_meta,
            "next_step": "Review what we read, then click Analyse to run the review.",
        }

    # ---------------- Preview edit ----------------------------------
    @r.patch("/care-plans/{plan_id}/preview")
    async def patch_preview(
        plan_id: str,
        body: PreviewPatchBody,
        user_id: str = Depends(get_current_user_id),
    ):
        plan = await _load_plan_or_404(plan_id, user_id)
        # Fetch extraction
        ext_id = plan.get("structured_extraction_id")
        if not ext_id:
            raise HTTPException(status_code=404, detail="No preview available.")
        ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id}))
        if not ext:
            raise HTTPException(status_code=404, detail="Preview not found.")

        # Apply edits
        updates_plan = {"updated_at": utcnow_iso()}
        updates_ext = {}
        if body.classification is not None:
            updates_plan["classification_at_review"] = body.classification
            updates_ext["classification"] = body.classification
        if body.quarterly_budget is not None:
            updates_plan["quarterly_budget_at_review"] = body.quarterly_budget
            updates_ext["quarterly_budget"] = body.quarterly_budget
        if body.provider_name is not None:
            updates_plan["provider_name"] = body.provider_name.strip() or None
            updates_ext["provider_name"] = body.provider_name.strip() or None
        if body.add_service and isinstance(body.add_service, dict):
            services = list(ext.get("services") or [])
            services.append(body.add_service)
            updates_ext["services"] = services
        if body.remove_service_index is not None:
            services = list(ext.get("services") or [])
            i = int(body.remove_service_index)
            if 0 <= i < len(services):
                services.pop(i)
                updates_ext["services"] = services

        if updates_plan:
            await db[COLL_PLANS].update_one({"id": plan_id}, {"$set": updates_plan})
        if updates_ext:
            await db[COLL_EXTRACTIONS].update_one({"id": ext_id}, {"$set": updates_ext})
        return {"ok": True}

    # ---------------- Analyse -------------------------------------
    @r.post("/care-plans/{plan_id}/analyse")
    async def analyse_plan(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        plan = await _load_plan_or_404(plan_id, user_id)
        ext_id = plan.get("structured_extraction_id")
        ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None

        # Prefer the stored raw text (from the upload), falls back to the
        # narrative + service reconstruction for legacy plans without it.
        raw_doc = None
        text_id = plan.get("extracted_text_id")
        if text_id:
            raw_doc = await db["care_plan_extracted_texts"].find_one({"id": text_id})
        if raw_doc:
            # Use the analysis_text (redacted-if-flagged) captured at upload time.
            analysis_text = raw_doc.get("analysis_text") or raw_doc.get("raw_text") or ""
        else:
            analysis_text_parts = []
            if ext:
                if ext.get("narrative_text"):
                    analysis_text_parts.append(ext["narrative_text"])
                for svc in (ext.get("services") or []):
                    analysis_text_parts.append(
                        f"{svc.get('description', '')} "
                        f"({svc.get('stream', '')}) "
                        f"{svc.get('frequency_text', '')}"
                    )
            analysis_text = "\n".join(analysis_text_parts) or "(empty plan)"

        # Run analysis
        client = await _get_llm_client()

        # Section F, cross-tool signal aggregation (90-day freshness gate).
        # Silent-fails if any read errors; never blocks analysis.
        cross_tool_summary = ""
        try:
            from services.care_plan_cross_tool_signal import (
                gather_cross_tool_signals, summarise_for_prompt,
            )
            signals = await gather_cross_tool_signals(
                plan.get("participant_id") or "",
                user_id,
            )
            cross_tool_summary = summarise_for_prompt(signals)
        except Exception:      # noqa: BLE001
            cross_tool_summary = ""

        result = await analyse_care_plan(
            analysis_text,
            extraction=StructuredExtraction(**ext) if ext else None,
            classification=plan.get("classification_at_review"),
            quarterly_budget=plan.get("quarterly_budget_at_review"),
            reference_snapshot_id=REFERENCE_SNAPSHOT_ID,
            llm_client=client,
            cross_tool_signal_summary=cross_tool_summary,
        )

        # Persist review run
        run_meta = result["review_run"]
        review_run = CarePlanReviewRun(
            care_plan_id=plan_id,
            triggered_by_user_id=user_id,
            model_used=run_meta["model_used"],
            prompt_version=run_meta["prompt_version"],
            reference_snapshot_id=run_meta["reference_snapshot_id"],
            status=run_meta["status"],
            failure_reason=run_meta.get("failure_reason"),
            completed_at=run_meta.get("completed_at"),
        )
        await db[COLL_RUNS].insert_one(review_run.model_dump())

        # Persist findings
        finding_docs = []
        for f in result["findings"]:
            finding = CarePlanFinding(
                care_plan_id=plan_id,
                review_run_id=review_run.id,
                category=f["category"],
                severity=f["severity"],
                finding_key=f["finding_key"],
                title=f["title"],
                detail=f["detail"],
                citation_source=f["citation_source"],
                citation_url=f["citation_url"],
                confidence=f["confidence"],
                suggested_question=f["suggested_question"],
                related_tool_slug=f.get("related_tool_slug"),
            )
            finding_docs.append(finding.model_dump())
        if finding_docs:
            await db[COLL_FINDINGS].insert_many(finding_docs)

        # Flip plan to active on first successful analysis
        if plan.get("status") == "uploaded" and review_run.status == "complete":
            await db[COLL_PLANS].update_one(
                {"id": plan_id},
                {"$set": {"status": "active", "updated_at": utcnow_iso()}},
            )

        _fmit, _notice = cpr_mitigate([_strip(d) for d in finding_docs])
        return {
            "review_run_id": review_run.id,
            "status": review_run.status,
            "findings_count": len(finding_docs),
            "findings": _fmit,
            "safety_notice": _notice,
        }

    # ---------------- List / register ----------------------------
    @r.get("/care-plans")
    async def list_care_plans(
        user_id: str = Depends(get_current_user_id),
        include_archived: bool = Query(False),
        participant_id: Optional[str] = Query(None),
    ):
        q: dict = {"uploaded_by_user_id": user_id}
        if participant_id:
            q["participant_id"] = participant_id
        if not include_archived:
            q["status"] = {"$in": ["uploaded", "active", "superseded"]}
        rows = await db[COLL_PLANS].find(q).sort("uploaded_at", -1).limit(200).to_list(length=200)
        # Attach latest-run finding counts
        out = []
        for row in rows:
            _strip(row)
            counts = await _latest_run_severity_counts(row["id"])
            row["latest_findings_by_severity"] = counts
            out.append(row)
        return {"care_plans": out}

    async def _latest_run_severity_counts(plan_id: str) -> dict:
        latest = await db[COLL_RUNS].find_one(
            {"care_plan_id": plan_id, "status": "complete"},
            sort=[("completed_at", -1)],
        )
        if not latest:
            return {"compliance": 0, "efficiency": 0, "choice": 0, "info": 0, "total": 0}
        findings = await db[COLL_FINDINGS].find({
            "care_plan_id": plan_id, "review_run_id": latest["id"],
        }).to_list(length=200)
        counts = {"compliance": 0, "efficiency": 0, "choice": 0, "info": 0}
        for f in findings:
            sev = f.get("severity", "info")
            if sev in counts:
                counts[sev] += 1
        counts["total"] = len(findings)
        return counts

    # ---------------- Detail --------------------------------------
    @r.get("/care-plans/{plan_id}")
    async def get_care_plan(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        plan = await _load_plan_or_404(plan_id, user_id)
        ext_id = plan.get("structured_extraction_id")
        ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None
        # Latest completed run + its findings
        latest_run = await db[COLL_RUNS].find_one(
            {"care_plan_id": plan_id, "status": "complete"},
            sort=[("completed_at", -1)],
        )
        _strip(latest_run)
        findings = []
        if latest_run:
            findings = await db[COLL_FINDINGS].find({
                "care_plan_id": plan_id, "review_run_id": latest_run["id"],
            }).to_list(length=200)
            for f in findings:
                _strip(f)
        # History: prior runs
        all_runs_cur = db[COLL_RUNS].find({"care_plan_id": plan_id}).sort("triggered_at", -1)
        all_runs = await all_runs_cur.to_list(length=50)
        for run in all_runs:
            _strip(run)

        _fmit, _notice = cpr_mitigate(_sort_findings(findings))
        return {
            "plan": plan,
            "extraction": ext,
            "latest_run": latest_run,
            "findings": _fmit,
            "safety_notice": _notice,
            "history": all_runs,
        }

    def _sort_findings(findings: list) -> list:
        order = {"compliance": 0, "choice": 1, "efficiency": 2, "info": 3}
        return sorted(
            findings,
            key=lambda f: (order.get(f.get("severity", "info"), 99), f.get("title", "")),
        )

    # ---------------- Notes ---------------------------------------
    @r.patch("/care-plans/{plan_id}/notes")
    async def patch_notes(
        plan_id: str,
        body: NotePatchBody,
        user_id: str = Depends(get_current_user_id),
    ):
        await _load_plan_or_404(plan_id, user_id)
        await db[COLL_PLANS].update_one(
            {"id": plan_id},
            {"$set": {"notes": body.notes.strip() or None, "updated_at": utcnow_iso()}},
        )
        return {"ok": True}

    # ---------------- Soft delete + restore ----------------------
    @r.delete("/care-plans/{plan_id}")
    async def soft_delete(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
        hard: bool = Query(False),
    ):
        """C3 · delete a review. `hard=false` (default) soft-deletes with a
        30-day restore window; `hard=true` permanently deletes the review row,
        its findings, runs, extractions and any stored artefact (privacy
        autonomy, immediate, no undo)."""
        await _load_plan_or_404(plan_id, user_id)
        if hard:
            await db[COLL_PLANS].delete_one({"id": plan_id})
            await db[COLL_FINDINGS].delete_many({"care_plan_id": plan_id})
            await db[COLL_RUNS].delete_many({"care_plan_id": plan_id})
            await db[COLL_EXTRACTIONS].delete_many({"care_plan_id": plan_id})
            await db["care_plan_extracted_texts"].delete_many({"care_plan_id": plan_id})
            return {"ok": True, "hard_deleted": True}
        now = utcnow_iso()
        await db[COLL_PLANS].update_one(
            {"id": plan_id},
            {"$set": {
                "status": "deleted",
                "soft_deleted_at": now,
                "hard_delete_at": compute_hard_delete_at(now, days=30),
                "updated_at": now,
            }},
        )
        return {"ok": True, "restore_within_days": 30}

    @r.post("/care-plans/{plan_id}/restore")
    async def restore(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        plan = await _load_plan_or_404(plan_id, user_id)
        if plan.get("status") != "deleted":
            raise HTTPException(status_code=400, detail="Plan is not deleted.")
        await db[COLL_PLANS].update_one(
            {"id": plan_id},
            {"$set": {
                "status": "active",
                "soft_deleted_at": None,
                "hard_delete_at": None,
                "updated_at": utcnow_iso(),
            }},
        )
        return {"ok": True}

    @r.get("/care-plans/archived/list")
    async def archived(
        user_id: str = Depends(get_current_user_id),
    ):
        rows = await db[COLL_PLANS].find({
            "uploaded_by_user_id": user_id,
            "status": {"$in": ["deleted", "archived"]},
        }).sort("soft_deleted_at", -1).limit(200).to_list(length=200)
        return {"care_plans": [_strip(r) for r in rows]}

    # ---------------- Meeting artefact, PDF export --------------
    @r.get("/care-plans/{plan_id}/artefact.pdf")
    async def artefact_pdf(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        """Server-side rendered meeting artefact PDF using reportlab.

        Returns a PDF stream with the plan overview, findings summary,
        verbatim question script, grouped findings, and a note-taking
        template. Print-ready with Wayly branding (Teal + Cream).
        """
        from fastapi.responses import StreamingResponse
        import io
        from services.care_plan_pdf import render_artefact_pdf

        plan = await _load_plan_or_404(plan_id, user_id)
        ext_id = plan.get("structured_extraction_id")
        ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None
        latest_run = await db[COLL_RUNS].find_one(
            {"care_plan_id": plan_id, "status": "complete"},
            sort=[("completed_at", -1)],
        )
        _strip(latest_run)
        findings: list = []
        if latest_run:
            findings = await db[COLL_FINDINGS].find({
                "care_plan_id": plan_id, "review_run_id": latest_run["id"],
            }).to_list(length=200)
            for f in findings:
                _strip(f)
            findings, _ = cpr_mitigate(findings)

        buf = io.BytesIO()
        from lib import cpr_rules as _cpr
        _facts = _cpr.build_facts(
            extraction=ext, plan_text="",
            classification=plan.get("classification_at_review"),
            quarterly_budget=plan.get("quarterly_budget_at_review"),
        )
        _vp = _cpr.run_verification_panel(_facts)
        from lib import cpr_safety as _cpr_safety
        render_artefact_pdf(
            buf, plan=plan, extraction=ext or {}, findings=findings,
            verification_panel=_vp,
            plan_summary_text=_cpr.plan_summary(ext or {}, _vp),
            safety_notice=_cpr_safety.safety_notice(),
        )
        buf.seek(0)
        from lib.artifact_naming import build_filename
        filename = build_filename(
            "care_plan",
            {"participant_name": plan.get("participant_name"),
             "title": plan.get("title") or plan.get("plan_name") or plan.get("name"),
             "date": (latest_run or {}).get("created_at")},
            "pdf",
        )
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ---------------- Meeting artefact, follow-up email draft --
    @r.get("/care-plans/{plan_id}/follow-up-email")
    async def follow_up_email(
        plan_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        """Return a suggested subject + body for the follow-up email to
        the provider after the meeting. Not sent, just drafted.
        """
        plan = await _load_plan_or_404(plan_id, user_id)
        ext_id = plan.get("structured_extraction_id")
        ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None
        latest_run = await db[COLL_RUNS].find_one(
            {"care_plan_id": plan_id, "status": "complete"},
            sort=[("completed_at", -1)],
        )
        _strip(latest_run)
        findings: list = []
        if latest_run:
            findings = await db[COLL_FINDINGS].find({
                "care_plan_id": plan_id, "review_run_id": latest_run["id"],
            }).to_list(length=200)
            for f in findings:
                _strip(f)
            findings, _ = cpr_mitigate(findings)

        from services.care_plan_email import draft_follow_up_email
        subject, body = draft_follow_up_email(
            plan=plan, extraction=ext or {}, findings=findings,
        )
        return {"subject": subject, "body": body}

    # ---------------- Hard-delete cron helper --------------------
    @r.post("/care-plans/admin/purge-expired")
    async def purge_expired(request: Request):
        """Idempotent admin-only helper, deletes plans past
        `hard_delete_at`. Intended to run daily.
        """
        # Simple admin gate: require an internal token header.
        expected = os.environ.get("CPR1_ADMIN_TOKEN")
        got = request.headers.get("x-admin-token") or ""
        if not expected or got != expected:
            raise HTTPException(status_code=403, detail="Forbidden.")

        now = datetime.now(timezone.utc).isoformat()
        # Find candidates
        expired = await db[COLL_PLANS].find({
            "status": "deleted",
            "hard_delete_at": {"$lte": now},
        }).to_list(length=1000)
        purged_ids = [e["id"] for e in expired]
        if not purged_ids:
            return {"purged": 0}

        await db[COLL_PLANS].delete_many({"id": {"$in": purged_ids}})
        await db[COLL_FINDINGS].delete_many({"care_plan_id": {"$in": purged_ids}})
        await db[COLL_RUNS].delete_many({"care_plan_id": {"$in": purged_ids}})
        await db[COLL_EXTRACTIONS].delete_many({"care_plan_id": {"$in": purged_ids}})
        return {"purged": len(purged_ids), "ids": purged_ids}

    # ---------------- Section F, Cross-tool signal read APIs ----------
    from services.care_plan_cross_tool_signal import (
        gather_cross_tool_signals,
        _statement_decoder_signal, _budget_calc_signal, _price_checker_signal,
        _classification_signal, _reassessment_letter_signal, _contribution_signal,
        _family_coordinator_signal,
    )

    @r.get("/internal/tools/statement-decoder/participant/{participant_id}/latest")
    async def _int_statement_decoder(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _statement_decoder_signal(participant_id)}

    @r.get("/internal/tools/budget-calculator/participant/{participant_id}/latest")
    async def _int_budget(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _budget_calc_signal(participant_id, user_id)}

    @r.get("/internal/tools/provider-price-checker/participant/{participant_id}/latest")
    async def _int_price(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _price_checker_signal(participant_id, user_id)}

    @r.get("/internal/tools/classification-self-check/participant/{participant_id}/latest")
    async def _int_classification(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _classification_signal(participant_id, user_id)}

    @r.get("/internal/tools/reassessment-letter-generator/participant/{participant_id}/latest")
    async def _int_reassessment(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _reassessment_letter_signal(participant_id, user_id)}

    @r.get("/internal/tools/contribution-estimator/participant/{participant_id}/latest")
    async def _int_contribution(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _contribution_signal(participant_id, user_id)}

    @r.get("/internal/tools/family-coordinator/participant/{participant_id}/household")
    async def _int_family(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return {"signal": await _family_coordinator_signal(participant_id, user_id)}

    @r.get("/internal/tools/all-signals/participant/{participant_id}")
    async def _int_all_signals(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        return await gather_cross_tool_signals(participant_id, user_id)

    # ---------------- Section G, Version compare -------------------
    @r.get("/care-plans/compare/{left_id}/{right_id}")
    async def compare_plans(
        left_id: str,
        right_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        """Return a side-by-side comparison of two care plans."""
        left = await _load_plan_or_404(left_id, user_id)
        right = await _load_plan_or_404(right_id, user_id)

        async def _bundle(plan: dict) -> dict:
            ext_id = plan.get("structured_extraction_id")
            ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None
            latest_run = await db[COLL_RUNS].find_one(
                {"care_plan_id": plan["id"], "status": "complete"},
                sort=[("completed_at", -1)],
            )
            _strip(latest_run)
            findings = []
            if latest_run:
                findings = await db[COLL_FINDINGS].find({
                    "care_plan_id": plan["id"],
                    "review_run_id": latest_run["id"],
                }).to_list(length=200)
                for f in findings:
                    _strip(f)
            return {"plan": plan, "extraction": ext, "latest_run": latest_run, "findings": findings}

        left_bundle = await _bundle(left)
        right_bundle = await _bundle(right)

        # Diff findings by finding_key
        left_keys = {f.get("finding_key"): f for f in left_bundle["findings"]}
        right_keys = {f.get("finding_key"): f for f in right_bundle["findings"]}
        only_left = [f for k, f in left_keys.items() if k not in right_keys]
        only_right = [f for k, f in right_keys.items() if k not in left_keys]
        both = [
            {"left": left_keys[k], "right": right_keys[k]}
            for k in left_keys.keys() & right_keys.keys()
        ]

        # Header diff
        def _header(ext: dict | None, plan: dict) -> dict:
            e = ext or {}
            return {
                "provider": plan.get("provider_name") or e.get("provider_name"),
                "effective_from": plan.get("effective_from") or e.get("effective_from"),
                "effective_to": plan.get("effective_to") or e.get("effective_to"),
                "classification": plan.get("classification_at_review") or e.get("classification"),
                "quarterly_budget": plan.get("quarterly_budget_at_review") or e.get("quarterly_budget"),
                "services_count": len((e.get("services") or []) if e else []),
            }

        return {
            "left": {**left_bundle, "header": _header(left_bundle["extraction"], left)},
            "right": {**right_bundle, "header": _header(right_bundle["extraction"], right)},
            "diff": {
                "only_left_findings": only_left,
                "only_right_findings": only_right,
                "resolved_or_persisting_pairs": both,
            },
        }

    # ---------------- Section I, Re-review reminder scanner ---------
    @r.get("/care-plans/prompts/re-review")
    async def re_review_prompts(
        user_id: str = Depends(get_current_user_id),
    ):
        """Return a list of prompts nudging the user to re-review one or
        more care plans. Three trigger types:

        1. `age_over_12mo`, plan effective_from > 365 days ago
        2. `legislative_change`, reference snapshot has moved on since the
           last review run (currently a static one-snapshot registry, so
           this is a placeholder that fires when the plan status is
           `active` AND `reference_snapshot_id` is older than
           `LEGISLATIVE_SNAPSHOT_ID`)
        3. `statement_underspend`, Statement Decoder shows persistent
           underspend >= 30% for 3 consecutive statements
        """
        prompts: List[Dict[str, Any]] = []
        now = datetime.now(timezone.utc)

        plans = await db[COLL_PLANS].find({
            "uploaded_by_user_id": user_id,
            "status": {"$in": ["active", "uploaded"]},
        }).to_list(length=200)

        for plan in plans:
            _strip(plan)
            ext_id = plan.get("structured_extraction_id")
            ext = _strip(await db[COLL_EXTRACTIONS].find_one({"id": ext_id})) if ext_id else None

            # 1. Age over 12 months
            eff = ext.get("effective_from") if ext else plan.get("effective_from")
            if eff:
                try:
                    eff_dt = datetime.fromisoformat(eff).replace(tzinfo=timezone.utc)
                    if (now - eff_dt).days > 365:
                        prompts.append({
                            "care_plan_id": plan["id"],
                            "provider_name": plan.get("provider_name"),
                            "trigger": "age_over_12mo",
                            "days_old": (now - eff_dt).days,
                            "message": (
                                "This plan is over 12 months old. Book a review with the provider "
                                "to check the services still match the participant's needs."
                            ),
                            "action_slug": "reassessment-letter-generator",
                        })
                except ValueError:
                    pass

            # 2. Legislative change (single snapshot for now, placeholder)
            latest_run = await db[COLL_RUNS].find_one(
                {"care_plan_id": plan["id"], "status": "complete"},
                sort=[("completed_at", -1)],
            )
            if latest_run and latest_run.get("reference_snapshot_id") != REFERENCE_SNAPSHOT_ID:
                prompts.append({
                    "care_plan_id": plan["id"],
                    "provider_name": plan.get("provider_name"),
                    "trigger": "legislative_change",
                    "prior_snapshot": latest_run.get("reference_snapshot_id"),
                    "current_snapshot": REFERENCE_SNAPSHOT_ID,
                    "message": (
                        "The legislative reference we check against has been updated since the "
                        "last review. Re-run the review to catch anything new."
                    ),
                    "action_slug": None,
                })

            # 3. Statement Decoder underspend >= 30% for 3 consecutive
            pid = plan.get("participant_id") or ""
            if pid:
                sd_signal = await _statement_decoder_signal(pid)
                if sd_signal and sd_signal.get("statements_count", 0) >= 3:
                    total = sd_signal.get("total_gross_recent", 0) or 0
                    budget = plan.get("quarterly_budget_at_review") or (ext or {}).get("quarterly_budget") or 0
                    if budget and total < (budget * 0.7 * 3):     # 3 statements worth
                        prompts.append({
                            "care_plan_id": plan["id"],
                            "provider_name": plan.get("provider_name"),
                            "trigger": "statement_underspend",
                            "underspend_pct": round(100 * (1 - (total / (budget * 3))), 1) if budget else None,
                            "message": (
                                "Statement Decoder shows this plan is being under-delivered on. "
                                "Review with the provider to check services are being received."
                            ),
                            "action_slug": "statement-decoder",
                        })

        # De-dupe by (care_plan_id, trigger)
        seen = set()
        deduped: List[Dict[str, Any]] = []
        for p in prompts:
            key = (p["care_plan_id"], p["trigger"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(p)
        return {"prompts": deduped, "count": len(deduped)}

    # ---------------- C1 · Draft letter from a finding -------------
    @r.post("/care-plans/letter-from-finding")
    async def letter_from_finding(
        body: FindingLetterBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Hand a CPR-1 finding off to LF-1: create a pre-filled correspondence
        keyed to the finding's addressee and return the entry id + editor path.
        CPR-1 does not embed letter drafting (L12)."""
        finding = body.finding or {}
        addressee = (body.addressee or finding.get("addressee_primary") or "provider").strip().lower()
        situation_id, recipient_type, archetype = _resolve_situation(body.source_tool, addressee)

        source_import = {
            "tool": body.source_tool or "care-plan-reviewer",
            "finding_title": finding.get("title"),
            "finding_body": finding.get("detail"),
            "citation_source": finding.get("citation_source"),
            "rule_id": finding.get("rule_id"),
            "severity": finding.get("severity"),
            "suggested_question": finding.get("suggested_question"),
            "addressee": addressee,
            "provider_name": body.provider_name,
        }
        entry_id = str(uuid4())
        now = utcnow_iso()
        intake = await _compose_letter_intake(
            db, body.participant_id, archetype,
            [{"title": finding.get("title"), "detail": finding.get("detail"), "suggested_question": finding.get("suggested_question"), "reference_number": finding.get("reference_number")}],
            body.provider_name, source_tool=body.source_tool,
        )
        entry = {
            "id": entry_id,
            "user_id": user_id,
            "participant_id": body.participant_id,
            "situation_id": situation_id,
            "archetype": archetype,
            "direction": "outbound",
            "recipient_type": recipient_type,
            "sender_identity": None,
            "sender_authority_basis": None,
            "complaint_mode": None,
            "atsi_preference": False,
            "source_import": source_import,
            "intake": intake,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        await db.lf1_correspondence.insert_one(entry)
        return {
            "entry_id": entry_id,
            "situation_id": situation_id,
            "addressee": addressee,
            "editor_path": f"/tools/letters-and-follow-ups/{entry_id}",
        }

    # ---------------- C1b · Draft ONE letter from ALL findings ------------
    @r.post("/care-plans/letter-from-findings")
    async def letter_from_findings(
        body: FindingsLetterBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Single-button consolidation: draft ONE letter that raises every
        finding with a single recipient, auto-filled from all detected issues."""
        findings = body.findings or []
        if body.addressee:
            addressee = body.addressee.strip().lower()
        else:
            counts = {}
            for f in findings:
                a = (f.get("addressee_primary") or "provider").strip().lower()
                counts[a] = counts.get(a, 0) + 1
            addressee = max(counts, key=counts.get) if counts else "provider"
        situation_id, recipient_type, archetype = _resolve_situation(body.source_tool, addressee)

        issues = [
            {
                "title": f.get("title"),
                "detail": f.get("detail"),
                "citation_source": f.get("citation_source"),
                "rule_id": f.get("rule_id"),
                "severity": f.get("severity"),
                "suggested_question": f.get("suggested_question"),
                "reference_number": f.get("reference_number"),
            }
            for f in findings
        ]
        source_import = {
            "tool": body.source_tool or "care-plan-reviewer",
            "combined": True,
            "issue_count": len(issues),
            "issues": issues,
            "finding_title": (issues[0]["title"] if issues else None),
            "finding_body": (issues[0]["detail"] if issues else None),
            "addressee": addressee,
            "provider_name": body.provider_name,
        }
        entry_id = str(uuid4())
        now = utcnow_iso()
        intake = await _compose_letter_intake(db, body.participant_id, archetype, issues, body.provider_name, source_tool=body.source_tool)
        entry = {
            "id": entry_id,
            "user_id": user_id,
            "participant_id": body.participant_id,
            "situation_id": situation_id,
            "archetype": archetype,
            "direction": "outbound",
            "recipient_type": recipient_type,
            "sender_identity": None,
            "sender_authority_basis": None,
            "complaint_mode": None,
            "atsi_preference": False,
            "source_import": source_import,
            "intake": intake,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        await db.lf1_correspondence.insert_one(entry)
        return {
            "entry_id": entry_id,
            "situation_id": situation_id,
            "addressee": addressee,
            "editor_path": f"/tools/letters-and-follow-ups/{entry_id}",
        }

    # ---------------- C1c · Ask a question about this plan ----------------
    @r.post("/care-plans/ask")
    async def ask_about_plan(
        body: dict,
        user_id: str = Depends(get_current_user_id),
    ):
        """Plain-English Q&A grounded ONLY in the review context the user just
        saw. Used by the 'Ask about this plan' box on the results screen."""
        question = (body.get("question") or "").strip()
        if not question:
            raise HTTPException(status_code=422, detail="Please type a question first.")
        ext = body.get("extraction") or {}
        findings = body.get("findings") or []
        parts = []
        if body.get("plan_summary"):
            parts.append(f"Plan summary: {body['plan_summary']}")
        if ext.get("provider_name"):
            parts.append(f"Provider: {ext['provider_name']}")
        if ext.get("classification"):
            parts.append(f"Classification level: {ext['classification']}")
        if ext.get("quarterly_budget"):
            parts.append(f"Quarterly budget: ${ext['quarterly_budget']}")
        svcs = ext.get("services") or []
        if svcs:
            parts.append("Services: " + "; ".join(f"{s.get('description')} ({s.get('stream')})" for s in svcs[:12]))
        goals = ext.get("goals") or []
        if goals:
            parts.append("Goals in the plan: " + "; ".join(goals[:10]))
        if findings:
            parts.append("Issues we found: " + "; ".join(f"{f.get('title')} — {f.get('detail')}" for f in findings[:12]))
        context = "\n".join(parts) or "No details were captured from this plan."
        system = (
            "You are Wayly, helping an older Australian or their family understand a Support at Home support plan. "
            "Answer ONLY using the context provided. Write in plain, warm English a 12-year-old could follow. "
            "Keep it to 2-4 short sentences. No jargon, no acronyms without explaining them. "
            "If the answer is not in the context, say you cannot tell from this plan and suggest asking the provider. Never invent figures."
        )
        user_text = f"CONTEXT:\n{context}\n\nQUESTION: {question}\n\nAnswer in plain English:"
        client = await _get_llm_client()
        try:
            answer = await client(system, user_text, f"cpr-ask-{user_id}")
        except Exception as e:
            raise HTTPException(status_code=503, detail="Wayly could not answer just now. Please try again in a moment.") from e
        return {"answer": (answer or "").strip()}

    @r.post("/care-plans/summary.pdf")
    async def summary_pdf(
        body: SummaryPdfBody,
        user_id: str = Depends(get_current_user_id),
    ):
        from fastapi.responses import StreamingResponse
        import io as _io
        from services.care_plan_pdf import render_artefact_pdf as _render
        from lib.artifact_naming import build_filename

        plan = {
            "provider_name": body.provider_name or body.extraction.get("provider_name"),
            "effective_from": body.extraction.get("effective_from"),
            "effective_to": body.extraction.get("effective_to"),
            "classification_at_review": body.extraction.get("classification"),
            "quarterly_budget_at_review": body.extraction.get("quarterly_budget"),
        }
        buf = _io.BytesIO()
        _render(
            buf, plan=plan, extraction=body.extraction, findings=body.findings,
            verification_panel=body.verification_panel,
            plan_summary_text=body.plan_summary,
            safety_notice=body.safety_notice,
        )
        buf.seek(0)
        filename = build_filename(
            "care_plan",
            {"participant_name": body.participant_name,
             "title": body.provider_name,
             "date": None},
            "pdf",
        )
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return r


__all__ = [
    "build_care_plans_router",
    "COLL_PLANS", "COLL_FINDINGS", "COLL_RUNS", "COLL_EXTRACTIONS",
    "REFERENCE_SNAPSHOT_ID",
]
