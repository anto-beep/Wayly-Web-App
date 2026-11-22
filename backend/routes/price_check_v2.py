"""PPC-1 v2 route module.

FastAPI router that exposes the deterministic PPC v2 surface:

* ``POST /api/public/price-check-v2``      , compare + guards + share (unauth-safe).
* ``GET  /api/ppc/snapshots``               , list available DoH snapshots (WS7).
* ``GET  /api/ppc/services``                , service dropdown (v2 shape).
* ``POST /api/ppc/checks``                  , save a check (auth).
* ``GET  /api/ppc/checks``                  , list saved checks (auth).
* ``GET  /api/ppc/checks/history``          , chronological log for
  a service + provider (auth). Returns rate-change count + time series.
* ``DELETE /api/ppc/checks/{check_id}``     , delete a single row (auth).
* ``DELETE /api/ppc/checks/provider``       , bulk delete all checks
  for a service + provider (auth).
* ``POST /api/ppc/email-draft``             , email-the-provider text.

The legacy ``/public/price-check`` endpoint in ``server.py`` is retained
verbatim for callers that have not yet migrated.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from lib import ppc_v2

logger = logging.getLogger("wayly.ppc_v2")

_ISO = lambda: _dt.datetime.now(_dt.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Request / response payloads.
# ---------------------------------------------------------------------------


class PublicPriceCheckV2Body(BaseModel):
    service: str
    rate: float = Field(gt=0)
    provider: str | None = None
    snapshot_id: str | None = None
    pension_status: str | None = None
    is_grandfathered: bool = False
    after_hours_toggle: bool = False
    check_date: str | None = None            # ISO YYYY-MM-DD (§3.8)
    unit_override: str | None = None         # "trip" | "kilometre" for transport (§4.5 guard 6)
    user_ind_rate_pct: float | None = None
    user_ev_rate_pct: float | None = None
    source_statement_id: str | None = None   # WS4 tap-through from decoder


class SaveCheckBody(BaseModel):
    service: str
    rate: float = Field(gt=0)
    provider: str | None = None
    snapshot_id: str | None = None
    unit: str | None = None
    position: str | None = None
    range_lower: float | None = None
    range_upper: float | None = None
    median: float | None = None
    stream: str | None = None
    source_date: str | None = None
    your_share: float | None = None
    pension_status: str | None = None
    is_grandfathered: bool = False
    source_statement_id: str | None = None
    is_after_hours: bool = False
    merge_provider_id: str | None = None     # explicit resolution when
                                             # WS12 fuzzy-match prompt returns
                                             # "yes, merge with X"


class EmailDraftBody(BaseModel):
    service: str
    rate: float
    unit: str | None = None
    provider: str | None = None
    lower: float | None = None
    upper: float | None = None
    source_date: str | None = None
    include_increase_paragraph: bool = False


class CEStateBody(BaseModel):
    """Contribution Estimator state persisted for PPC read-through (§3.3)."""
    pension_status: str
    is_grandfathered: bool = False
    classification: int | None = None
    independence_rate_pct: float | None = None
    everyday_rate_pct: float | None = None


class PdfExportBody(BaseModel):
    """PPC-1 v2 §WS8, one-page PDF export payload."""
    service: str
    provider: str | None = None
    charged: float
    unit: str | None = None
    position: str
    plain_language: str
    distance_summary: str | None = None
    lower: float | None = None
    upper: float | None = None
    median: float | None = None
    stream: str | None = None
    your_share_amount: float | None = None
    your_share_explanation: str | None = None
    source_date: str | None = None
    doh_caveat: str | None = None
    notes: list[str] = []


class AnalyticsEventBody(BaseModel):
    """Server-side mirror for the 11 PPC events (WS10). PostHog fires
    directly from the frontend; this write is the audit trail."""
    event_name: str
    props: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Deterministic response builder, shared by public + saved-check callers.
# ---------------------------------------------------------------------------


def _parse_date(iso: str | None) -> _dt.date | None:
    if not iso:
        return None
    try:
        return _dt.date.fromisoformat(iso[:10])
    except Exception:
        return None


def _build_v2_response(body: PublicPriceCheckV2Body) -> dict:
    # Non-checkable transport per-km handling (§4.5 guard 6).
    service = body.service
    if service == "Transport" and body.unit_override == "kilometre":
        service = "Transport (per kilometre)"

    comp = ppc_v2.compare_rate(service, body.rate, body.snapshot_id)

    guard = ppc_v2.run_quality_guards(
        service=service,
        rate=body.rate,
        unit=comp.unit,
        comp=comp,
        after_hours_toggle=body.after_hours_toggle,
    )

    share = ppc_v2.compute_your_share(
        comp=comp,
        pension_status=body.pension_status,
        is_grandfathered=body.is_grandfathered,
        check_date=_parse_date(body.check_date),
        user_ind_rate_pct=body.user_ind_rate_pct,
        user_ev_rate_pct=body.user_ev_rate_pct,
    )

    # Convert share (which is expressed as a rate decimal or absolute figure
    # from ppc_v2) into a per-unit AUD amount using the charged rate.
    your_share = None
    if share.get("mode") == "exact":
        rate_pct = share.get("rate_pct")
        if rate_pct is not None:
            your_share = ppc_v2.share_from_rate(body.rate, rate_pct / 100)
    elif share.get("mode") == "clinical":
        your_share = 0.0

    band = None
    if share.get("mode") == "band":
        # share_low/share_high in the module are computed against comp.median
        # rather than the entered rate. Recompute using the entered rate for
        # a per-unit-share figure that matches the user's actual charge.
        # Independence band 5%-50%, Everyday Living 17.5%-80%.
        stream = comp.stream
        band_map = {
            "Independence": (0.05, 0.50),
            "Everyday Living": (0.175, 0.80),
        }
        b = band_map.get(stream)
        if b:
            band = {
                "share_low": round(body.rate * b[0], 2),
                "share_high": round(body.rate * b[1], 2),
            }

    # §3.8 personal care transitional notice (before 1 Oct 2026 only).
    personal_care_note = None
    check_date = _parse_date(body.check_date) or _dt.date.today()
    if service == "Personal care" and check_date < ppc_v2.personal_care_shift_date():
        personal_care_note = (
            "From 1 October 2026, personal care becomes a clinical support with no "
            "participant contribution. Your share will drop to $0 per hour on that date."
        )

    # After-hours relaxation note (§4.5 guard 4 continued).
    after_hours_note = None
    if body.after_hours_toggle and service in ppc_v2.AFTER_HOURS_SERVICES:
        after_hours_note = (
            "DoH indicative ranges are for standard business hours. There is no "
            "published after-hours range."
        )

    # Nursing consumables note.
    nursing_note = None
    if comp.stream == "Clinical" and (comp.notes or "").lower().find("nursing consumables") != -1:
        nursing_note = comp.notes

    unit_word = ppc_v2.unit_word(comp.unit)

    return {
        "service": service,
        "charged": body.rate,
        "median": comp.median,
        "lower": comp.range_lower,
        "upper": comp.range_upper,
        "unit": comp.unit,
        "unit_word": unit_word,
        "stream": comp.stream,
        "position": comp.position,
        "direction": comp.direction,
        "distance_from_edge": comp.distance_from_edge,
        "distance_from_median": comp.distance_from_median,
        "plain_language": comp.plain_language,
        "distance_summary": ppc_v2.distance_summary(comp),
        "doh_caveat": comp.doh_caveat,
        "notes": comp.notes,
        "source_date": comp.source_date,
        "source_snapshot_id": comp.source_snapshot_id,
        "your_share": {
            "mode": share.get("mode"),
            "amount": your_share,
            "band": band,
            "explanation": share.get("explanation"),
            "rate_pct": share.get("rate_pct"),
        },
        "quality_guard": None if guard is None else {
            "guard_type": guard.guard_type,
            "prompt": guard.prompt,
            "allow_continue": guard.allow_continue,
            "after_hours_toggle_available": guard.after_hours_toggle_available,
        },
        "personal_care_transitional_note": personal_care_note,
        "after_hours_note": after_hours_note,
        "nursing_consumables_note": nursing_note,
        "how_this_works_bullets": ppc_v2.HOW_THIS_WORKS_BULLETS,
        "cap_deferral_note": ppc_v2.CAP_DEFERRAL_NOTE,
    }


# ---------------------------------------------------------------------------
# Router construction. Late-bound dependencies so we can share
# `get_current_user_id` + `db` from server.py without a circular import.
# ---------------------------------------------------------------------------


def build_ppc_v2_router(db, get_current_user_id, get_current_user_id_optional, require_paid_plan):
    """Return an APIRouter with all PPC-1 v2 routes bound to the given DB
    handle + auth deps."""

    r = APIRouter(tags=["ppc-v2"])

    # ---------- Snapshot / service dictionary (unauth) ----------

    @r.get("/ppc/snapshots")
    async def list_snapshots():
        snaps = ppc_v2.list_snapshots()
        return {
            "snapshots": snaps,
            "default_snapshot_id": ppc_v2.get_default_snapshot_id(),
        }

    @r.get("/ppc/services")
    async def list_services(snapshot_id: str | None = Query(default=None)):
        rows = ppc_v2.list_services(snapshot_id)
        return {
            "snapshot_id": snapshot_id or ppc_v2.get_default_snapshot_id(),
            "services": [
                {
                    "service": r_["service"],
                    "service_code": r_["service_code"],
                    "stream": r_.get("stream"),
                    "unit": r_.get("unit"),
                    "available": r_.get("available"),
                    "checkable": r_.get("checkable"),
                    "notes": r_.get("notes"),
                }
                for r_ in rows
            ],
        }

    # ---------- Public price check ----------

    @r.post("/public/price-check-v2")
    async def public_price_check_v2(body: PublicPriceCheckV2Body, request: Request, response: Response):
        await require_paid_plan(request, response, "Provider Price Checker")
        return _build_v2_response(body)

    # ---------- Save + history (auth) ----------

    async def _resolve_provider_for_save(
        user_id: str,
        entered_provider: str | None,
        service: str,
        merge_provider_id: str | None,
    ) -> tuple[str | None, str | None, list[dict]]:
        """Return (display_name, normalised_name, fuzzy_match_prompts).

        If ``merge_provider_id`` is present, use the display name attached to
        that saved check (silent merge). Otherwise, compute the normalised
        name and check the user's history for close matches; when at least
        one is found within edit distance 3, return the prompt payload so the
        UI can ask the user to merge / keep separate.
        """
        display = (entered_provider or "").strip() or None
        normalised = ppc_v2.normalise_provider_name(display) if display else None

        if merge_provider_id:
            row = await db.ppc_saved_checks.find_one(
                {"user_id": user_id, "id": merge_provider_id},
                {"_id": 0, "provider_display_name": 1, "provider_normalised_name": 1},
            )
            if row and row.get("provider_display_name"):
                return row["provider_display_name"], row.get("provider_normalised_name"), []

        # Fuzzy match against the user's own history for this service.
        prompts: list[dict] = []
        if normalised:
            cursor = db.ppc_saved_checks.aggregate([
                {"$match": {"user_id": user_id, "service": service}},
                {"$group": {
                    "_id": "$provider_normalised_name",
                    "display_name": {"$first": "$provider_display_name"},
                    "last_check_id": {"$last": "$id"},
                }},
            ])
            candidates = []
            async for row in cursor:
                candidates.append({
                    "normalised_name": row.get("_id"),
                    "display_name": row.get("display_name"),
                    "last_check_id": row.get("last_check_id"),
                })
            match = ppc_v2.fuzzy_match_provider(display or "", candidates, max_distance=3)
            if match and match.get("normalised_name") != normalised:
                prompts.append({
                    "guard_type": "provider_fuzzy_match",
                    "entered_display_name": display,
                    "suggested_display_name": match.get("display_name"),
                    "suggested_normalised_name": match.get("normalised_name"),
                    "suggested_last_check_id": match.get("last_check_id"),
                })

        return display, normalised, prompts

    @r.post("/ppc/checks")
    async def save_check(
        body: SaveCheckBody,
        user_id: str = Depends(get_current_user_id),
    ):
        # WS12 fuzzy match before writing.
        display_name, normalised_name, prompts = await _resolve_provider_for_save(
            user_id, body.provider, body.service, body.merge_provider_id
        )
        if prompts and not body.merge_provider_id:
            return {
                "saved": False,
                "prompts": prompts,
            }

        check_id = secrets.token_urlsafe(12)
        doc = {
            "id": check_id,
            "user_id": user_id,
            "service": body.service,
            "rate": float(body.rate),
            "unit": body.unit,
            "provider_display_name": display_name,
            "provider_normalised_name": normalised_name,
            "snapshot_id": body.snapshot_id,
            "position": body.position,
            "range_lower": body.range_lower,
            "range_upper": body.range_upper,
            "median": body.median,
            "stream": body.stream,
            "source_date": body.source_date,
            "your_share": body.your_share,
            "pension_status": body.pension_status,
            "is_grandfathered": bool(body.is_grandfathered),
            "source_statement_id": body.source_statement_id,
            "is_after_hours": bool(body.is_after_hours),
            "created_at": _ISO(),
        }
        await db.ppc_saved_checks.insert_one(doc)

        # WS10 provider aggregate write. One-way hashed user identifier so
        # WS13 erasure remains possible without leaking identity.
        if normalised_name:
            import hashlib
            aggregate_doc = {
                "id": secrets.token_urlsafe(12),
                "hashed_user_id": hashlib.sha256(user_id.encode("utf-8")).hexdigest(),
                "check_id": check_id,
                "provider_normalised_name": normalised_name,
                "provider_display_name_seen": display_name,
                "service": body.service,
                "rate": float(body.rate),
                "unit": body.unit,
                "position": body.position,
                "stream": body.stream,
                "snapshot_id": body.snapshot_id,
                "entered_at": _ISO(),
            }
            await db.ppc_provider_aggregate.insert_one(aggregate_doc)

        # Fire an audit event.
        try:
            await db.ppc_events.insert_one({
                "id": secrets.token_urlsafe(12),
                "user_id": user_id,
                "event_type": "ppc_check_saved",
                "check_id": check_id,
                "service": body.service,
                "created_at": _ISO(),
            })
        except Exception:  # pragma: no cover
            pass

        # Compute the rate-increase count for the flag.
        matching = []
        if normalised_name:
            cursor = db.ppc_saved_checks.find({
                "user_id": user_id,
                "service": body.service,
                "provider_normalised_name": normalised_name,
            }, {"_id": 0, "rate": 1, "created_at": 1, "source_statement_id": 1})
            async for row in cursor:
                matching.append(row)
        increase_count = ppc_v2.count_rate_increases_last_12mo(matching)

        return {
            "saved": True,
            "check_id": check_id,
            "prompts": [],
            "provider_display_name": display_name,
            "provider_normalised_name": normalised_name,
            "rate_increases_last_12mo": increase_count,
        }

    @r.get("/ppc/checks")
    async def list_checks(user_id: str = Depends(get_current_user_id)):
        cursor = db.ppc_saved_checks.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1)
        rows = await cursor.to_list(length=500)
        return {"checks": rows}

    @r.get("/ppc/checks/history")
    async def check_history(
        service: str = Query(...),
        provider: str = Query(...),
        user_id: str = Depends(get_current_user_id),
    ):
        normalised = ppc_v2.normalise_provider_name(provider)
        cursor = db.ppc_saved_checks.find(
            {
                "user_id": user_id,
                "service": service,
                "provider_normalised_name": normalised,
            },
            {"_id": 0},
        ).sort("created_at", 1)
        rows = await cursor.to_list(length=500)

        # Ordered ascending for calculations; UI can display in reverse.
        earliest = rows[0] if rows else None
        latest = rows[-1] if rows else None
        change_delta = change_pct = None
        if earliest and latest and earliest["rate"]:
            change_delta = round(float(latest["rate"]) - float(earliest["rate"]), 2)
            change_pct = round(change_delta / float(earliest["rate"]) * 100, 2)

        increases = ppc_v2.count_rate_increases_last_12mo(rows)

        # Per-row percent change vs previous saved rate.
        annotated = []
        prev_rate = None
        for row in rows:
            row_pct = None
            row_delta = None
            if prev_rate not in (None, 0):
                row_delta = round(float(row["rate"]) - float(prev_rate), 2)
                row_pct = round(row_delta / float(prev_rate) * 100, 2)
            annotated.append({
                **row,
                "delta_vs_previous": row_delta,
                "pct_vs_previous": row_pct,
            })
            prev_rate = row["rate"]

        return {
            "service": service,
            "provider_display_name": rows[0].get("provider_display_name") if rows else provider,
            "provider_normalised_name": normalised,
            "checks": list(reversed(annotated)),  # UI wants most recent first
            "count": len(rows),
            "rate_increases_last_12mo": increases,
            "earliest": earliest,
            "latest": latest,
            "change_delta": change_delta,
            "change_pct": change_pct,
        }

    @r.delete("/ppc/checks/provider")
    async def bulk_delete_provider(
        service: str = Query(...),
        provider: str = Query(...),
        user_id: str = Depends(get_current_user_id),
    ):
        normalised = ppc_v2.normalise_provider_name(provider)
        cursor = db.ppc_saved_checks.find(
            {
                "user_id": user_id,
                "service": service,
                "provider_normalised_name": normalised,
            },
            {"_id": 0, "id": 1},
        )
        ids = [row["id"] async for row in cursor]
        if not ids:
            return {"deleted": 0}
        await db.ppc_saved_checks.delete_many(
            {"user_id": user_id, "service": service, "provider_normalised_name": normalised},
        )
        try:
            await db.ppc_provider_aggregate.delete_many({"check_id": {"$in": ids}})
        except Exception:  # pragma: no cover
            pass
        try:
            await db.ppc_events.insert_one({
                "id": secrets.token_urlsafe(12),
                "user_id": user_id,
                "event_type": "ppc_provider_bulk_deleted",
                "service": service,
                "provider_normalised_name": normalised,
                "removed_count": len(ids),
                "created_at": _ISO(),
            })
        except Exception:  # pragma: no cover
            pass
        return {"deleted": len(ids)}

    @r.delete("/ppc/checks/{check_id}")
    async def delete_check(
        check_id: str,
        confirm: bool = Query(default=False),
        user_id: str = Depends(get_current_user_id),
    ):
        row = await db.ppc_saved_checks.find_one({"user_id": user_id, "id": check_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Saved check not found")

        # Confirm if the delete would change the rate-change flag state.
        neighbours = await db.ppc_saved_checks.find(
            {
                "user_id": user_id,
                "service": row["service"],
                "provider_normalised_name": row.get("provider_normalised_name"),
            },
            {"_id": 0, "rate": 1, "created_at": 1, "source_statement_id": 1, "id": 1},
        ).to_list(length=500)
        before = ppc_v2.count_rate_increases_last_12mo(neighbours)
        after = ppc_v2.count_rate_increases_last_12mo(
            [n for n in neighbours if n.get("id") != check_id]
        )
        threshold_change = (before > 2) != (after > 2)
        if threshold_change and not confirm:
            return {
                "deleted": False,
                "requires_confirmation": True,
                "explanation": (
                    f"Deleting this check will change the rate-change flag for "
                    f"{row['service']} with {row.get('provider_display_name')}. Continue?"
                ),
                "flag_before": before,
                "flag_after": after,
            }

        await db.ppc_saved_checks.delete_one({"user_id": user_id, "id": check_id})
        # WS13 aggregate scrubbing.
        try:
            await db.ppc_provider_aggregate.delete_many({"check_id": check_id})
        except Exception:  # pragma: no cover
            pass
        try:
            await db.ppc_events.insert_one({
                "id": secrets.token_urlsafe(12),
                "user_id": user_id,
                "event_type": "ppc_check_deleted",
                "check_id": check_id,
                "service": row["service"],
                "created_at": _ISO(),
            })
        except Exception:  # pragma: no cover
            pass
        return {"deleted": True, "flag_after": after}

    # ---------- Email drafts ----------

    @r.post("/ppc/email-draft")
    async def email_draft(
        body: EmailDraftBody,
        user_id: str = Depends(get_current_user_id),
    ):
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
        first = ((user or {}).get("name") or "").split(" ")[0] or None

        # Always compute the increase count when a provider is entered so
        # the UI can surface whether the toggle will add anything.
        increase_count = 0
        if body.provider:
            normalised = ppc_v2.normalise_provider_name(body.provider)
            rows = await db.ppc_saved_checks.find(
                {
                    "user_id": user_id,
                    "service": body.service,
                    "provider_normalised_name": normalised,
                },
                {"_id": 0, "rate": 1, "created_at": 1, "source_statement_id": 1},
            ).to_list(length=500)
            increase_count = ppc_v2.count_rate_increases_last_12mo(rows)

        draft = ppc_v2.draft_email_to_provider(
            provider_name=body.provider,
            first_name=first,
            service=body.service,
            unit=body.unit,
            rate=body.rate,
            lower=body.lower,
            upper=body.upper,
            source_date=body.source_date,
            include_increase_paragraph=body.include_increase_paragraph,
            increase_count=increase_count,
        )
        # Surface the increase count so the UI can hint what the toggle does
        # even when no rate history exists yet.
        draft["increase_count"] = increase_count or 0
        return draft

    # ---------- Report an issue ----------
    # Reports flow through the shared /api/support/tickets endpoint via
    # ReportIssueButton. Tool context (service, rate, result payload) is
    # captured by the shared handler into sup_tickets + sup_tool_snapshots.
    # No PPC-specific route needed. See ReportIssueButton.jsx in the frontend.

    # ---------- CE state persistence + read-through ----------

    @r.get("/tools/ce/state")
    async def ce_state_get(user_id: str = Depends(get_current_user_id)):
        row = await db.contribution_estimates.find_one(
            {"user_id": user_id},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if not row:
            return {"state": None}
        return {"state": row}

    @r.put("/tools/ce/state")
    async def ce_state_put(
        body: CEStateBody,
        user_id: str = Depends(get_current_user_id),
    ):
        doc = {
            "id": secrets.token_urlsafe(12),
            "user_id": user_id,
            "pension_status": body.pension_status,
            "is_grandfathered": bool(body.is_grandfathered),
            "classification": body.classification,
            "independence_rate_pct": body.independence_rate_pct,
            "everyday_rate_pct": body.everyday_rate_pct,
            "created_at": _ISO(),
        }
        await db.contribution_estimates.insert_one(doc)
        # Motor mutates the doc to include an ObjectId `_id` after insert;
        # strip it before returning so FastAPI can JSON-encode the response.
        doc.pop("_id", None)
        return {"state": doc, "saved": True}

    # ---------- Feature flag reader ----------

    @r.get("/features/{name}")
    async def read_feature_flag(name: str):
        """Public read of an enabled/disabled feature flag."""
        row = await db.feature_flags.find_one({"name": name}, {"_id": 0})
        return {
            "name": name,
            "enabled": bool((row or {}).get("enabled")),
            "found": bool(row),
        }

    # ---------- Decoder-integration context (WS4) ----------

    @r.get("/ppc/decoder-context")
    async def decoder_context(
        service: str = Query(...),
        user_id: str = Depends(get_current_user_id),
    ):
        """Return the most-recent decoded statement's anomalies + matching
        line items for the requested service. Feature-flag-gated by the
        frontend via ``/api/features/ppc_decoder_integration``."""
        household = await db.households.find_one({"members.user_id": user_id})
        if not household:
            return {"anomalies": [], "line_items": [], "statement": None}

        stmts = await db.statements.find(
            {
                "household_id": household["id"],
                "state": {"$nin": ["archived", "deleted"]},
            },
            {"_id": 0, "id": 1, "period_label": 1, "uploaded_at": 1, "line_items": 1, "audit_json": 1},
        ).sort("uploaded_at", -1).to_list(3)
        if not stmts:
            return {"anomalies": [], "line_items": [], "statement": None}

        top = stmts[0]
        anomalies_all = ((top.get("audit_json") or {}).get("anomalies") or [])
        anomalies = []
        for a in anomalies_all:
            svc = (a.get("service") or a.get("line_service") or "").lower()
            if svc and svc == service.lower():
                anomalies.append({
                    "rule": a.get("rule"),
                    "severity": a.get("severity"),
                    "message": a.get("message"),
                    "evidence": a.get("evidence"),
                })

        line_items = []
        for stmt in stmts:
            for li in stmt.get("line_items") or []:
                raw = (li.get("service_description") or li.get("service_code") or "").lower()
                if service.lower() in raw:
                    line_items.append({
                        "service": li.get("service_description") or li.get("service_code"),
                        "unit_price": li.get("unit_price"),
                        "period_label": stmt.get("period_label"),
                        "statement_id": stmt.get("id"),
                        "uploaded_at": stmt.get("uploaded_at"),
                    })
        return {
            "anomalies": anomalies,
            "line_items": line_items[:10],
            "statement": {
                "id": top.get("id"),
                "period_label": top.get("period_label"),
                "uploaded_at": top.get("uploaded_at"),
            },
        }

    # ---------- PDF export (WS8) ----------

    @r.post("/ppc/pdf-export")
    async def pdf_export(
        body: PdfExportBody,
        user_id: str = Depends(get_current_user_id),
    ):
        from fastapi.responses import Response as _Response
        from services import ppc_pdf as _ppc_pdf

        pdf_bytes = _ppc_pdf.render_ppc_pdf(
            service=body.service,
            provider=body.provider,
            charged=body.charged,
            unit=body.unit,
            position=body.position,
            plain_language=body.plain_language,
            distance_summary=body.distance_summary,
            lower=body.lower,
            upper=body.upper,
            median=body.median,
            stream=body.stream,
            your_share_amount=body.your_share_amount,
            your_share_explanation=body.your_share_explanation,
            source_date=body.source_date,
            notes=body.notes,
            doh_caveat=body.doh_caveat,
        )
        filename = f"wayly-price-check-{(body.service or 'check').lower().replace(' ', '-')}.pdf"
        return _Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ---------- Analytics event server-side mirror (WS10) ----------

    @r.post("/ppc/analytics-event")
    async def analytics_event(
        body: AnalyticsEventBody,
        user_id: str = Depends(get_current_user_id),
    ):
        allowed_events = {
            "ppc_tool_opened", "ppc_service_selected", "ppc_result_rendered",
            "ppc_quality_guard_shown", "ppc_quality_guard_dismissed",
            "ppc_check_saved", "ppc_check_deleted", "ppc_history_opened",
            "ppc_email_drafted", "ppc_pdf_exported", "ppc_report_issue_submitted",
            "ppc_snapshot_selector_shown", "ppc_snapshot_switched",
            "ppc_adm_disclosure_opened", "ppc_prefill_applied",
        }
        if body.event_name not in allowed_events:
            raise HTTPException(status_code=400, detail=f"Unknown event: {body.event_name}")
        await db.ppc_events.insert_one({
            "id": secrets.token_urlsafe(12),
            "user_id": user_id,
            "event_type": body.event_name,
            "props": body.props,
            "created_at": _ISO(),
        })
        return {"ok": True}

    return r
