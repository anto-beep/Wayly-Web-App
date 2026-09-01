"""CE-2 v1.1 HTTP routes.

Exposes the calculation engine at ``POST /api/ce2/calculate`` and returns a
strict Pydantic-serialised copy of :class:`CE2Output`. This is a Phase 1
endpoint, feature-flagged so that Phase 2 UI can start integrating while the
CE-1 endpoint (``/api/public/contribution-estimator``) remains live for
backward compatibility. CE-1 is not removed until Workstream K ships and the
switchover date is chosen.

Auth:
  * Anonymous requests are allowed, CE-2 replaces the free CE-1 tool that
    was already accessible to non-logged-in users.
  * Rate limiting is delegated to the shared middleware; see server.py.

Contract:

    POST /api/ce2/calculate
    Body: JSON matching :class:`services.ce2_engine.CE2Input` (with
          service_mix as an object, effective_date as ISO-8601 string).
    Response 200: JSON with the CE2Output fields.
    Response 400: { detail: "Service mix must sum to 100%, got X" } etc.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from services.ce2_engine import (
    CE2Input,
    ServiceMix,
    calculate,
    build_input,
    DEFAULT_SERVICE_MIX,
)
from services.ce2_pdf import render_ce2_pdf


class CE2ServiceMixIn(BaseModel):
    clinical: float = Field(default=DEFAULT_SERVICE_MIX["clinical"], ge=0, le=100)
    independence: float = Field(default=DEFAULT_SERVICE_MIX["independence"], ge=0, le=100)
    everyday: float = Field(default=DEFAULT_SERVICE_MIX["everyday"], ge=0, le=100)


class CE2CalculateBody(BaseModel):
    """HTTP body contract for POST /api/ce2/calculate."""
    assessment_status: str = Field(pattern=r"^(have_classification|awaiting_classification|not_assessed)$")
    pension_status: str = Field(pattern=r"^(full_pension|part_pension|cshc|self_funded)$")
    relationship: str = Field(pattern=r"^(single|couple)$")
    homeowner: bool
    entry_path: str = Field(pattern=r"^(not_assessed|hcp_pre_sep_2024|npq_pre_sep_2024|hcp_post_sep_pre_nov_2025|post_nov_2025)$")
    effective_date: Optional[str] = None
    person_name: Optional[str] = None
    income_excluding_pension: Optional[float] = Field(default=None, ge=0)
    financial_assets: Optional[float] = Field(default=None, ge=0)
    partner_income: Optional[float] = Field(default=None, ge=0)
    partner_assets: Optional[float] = Field(default=None, ge=0)
    hcp_paid_fees: Optional[bool] = None
    classification: Optional[str] = None
    hcp_level_when_grandfathered: Optional[int] = Field(default=None, ge=1, le=4)
    service_mix: Optional[CE2ServiceMixIn] = None

    @field_validator("classification")
    @classmethod
    def _classification_pattern(cls, v):
        if v is None:
            return v
        import re
        if not re.match(r"^(class_[1-8]|transitional_[1-4]|rcp|eolp)$", v):
            raise ValueError(f"invalid classification: {v!r}")
        return v


def build_ce2_router() -> APIRouter:
    router = APIRouter(prefix="/ce2", tags=["ce2"])

    @router.post("/calculate")
    async def ce2_calculate(body: CE2CalculateBody):
        payload = body.model_dump()
        if payload.get("service_mix") is None:
            payload["service_mix"] = dict(DEFAULT_SERVICE_MIX)
        try:
            input_data = build_input(payload)
            output = calculate(input_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        # Convert dataclass tree to plain dict via asdict (already done in
        # CE2Output.to_dict), but also expose person_name for downstream.
        d = output.to_dict()
        d["person_name"] = body.person_name
        return d

    @router.get("/constants")
    async def ce2_constants():
        """Returns the current CE-2 constants for the input form to reference.

        The UI form uses these to show "$5,668 income-free area" etc. as
        helper text alongside the input fields. Reading from a single
        endpoint means the UI never hardcodes dollar values.
        """
        from monetary_constants import load_registry
        r = load_registry()
        keys = [
            "means_test.income_free_area.individual",
            "means_test.income_free_area.couple_member",
            "means_test.assets_free_area.individual_homeowner",
            "means_test.assets_free_area.individual_non_homeowner",
            "means_test.assets_free_area.couple_homeowner",
            "means_test.assets_free_area.couple_non_homeowner",
            "means_test.income_limit.individual",
            "means_test.income_limit.couple_separated_by_illness",
            "means_test.income_taper_pct",
            "means_test.asset_taper_pct",
            "lifetime_cap.standard",
            "lifetime_cap.no_worse_off",
            "lifetime_cap.hcp_transitioned",
            "ce2.personal_care_sub_share_of_independence",
        ]
        constants: Dict[str, Any] = {}
        for k in keys:
            e = r.get_entry(k)
            if e is None:
                continue
            constants[k] = {
                "value": float(e.value) if isinstance(e.value, (int, float)) else str(e.value),
                "unit": e.unit,
                "source_url": e.source_url,
                "source_citation": e.source_citation,
                "effective_from": e.effective_from.isoformat() if e.effective_from else None,
            }
        return {"constants": constants}

    @router.post("/pdf")
    async def ce2_pdf(body: CE2CalculateBody):
        """Render the CE-2 result as a downloadable A4 PDF.

        Runs the same calculation as ``/calculate``, then hands the result
        dict to :func:`services.ce2_pdf.render_ce2_pdf`. Returns the PDF as
        an ``application/pdf`` blob with a ``Content-Disposition: attachment``
        header naming the file after the participant.
        """
        payload = body.model_dump()
        if payload.get("service_mix") is None:
            payload["service_mix"] = dict(DEFAULT_SERVICE_MIX)
        try:
            input_data = build_input(payload)
            output = calculate(input_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        result_dict = output.to_dict()
        result_dict["person_name"] = body.person_name
        pdf_bytes = render_ce2_pdf(result=result_dict, person_name=body.person_name)
        safe_name = (body.person_name or "wayly").replace(" ", "_").replace("/", "_")[:40] or "wayly"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}_contribution_estimate.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    return router
