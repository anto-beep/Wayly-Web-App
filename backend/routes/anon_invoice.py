"""CONV-1 v2 · Workstream B — Anonymous Invoice Check (public, no account).

A signed-out visitor runs ONE real Invoice Check per 120 days on their own
invoice and sees the COMPLETE result. This calls the SAME ``lib.inv1`` engine
as the signed-in ``/api/invoices/upload`` route, so there is no dual-path
divergence (spec E-B-parity). Only the allowance check and the persistence
behaviour differ.

Privacy (spec §7.3): the uploaded file and its extracted text are discarded as
soon as the result is produced. Only the rendered result is persisted, against
an opaque token, and deleted after 7 days (TTL index). An anonymous run is
never joined to an account unless the visitor explicitly saves it.

Abuse / cost controls (spec §8.1 / §8.2) — this stack's server-side equivalents
in place of Cloudflare: a per-IP burst limit, the per-device 120-day allowance,
a global daily AUD spend cap, a kill switch (toggled by env without a deploy),
an input character/token ceiling, and content-type + size validation. Cloudflare
Turnstile is not part of this stack; the rate limit + burst cap + spend cap are
the equivalent automated-submission defence.

Endpoints (all public, no auth):
    POST /api/public/invoice-check/run        — run a check (file | text | sample)
    GET  /api/public/invoice-check/{token}    — fetch a persisted result (7-day)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, EmailStr

from lib.inv1 import (
    DocumentShape,
    SituationProfile,
    classify_document,
    extract_line_items,
    run_checks,
    split_combined_document,
)
from lib.inv1.extractor import extract_invoice_header, extract_invoice_totals
from lib.inv1.summariser import generate_summary
from lib.inv1.schema import PensionStatus, YesNoUnknown
from lib.inv1.checks import refund_total as _refund_total
from lib.upload_guard import classify_content

from email_service import deliver
from wayly_email_branding import wrap_email_html
from lib.email_governance import (
    make_email_token, marketing_unsub_headers, email_hash,
    MARKETING_CONSENT_VERSION,
)
from html import escape as _esc

logger = logging.getLogger("wayly.conv1.anon_invoice")

_SESSION_DAYS = 7           # spec B8: hold the result for 7 days
_COOKIE_NAME = "wayly_anon_invoice"
_FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "inv1" / "fixtures" / "samburke_inv2_text.txt"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _anon_enabled() -> bool:
    """Kill switch (spec §8.1). Toggled by env, no deploy required."""
    return (os.environ.get("CONV1_ANON_INVOICE_ENABLED", "true") or "").strip().lower() not in ("0", "false", "off", "no")


def _daily_cap_aud() -> float:
    try:
        return float(os.environ.get("CONV1_ANON_DAILY_CAP_AUD", "50") or 50)
    except (TypeError, ValueError):
        return 50.0


def _cost_per_run_aud() -> float:
    try:
        return float(os.environ.get("CONV1_ANON_COST_PER_RUN_AUD", "0.02") or 0.02)
    except (TypeError, ValueError):
        return 0.02


def _char_ceiling() -> int:
    try:
        return int(os.environ.get("CONV1_ANON_MAX_CHARS", "40000") or 40000)
    except (TypeError, ValueError):
        return 40000


def _frontend_base() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL")
            or "https://wayly.com.au").rstrip("/")


def _aud(n) -> str:
    try:
        v = float(n)
        return f"${v:,.2f}"
    except (TypeError, ValueError):
        return "—"


class ResultEmailBody(BaseModel):
    email: EmailStr
    marketing_consent: bool = False


class FeedbackBody(BaseModel):
    helpful: Optional[bool] = None
    comment: Optional[str] = None
    may_quote: bool = False


def _ps(v: Any) -> PensionStatus:
    try:
        return PensionStatus(str(v))
    except Exception:
        return PensionStatus.unknown


def _yn(v: Any) -> YesNoUnknown:
    try:
        return YesNoUnknown(str(v))
    except Exception:
        return YesNoUnknown.unknown


def build_anon_invoice_router(
    *,
    db,
    user_dep: Callable,
    check_free_tool_usage: Callable,
    record_free_tool_usage_raw: Callable,
    client_ip: Callable,
    is_unlimited_ip: Callable,
    burst_check: Callable,
) -> APIRouter:
    router = APIRouter(tags=["conv1-anon-invoice"])

    _state = {"indexed": False}

    async def _ensure_indexes() -> None:
        if _state["indexed"]:
            return
        try:
            await db.anon_invoice_checks.create_index("token", unique=True)
            # TTL: delete the stored result 7 days after expiry stamp (spec §7.3/B8).
            await db.anon_invoice_checks.create_index("expire_at", expireAfterSeconds=0)
        except Exception as e:      # pragma: no cover - defensive
            logger.warning("anon_invoice index ensure failed: %s", e)
        _state["indexed"] = True

    async def _spend_today() -> float:
        day = _now().strftime("%Y-%m-%d")
        doc = await db.anon_inference_spend.find_one({"day": day}, {"_id": 0, "spend_aud": 1})
        return float((doc or {}).get("spend_aud") or 0.0)

    async def _record_spend() -> None:
        day = _now().strftime("%Y-%m-%d")
        await db.anon_inference_spend.update_one(
            {"day": day},
            {"$inc": {"runs": 1, "spend_aud": _cost_per_run_aud()}, "$set": {"updated_at": _now_iso()}},
            upsert=True,
        )

    def _load_sample_text() -> str:
        try:
            return _FIXTURE.read_text(encoding="utf-8")
        except Exception as e:      # pragma: no cover - defensive
            logger.warning("sample fixture load failed: %s", e)
            raise HTTPException(status_code=500, detail="The sample invoice is temporarily unavailable.")

    async def _run_engine(text: str, situation: SituationProfile) -> dict:
        """The EXACT signed-in sequence (routes/invoices.py), minus the
        user-specific PPC snapshot and supporting records. Same engine, same
        answer keys — verified by diffing this against the signed-in route."""
        payable_text = text or ""
        information_text = ""
        classification = classify_document(payable_text)
        if classification.shape == DocumentShape.statement:
            return {"_redirect": "statement-decoder", "document_shape": "statement"}
        if classification.shape == DocumentShape.combined:
            split = split_combined_document(payable_text)
            if split.succeeded:
                payable_text = split.payable_section
                information_text = split.information_section
                effective_shape = DocumentShape.combined
            else:
                effective_shape = DocumentShape.combined_unsplit
        else:
            effective_shape = classification.shape

        header = extract_invoice_header(payable_text)
        invoice_year = None
        try:
            if header.get("invoice_date"):
                invoice_year = int(header["invoice_date"][:4])
        except (ValueError, TypeError):
            pass
        lines = extract_line_items(payable_text, invoice_year=invoice_year)
        _p_sub, _p_gst, _p_total = extract_invoice_totals(payable_text)

        reconciliation = run_checks(
            lines=lines,
            situation=situation,
            document_shape=effective_shape,
            invoice_date=header.get("invoice_date"),
            period_end=header.get("period_end"),
            quarterly_budget=header.get("quarterly_budget"),
            ppc_snapshot=None,
            printed_total_payable=_p_total,
            supporting=None,
        ).to_dict()

        _sum_gross = reconciliation.get("invoice_total")
        reconciliation["invoice_subtotal"] = _p_sub if _p_sub is not None else _sum_gross
        reconciliation["invoice_gst"] = _p_gst
        if _p_total is not None:
            reconciliation["invoice_total"] = _p_total
        elif _p_sub is not None and _p_gst:
            reconciliation["invoice_total"] = round(_p_sub + _p_gst, 2)
        reconciliation["refund_total"] = _refund_total(
            reconciliation.get("findings") or [], reconciliation.get("invoice_total"),
        )
        reconciliation["summary_md"] = await generate_summary(
            reconciliation, header=header, situation=situation.to_dict(),
            session_id=f"anon-{uuid.uuid4().hex[:8]}",
        )
        return {
            "document_shape": effective_shape.value,
            "provider_name": header.get("provider_name"),
            "provider_abn": header.get("provider_abn"),
            "invoice_date": header.get("invoice_date"),
            "due_date": header.get("due_date"),
            "invoice_number": header.get("invoice_number"),
            "reconciliation": reconciliation,
        }

    @router.post("/public/invoice-check/run")
    async def run_anon_check(
        request: Request,
        response: Response,
        file: Optional[UploadFile] = File(None),
        text: Optional[str] = Form(None),
        example: bool = Form(False),
        pension_status: Optional[str] = Form(None),
        grandfathered: Optional[str] = Form(None),
        hardship: Optional[str] = Form(None),
        assessment_pending: Optional[str] = Form(None),
    ) -> dict:
        if not _anon_enabled():
            # Kill switch engaged → brochure fallback (spec §8.1 / rollback B).
            raise HTTPException(status_code=503, detail={
                "error": "anon_disabled",
                "message": "The instant check is paused right now. You can still start a free trial to check your invoice.",
            })

        await _ensure_indexes()
        ip = client_ip(request)
        unlimited = is_unlimited_ip(ip)

        # Per-IP burst protection (spec §8.2). Fail-open only inside burst_check.
        if not unlimited:
            burst_check(ip)

        situation = SituationProfile(
            pension_status=_ps(pension_status),
            grandfathered=_yn(grandfathered),
            hardship=_yn(hardship),
            assessment_pending=_yn(assessment_pending),
        )

        is_sample = bool(example)

        # Allowance (spec B7): one real run per device per 120 days. The sample
        # is free and never consumes the allowance. Record only AFTER success.
        if not is_sample and not unlimited:
            usage = await check_free_tool_usage(request, tool="INVOICE_CHECKER", user_id=None)
            if not usage["allowed"]:
                days = int(usage.get("days_until_next_use") or 0)
                raise HTTPException(status_code=429, detail={
                    "error": "cooldown_active",
                    "message": (
                        f"You've used your free invoice check. You can run another in "
                        f"{days} day{'' if days == 1 else 's'}, or start a 7-day free trial to check as many as you need."
                    ),
                    "days_until_next_use": days,
                    "reset_at": usage.get("reset_at"),
                    "window_days": 120,
                })

        # Global daily spend cap (spec §8.1). The sample never bills inference.
        if not is_sample:
            if (await _spend_today()) + _cost_per_run_aud() > _daily_cap_aud():
                raise HTTPException(status_code=503, detail={
                    "error": "capacity",
                    "message": "We've hit today's limit for instant checks. Please try again tomorrow, or start a free trial to check now.",
                })

        # Resolve the input text. The uploaded bytes / extracted text are used
        # only to produce the result and are never persisted (spec §7.3).
        if is_sample:
            doc_text = _load_sample_text()
        elif file is not None:
            from upload_security import secure_read_upload, PROFILE_STATEMENT, sanitize_for_prompt
            raw, safe_name, _kind = await secure_read_upload(file, allowed_profiles=PROFILE_STATEMENT)
            if not raw:
                raise HTTPException(status_code=400, detail="That file looks empty. Try another copy.")
            from document_extract import (
                extract_document, UnsupportedFormatError, FileTooLargeError,
                CorruptFileError, PasswordProtectedError,
            )
            try:
                doc_text, _im, _pc, _w = await extract_document(safe_name, raw)
            except UnsupportedFormatError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except FileTooLargeError as e:
                mb = e.limit_bytes // (1024 * 1024)
                raise HTTPException(status_code=413, detail=f"This file exceeds the {mb} MB limit. Try a smaller or compressed copy.")
            except PasswordProtectedError:
                raise HTTPException(status_code=400, detail="This PDF is password-protected. Remove the password and upload a new copy.")
            except CorruptFileError:
                raise HTTPException(status_code=400, detail="This file appears to be damaged or unreadable.")
            doc_text = sanitize_for_prompt(doc_text or "")
            del raw
        elif text and text.strip():
            doc_text = text
        else:
            raise HTTPException(status_code=400, detail="Add your invoice — upload a file, take a photo, or paste the text.")

        if not (doc_text or "").strip():
            raise HTTPException(status_code=400, detail="We couldn't read any text. Try a clearer photo or paste the text directly.")

        # Token ceiling per run (spec §8.1).
        doc_text = doc_text[: _char_ceiling()]

        # Content guard: reject off-topic / wrong-tool uploads before inference.
        guard = classify_content("invoice-checker", doc_text)
        if guard.get("decision") not in ("accept", None):
            return {"upload_guard": guard, "document_shape": None}

        out = await _run_engine(doc_text, situation)
        if out.get("_redirect") == "statement-decoder":
            return {"document_shape": "statement", "redirect_to": "statement-decoder"}

        # Record allowance + spend ONLY on success, so a failed/empty run never
        # burns the visitor's one free check (mirrors the Statement Decoder).
        if not is_sample and not unlimited:
            try:
                await record_free_tool_usage_raw(
                    tool="INVOICE_CHECKER", user_id=None,
                    fingerprint=None, ip=ip, result_id=None,
                )
            except Exception as e:      # pragma: no cover - defensive
                logger.warning("anon invoice usage record failed: %s", e)
            await _record_spend()

        # Persist ONLY the rendered result against an opaque token (spec B8).
        token = uuid.uuid4().hex
        expire_at = _now() + timedelta(days=_SESSION_DAYS)
        record = {
            "token": token,
            "is_sample": is_sample,
            "document_shape": out.get("document_shape"),
            "provider_name": out.get("provider_name"),
            "provider_abn": out.get("provider_abn"),
            "invoice_date": out.get("invoice_date"),
            "due_date": out.get("due_date"),
            "invoice_number": out.get("invoice_number"),
            "reconciliation": out.get("reconciliation"),
            "situation": situation.to_dict(),
            "created_at": _now_iso(),
            "expire_at": expire_at,
        }
        await db.anon_invoice_checks.insert_one(dict(record))

        # First-party cookie so a return visit finds the result (spec B8). The
        # token is also returned so the C1 "email me this" link can carry it.
        response.set_cookie(
            key=_COOKIE_NAME, value=token, max_age=_SESSION_DAYS * 86400,
            httponly=True, samesite="lax", secure=True, path="/",
        )

        record.pop("expire_at", None)
        record["expires_at"] = expire_at.isoformat()
        return record

    async def _fetch_result(token: str) -> dict:
        doc = await db.anon_invoice_checks.find_one({"token": token}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="This result has expired or could not be found.")
        exp = doc.get("expire_at")
        if isinstance(exp, datetime):
            exp_aware = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            if exp_aware < _now():
                raise HTTPException(status_code=404, detail="This result has expired.")
            doc["expires_at"] = exp_aware.isoformat()
        doc.pop("expire_at", None)
        return doc

    @router.get("/public/invoice-check/session")
    async def get_anon_session(request: Request) -> dict:
        """Restore the in-session result from the first-party cookie (spec B8)
        so a visitor who closed the tab finds their result still there."""
        token = request.cookies.get(_COOKIE_NAME)
        if not token:
            raise HTTPException(status_code=404, detail="No in-progress check.")
        return await _fetch_result(token)

    @router.get("/public/invoice-check/{token}")
    async def get_anon_check(token: str) -> dict:
        return await _fetch_result(token)

    @router.post("/public/invoice-check/{token}/email")
    async def email_anon_result(token: str, body: ResultEmailBody) -> dict:
        """CONV-1 C1: email the full result to the visitor. The email is
        transactional (the result they asked for), so it is sent whether or not
        the SEPARATE, unticked marketing box (C4) was ticked. Spam Act 2003: a
        working unsubscribe + Wayly Pty Ltd ABN appear in every email."""
        doc = await _fetch_result(token)
        rec = doc.get("reconciliation") or {}
        findings = rec.get("findings") or []
        billed = _aud(rec.get("invoice_total"))
        refund = _aud(rec.get("refund_total"))
        provider = doc.get("provider_name") or "your provider"
        back_link = f"{_frontend_base()}/ai-tools/invoice-checker?r={token}"

        inner = f"""
          <h1 style="font-size:22px;margin:0 0 8px;color:#0B2A3C;">Your invoice check</h1>
          <p style="margin:0 0 16px;color:#44565f;">Here's the result for the invoice from <strong>{_esc(provider)}</strong>.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr>
              <td style="padding:12px 16px;background:#0B2A3C;border-radius:10px 0 0 10px;color:#fff;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;opacity:.8;">Amount billed</div>
                <div style="font-size:20px;">{_esc(billed)}</div>
              </td>
              <td style="padding:12px 16px;background:#0F4D52;color:#F0B267;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;opacity:.9;color:#fff;">Potential refund</div>
                <div style="font-size:20px;font-weight:700;">{_esc(refund)}</div>
              </td>
              <td style="padding:12px 16px;background:#0B2A3C;border-radius:0 10px 10px 0;color:#fff;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;opacity:.8;">Issues to raise</div>
                <div style="font-size:20px;">{len(findings)}</div>
              </td>
            </tr>
          </table>
          <a href="{_esc(back_link)}" style="display:inline-block;background:#0B2A3C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;">View the full result</a>
          <p style="margin:18px 0 0;color:#44565f;font-size:13px;">Your result stays available at the link above for 7 days. Create a free Wayly account to keep it for good and draft the email to your provider.</p>
        """

        unsub_token = make_email_token("anon", str(body.email), "prefs")
        headers = marketing_unsub_headers(_frontend_base(), unsub_token)
        unsub_url = f"{_frontend_base()}/api/email/unsubscribe?token={unsub_token}"
        footer = (
            f"Wayly Pty Ltd — see our ABN in the site footer at {_frontend_base()}. "
            f"You received this because you asked us to email you this invoice result. "
            f"Unsubscribe: {unsub_url}"
        )
        html = wrap_email_html(
            title="Your Wayly invoice check", inner_html=inner,
            eyebrow="Invoice Checker", footer_note=footer,
        )
        text = (
            f"Your Wayly invoice check for {provider}\n\n"
            f"Amount billed: {billed}\nPotential refund: {refund}\nIssues to raise: {len(findings)}\n\n"
            f"View the full result (available 7 days): {back_link}\n\n"
            f"Wayly Pty Ltd (ABN shown in the site footer). "
            f"You asked us to email this result. Unsubscribe: {unsub_url}\n"
        )
        send_res = await deliver(
            to=str(body.email), subject="Your Wayly invoice check",
            html=html, text=text, headers=headers,
            idempotency_key=f"anon-inv-{token}-{email_hash(str(body.email))[:12]}",
        )

        # C4: store the capture + consent. marketing_consent defaults to false
        # when the box is unticked, and the result is sent regardless.
        now = _now_iso()
        await db.anon_captures.insert_one({
            "id": uuid.uuid4().hex,
            "email_hash": email_hash(str(body.email)),
            "token": token,
            "marketing_consent": bool(body.marketing_consent),
            "consent_version": MARKETING_CONSENT_VERSION,
            "source": "anon_invoice_result",
            "created_at": now,
        })
        if body.marketing_consent:
            await db.marketing_consent_events.insert_one({
                "id": uuid.uuid4().hex,
                "user_id": None,
                "email_hash": email_hash(str(body.email)),
                "status": "opted_in",
                "source": "anon_invoice_result",
                "version": MARKETING_CONSENT_VERSION,
                "created_at": now,
            })
        return {"ok": bool(send_res.get("ok", True)), "emailed": True}

    @router.post("/public/invoice-check/{token}/feedback")
    async def anon_feedback(token: str, body: FeedbackBody) -> dict:
        """CONV-1 H4: an optional 'Did this help?' at the foot of the result,
        plus permission-to-quote. Nothing is gated on answering it."""
        await _fetch_result(token)
        await db.anon_feedback.insert_one({
            "id": uuid.uuid4().hex,
            "token": token,
            "helpful": body.helpful,
            "comment": (body.comment or "")[:2000],
            "may_quote": bool(body.may_quote),
            "created_at": _now_iso(),
        })
        return {"ok": True}

    return router
