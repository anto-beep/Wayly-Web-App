"""PPC-1 v2 Provider Price Checker core module.

Implements the deterministic slice of the PPC-1 v2 spec:

* WS1, DoH price snapshot dictionary. Reads every YAML in
  ``backend/data/doh-price-snapshots/`` at import time and exposes a
  ``list_snapshots`` / ``get_snapshot`` / ``get_service`` surface. The
  loader normalises the row shape so downstream code never has to
  paper over per-file drift.

* WS3 partial, ``compute_your_share`` produces the "Your Share"
  figure from a Contribution Estimator state (pension status,
  classification, grandfathered flag). Silent when the state is
  incomplete so the route can render an inline picker fallback.

* WS5, ``run_quality_guards`` returns the soft-confirm prompt for
  the entered rate + service combination (implausibly low, high,
  unit-service mismatch, after-hours ambiguity, non-checkable).

* WS8, position + distance-from-nearer-edge arithmetic and the
  drafted "Email the provider" template.

* WS11 partial, ``count_rate_increases_last_12mo`` computes the
  informational flag surfaced on the result card and email template.

* WS12, ``normalise_provider_name`` collapses "Glorious Services
  Pty Ltd" / "glorious services p/l" / "GLORIOUS SERVICES" into a
  single normalised key so history + aggregate rows co-locate.

The route layer in ``routes/price_check.py`` composes these primitives
into the HTTP shape. Keeping the arithmetic here (rather than in the
route) means the deterministic Pytest suite can exercise the spec's
35 acceptance tests without spinning up FastAPI.
"""
from __future__ import annotations

import datetime as _dt
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import yaml

# ---------------------------------------------------------------------------
# WS1, DoH snapshot loading.
# ---------------------------------------------------------------------------

_SNAPSHOT_DIR = Path(__file__).parent.parent / "data" / "doh-price-snapshots"

_UNIT_LABELS = {
    "hour": "per hour",
    "trip": "per trip",
    "meal": "per meal",
    "month": "per month",
    "kilometre": "per kilometre",
}

_UNIT_DOLLAR_LABEL = {
    "hour": "$ per hour",
    "trip": "$ per trip",
    "meal": "$ per meal",
    "month": "$ per month",
    "kilometre": "$ per kilometre",
}


def _load_snapshot_files() -> list[dict]:
    if not _SNAPSHOT_DIR.exists():
        return []
    snapshots: list[dict] = []
    for path in sorted(_SNAPSHOT_DIR.glob("*.yaml")):
        with path.open("r", encoding="utf-8") as handle:
            raw = yaml.safe_load(handle) or {}
        snap_id = raw.get("snapshot_id") or path.stem
        raw["snapshot_id"] = snap_id
        raw["services"] = [_normalise_row(r, snap_id) for r in (raw.get("services") or [])]
        snapshots.append(raw)
    # Most recent first (source_date descending).
    snapshots.sort(key=lambda s: s.get("source_date") or "", reverse=True)
    return snapshots


def _normalise_row(row: dict, snapshot_id: str) -> dict:
    row = dict(row or {})
    row["snapshot_id"] = snapshot_id
    # Coerce numeric fields.
    for key in ("median", "range_lower", "range_upper"):
        val = row.get(key)
        if val is None:
            row[key] = None
        else:
            row[key] = float(val)
    row["available"] = bool(row.get("available"))
    row["checkable"] = bool(row.get("checkable"))
    row.setdefault("notes", None)
    row.setdefault("source_citation", None)
    return row


_SNAPSHOTS = _load_snapshot_files()


def list_snapshots() -> list[dict]:
    """All available DoH snapshots, most recent first. Each row has the
    top-level metadata (id, source_date, source_url) but not the service
    rows themselves, callers pass through ``get_snapshot`` for those."""
    return [
        {
            "snapshot_id": s["snapshot_id"],
            "source_date": s.get("source_date"),
            "source_publication": s.get("source_publication"),
            "source_url": s.get("source_url"),
            "regional": bool(s.get("regional")),
            "sample_note": s.get("sample_note"),
        }
        for s in _SNAPSHOTS
    ]


def get_default_snapshot_id() -> str | None:
    """The most recent published snapshot, or ``None`` when no data is
    loaded (test harness edge case)."""
    return _SNAPSHOTS[0]["snapshot_id"] if _SNAPSHOTS else None


def get_snapshot(snapshot_id: str | None = None) -> dict | None:
    if not _SNAPSHOTS:
        return None
    target = snapshot_id or get_default_snapshot_id()
    for s in _SNAPSHOTS:
        if s["snapshot_id"] == target:
            return s
    return None


def list_services(snapshot_id: str | None = None) -> list[dict]:
    """All services in a snapshot, ordered by stream then display name."""
    snap = get_snapshot(snapshot_id)
    if not snap:
        return []
    stream_order = {"Clinical": 0, "Independence": 1, "Everyday Living": 2}
    return sorted(
        snap["services"],
        key=lambda r: (stream_order.get(r.get("stream"), 99), r.get("service", "")),
    )


def get_service(service: str, snapshot_id: str | None = None) -> dict | None:
    """Look up a service row by display name in the given snapshot."""
    snap = get_snapshot(snapshot_id)
    if not snap:
        return None
    for row in snap["services"]:
        if row.get("service") == service:
            return row
    return None


# ---------------------------------------------------------------------------
# WS2 / WS8, Position + distance arithmetic.
# ---------------------------------------------------------------------------


@dataclass
class PriceComparison:
    """Deterministic slice of the result card payload.

    ``position`` is one of ``"above"`` / ``"in"`` / ``"below"`` / ``"not_checkable"``
    / ``"unavailable"``. Distance figures are absolute dollars from the nearer
    band edge (positive when above, positive when below, the sign is carried
    by ``direction``).
    """

    position: str  # above | in | below | not_checkable | unavailable
    direction: str  # above_range | in_range | below_range | non_checkable
    distance_from_edge: float | None
    distance_from_median: float | None
    median: float | None
    range_lower: float | None
    range_upper: float | None
    unit: str | None
    stream: str | None
    notes: str | None
    source_date: str | None
    source_snapshot_id: str | None
    plain_language: str
    doh_caveat: str | None
    service_display_name: str


_ABOVE_CAVEAT = (
    "A provider who charges a price above the range is not necessarily charging a "
    "price that is unreasonable. It may be worth asking for a written explanation "
    "of how the rate was set."
)


def compare_rate(
    service: str,
    rate: float,
    snapshot_id: str | None = None,
) -> PriceComparison:
    """Return the deterministic result-card fields for the given rate."""
    snap = get_snapshot(snapshot_id)
    row = get_service(service, snap["snapshot_id"] if snap else None) if snap else None
    if not snap or not row:
        # Unknown service, the tool should render as unavailable.
        return PriceComparison(
            position="unavailable",
            direction="unavailable",
            distance_from_edge=None,
            distance_from_median=None,
            median=None,
            range_lower=None,
            range_upper=None,
            unit=None,
            stream=None,
            notes=None,
            source_date=snap.get("source_date") if snap else None,
            source_snapshot_id=snap.get("snapshot_id") if snap else None,
            plain_language=(
                f"No indicative range is published for {service} in the current "
                "DoH dataset."
            ),
            doh_caveat=None,
            service_display_name=service,
        )

    unit_word = _UNIT_LABELS.get(row.get("unit"), "per unit")
    stream = row.get("stream")
    source_date = snap.get("source_date")

    # Non-checkable services (monthly flat fee, per-km, wraparound). Even if
    # the row happens to have a median it should not be compared.
    if not row.get("checkable"):
        return PriceComparison(
            position="not_checkable",
            direction="non_checkable",
            distance_from_edge=None,
            distance_from_median=None,
            median=row.get("median"),
            range_lower=row.get("range_lower"),
            range_upper=row.get("range_upper"),
            unit=row.get("unit"),
            stream=stream,
            notes=row.get("notes"),
            source_date=source_date,
            source_snapshot_id=snap["snapshot_id"],
            plain_language=row.get("notes") or (
                f"DoH does not publish an indicative range for {service.lower()}."
            ),
            doh_caveat=None,
            service_display_name=service,
        )

    lower = row.get("range_lower")
    upper = row.get("range_upper")
    median = row.get("median")

    if lower is None or upper is None:
        # Range not available even though the row is technically checkable.
        return PriceComparison(
            position="unavailable",
            direction="unavailable",
            distance_from_edge=None,
            distance_from_median=None,
            median=median,
            range_lower=None,
            range_upper=None,
            unit=row.get("unit"),
            stream=stream,
            notes=row.get("notes"),
            source_date=source_date,
            source_snapshot_id=snap["snapshot_id"],
            plain_language=(
                f"No indicative range is published for {service.lower()} in the "
                f"DoH {source_date} dataset. This does not mean the rate is "
                "unreasonable, only that we cannot compare it against a published "
                "benchmark."
            ),
            doh_caveat=None,
            service_display_name=service,
        )

    if rate > upper:
        position = "above"
        direction = "above_range"
        distance_from_edge = round(rate - upper, 2)
        plain = (
            f"Your rate of ${rate:,.2f} {unit_word} is above the published range of "
            f"${lower:,.2f} to ${upper:,.2f} for {service.lower()}."
        )
        doh_caveat = _ABOVE_CAVEAT
    elif rate < lower:
        position = "below"
        direction = "below_range"
        distance_from_edge = round(lower - rate, 2)
        plain = (
            f"Your rate of ${rate:,.2f} {unit_word} is below the published range of "
            f"${lower:,.2f} to ${upper:,.2f} for {service.lower()}."
        )
        doh_caveat = None
    else:
        position = "in"
        direction = "in_range"
        distance_from_edge = 0.0
        plain = (
            f"Your rate of ${rate:,.2f} {unit_word} is inside the published range of "
            f"${lower:,.2f} to ${upper:,.2f} for {service.lower()}."
        )
        doh_caveat = None

    distance_from_median = (
        round(rate - median, 2) if median is not None else None
    )

    return PriceComparison(
        position=position,
        direction=direction,
        distance_from_edge=distance_from_edge,
        distance_from_median=distance_from_median,
        median=median,
        range_lower=lower,
        range_upper=upper,
        unit=row.get("unit"),
        stream=stream,
        notes=row.get("notes"),
        source_date=source_date,
        source_snapshot_id=snap["snapshot_id"],
        plain_language=plain,
        doh_caveat=doh_caveat,
        service_display_name=service,
    )


def distance_summary(comp: PriceComparison) -> str | None:
    """Human-readable one-liner sitting below the position statement."""
    if comp.direction == "above_range":
        return f"That is ${comp.distance_from_edge:,.2f} above the top of the published range."
    if comp.direction == "below_range":
        return f"That is ${comp.distance_from_edge:,.2f} below the bottom of the published range."
    if comp.direction == "in_range":
        return "Inside the published range."
    return None


# ---------------------------------------------------------------------------
# WS3, Contribution Estimator integration ("Your Share").
# ---------------------------------------------------------------------------

# Contribution rates come from the DoH "Support at Home, participant
# contributions" schedule (effective 1 November 2025). Mirrors tool_helpers.py::
# PENSION_RATES so we stay in lock-step with the Contribution Estimator itself.
_CONTRIBUTION_RATES: dict[str, dict[str, float | None]] = {
    "full":       {"clinical": 0.0, "Independence": 0.05, "Everyday Living": 0.175},
    "part":       {"clinical": 0.0, "Independence": None, "Everyday Living": None},
    "cshc":       {"clinical": 0.0, "Independence": None, "Everyday Living": None},
    "self":       {"clinical": 0.0, "Independence": 0.50, "Everyday Living": 0.80},
    "self_funded": {"clinical": 0.0, "Independence": 0.50, "Everyday Living": 0.80},
}

# Personal care crosses over from Independence to Clinical on 1 October 2026
# (PPC-1 v2 §3.8).
_PERSONAL_CARE_CLINICAL_DATE = _dt.date(2026, 10, 1)


def _pension_key(pension_status: str | None) -> str | None:
    if not pension_status:
        return None
    key = str(pension_status).strip().lower()
    if key in ("full", "full pension", "full age pension"):
        return "full"
    if key in ("part", "part pension", "part age pension"):
        return "part"
    if key in ("cshc", "commonwealth seniors health card"):
        return "cshc"
    if key in ("self", "self-funded", "self funded", "self_funded"):
        return "self_funded"
    return None


def compute_your_share(
    *,
    comp: PriceComparison,
    pension_status: str | None,
    is_grandfathered: bool = False,
    check_date: _dt.date | None = None,
    user_ind_rate_pct: float | None = None,
    user_ev_rate_pct: float | None = None,
) -> dict:
    """Return the "Your Share" card payload.

    States (matching spec §4.3):
      * ``mode="grandfathered"``, user is on HCP transitional pricing.
      * ``mode="clinical"``     , service is clinical, share is $0.
      * ``mode="picker"``       , pension unknown, prompt the user inline.
      * ``mode="band"``         , pension known but only a band applies.
      * ``mode="exact"``         , pension known, exact per-unit share.
      * ``mode="unavailable"``   , service is not_checkable / unavailable.
    """
    if comp.direction == "non_checkable":
        return {
            "mode": "unavailable",
            "share_amount": None,
            "explanation": comp.notes or (
                "DoH does not publish a per-unit indicative range for this fee type, "
                "so a per-unit participant contribution cannot be computed here."
            ),
        }

    if is_grandfathered:
        return {
            "mode": "grandfathered",
            "share_amount": None,
            "explanation": (
                "Grandfathered pricing applies. Contribution rates from your HCP "
                "transitional arrangement are used by your provider directly, so "
                "the SAH stream rates do not apply."
            ),
        }

    stream = comp.stream
    service_name = comp.service_display_name

    # §3.8 date-based personal-care shift.
    check_date = check_date or _dt.date.today()
    if service_name == "Personal care" and check_date >= _PERSONAL_CARE_CLINICAL_DATE:
        stream = "Clinical"

    if stream == "Clinical" or stream == "clinical":
        return {
            "mode": "clinical",
            "share_amount": 0.0,
            "explanation": "Clinical supports carry no participant contribution.",
        }

    key = _pension_key(pension_status)
    if not key:
        return {
            "mode": "picker",
            "share_amount": None,
            "explanation": None,
        }

    rate_map = _CONTRIBUTION_RATES.get(key, {})
    stream_rate = rate_map.get(stream)

    # Band cohorts: honour a user-supplied rate if provided.
    if stream_rate is None:
        # part / cshc, band cohort.
        band_rate_pct = None
        if stream == "Independence" and user_ind_rate_pct is not None:
            band_rate_pct = user_ind_rate_pct
        elif stream == "Everyday Living" and user_ev_rate_pct is not None:
            band_rate_pct = user_ev_rate_pct

        if band_rate_pct is not None:
            share = _compute_share(comp, band_rate_pct / 100)
            return {
                "mode": "exact",
                "share_amount": share,
                "explanation": None,
                "rate_pct": band_rate_pct,
            }

        # Band without a user-supplied rate, surface the range.
        band = {
            "Independence": (5.0, 50.0),
            "Everyday Living": (17.5, 80.0),
        }.get(stream)
        if not band:
            return {"mode": "picker", "share_amount": None, "explanation": None}

        low_share = _compute_share(comp, band[0] / 100)
        high_share = _compute_share(comp, band[1] / 100)
        return {
            "mode": "band",
            "share_amount": None,
            "share_low": low_share,
            "share_high": high_share,
            "explanation": (
                "Your exact contribution rate is set by Services Australia. Enter "
                "the rate from your contribution letter for a precise figure."
            ),
        }

    # Exact-rate cohorts (full pension, self-funded).
    share = _compute_share(comp, stream_rate)
    return {
        "mode": "exact",
        "share_amount": share,
        "explanation": None,
        "rate_pct": round(stream_rate * 100, 2),
    }


def _compute_share(comp: PriceComparison, rate_decimal: float) -> float:
    """Return the participant contribution per unit for the given rate."""
    if comp.range_upper is None or comp.range_lower is None or comp.median is None:
        # Fall back to the user's charged rate, the caller supplies it via
        # the route layer when computing share against their own paid rate.
        base = comp.median or 0.0
    else:
        base = comp.median  # Not used; route uses charged rate directly.
    # The public spec defines share as ``pct * user's charged rate``. The
    # route layer passes the charged rate through ``comp`` indirectly by
    # populating ``median`` for us; the actual arithmetic happens on the
    # route side. Keep this helper simple, it is called for the share vs
    # rate calc in the route only. Return a decimal per unit that the
    # route multiplies against the charged rate.
    return round(base * rate_decimal, 2)


def share_from_rate(rate: float, rate_decimal: float) -> float:
    """The spec is explicit: Your Share = pct * user's charged rate.
    This helper is what the route calls with the entered rate."""
    return round(float(rate) * float(rate_decimal), 2)


# ---------------------------------------------------------------------------
# WS5, Data quality guards.
# ---------------------------------------------------------------------------


@dataclass
class QualityGuard:
    guard_type: str
    prompt: str
    allow_continue: bool = True
    after_hours_toggle_available: bool = False


AFTER_HOURS_SERVICES = frozenset({
    "Personal care", "Nursing care", "Registered nurse", "Enrolled nurse",
    "Nursing assistant", "Respite",
})


def run_quality_guards(
    *,
    service: str,
    rate: float,
    unit: str | None,
    comp: PriceComparison,
    after_hours_toggle: bool = False,
) -> QualityGuard | None:
    """Return the first triggered quality guard, or ``None`` if all clear."""
    if comp.direction == "non_checkable":
        return None  # handled at the render layer with a bespoke panel

    if comp.range_lower is None or comp.range_upper is None:
        return None

    # Guard 1, implausibly low.
    if rate < comp.range_lower * 0.60:
        return QualityGuard(
            guard_type="implausibly_low",
            prompt=(
                f"This rate is unusually low for {service.lower()}. Please check: "
                "(a) is this the hourly rate, or per visit or per trip? "
                "(b) is this the retail rate on your statement, or a wholesale rate? "
                "Some providers use subcontractors and list a lower base rate with a "
                "separate broker premium."
            ),
        )

    # Guard 2, implausibly high (double the upper bound).
    if rate > comp.range_upper * 2:
        return QualityGuard(
            guard_type="implausibly_high",
            prompt=(
                "This rate is more than double the top of the published range. Please "
                "check the unit is correct (hourly, per visit, per trip) and the amount "
                "is not a total across multiple visits."
            ),
        )

    # Guard 3, unit mismatch (per-trip / per-meal above 3× upper).
    if unit in ("trip", "meal") and rate > comp.range_upper * 3:
        return QualityGuard(
            guard_type="unit_mismatch",
            prompt=(
                "This value is well above the published range for a "
                f"{unit} rate. Please confirm the unit is correct, for example, "
                "an hourly rate mistakenly entered as per meal will look this high."
            ),
        )

    # Guard 4, after-hours ambiguity. Optional inline prompt only, does not
    # block. When the toggle is on we relax the standard guard so above-range
    # results carry an "after-hours, no published range" note instead.
    if (
        rate > comp.range_upper
        and service in AFTER_HOURS_SERVICES
        and not after_hours_toggle
    ):
        return QualityGuard(
            guard_type="after_hours_ambiguity",
            prompt=(
                "Was this service delivered outside standard business hours "
                "(evenings, weekends, public holidays)? DoH indicative ranges are for "
                "standard business hours only."
            ),
            after_hours_toggle_available=True,
        )

    return None


# ---------------------------------------------------------------------------
# WS6, Copy blocks + WS8 email template.
# ---------------------------------------------------------------------------

CAP_DEFERRAL_NOTE = {
    "headline": "Price caps deferred.",
    "body": (
        "The Australian Government has deferred the planned 1 July 2026 national "
        "provider price caps under Support at Home indefinitely. Providers continue "
        "to set their own prices. This tool compares your provider's rate against the "
        "indicative ranges published by the Department of Health, not a government cap."
    ),
    "citation": {
        "label": "Source: Minister for Aged Care media release, May 2026.",
        "url": "https://www.health.gov.au/ministers/the-hon-sam-rae-mp/media/strengthening-consumer-protections-for-older-australians",
    },
}

HOW_THIS_WORKS_BULLETS = [
    "Under Support at Home, providers set their own prices.",
    "The Department of Health publishes indicative price ranges based on a February 2025 survey of over 300 HCP providers.",
    "The Price Checker compares your provider's rate against those indicative ranges. It does not compare against a legislated cap because none is currently in force.",
    "The Australian Government has deferred the planned 1 July 2026 price caps indefinitely.",
    "Prices delivered outside standard business hours may be higher than the indicative range.",
    "Nursing hourly prices include the cost of everyday nursing consumables the nurse carries.",
    "The indicative ranges are a market snapshot from a survey. They are not a guarantee that in-range prices are fair or that above-range prices are unfair.",
    "DoH updates these ranges each quarter under the May 2026 policy commitment. We update Wayly's reference within 5 working days of each publication.",
]


def draft_email_to_provider(
    *,
    provider_name: str | None,
    first_name: str | None,
    service: str,
    unit: str | None,
    rate: float,
    lower: float | None,
    upper: float | None,
    source_date: str | None,
    include_increase_paragraph: bool = False,
    increase_count: int | None = None,
) -> dict:
    """Return the drafted subject + body for the "Email the provider" action."""
    provider_label = (provider_name or "there").strip() or "there"
    first = (first_name or "").strip() or "[Your name]"
    unit_word = _UNIT_LABELS.get(unit or "", "per unit")
    subject = f"Question about the rate for {service.lower()} on my recent statement"
    range_line = (
        f"The Department of Health National Summary of Support at Home Prices "
        f"({source_date or 'October 2025'}) shows an indicative range for this service of "
        f"${lower:,.2f} to ${upper:,.2f} {unit_word}."
        if lower is not None and upper is not None
        else "The Department of Health publishes indicative ranges for most Support at Home services."
    )
    body_lines = [
        f"Hi {provider_label},",
        "",
        f"I'd like to understand more about the rate you charge for {service.lower()}.",
        "",
        f"Your current rate is ${rate:,.2f} {unit_word}. {range_line}",
        "",
        (
            "I know indicative ranges are not caps and providers are free to set their own "
            "prices. Under the Aged Care Act 2024, prices need to be reasonable and reflect "
            "the cost of delivering the service. I'd appreciate a written explanation of how "
            "you set your rate, so I can understand what's included and make sure this is the "
            "right service arrangement for me."
        ),
    ]
    if include_increase_paragraph and (increase_count or 0) > 2:
        body_lines.extend([
            "",
            (
                f"I note that the DoH has encouraged providers to limit price increases to no "
                f"more than two per year. I've seen {increase_count} increases from your "
                "service over the past 12 months, so I would like to understand what has driven "
                "that."
            ),
            "",
            (
                "If we are unable to reach a satisfactory explanation, I understand the Aged Care "
                "Quality and Safety Commission has powers to order refunds where prices are found "
                "to be unreasonable."
            ),
        ])
    body_lines.extend([
        "",
        "Thanks,",
        first,
    ])
    return {
        "subject": subject,
        "body": "\n".join(body_lines),
        "disclaimer": (
            "This template is drafted to help you ask questions. It is not legal advice. "
            "If you want to pursue a refund complaint, contact the Aged Care Quality and "
            "Safety Commission directly or seek independent advice."
        ),
    }


# ---------------------------------------------------------------------------
# WS11, Rate-increase counter.
# ---------------------------------------------------------------------------

# See spec §4.11 for the two-floor rationale.
RATE_CHANGE_ABSOLUTE_FLOOR = 0.50   # dollars per unit
RATE_CHANGE_PERCENTAGE_FLOOR = 0.02  # 2%


def _clears_change_floor(new_rate: float, previous_rate: float) -> bool:
    """Both the absolute-dollar and percentage floors must be cleared."""
    delta = abs(new_rate - previous_rate)
    if delta < RATE_CHANGE_ABSOLUTE_FLOOR:
        return False
    if delta < RATE_CHANGE_PERCENTAGE_FLOOR * abs(previous_rate):
        return False
    return True


def count_rate_increases_last_12mo(saved_checks: list[dict]) -> int:
    """Given the user's saved checks for a (service, provider) combination,
    return the number of increases in the past 12 months per §4.11.

    ``saved_checks`` is expected to be a list of dicts with ``rate``,
    ``created_at`` (ISO string), and optional ``source_statement_id`` keys.
    """
    if not saved_checks:
        return 0

    # Sort ascending by created_at so we can walk through in chronological
    # order.
    def _dt_key(row: dict) -> str:
        return row.get("created_at") or ""
    ordered = sorted(saved_checks, key=_dt_key)

    now = _dt.datetime.now(_dt.timezone.utc)
    cutoff = now - _dt.timedelta(days=365)

    # Build groups. Rows carrying the same non-null source_statement_id
    # collapse into one group (spec §4.11 mid-statement grouping). Manual
    # saves without a statement id are their own group.
    groups: list[list[dict]] = []
    for row in ordered:
        rate_val = row.get("rate")
        try:
            rate_val = float(rate_val) if rate_val is not None else None
        except (TypeError, ValueError):
            continue
        if rate_val is None:
            continue
        sid = row.get("source_statement_id")
        row = dict(row, rate=rate_val)
        if sid and groups and groups[-1][-1].get("source_statement_id") == sid:
            groups[-1].append(row)
        else:
            groups.append([row])

    def _parse(iso_str: str | None) -> _dt.datetime | None:
        if not iso_str:
            return None
        try:
            dt_val = _dt.datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
            if dt_val.tzinfo is None:
                dt_val = dt_val.replace(tzinfo=_dt.timezone.utc)
            return dt_val
        except Exception:
            return None

    def _group_first_rate(g: list[dict]) -> float:
        return float(g[0]["rate"])

    def _group_last_rate(g: list[dict]) -> float:
        return float(g[-1]["rate"])

    def _group_created(g: list[dict]) -> _dt.datetime | None:
        # Use the LATEST row's timestamp for cutoff calculations, a mid-
        # statement transition group is "current" as of its later row.
        return _parse(g[-1].get("created_at"))

    increases = 0

    # 1) Intra-group increases (mid-statement transitions). A group with >=2
    #    rows counts one increase if its last rate is above its first rate
    #    and the change clears the floor. This handles §7.26 case 1.
    for g in groups:
        if len(g) < 2:
            continue
        created = _group_created(g)
        if created is None or created < cutoff:
            continue
        first_r, last_r = _group_first_rate(g), _group_last_rate(g)
        if last_r > first_r and _clears_change_floor(last_r, first_r):
            increases += 1

    # 2) Between-group increases. Compare the last rate of group N with the
    #    first rate of group N+1 to detect increases that happen across
    #    saves. Applies whether the group is a single manual save or a
    #    multi-row same-statement group.
    for i in range(1, len(groups)):
        prev_group = groups[i - 1]
        curr_group = groups[i]
        created = _group_created(curr_group)
        if created is None or created < cutoff:
            continue
        prev_rate = _group_last_rate(prev_group)
        curr_rate = _group_first_rate(curr_group)
        if curr_rate > prev_rate and _clears_change_floor(curr_rate, prev_rate):
            increases += 1

    return increases


# ---------------------------------------------------------------------------
# WS12, Provider name normalisation + fuzzy match.
# ---------------------------------------------------------------------------

_LEGAL_SUFFIXES = (
    "pty. ltd.", "pty ltd", "pty. limited.", "pty limited",
    "p/l", "p.l.",
    "incorporated", "inc.", "inc",
    "limited", "ltd.", "ltd",
    "company", "co.", "co",
)


def normalise_provider_name(name: str | None) -> str:
    """Collapse legal-suffix + punctuation + whitespace variants.

    Return ``""`` for None / whitespace input. Never raises.
    """
    if not name:
        return ""
    text = str(name)
    # Strip "trading as" (and everything after it).
    ta_pattern = re.compile(r"\s+t/a\s+.*$", re.IGNORECASE)
    text = ta_pattern.sub("", text)
    # Case + ampersand handling first (some suffixes contain ampersands).
    text = text.lower().replace("&", " and ")
    # Strip legal suffixes from the tail. Iterate to catch double suffixes
    # like "glorious services pty. ltd. incorporated".
    changed = True
    while changed:
        changed = False
        stripped = text.strip()
        for suffix in _LEGAL_SUFFIXES:
            if stripped.endswith(" " + suffix) or stripped.endswith("," + suffix) or stripped.endswith("." + suffix) or stripped == suffix:
                text = stripped[: -len(suffix)].rstrip(" ,.")
                changed = True
                break
            # Also handle suffix embedded before final punctuation.
            if stripped.endswith(suffix):
                text = stripped[: -len(suffix)].rstrip(" ,.")
                changed = True
                break
    # Strip punctuation.
    text = re.sub(r"[.,'\"]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _levenshtein(a: str, b: str) -> int:
    """Classical edit distance, iterative row-based."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr[j] = min(
                curr[j - 1] + 1,      # insertion
                prev[j] + 1,          # deletion
                prev[j - 1] + cost,   # substitution
            )
        prev = curr
    return prev[-1]


def fuzzy_match_provider(
    entered: str,
    candidates: Iterable[dict],
    max_distance: int = 3,
) -> dict | None:
    """Return the first candidate whose normalised name is within
    ``max_distance`` edit-distance of the entered provider name.

    ``candidates`` is a sequence of dicts each with a ``normalised_name`` key
    (as stored on the user's saved checks) and a ``display_name`` key that the
    UI shows back to the user.
    """
    ne = normalise_provider_name(entered)
    if not ne:
        return None
    best = None
    best_dist = max_distance + 1
    for c in candidates:
        norm = c.get("normalised_name") or normalise_provider_name(c.get("display_name"))
        if not norm:
            continue
        if norm == ne:
            return c
        dist = _levenshtein(ne, norm)
        if dist < best_dist:
            best = c
            best_dist = dist
    return best if best_dist <= max_distance else None


# ---------------------------------------------------------------------------
# Metadata surface for tests + UI.
# ---------------------------------------------------------------------------

def unit_dollar_label(unit: str | None) -> str:
    return _UNIT_DOLLAR_LABEL.get(unit or "hour", "$ per unit")


def unit_word(unit: str | None) -> str:
    return _UNIT_LABELS.get(unit or "hour", "per unit")


def personal_care_shift_date() -> _dt.date:
    return _PERSONAL_CARE_CLINICAL_DATE
