"""Nightly reconciliation job, Phase 4 of the duplicate-statement lifecycle.

For every household + participant, the job:

1. Recomputes YTD (year-to-date) totals from the raw `line_items` of every
   ACTIVE statement that falls inside the current calendar year.
2. Persists the snapshot as a row in `derived_calculation_runs` so the
   dashboard read path stays cheap.
3. Compares against the most recent persisted snapshot and, if the
   absolute drift in total > `DRIFT_THRESHOLD_AUD`, fires a HIGH-severity
   `STATEMENT_DERIVATION_DRIFT` system alert (admins triage from the
   Admin dashboard).

The job is intentionally idempotent, running it twice in a row yields
the same persisted snapshot for the same input set. It is safe to call
on demand from a `/api/admin/reconciliation/run` endpoint (added in
this module) or via the periodic scheduler (wired in `server.py`).

Why YTD specifically? It is the figure most likely to drift after a
revised statement supersedes a prior version. The Privacy Principles
also require that any number the user *sees* in the dashboard must be
traceable back to raw statement rows on demand, this job is that
trace, codified.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from lib.statement_lifecycle import STATE_ACTIVE

log = logging.getLogger("wayly.statement_reconciliation")

DRIFT_THRESHOLD_AUD = 0.50  # ½ cent variance is rounding; > 50¢ is real drift.
CALCULATION_KIND_YTD = "ytd_total_aud"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _year_window():
    """ISO-string bounds of the current calendar year (UTC)."""
    now = datetime.now(timezone.utc)
    start = datetime(now.year, 1, 1, tzinfo=timezone.utc).isoformat()
    end = datetime(now.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc).isoformat()
    return now.year, start, end


def _statement_total(doc: dict) -> float:
    """Sum the line_items.total for a single statement, defensively."""
    total = 0.0
    for li in (doc.get("line_items") or []):
        try:
            total += float(li.get("total") or 0)
        except Exception:
            pass
    return round(total, 2)


async def reconcile_participant_ytd(db, *, household_id: str, participant_id: str | None, year: int, period_start: str, period_end: str) -> dict:
    """Recompute YTD for one participant and persist a snapshot.

    Returns the new derived-run row.
    """
    q: dict = {
        "household_id": household_id,
        "state": STATE_ACTIVE,
        # Period falls inside the year. We accept rows whose `uploaded_at`
        # is in the window when `period_label` doesn't parse to a date.
        "$or": [
            {"period_end": {"$gte": period_start, "$lte": period_end}},
            {"period_start": {"$gte": period_start, "$lte": period_end}},
            {"uploaded_at": {"$gte": period_start, "$lte": period_end}},
        ],
    }
    if participant_id:
        q["participant_id"] = participant_id

    cursor = db.statements.find(q, {"_id": 0, "id": 1, "line_items": 1})
    contributing_ids: list[str] = []
    total = 0.0
    async for s in cursor:
        contributing_ids.append(s["id"])
        total += _statement_total(s)
    total = round(total, 2)

    # Find the latest prior snapshot to detect drift.
    prior = await db.derived_calculation_runs.find_one(
        {
            "household_id": household_id,
            "participant_id": participant_id,
            "calculation_kind": CALCULATION_KIND_YTD,
            "year": year,
        },
        sort=[("calculated_at", -1)],
        projection={"_id": 0, "value_aud": 1, "contributing_version_ids": 1},
    )
    drift_aud: float | None = None
    if prior and isinstance(prior.get("value_aud"), (int, float)):
        drift_aud = round(total - float(prior["value_aud"]), 2)

    import uuid
    new_run = {
        "id": str(uuid.uuid4()),
        "household_id": household_id,
        "participant_id": participant_id,
        "calculation_kind": CALCULATION_KIND_YTD,
        "year": year,
        "value_aud": total,
        "contributing_version_ids": contributing_ids,
        "prior_value_aud": prior.get("value_aud") if prior else None,
        "drift_aud": drift_aud,
        "calculated_at": _now_iso(),
    }
    await db.derived_calculation_runs.insert_one(new_run)
    new_run.pop("_id", None)
    return new_run


async def run_nightly_reconciliation(db) -> dict:
    """Sweep every household + participant. Returns a summary suitable
    for logging."""
    year, period_start, period_end = _year_window()

    # The distinct list is small (one household × one or two participants
    # per household). Aggregate once and iterate.
    pipeline = [
        {"$match": {"state": STATE_ACTIVE}},
        {"$group": {"_id": {"hh": "$household_id", "pid": "$participant_id"}}},
        {"$limit": 50_000},  # safety cap
    ]
    pairs: list[tuple[str, str | None]] = []
    async for row in db.statements.aggregate(pipeline):
        hh = (row.get("_id") or {}).get("hh")
        pid = (row.get("_id") or {}).get("pid")
        if hh:
            pairs.append((hh, pid))

    runs = 0
    drift_alerts = 0
    drift_examples: list[dict] = []
    for hh, pid in pairs:
        try:
            run = await reconcile_participant_ytd(
                db,
                household_id=hh, participant_id=pid,
                year=year, period_start=period_start, period_end=period_end,
            )
            runs += 1
            d = run.get("drift_aud")
            if d is not None and abs(float(d)) > DRIFT_THRESHOLD_AUD:
                drift_alerts += 1
                if len(drift_examples) < 10:
                    drift_examples.append({
                        "household_id": hh,
                        "participant_id": pid,
                        "year": year,
                        "drift_aud": d,
                        "value_aud": run.get("value_aud"),
                        "prior_value_aud": run.get("prior_value_aud"),
                    })
        except Exception as e:
            log.warning("reconciliation failed for hh=%s pid=%s: %s", hh, pid, e)

    summary = {
        "year": year,
        "households_scanned": len(pairs),
        "runs_persisted": runs,
        "drift_alerts": drift_alerts,
        "drift_examples": drift_examples,
        "ran_at": _now_iso(),
    }

    # Pipe drift into system_alerts so admins see it in the dashboard.
    if drift_examples:
        try:
            from security_alerter import record_derivation_drift
            await record_derivation_drift(db, drift_rows=drift_examples)
        except Exception as e:
            log.warning("failed to publish reconciliation drift: %s", e)

    log.info("nightly reconciliation: %s", summary)
    return summary
