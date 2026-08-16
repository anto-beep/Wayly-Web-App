"""CPR-1 · Cross-tool signal aggregator (Section F).

Reads the most-recent persisted output from each of the seven other Wayly
tools for a given participant, applies the 90-day freshness gate, and
returns a compact `CrossToolSignal` bundle that the analysis engine can
weave into its findings without fabricating.

The seven signals:

  1. Statement Decoder            → last 3 decoded statements, flagged
                                     anomalies, utilisation rollup
  2. Budget Calculator            → most recent budget calc
  3. Provider Price Checker       → most recent comparison
  4. Classification Self-Check    → most recent outcome
  5. Reassessment Letter Gen      → whether a letter was drafted in the
                                     last 90 days
  6. Contribution Estimator       → most recent estimate
  7. Family Coordinator           → household membership + roles

Freshness gate: any signal older than `MAX_SIGNAL_AGE_DAYS` (default 90)
is dropped from the summary, per spec §F.9.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient


MAX_SIGNAL_AGE_DAYS = 90


_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


# ---------------------------------------------------------------------------
# Freshness helper (spec §F.9)
# ---------------------------------------------------------------------------

def _parse_dt(v: Any) -> Optional[datetime]:
    """Coerce a stored value to a timezone-aware datetime, or None."""
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def is_signal_fresh(source_dt: Any, max_days: int = MAX_SIGNAL_AGE_DAYS) -> bool:
    """Return True when the signal timestamp is within `max_days` of now."""
    dt = _parse_dt(source_dt)
    if not dt:
        return False
    return (datetime.now(timezone.utc) - dt) <= timedelta(days=max_days)


def age_days(source_dt: Any) -> Optional[int]:
    dt = _parse_dt(source_dt)
    if not dt:
        return None
    return (datetime.now(timezone.utc) - dt).days


# ---------------------------------------------------------------------------
# Individual read helpers
# ---------------------------------------------------------------------------

async def _statement_decoder_signal(participant_id: str) -> Optional[Dict[str, Any]]:
    """Last 3 decoded statements for the participant, with per-stream
    utilisation rollup and anomaly rules fired."""
    if not participant_id:
        return None
    rows_cur = _db["statements"].find(
        {"participant_id": participant_id, "status": {"$in": ["decoded", "reviewed"]}},
    ).sort("decoded_at", -1).limit(3)
    rows = await rows_cur.to_list(length=3)
    if not rows:
        return None

    # Latest freshness check
    latest_ts = rows[0].get("decoded_at") or rows[0].get("created_at")
    if not is_signal_fresh(latest_ts):
        return None

    utilisation = {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0}
    total_gross = 0.0
    anomaly_rules: List[str] = []

    for s in rows:
        ext = s.get("extracted_json") or {}
        for li in ext.get("line_items", []) or []:
            stream = li.get("stream")
            try:
                gross = float(li.get("gross") or 0)
            except (TypeError, ValueError):
                continue
            if stream in utilisation:
                utilisation[stream] += gross
            total_gross += gross
        # Anomalies
        aj = s.get("audit_json") or {}
        for a in aj.get("anomalies") or []:
            r = a.get("rule")
            if r and r not in anomaly_rules:
                anomaly_rules.append(r)

    return {
        "latest_decoded_at": latest_ts if isinstance(latest_ts, str) else (
            latest_ts.isoformat() if latest_ts else None
        ),
        "statements_count": len(rows),
        "utilisation_by_stream": utilisation,
        "total_gross_recent": round(total_gross, 2),
        "recent_anomaly_rules": anomaly_rules[:12],
        "age_days": age_days(latest_ts),
    }


async def _budget_calc_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Most-recent budget calculator run for the participant / user."""
    q = {"$or": [{"participant_id": participant_id}, {"user_id": user_id}]}
    row = await _db["budget_calcs"].find_one(q, sort=[("created_at", -1)])
    if not row or not is_signal_fresh(row.get("created_at")):
        return None
    return {
        "classification": row.get("classification"),
        "quarterly_budget": row.get("quarterly_budget"),
        "estimated_hours": row.get("estimated_hours"),
        "care_management_pct": row.get("care_management_pct"),
        "created_at": row.get("created_at"),
        "age_days": age_days(row.get("created_at")),
    }


async def _price_checker_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    q = {"$or": [{"participant_id": participant_id}, {"user_id": user_id}]}
    row = await _db["price_check_runs"].find_one(q, sort=[("created_at", -1)])
    if not row or not is_signal_fresh(row.get("created_at")):
        return None
    return {
        "service_category": row.get("service_category"),
        "provider_price": row.get("provider_price"),
        "national_midpoint": row.get("national_midpoint"),
        "variance_pct": row.get("variance_pct"),
        "created_at": row.get("created_at"),
        "age_days": age_days(row.get("created_at")),
    }


async def _classification_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    q = {"$or": [{"participant_id": participant_id}, {"user_id": user_id}]}
    row = await _db["classification_selfchecks"].find_one(q, sort=[("created_at", -1)])
    if not row or not is_signal_fresh(row.get("created_at")):
        return None
    return {
        "suggested_classification": row.get("suggested_classification"),
        "provider_stated_classification": row.get("provider_stated_classification"),
        "confidence": row.get("confidence"),
        "created_at": row.get("created_at"),
        "age_days": age_days(row.get("created_at")),
    }


async def _reassessment_letter_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    q = {"$or": [{"participant_id": participant_id}, {"user_id": user_id}]}
    row = await _db["reassessment_letters"].find_one(q, sort=[("generated_at", -1)])
    if not row or not is_signal_fresh(row.get("generated_at")):
        return None
    return {
        "generated_at": row.get("generated_at"),
        "trigger_reason": row.get("trigger_reason"),
        "sent_to_provider": bool(row.get("sent_to_provider")),
        "age_days": age_days(row.get("generated_at")),
    }


async def _contribution_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    q = {"$or": [{"participant_id": participant_id}, {"user_id": user_id}]}
    row = await _db["contribution_estimates"].find_one(q, sort=[("created_at", -1)])
    if not row or not is_signal_fresh(row.get("created_at")):
        return None
    return {
        "pension_status": row.get("pension_status"),
        "estimated_monthly_contribution": row.get("estimated_monthly_contribution"),
        "created_at": row.get("created_at"),
        "age_days": age_days(row.get("created_at")),
    }


async def _family_coordinator_signal(participant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Household membership + roles. No freshness gate, household
    membership is standing state, not point-in-time signal."""
    p = await _db["participants"].find_one({"id": participant_id}, {"_id": 0, "household_id": 1})
    if not p or not p.get("household_id"):
        return None
    members = await _db["household_members"].find(
        {"household_id": p["household_id"]}, {"_id": 0, "user_id": 1, "role": 1},
    ).to_list(length=50)
    return {
        "household_id": p["household_id"],
        "member_count": len(members),
        "roles": sorted({m.get("role") for m in members if m.get("role")}),
    }


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------

async def gather_cross_tool_signals(
    participant_id: str,
    user_id: str,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """Return a dict keyed by tool slug with the fresh signal (or None if
    stale / missing). Silent-fails per tool so a broken read never fails
    the overall analysis run."""
    async def _safe(coro):
        try:
            return await coro
        except Exception:      # noqa: BLE001
            return None

    signals = {
        "statement_decoder": await _safe(_statement_decoder_signal(participant_id)),
        "budget_calculator": await _safe(_budget_calc_signal(participant_id, user_id)),
        "provider_price_checker": await _safe(_price_checker_signal(participant_id, user_id)),
        "classification_selfcheck": await _safe(_classification_signal(participant_id, user_id)),
        "reassessment_letter": await _safe(_reassessment_letter_signal(participant_id, user_id)),
        "contribution_estimator": await _safe(_contribution_signal(participant_id, user_id)),
        "family_coordinator": await _safe(_family_coordinator_signal(participant_id, user_id)),
    }
    return signals


def summarise_for_prompt(signals: Dict[str, Optional[Dict[str, Any]]]) -> str:
    """Compact 5-10 line summary the LLM can read. Never speculative ,
    only surfaces signals that exist and are fresh."""
    lines: List[str] = []

    sd = signals.get("statement_decoder")
    if sd:
        util = sd.get("utilisation_by_stream") or {}
        lines.append(
            f"Statement Decoder: {sd['statements_count']} recent statement(s) "
            f"totalling ${sd.get('total_gross_recent', 0):,.2f} "
            f"(Clinical ${util.get('Clinical', 0):,.0f} / "
            f"Independence ${util.get('Independence', 0):,.0f} / "
            f"Everyday ${util.get('EverydayLiving', 0):,.0f}). "
            f"Rules fired: {', '.join(sd.get('recent_anomaly_rules', []) or ['none']) or 'none'}."
        )

    bc = signals.get("budget_calculator")
    if bc:
        lines.append(
            f"Budget Calculator: classification {bc.get('classification')}, "
            f"quarterly budget ${bc.get('quarterly_budget', 0):,.2f}, "
            f"est {bc.get('estimated_hours')} hrs, "
            f"care mgmt {bc.get('care_management_pct')}%."
        )

    pc = signals.get("provider_price_checker")
    if pc:
        lines.append(
            f"Provider Price Checker: {pc.get('service_category')} at "
            f"${pc.get('provider_price', 0):,.2f} vs national midpoint "
            f"${pc.get('national_midpoint', 0):,.2f} "
            f"({pc.get('variance_pct')}% variance)."
        )

    cs = signals.get("classification_selfcheck")
    if cs:
        stated = cs.get("provider_stated_classification")
        suggested = cs.get("suggested_classification")
        if stated is not None and suggested is not None and stated != suggested:
            lines.append(
                f"Classification Self-Check: provider stated {stated} but "
                f"Wayly suggested {suggested} at {cs.get('confidence')} confidence."
            )
        elif suggested is not None:
            lines.append(
                f"Classification Self-Check: suggested {suggested} at "
                f"{cs.get('confidence')} confidence."
            )

    rl = signals.get("reassessment_letter")
    if rl:
        lines.append(
            f"Reassessment Letter Gen: draft prepared "
            f"{rl.get('age_days')} days ago "
            f"({'sent' if rl.get('sent_to_provider') else 'not sent'})."
        )

    ce = signals.get("contribution_estimator")
    if ce:
        lines.append(
            f"Contribution Estimator: pension status {ce.get('pension_status')}, "
            f"est monthly ${ce.get('estimated_monthly_contribution', 0):,.2f}."
        )

    fc = signals.get("family_coordinator")
    if fc:
        lines.append(
            f"Family Coordinator: household of {fc.get('member_count')} "
            f"({', '.join(fc.get('roles') or [])})."
        )

    return "\n".join(lines).strip()


__all__ = [
    "MAX_SIGNAL_AGE_DAYS",
    "is_signal_fresh",
    "age_days",
    "gather_cross_tool_signals",
    "summarise_for_prompt",
]
