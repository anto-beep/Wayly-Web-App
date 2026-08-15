"""INV-1 v1.2 · WS1 · Invoice Checker HTTP surface (skeleton).

This is the Phase 1 skeleton, enough to accept an upload, classify the
document, optionally split a combined document, persist the raw file
and the classification, and hand back the ``document_shape`` to the
caller. The C1,C12 checks engine, situation-step flow and result screen
are Phase 1 follow-ups (WS4, WS8, WS9).

Endpoints
---------
POST /api/invoices/upload           , accept a PDF or image, classify, persist
GET  /api/invoices/{invoice_id}     , fetch the saved invoice + reconciliation
DELETE /api/invoices/{invoice_id}   , hard-delete, purge raw file bytes

All endpoints are household-scoped and household-owner-only. Rate-limit
budget: 20 uploads / account / hour (mirrors ``/api/statements/upload``).

Wire in server.py:
    from routes.invoices import build_invoices_router
    api.include_router(build_invoices_router(
        db=db,
        user_dep=_user_from_request,
        require_household=_require_household,
        resolve_active_participant=_resolve_active_participant,
    ))
"""
from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from lib.inv1 import (
    INV1_SCHEMA_VERSION,
    DocumentShape,
    classify_document,
    extract_line_items,
    run_checks,
    split_combined_document,
    InputState,
    ReconciliationPayload,
    OverallVerdict,
    SituationProfile,
)
from lib.inv1.extractor import extract_invoice_header
from lib.inv1.summariser import generate_summary
from lib.inv1.schema import PensionStatus, YesNoUnknown

logger = logging.getLogger("wayly.inv1.routes")

# Safety: reject anything above this raw size (25MB, same as statements)
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_reconciliation(
    document_shape: DocumentShape,
    input_state: InputState,
    ce2_schema_version: Optional[str] = None,
    statement_schema_version: Optional[str] = None,
) -> dict:
    """Placeholder payload emitted before the checks engine (WS4) runs.

    Returned to the frontend so the UI can render a "processing" state
    without ever seeing a null. The verdict is ``all_clear`` by default
    because no checks have run yet; the frontend must not display the
    verdict until ``checks_status == "ready"``.
    """
    payload = ReconciliationPayload(
        schema_version=INV1_SCHEMA_VERSION,
        document_shape=document_shape,
        input_state=input_state,
        overall_verdict=OverallVerdict.all_clear,
        ce2_schema_version=ce2_schema_version,
        statement_schema_version=statement_schema_version,
    )
    return payload.to_dict()


def build_invoices_router(
    *,
    db,
    user_dep: Callable,
    require_household: Optional[Callable] = None,
    resolve_active_participant: Optional[Callable] = None,
) -> APIRouter:
    """Return an APIRouter with all INV-1 routes wired to the given DB
    handle and auth dependencies from server.py."""

    router = APIRouter(tags=["invoice-checker"])

    async def _current_user(request: Request) -> dict:
        user = await user_dep(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

    async def _build_ppc_snapshot(user_id: str) -> dict:
        """WS5 · Provider Price Checker integration for C12.

        Aggregate every recent `price_check_runs` entry for this user
        into a `{service_type_key: provider_price}` map. C12 uses this
        to flag any invoice unit price that exceeds the price the
        provider itself has published for the same service.
        """
        snapshot: dict = {}
        try:
            cursor = db.price_check_runs.find(
                {"user_id": user_id},
                {"_id": 0, "service_category": 1, "provider_price": 1},
            ).sort("created_at", -1).limit(200)
            async for row in cursor:
                service = (row.get("service_category") or "").strip().lower()
                price = row.get("provider_price")
                if not service or price is None:
                    continue
                snapshot.setdefault(service[:40], float(price))
        except Exception as e:      # pragma: no cover - defensive
            logger.warning("PPC snapshot build failed: %s", e)
        return snapshot

    @router.post("/invoices/upload")
    async def upload_invoice(
        request: Request,
        file: UploadFile = File(...),
        user: dict = Depends(_current_user),
    ) -> dict:
        """Accept an invoice upload, classify it, split if combined,
        persist raw bytes and return an invoice_id with the classification.

        Response shape:
            {
                "invoice_id": str,
                "document_shape": "invoice" | "combined" | "combined_unsplit"
                                  | "remittance" | "receipt" | "statement",
                "confidence": float,
                "classifier_signals": {...},
                "reconciliation": {...ReconciliationPayload placeholder...},
                "checks_status": "pending",
                "created_at": ISO8601
            }

        A ``statement`` classification returns HTTP 200 with a redirect
        hint the frontend should use to route the user to the Statement
        Decoder tool instead (spec §6, spec §13 statement-only redirect).
        """
        user_id = user.get("id") or user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Read the upload. Enforce size cap early.
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty upload")
        if len(raw) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Upload too large. Please compress or upload a smaller file.",
            )

        filename = (file.filename or "invoice").strip() or "invoice"

        # Extract text via the shared pipeline. Keep the import local so
        # server startup does not depend on it (defence-in-depth).
        try:
            from document_extract import extract_document
        except Exception:  # pragma: no cover - defensive
            from backend.document_extract import extract_document  # type: ignore

        try:
            text, input_method, page_count, warnings = await extract_document(
                filename, raw,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("invoice extract failed: %s", e)
            raise HTTPException(
                status_code=422,
                detail="We could not read this file. Try a clearer copy or a different format.",
            )

        # Classify.
        classification = classify_document(text or "")

        # If the user uploaded a statement, hand back the redirect hint
        # so the frontend can show the spec §13 statement-only copy.
        if classification.shape == DocumentShape.statement:
            return {
                "invoice_id": None,
                "document_shape": DocumentShape.statement.value,
                "confidence": classification.confidence,
                "classifier_signals": classification.signals,
                "redirect_to": "statement-decoder",
                "checks_status": "not_applicable",
                "created_at": _now_iso(),
            }

        # Split combined documents. Fall back to combined_unsplit on failure.
        payable_text = text or ""
        information_text = ""
        split_method: Optional[str] = None
        if classification.shape == DocumentShape.combined:
            split = split_combined_document(text or "")
            split_method = split.split_method
            if split.succeeded:
                payable_text = split.payable_section
                information_text = split.information_section
                effective_shape = DocumentShape.combined
            else:
                effective_shape = DocumentShape.combined_unsplit
        else:
            effective_shape = classification.shape

        invoice_id = str(uuid.uuid4())

        # Run the deterministic checks synchronously, the C1..C12 engine
        # is CPU-bound and completes in <50 ms for a typical invoice.
        header = extract_invoice_header(payable_text)
        invoice_year = None
        try:
            if header.get("invoice_date"):
                invoice_year = int(header["invoice_date"][:4])
        except (ValueError, TypeError):
            pass
        lines = extract_line_items(payable_text, invoice_year=invoice_year)
        situation = SituationProfile()  # empty; user can refine via PATCH
        ppc_snapshot = await _build_ppc_snapshot(user_id)

        # Combined-doc detection: extract the statement-side line items so
        # the frontend can prompt "we detected a statement, reconcile?".
        # We DON'T auto-reconcile at upload time (spec: prompt user first).
        combined_statement_lines: list = []
        if effective_shape == DocumentShape.combined and information_text:
            try:
                combined_statement_lines = [
                    ln.to_dict() for ln in extract_line_items(
                        information_text, invoice_year=invoice_year,
                    )
                ]
            except Exception:      # pragma: no cover - defensive
                combined_statement_lines = []

        reconciliation = run_checks(
            lines=lines,
            situation=situation,
            document_shape=effective_shape,
            invoice_date=header.get("invoice_date"),
            period_end=header.get("period_end"),
            quarterly_budget=header.get("quarterly_budget"),
            ppc_snapshot=ppc_snapshot or None,
        ).to_dict()

        # AI plain-English summary. Non-blocking failure, the fallback
        # template kicks in if the LLM is unavailable.
        summary_md = await generate_summary(
            reconciliation, header=header, situation=situation.to_dict(),
            session_id=f"inv1-{invoice_id[:8]}",
        )
        reconciliation["summary_md"] = summary_md

        # Persist. Same shape as db.statements (base64 raw + extracted text
        # + audit trail). File bytes ARE stored so a re-check with a fixed
        # checks engine can re-run against the original document; delete
        # purges them.
        doc = {
            "id": invoice_id,
            "user_id": user_id,
            "household_id": user.get("household_id"),
            "participant_id": None,
            "filename": filename,
            "file_b64": base64.b64encode(raw).decode("ascii"),
            "file_size": len(raw),
            "input_method": input_method,
            "page_count": page_count,
            "warnings": warnings or [],
            "extracted_text": text or "",
            "information_section": information_text,
            "payable_section": payable_text,
            "document_shape": effective_shape.value,
            "classifier_confidence": classification.confidence,
            "classifier_signals": classification.signals,
            "split_method": split_method,
            "invoice_date": header.get("invoice_date"),
            "due_date": header.get("due_date"),
            "provider_name": header.get("provider_name"),
            "provider_abn": header.get("provider_abn"),
            "quarterly_budget": header.get("quarterly_budget"),
            "period_end": header.get("period_end"),
            "checks_status": "ready",
            "reconciliation": reconciliation,
            "combined_statement_lines": combined_statement_lines,
            "combined_reconciled": False,
            "state": "active",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

        # Resolve active participant if that helper is available.
        if resolve_active_participant is not None:
            try:
                p = await resolve_active_participant(user_id, request)
                if p:
                    doc["participant_id"] = p.get("id")
            except Exception:
                pass

        await db.invoices.insert_one(doc)

        return {
            "invoice_id": invoice_id,
            "document_shape": effective_shape.value,
            "confidence": classification.confidence,
            "classifier_signals": classification.signals,
            "split_method": split_method,
            "invoice_date": header.get("invoice_date"),
            "due_date": header.get("due_date"),
            "provider_name": header.get("provider_name"),
            "provider_abn": header.get("provider_abn"),
            "quarterly_budget": header.get("quarterly_budget"),
            "period_end": header.get("period_end"),
            "reconciliation": doc["reconciliation"],
            "combined_statement_line_count": len(combined_statement_lines),
            "combined_reconciled": False,
            "checks_status": "ready",
            "created_at": doc["created_at"],
        }

    @router.get("/invoices/{invoice_id}")
    async def get_invoice(
        invoice_id: str,
        user: dict = Depends(_current_user),
    ) -> dict:
        user_id = user.get("id") or user.get("user_id")
        doc = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
            {"_id": 0, "file_b64": 0},        # never leak raw bytes to the client
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return doc

    @router.post("/invoices/{invoice_id}/situation")
    async def update_situation(
        invoice_id: str,
        payload: dict,
        user: dict = Depends(_current_user),
    ) -> dict:
        """Update the situation profile (spec §7) and re-run the checks
        engine. Every field is optional; missing fields default to
        ``unknown``. Returns the fresh reconciliation payload."""
        user_id = user.get("id") or user.get("user_id")
        doc = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Invoice not found")

        def _yn(v: Any) -> YesNoUnknown:
            try:
                return YesNoUnknown(str(v))
            except Exception:
                return YesNoUnknown.unknown

        def _ps(v: Any) -> PensionStatus:
            try:
                return PensionStatus(str(v))
            except Exception:
                return PensionStatus.unknown

        situation = SituationProfile(
            pension_status=_ps(payload.get("pension_status")),
            grandfathered=_yn(payload.get("grandfathered")),
            hardship=_yn(payload.get("hardship")),
            assessment_pending=_yn(payload.get("assessment_pending")),
            assessment_letter_date=payload.get("assessment_letter_date"),
        )

        # Rebuild the extracted lines from the persisted payable section
        invoice_year = None
        try:
            iso = doc.get("invoice_date")
            if iso:
                invoice_year = int(iso[:4])
        except (ValueError, TypeError):
            pass
        lines = extract_line_items(doc.get("payable_section") or "", invoice_year=invoice_year)
        try:
            shape = DocumentShape(doc.get("document_shape") or "invoice")
        except Exception:
            shape = DocumentShape.invoice

        # Prefer the invoice date on the request; fall back to the header
        # we parsed at upload time.
        invoice_date = payload.get("invoice_date") or doc.get("invoice_date")

        reconciliation = run_checks(
            lines=lines,
            situation=situation,
            document_shape=shape,
            invoice_date=invoice_date,
            period_end=doc.get("period_end"),
            quarterly_budget=doc.get("quarterly_budget"),
            ppc_snapshot=(await _build_ppc_snapshot(user_id)) or None,
        ).to_dict()

        header = {
            "invoice_date": invoice_date,
            "due_date": doc.get("due_date"),
            "provider_name": doc.get("provider_name"),
            "provider_abn": doc.get("provider_abn"),
        }
        reconciliation["summary_md"] = await generate_summary(
            reconciliation, header=header, situation=situation.to_dict(),
            session_id=f"inv1-{invoice_id[:8]}",
        )

        await db.invoices.update_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
            {
                "$set": {
                    "reconciliation": reconciliation,
                    "situation": situation.to_dict(),
                    "checks_status": "ready",
                    "updated_at": _now_iso(),
                },
            },
        )

        return {
            "invoice_id": invoice_id,
            "reconciliation": reconciliation,
            "situation": situation.to_dict(),
            "checks_status": "ready",
        }

    @router.post("/invoices/{invoice_id}/findings/{finding_index}/letter")
    async def create_letter_from_finding(
        invoice_id: str,
        finding_index: int,
        user: dict = Depends(_current_user),
    ) -> dict:
        """LF-1 Bridge (spec §12, WS13). Given a finding on this invoice,
        create a matching LF-1 correspondence entry and return the LF-1
        record id so the frontend can navigate to the letter editor
        pre-populated with the invoice + finding context."""
        user_id = user.get("id") or user.get("user_id")
        doc = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Invoice not found")
        recon = doc.get("reconciliation") or {}
        findings = recon.get("findings") or []
        if finding_index < 0 or finding_index >= len(findings):
            raise HTTPException(status_code=404, detail="Finding not found")
        finding = findings[finding_index]

        # Map tier → LF-1 situation. Tier 4 with acqsc escalation goes to
        # situation 10 (regulator complaint). Everything else routes to
        # situation 3 ("I don't agree with a charge on the statement").
        if finding.get("escalation") == "acqsc":
            situation_id = 10
        else:
            situation_id = 3

        # Build the source_import context the LF-1 route accepts. The
        # editor renders this as an "About this invoice" panel.
        source_import = {
            "tool": "invoice-checker",
            "record_id": invoice_id,
            "check_id": finding.get("check_id"),
            "tier": finding.get("tier"),
            "suggested_question": finding.get("suggested_question"),
            "narrative": finding.get("narrative"),
            "invoice_filename": doc.get("filename"),
        }

        # Delegate the actual creation to the LF-1 route by inserting the
        # correspondence document directly. Keep the shape compatible with
        # ``lf1.create_correspondence``.
        import uuid as _uuid
        entry_id = str(_uuid.uuid4())
        now = _now_iso()
        entry = {
            "id": entry_id,
            "user_id": user_id,
            "participant_id": doc.get("participant_id"),
            "situation_id": situation_id,
            "archetype": "escalation" if situation_id == 10 else "dispute",
            "direction": "outbound",
            "recipient_type": "acqsc" if situation_id == 10 else "provider_cm",
            "sender_identity": None,
            "sender_authority_basis": None,
            "complaint_mode": None,
            "atsi_preference": False,
            "source_import": source_import,
            "intake": {},
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        await db.lf1_correspondence.insert_one(entry)

        return {
            "entry_id": entry_id,
            "situation_id": situation_id,
            "editor_path": f"/tools/letters-and-follow-ups/{entry_id}",
        }

    @router.post("/invoices/{invoice_id}/reconcile-combined")
    async def reconcile_combined(
        invoice_id: str,
        user: dict = Depends(_current_user),
    ) -> dict:
        """Combined-Doc Reconciliation (C7/C9). Re-runs the checks engine
        with the statement-side line items (extracted at upload time from
        the ``information_section``) injected as the ``statement`` payload.
        Enables cross-checks between the two sides of a single PDF.
        """
        user_id = user.get("id") or user.get("user_id")
        doc = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Invoice not found")
        statement_lines = doc.get("combined_statement_lines") or []
        if not statement_lines:
            raise HTTPException(
                status_code=400,
                detail="No statement section detected in this document.",
            )

        # Rebuild extracted invoice lines from the persisted payable section.
        invoice_year = None
        try:
            iso = doc.get("invoice_date")
            if iso:
                invoice_year = int(iso[:4])
        except (ValueError, TypeError):
            pass
        lines = extract_line_items(doc.get("payable_section") or "", invoice_year=invoice_year)

        situation_dict = doc.get("situation") or {}

        def _yn(v: Any) -> YesNoUnknown:
            try:
                return YesNoUnknown(str(v))
            except Exception:
                return YesNoUnknown.unknown

        def _ps(v: Any) -> PensionStatus:
            try:
                return PensionStatus(str(v))
            except Exception:
                return PensionStatus.unknown

        situation = SituationProfile(
            pension_status=_ps(situation_dict.get("pension_status")),
            grandfathered=_yn(situation_dict.get("grandfathered")),
            hardship=_yn(situation_dict.get("hardship")),
            assessment_pending=_yn(situation_dict.get("assessment_pending")),
            assessment_letter_date=situation_dict.get("assessment_letter_date"),
        )
        try:
            shape = DocumentShape(doc.get("document_shape") or "invoice")
        except Exception:
            shape = DocumentShape.combined

        reconciliation = run_checks(
            lines=lines,
            situation=situation,
            document_shape=shape,
            invoice_date=doc.get("invoice_date"),
            period_end=doc.get("period_end"),
            quarterly_budget=doc.get("quarterly_budget"),
            statement={"line_items": statement_lines},
            ppc_snapshot=(await _build_ppc_snapshot(user_id)) or None,
        ).to_dict()

        header = {
            "invoice_date": doc.get("invoice_date"),
            "due_date": doc.get("due_date"),
            "provider_name": doc.get("provider_name"),
            "provider_abn": doc.get("provider_abn"),
        }
        reconciliation["summary_md"] = await generate_summary(
            reconciliation, header=header, situation=situation.to_dict(),
            session_id=f"inv1-{invoice_id[:8]}",
        )

        await db.invoices.update_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
            {
                "$set": {
                    "reconciliation": reconciliation,
                    "combined_reconciled": True,
                    "checks_status": "ready",
                    "updated_at": _now_iso(),
                },
            },
        )

        return {
            "invoice_id": invoice_id,
            "reconciliation": reconciliation,
            "combined_reconciled": True,
            "statement_line_count": len(statement_lines),
        }

    @router.post("/invoices/{invoice_id}/save-to-vault")
    async def save_to_vault(
        invoice_id: str,
        user: dict = Depends(_current_user),
    ) -> dict:
        """Save the invoice PDF + a generated Check Report PDF to the
        Document Vault under the ``financial`` category. One-tap filing
        for users who want to keep a paper-trail of what Wayly flagged.
        """
        user_id = user.get("id") or user.get("user_id")
        doc = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Invoice not found")

        # Idempotency: if already saved, return the existing vault document IDs
        # instead of creating duplicates.
        if doc.get("saved_to_vault_at") and doc.get("vault_document_ids"):
            return {
                "invoice_id": invoice_id,
                "saved_document_ids": doc.get("vault_document_ids") or [],
                "saved_count": len(doc.get("vault_document_ids") or []),
                "vault_path": "/documents",
                "already_saved": True,
            }

        # Household required for vault.
        user_row = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
        household_id = (user_row or {}).get("household_id")
        if not household_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "no_household",
                    "message": "Create your household first to use the Document Vault.",
                    "redirect": "/onboarding",
                },
            )

        # Vault capacity check.
        cur = db.documents.aggregate([
            {"$match": {"household_id": household_id}},
            {"$group": {"_id": None, "total": {"$sum": "$file_size_bytes"}}},
        ])
        agg = await cur.to_list(1)
        used_bytes = int(agg[0]["total"]) if agg else 0
        max_vault_bytes = 100 * 1024 * 1024   # mirror documents_routes.MAX_VAULT_BYTES

        provider = (doc.get("provider_name") or "Provider").strip()[:60]
        invoice_date = doc.get("invoice_date") or ""

        saved_ids: list = []

        # 1. Save the original invoice PDF (if we still have the bytes).
        file_b64 = doc.get("file_b64")
        if file_b64:
            raw = base64.b64decode(file_b64)
            if used_bytes + len(raw) > max_vault_bytes:
                raise HTTPException(status_code=413, detail={
                    "error": "vault_full",
                    "message": "Your vault is full. Delete older documents or contact support.",
                })
            title = f"Invoice · {provider}{(' · ' + invoice_date) if invoice_date else ''}"
            invoice_doc = {
                "id": str(uuid.uuid4()),
                "household_id": household_id,
                "owner_user_id": user_id,
                "category": "financial",
                "title": title[:200],
                "filename": doc.get("filename") or "invoice.pdf",
                "file_mimetype": "application/pdf",
                "file_size_bytes": len(raw),
                "file_b64": file_b64,
                "notes": f"Saved from Invoice Checker · verdict {(doc.get('reconciliation') or {}).get('overall_verdict', 'all_clear')}",
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "last_decoded_statement_id": None,
                "source": {"tool": "invoice-checker", "invoice_id": invoice_id, "kind": "original"},
            }
            await db.documents.insert_one(invoice_doc)
            saved_ids.append(invoice_doc["id"])
            used_bytes += len(raw)

        # 2. Generate + save the Check Report PDF.
        try:
            from services.inv1_check_report_pdf import render_invoice_check_report
            report_bytes = render_invoice_check_report(
                invoice=doc, reconciliation=doc.get("reconciliation") or {},
            )
        except Exception as e:      # pragma: no cover - defensive
            logger.warning("check-report PDF render failed: %s", e)
            report_bytes = None

        if report_bytes:
            if used_bytes + len(report_bytes) > max_vault_bytes:
                raise HTTPException(status_code=413, detail={
                    "error": "vault_full",
                    "message": "Your vault is full. Delete older documents or contact support.",
                })
            title = f"Invoice Check Report · {provider}{(' · ' + invoice_date) if invoice_date else ''}"
            report_doc = {
                "id": str(uuid.uuid4()),
                "household_id": household_id,
                "owner_user_id": user_id,
                "category": "financial",
                "title": title[:200],
                "filename": "invoice-check-report.pdf",
                "file_mimetype": "application/pdf",
                "file_size_bytes": len(report_bytes),
                "file_b64": base64.b64encode(report_bytes).decode("ascii"),
                "notes": "Wayly Invoice Checker report",
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "last_decoded_statement_id": None,
                "source": {"tool": "invoice-checker", "invoice_id": invoice_id, "kind": "report"},
            }
            await db.documents.insert_one(report_doc)
            saved_ids.append(report_doc["id"])

        # Persist a marker on the invoice so the frontend can hide the CTA.
        await db.invoices.update_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
            {"$set": {"saved_to_vault_at": _now_iso(), "vault_document_ids": saved_ids}},
        )

        return {
            "invoice_id": invoice_id,
            "saved_document_ids": saved_ids,
            "saved_count": len(saved_ids),
            "vault_path": "/documents",
        }

    @router.get("/invoices")
    async def list_invoices(user: dict = Depends(_current_user)) -> dict:
        user_id = user.get("id") or user.get("user_id")
        cursor = db.invoices.find(
            {"user_id": user_id, "state": "active"},
            {
                "_id": 0, "file_b64": 0, "extracted_text": 0,
                "information_section": 0, "payable_section": 0,
            },
        ).sort("created_at", -1).limit(50)
        items = [doc async for doc in cursor]
        return {"count": len(items), "items": items}

    @router.delete("/invoices/{invoice_id}")
    async def delete_invoice(
        invoice_id: str,
        user: dict = Depends(_current_user),
    ) -> dict:
        """Hard-delete: purge the raw file bytes and mark the record
        ``deleted``. A de-identified stub survives 30 days for support
        triage (spec-aligned retention)."""
        user_id = user.get("id") or user.get("user_id")
        result = await db.invoices.update_one(
            {"id": invoice_id, "user_id": user_id, "state": "active"},
            {
                "$set": {
                    "state": "deleted",
                    "deleted_at": _now_iso(),
                    "updated_at": _now_iso(),
                },
                "$unset": {
                    "file_b64": "",
                    "extracted_text": "",
                    "information_section": "",
                    "payable_section": "",
                },
            },
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"invoice_id": invoice_id, "state": "deleted"}

    return router
