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
# Router builder
# ---------------------------------------------------------------------------

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
        return {
            "findings": result["findings"],
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

        # UPLOAD-GUARD-1: redirect if this is clearly an invoice/statement.
        _guard = classify_content("care-plan-reviewer", combined_text)
        if _guard["decision"] == "block" and _guard["reason"] == "wrong_tool":
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
        return {
            "findings": result["findings"],
            "review_run": result["review_run"],
            "extraction": extraction.model_dump(),
            "per_file_meta": per_file_meta,
        }

    # ---------------- Authenticated: upload -----------------------------
    from fastapi import Depends

    @r.post("/care-plans/upload")
    async def upload_care_plan(
        body: TextUploadBody,
        user_id: str = Depends(get_current_user_id),
    ):
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

        # UPLOAD-GUARD-1: redirect if this is clearly an invoice/statement.
        _guard = classify_content("care-plan-reviewer", combined_text)
        if _guard["decision"] == "block" and _guard["reason"] == "wrong_tool":
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

        return {
            "review_run_id": review_run.id,
            "status": review_run.status,
            "findings_count": len(finding_docs),
            "findings": [_strip(d) for d in finding_docs],
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

        return {
            "plan": plan,
            "extraction": ext,
            "latest_run": latest_run,
            "findings": _sort_findings(findings),
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
    ):
        await _load_plan_or_404(plan_id, user_id)
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

        buf = io.BytesIO()
        render_artefact_pdf(buf, plan=plan, extraction=ext or {}, findings=findings)
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

    return r


__all__ = [
    "build_care_plans_router",
    "COLL_PLANS", "COLL_FINDINGS", "COLL_RUNS", "COLL_EXTRACTIONS",
    "REFERENCE_SNAPSHOT_ID",
]
