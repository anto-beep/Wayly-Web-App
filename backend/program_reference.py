"""Versioned program reference data — Wayly Scenario Engine, Phase 1.

Single source of truth for every Support at Home program figure. Replaces the
scattered literals in `budget.py`, `batch2_routes.py`, the marketing JS files,
and the Demo page.

Design
------
- Mongo collection ``program_reference`` holds ALL rows ever, with
  ``effective_from`` / ``effective_to`` ISO date strings. ``effective_to`` is
  ``null`` for the row currently in force.
- A second collection ``program_reference_history`` mirrors every insert so we
  can answer "which figures were applied when we evaluated event X" by joining
  on the row id.
- The lookup ``get_value(key, as_of_date=None)`` is **synchronous**. It reads
  from an in-process dict cache populated once at startup. Callers in hot paths
  (statement decoder, ``/budget/current``, every adviser tool) pay no Mongo
  round-trip.
- ``get_value_async`` handles historical lookups (``as_of_date`` older than the
  cache's preload window) by falling back to Mongo.
- Indexation events (20 Mar, 20 Sep, 1 Jul) are applied via
  ``set_value(key, value, effective_from, ...)`` which inserts a new row,
  closes the previous one, and refreshes the cache atomically.

Naming convention
-----------------
Keys are lowercase, dot-separated. The first segment is the family. Examples:

  classification_annual.4              float — $29,696 annual budget for Cl. 4
  care_management.cap_pct              float — 0.10
  rollover.floor_aud                   float — 1000.00
  rollover.pct                         float — 0.10
  lifetime_cap.standard                float — 137917.01 (as of 2026-03-20)
  lifetime_cap.no_worse_off            float — 86185.23  (as of 2026-03-20)
  cap.time_limited_years               int   — 4
  interim_funding.pct                  float — 0.60
  restorative.budget_aud               float — 6000
  restorative.extension_aud            float — 12000
  restorative.weeks                    int   — 16
  restorative.episodes_per_year        int   — 2
  restorative.months_between_episodes  int   — 3
  eol.budget_aud                       float — 25000
  eol.weeks                            int   — 12
  eol.max_weeks                        int   — 16
  at_hm.validity_months                int   — 12
  at_hm.high_tier_threshold_aud        float — 15000
  contribution.clinical_pct            float — 0.00
  contribution.independence_band       list  — [0.05, 0.50]
  contribution.everyday_band           list  — [0.175, 0.80]
  stream_proportion.Clinical           float — 0.40 (MVP default; participant-specific in reality)
  stream_proportion.Independence       float — 0.35
  stream_proportion.Everyday Living    float — 0.25
  deadline.statement_due_days_after_month_end                int — 30
  deadline.provider_exit_notice_days                         int — 14
  deadline.provider_branch_transfer_notice_days              int — 90
  deadline.provider_initial_agreement_min_days_before_cease  int — 90
  deadline.death_provider_notify_days                        int — 28
  deadline.death_final_claim_days                            int — 60
  deadline.contribution_letter_validity_days                 int — 120
  deadline.referral_code_validity_days                       int — 56
  deadline.no_service_quarters_for_withdrawal                int — 4
  deadline.respite_days_per_year                             int — 63
  deadline.cancellation_charge_hours_threshold               int — 48
  policy_date.personal_care_free                             str — "2026-10-01"
  policy_date.price_caps_start                               str — "2026-07-01" (DEFERRED — see policy.price_caps_status)
  policy.price_caps_status                                   str — "deferred_indefinitely" from 2026-05-20
  policy_date.eol_second_round_start                         str — "2027-02-01"  (approx — "early 2027")
  policy_date.chsp_transition_earliest                       str — "2027-07-01"
  policy_date.next_classification_indexation                 str — "2026-07-01"
  policy_date.next_cap_indexation                            str — "2026-09-20"

History note: every key whose value moves with indexation must have a row per
effective period. ``lifetime_cap.standard`` for example has two rows:
``effective_from=2025-11-01, effective_to=2026-03-20, value=135318.69`` and
``effective_from=2026-03-20, effective_to=null, value=137917.01``.
"""
from __future__ import annotations
import logging
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid

log = logging.getLogger("wayly.program_reference")

# ---------------------------------------------------------------------------
# in-process cache
# ---------------------------------------------------------------------------
# {key: [(effective_from_iso, effective_to_iso_or_None, value, source_id), ...]}
# Rows are sorted ascending by effective_from so the lookup walks the list once.
_CACHE: Dict[str, List[Tuple[str, Optional[str], Any, str]]] = {}
_CACHE_READY = False
_DB = None  # injected via init()


def init(db) -> None:
    """Wire the Mongo handle. Called once from server.py at startup."""
    global _DB
    _DB = db


async def ensure_seeded(seed_rows: List[dict]) -> None:
    """Insert seed rows that are missing. Idempotent on (key, effective_from).
    Safe to run on every startup."""
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    for row in seed_rows:
        if not row.get("id"):
            row["id"] = str(uuid.uuid4())
        if not row.get("created_at"):
            row["created_at"] = datetime.now(timezone.utc).isoformat()
        if not row.get("created_by"):
            row["created_by"] = "seed"
        existing = await _DB.program_reference.find_one(
            {"key": row["key"], "effective_from": row["effective_from"]},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        await _DB.program_reference.insert_one(dict(row))
        await _DB.program_reference_history.insert_one({**row, "op": "seed"})


async def apply_data_migrations() -> None:
    """One-off data migrations on program_reference rows.

    Each migration is idempotent and safe to re-run on every startup. Use this
    when a previously open-ended row needs to be closed (``effective_to`` set)
    because policy changed in flight — the seed file already carries the
    correct shape for fresh installs, but existing Mongo databases need to
    be brought in line.
    """
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    migrations_run: List[str] = []

    # 2026-05-20 — National provider price caps deferred indefinitely.
    # Close any open-ended ``policy_date.price_caps_start`` row by setting
    # ``effective_to=2026-05-19``. The matching ``policy.price_caps_status``
    # row is added by the regular seed step.
    result = await _DB.program_reference.update_many(
        {"key": "policy_date.price_caps_start",
         "$or": [{"effective_to": None}, {"effective_to": {"$exists": False}}]},
        {"$set": {"effective_to": "2026-05-19"}},
    )
    if result.modified_count:
        migrations_run.append(
            f"closed {result.modified_count} open policy_date.price_caps_start row(s) at 2026-05-19"
        )
        await _DB.program_reference_history.insert_one({
            "op": "migration",
            "migration_id": "price_caps_deferred_2026_05_20",
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "rows_modified": result.modified_count,
            "note": "Australian Government deferred national provider price caps indefinitely (announced 20 May 2026).",
        })

    if migrations_run:
        log.info("program_reference migrations applied: %s", "; ".join(migrations_run))


async def preload_cache() -> None:
    """Read every row from Mongo into the in-process cache. Called once at
    startup right after ``ensure_seeded``."""
    global _CACHE_READY, _CACHE
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    cur = _DB.program_reference.find({}, {"_id": 0, "id": 1, "key": 1, "value": 1,
                                            "effective_from": 1, "effective_to": 1})
    fresh: Dict[str, List[Tuple[str, Optional[str], Any, str]]] = {}
    async for doc in cur:
        key = doc["key"]
        fresh.setdefault(key, []).append((
            doc["effective_from"],
            doc.get("effective_to"),
            doc["value"],
            doc["id"],
        ))
    # Sort each key's history ascending by effective_from
    for key in fresh:
        fresh[key].sort(key=lambda r: r[0])
    _CACHE = fresh
    _CACHE_READY = True
    log.info("program_reference cache loaded: %d keys, %d rows total",
             len(_CACHE), sum(len(v) for v in _CACHE.values()))


def flush_cache() -> None:
    """Drop the in-process cache. Next ``preload_cache`` rebuilds it."""
    global _CACHE_READY, _CACHE
    _CACHE = {}
    _CACHE_READY = False


# ---------------------------------------------------------------------------
# lookup
# ---------------------------------------------------------------------------
class ProgramReferenceMissing(KeyError):
    """Raised when a key has no row applicable to the requested date."""


def get_value(key: str, as_of_date: Optional[date | str] = None,
              default: Any = ...,) -> Any:
    """Return the value of ``key`` in force on ``as_of_date`` (default: today).

    Sync. Reads from the in-process cache only. Raises
    ``ProgramReferenceMissing`` if no row matches, unless a ``default`` is
    given.

    Parameters
    ----------
    key
        Lookup key, e.g. ``"classification_annual.4"``.
    as_of_date
        ``date`` or ``YYYY-MM-DD`` string. ``None`` ⇒ today (UTC).
    default
        Returned instead of raising when the key is missing or has no row
        applicable to the date. Pass ``None`` if you want a quiet miss.
    """
    if not _CACHE_READY:
        if default is ...:
            raise RuntimeError("program_reference cache not loaded — "
                                "call preload_cache() at startup")
        return default

    if as_of_date is None:
        as_of_iso = datetime.now(timezone.utc).date().isoformat()
    elif isinstance(as_of_date, date):
        as_of_iso = as_of_date.isoformat()
    else:
        as_of_iso = as_of_date  # assume already YYYY-MM-DD

    rows = _CACHE.get(key) or []
    for eff_from, eff_to, value, _row_id in rows:
        if eff_from <= as_of_iso and (eff_to is None or as_of_iso < eff_to):
            return value
    if default is ...:
        raise ProgramReferenceMissing(
            f"No program_reference row for key={key!r} as_of={as_of_iso!r}"
        )
    return default


def get_value_with_source(key: str, as_of_date: Optional[date | str] = None) -> dict:
    """Like get_value but also returns the row id so events can pin themselves
    to the exact reference figure used at evaluation time."""
    if not _CACHE_READY:
        raise RuntimeError("program_reference cache not loaded")
    if as_of_date is None:
        as_of_iso = datetime.now(timezone.utc).date().isoformat()
    elif isinstance(as_of_date, date):
        as_of_iso = as_of_date.isoformat()
    else:
        as_of_iso = as_of_date
    rows = _CACHE.get(key) or []
    for eff_from, eff_to, value, row_id in rows:
        if eff_from <= as_of_iso and (eff_to is None or as_of_iso < eff_to):
            return {"key": key, "value": value, "effective_from": eff_from,
                    "effective_to": eff_to, "row_id": row_id, "as_of": as_of_iso}
    raise ProgramReferenceMissing(
        f"No program_reference row for key={key!r} as_of={as_of_iso!r}"
    )


async def get_value_async(key: str, as_of_date: Optional[date | str] = None,
                          default: Any = ...,) -> Any:
    """Like ``get_value`` but always reads from Mongo. Use for historical
    queries deeper than the preload window if we ever introduce one."""
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    if as_of_date is None:
        as_of_iso = datetime.now(timezone.utc).date().isoformat()
    elif isinstance(as_of_date, date):
        as_of_iso = as_of_date.isoformat()
    else:
        as_of_iso = as_of_date
    doc = await _DB.program_reference.find_one({
        "key": key,
        "effective_from": {"$lte": as_of_iso},
        "$or": [{"effective_to": None}, {"effective_to": {"$gt": as_of_iso}}],
    }, {"_id": 0, "value": 1, "id": 1, "effective_from": 1, "effective_to": 1})
    if doc is None:
        if default is ...:
            raise ProgramReferenceMissing(
                f"No program_reference row for key={key!r} as_of={as_of_iso!r}"
            )
        return default
    return doc["value"]


# ---------------------------------------------------------------------------
# mutation (admin-only)
# ---------------------------------------------------------------------------
async def set_value(key: str, value: Any, effective_from: str, *,
                     source_url: Optional[str] = None,
                     notes: Optional[str] = None,
                     created_by: str = "admin",
                     close_previous: bool = True) -> dict:
    """Insert a new effective row for ``key``. Closes the previous row's
    ``effective_to`` to ``effective_from`` so the timeline stays contiguous.

    Caller must be admin. Refreshes the cache on success.
    """
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    now_iso = datetime.now(timezone.utc).isoformat()
    new_id = str(uuid.uuid4())
    new_row = {
        "id": new_id,
        "key": key,
        "value": value,
        "effective_from": effective_from,
        "effective_to": None,
        "source_url": source_url,
        "notes": notes,
        "created_at": now_iso,
        "created_by": created_by,
    }
    if close_previous:
        prev = await _DB.program_reference.find_one(
            {"key": key, "effective_to": None}, {"_id": 0, "id": 1},
        )
        if prev:
            await _DB.program_reference.update_one(
                {"id": prev["id"]},
                {"$set": {"effective_to": effective_from,
                          "closed_at": now_iso, "closed_by": created_by}},
            )
            await _DB.program_reference_history.insert_one({
                "id": str(uuid.uuid4()), "key": key,
                "op": "close", "row_id": prev["id"],
                "effective_to": effective_from,
                "created_at": now_iso, "created_by": created_by,
            })
    # We pass a copy to insert_one so the in-memory ``new_row`` stays free of
    # the BSON ObjectId that the driver attaches to inserted dicts. The return
    # value then serializes cleanly through FastAPI's JSON encoder.
    await _DB.program_reference.insert_one(dict(new_row))
    await _DB.program_reference_history.insert_one({**new_row, "op": "insert"})
    await preload_cache()
    return new_row


async def list_history(key: Optional[str] = None) -> List[dict]:
    """Read-only audit view. Returns every history row (newest first) for one
    key or for all keys when ``key`` is ``None``."""
    if _DB is None:
        raise RuntimeError("program_reference.init(db) must be called first")
    q: dict = {}
    if key:
        q["key"] = key
    cur = _DB.program_reference_history.find(q, {"_id": 0}).sort("created_at", -1).limit(500)
    return [d async for d in cur]


def public_snapshot(as_of_date: Optional[date | str] = None) -> dict:
    """Return the public-safe figures bundle for the front-end loader.
    Excludes admin-only / sensitive figures. Read-only."""
    classifications = {}
    for c in range(1, 9):
        try:
            classifications[str(c)] = {
                "annual": get_value(f"classification_annual.{c}", as_of_date),
                "label": f"Classification {c}",
            }
        except ProgramReferenceMissing:
            continue
    return {
        "as_of": (as_of_date or datetime.now(timezone.utc).date().isoformat()
                  if not isinstance(as_of_date, date) else as_of_date.isoformat()),
        "classifications": classifications,
        "care_management": {"cap_pct": get_value("care_management.cap_pct", as_of_date)},
        "rollover": {
            "floor_aud": get_value("rollover.floor_aud", as_of_date),
            "pct": get_value("rollover.pct", as_of_date),
        },
        "lifetime_cap": {
            "standard": get_value("lifetime_cap.standard", as_of_date),
            "no_worse_off": get_value("lifetime_cap.no_worse_off", as_of_date),
            "time_limited_years": get_value("cap.time_limited_years", as_of_date),
        },
        "stream_proportion": {
            "Clinical": get_value("stream_proportion.Clinical", as_of_date),
            "Independence": get_value("stream_proportion.Independence", as_of_date),
            "Everyday Living": get_value("stream_proportion.Everyday Living", as_of_date),
        },
        "policy_dates": {
            "personal_care_free": get_value("policy_date.personal_care_free", as_of_date, default=None),
            "price_caps_start": get_value("policy_date.price_caps_start", as_of_date, default=None),
            "eol_second_round_start": get_value("policy_date.eol_second_round_start", as_of_date, default=None),
            "chsp_transition_earliest": get_value("policy_date.chsp_transition_earliest", as_of_date, default=None),
        },
        "policy_status": {
            "price_caps": get_value("policy.price_caps_status", as_of_date, default="deferred_indefinitely"),
        },
        "deadlines": {
            "statement_due_days_after_month_end": get_value("deadline.statement_due_days_after_month_end", as_of_date, default=None),
            "provider_exit_notice_days": get_value("deadline.provider_exit_notice_days", as_of_date, default=None),
            "death_provider_notify_days": get_value("deadline.death_provider_notify_days", as_of_date, default=None),
            "death_final_claim_days": get_value("deadline.death_final_claim_days", as_of_date, default=None),
            "contribution_letter_validity_days": get_value("deadline.contribution_letter_validity_days", as_of_date, default=None),
            "referral_code_validity_days": get_value("deadline.referral_code_validity_days", as_of_date, default=None),
            "no_service_quarters_for_withdrawal": get_value("deadline.no_service_quarters_for_withdrawal", as_of_date, default=None),
        },
    }
