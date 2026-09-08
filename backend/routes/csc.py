"""CSC-1 v1 HTTP surface.

Endpoints
---------
POST /api/public/csc/run             , score a completed self-check (public,
                                          paid-plan gated via injected dep).
                                          Also stores the payload when the
                                          caller is authenticated.
GET  /api/public/csc/iat-domains      , "What the assessor will ask" data.
POST /api/public/csc/pdf              , server-rendered A4 PDF from a payload.
POST /api/public/csc/email            , email the PDF + summary to the caller.
GET  /api/public/csc/run/{run_id}     , fetch a stored run (auth'd users
                                          reading their own, or public read
                                          for tools that carry the id via
                                          querystring on Branch-A deep links).

Wire it up in server.py with:

    from routes.csc import build_csc_router
    api.include_router(build_csc_router(
        db=db,
        require_paid_plan=_require_paid_plan,
        user_dep_optional=_user_from_request_optional,
    ))
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from lib.csc.registry import load_iat_domains
from lib.csc.schema import CSCPayload, CSCRunRequest
from lib.csc.scoring import score

logger = logging.getLogger("wayly.csc.routes")

# Plain-language, non-clinical descriptors for each Support at Home
# classification level. Kept short and jargon-free so caregivers can quickly
# see what each level of support looks like in everyday terms.
_BAND_DESCRIPTORS: dict = {
    1: {"headline": "A little help", "plain": "Mostly independent, with occasional help around the home or with errands."},
    2: {"headline": "Some regular help", "plain": "Independent most of the time, but needs regular help with a few everyday tasks."},
    3: {"headline": "Steady daily help", "plain": "Needs help most days with things like washing, dressing, meals or getting around."},
    4: {"headline": "Substantial help", "plain": "Needs hands-on help every day across many everyday tasks, and some support to stay safe."},
    5: {"headline": "High daily support", "plain": "Needs a lot of help each day, often with early memory changes or a higher chance of falls."},
    6: {"headline": "Very high support", "plain": "Needs help with almost everything, close supervision, and regular clinical care."},
    7: {"headline": "Intensive support", "plain": "Needs intensive help all day, usually with significant memory change or complex health needs."},
    8: {"headline": "Highest level of support", "plain": "Needs the highest level of care, with round-the-clock help and complex clinical needs."},
}



class CSCPdfRequest(BaseModel):
    payload: dict
    person_name: Optional[str] = Field(default=None, max_length=120)


class CSCEmailRequest(BaseModel):
    payload: dict
    to: EmailStr
    person_name: Optional[str] = Field(default=None, max_length=120)


def build_csc_router(
    *,
    db,
    require_paid_plan: Callable[..., Any],
    user_dep_optional: Optional[Callable] = None,
) -> APIRouter:
    """``require_paid_plan`` is an async ``(request, response, feature_label)``.
    ``user_dep_optional`` is used to opportunistically store the run against
    the calling user if they're signed in."""
    router = APIRouter(tags=["csc"])

    async def _current_user(request: Request) -> Optional[dict]:
        if user_dep_optional is None:
            return None
        try:
            return await user_dep_optional(request)
        except Exception:
            return None

    async def _store_run(user: Optional[dict], payload: CSCPayload) -> None:
        if not user or not user.get("id"):
            return
        try:
            await db.csc_runs.update_one(
                {"csc_run_id": payload.csc_run_id},
                {"$set": {
                    "csc_run_id": payload.csc_run_id,
                    "user_id": user["id"],
                    "account_id": user.get("account_id"),
                    "persona": payload.persona,
                    "payload": payload.model_dump(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        except Exception as e:
            logger.warning("csc_runs upsert failed: %s", e)

    # --- 1. Score --------------------------------------------------------

    @router.post("/public/csc/run")
    async def csc_run(body: CSCRunRequest, request: Request, response: Response):
        await require_paid_plan(request, response, "Classification Self-Check")
        payload = score(body)
        user = await _current_user(request)
        await _store_run(user, payload)
        return payload.model_dump()

    # --- 2. IAT domains --------------------------------------------------

    @router.get("/public/csc/iat-domains")
    async def csc_iat_domains():
        data = load_iat_domains()
        return {
            "domains": data["domains"],
            "closing_copy": data["closing_copy"],
            "schema_version": data["schema_version"],
        }

    # --- 2b. Classification bands (all 8) --------------------------------
    @router.get("/public/csc/bands")
    async def csc_bands():
        """All 8 Support at Home classifications with authoritative annual +
        quarterly budgets and a short, plain-language descriptor. Powers the
        comparison visual on the result screen."""
        from lib.csc.scoring import _budget_lookup, _quarterly_from_annual
        bands = []
        source_version = "index-1"
        for n in range(1, 9):
            annual = _budget_lookup(n)
            quarterly = _quarterly_from_annual(annual)
            desc = _BAND_DESCRIPTORS.get(n, {})
            bands.append({
                "classification": n,
                "annual_budget": annual,
                "quarterly_budget": quarterly,
                "headline": desc.get("headline", f"Classification {n}"),
                "plain": desc.get("plain", ""),
            })
        return {"bands": bands, "budget_source_version": source_version}

    # --- 3. PDF ----------------------------------------------------------

    @router.post("/public/csc/pdf")
    async def csc_pdf(body: CSCPdfRequest, request: Request, response: Response):
        await require_paid_plan(request, response, "Classification Self-Check")
        try:
            from services.csc_pdf import render_csc_pdf
        except Exception as e:
            logger.exception("csc_pdf renderer import failed: %s", e)
            raise HTTPException(status_code=503, detail="PDF renderer unavailable")
        persona = (body.payload.get("persona") or "caregiver").title()
        try:
            pdf_bytes = render_csc_pdf(
                payload=body.payload,
                person_name=body.person_name,
                persona_label=persona,
            )
        except Exception as e:
            logger.exception("csc_pdf render error: %s", e)
            raise HTTPException(status_code=500, detail="PDF render failed")
        safe = (body.person_name or "wayly").replace(" ", "_").replace("/", "_")[:40] or "wayly"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{safe}_classification_self_check.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    # --- 4. Email --------------------------------------------------------

    @router.post("/public/csc/email")
    async def csc_email(body: CSCEmailRequest, request: Request, response: Response):
        await require_paid_plan(request, response, "Classification Self-Check")
        try:
            from services.csc_pdf import render_csc_pdf
            import email_service  # noqa: F401 (module)
            from email_service import _send, _sender  # type: ignore
        except Exception as e:
            logger.exception("csc email deps import failed: %s", e)
            raise HTTPException(status_code=503, detail="Email unavailable")
        persona = (body.payload.get("persona") or "caregiver").title()
        pdf_bytes = render_csc_pdf(
            payload=body.payload, person_name=body.person_name, persona_label=persona,
        )
        c = body.payload.get("classification", {})
        primary = c.get("primary", "?")
        range_lo, range_hi = c.get("range_low"), c.get("range_high")
        range_txt = (
            f"Classification {primary}" if range_lo == range_hi
            else f"Classification {range_lo} to {range_hi}"
        )
        html = f"""<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;background:#EAF4FB;padding:24px;color:#0E2A47">
<table align="center" style="width:600px;max-width:100%;background:#fff;border-radius:12px;border:1px solid #CFE0F0;overflow:hidden">
<tr><td style="padding:20px 28px;background:#0E4D52;color:#fff">
  <div style="font-family:Georgia,serif;font-size:22px">Wayly</div>
  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;margin-top:4px">Classification Self-Check</div>
</td></tr>
<tr><td style="padding:24px 28px">
  <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0E4D52">Your result: {range_txt}</h2>
  <p style="font-size:14px;line-height:1.6;color:#0E2A47">Confidence: <b>{c.get('confidence', 'unknown').title()}</b></p>
  <p style="font-size:14px;line-height:1.6;color:#0E2A47">
    Indicative budget range: <b>${c.get('annual_budget_low', 0):,}</b> to <b>${c.get('annual_budget_high', 0):,}</b> per year.
  </p>
  <p style="font-size:14px;line-height:1.6;color:#0E2A47">
    Your full result, including the top drivers and the assessor-domain checklist, is attached as a PDF.
  </p>
  <hr style="border:0;border-top:1px solid #CFE0F0;margin:20px 0" />
  <p style="margin:0;font-size:13px;color:#555">
    This is informational only. Only the My Aged Care Integrated Assessment Tool (IAT) determines actual classification.
  </p>
</td></tr>
<tr><td style="padding:16px 28px;background:#F0EBE0;color:#888;font-size:11px">
  Sent because you requested it from Wayly's Classification Self-Check.
  Crisis support: Lifeline 13 11 14, 1800ELDERHelp 1800 353 374.
</td></tr>
</table>
</body></html>"""
        import base64 as _b64
        result = await _send({
            "from": _sender(),
            "to": [str(body.to)],
            "subject": f"Your Wayly Classification Self-Check result ({range_txt})",
            "html": html,
            "attachments": [{
                "filename": "classification_self_check.pdf",
                "content": _b64.b64encode(pdf_bytes).decode("ascii"),
            }],
        })
        if not result.get("ok"):
            raise HTTPException(status_code=502, detail=f"Email failed: {result.get('reason')}")
        return {"ok": True, "id": result.get("id"), "mocked": bool(result.get("mocked"))}

    # --- 5. Fetch stored run --------------------------------------------

    @router.get("/public/csc/run/{run_id}")
    async def csc_get_run(run_id: str, request: Request):
        """Return a stored run. Signed-in users can read their own runs.
        Unauthenticated callers can read runs deep-linked from Branch A
        (e.g. LF-1 receiving the ``?csc_run_id=<uuid>``). This is safe
        because the run id is a UUIDv4 secret."""
        doc = await db.csc_runs.find_one({"csc_run_id": run_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Run not found")
        return doc.get("payload") or {}

    return router
