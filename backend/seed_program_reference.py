"""Seed rows for ``program_reference``.

Every row is a point-in-time figure with an ``effective_from`` date and an
``effective_to`` date that is either ``null`` (currently in force) or the date
the next row took over. Indexed figures (lifetime cap, classification budgets
after 1 July indexation) have multiple rows here so the lookup function can
answer historical queries correctly.

Sources are cited in ``source_url`` so audits can verify any figure against
the original Department of Health / My Aged Care / Services Australia page at
the time of writing.

DO NOT ADD COMPUTED ROWS HERE. The seed is for figures that come straight
from official sources. Derived figures (e.g. quarterly = annual / 4) belong
in ``budget.py`` and are computed at call time using ``get_value``.
"""
from __future__ import annotations
from typing import List


def _row(key, value, eff_from, *, eff_to=None, source=None, notes=None):
    return {
        "key": key, "value": value,
        "effective_from": eff_from, "effective_to": eff_to,
        "source_url": source, "notes": notes,
    }


# Department of Health citation used in many rows below
DOH = "https://www.health.gov.au/our-work/support-at-home"
MAC = "https://www.myagedcare.gov.au"

SEED_ROWS: List[dict] = [
    # ---------- Classification annual budgets (8 ongoing levels) ----------
    # Effective 1 November 2025 — first day of Support at Home.
    _row("classification_annual.1", 10731.00, "2025-11-01", source=DOH),
    _row("classification_annual.2", 15910.00, "2025-11-01", source=DOH),
    _row("classification_annual.3", 22515.00, "2025-11-01", source=DOH),
    _row("classification_annual.4", 29696.00, "2025-11-01", source=DOH),
    _row("classification_annual.5", 39805.00, "2025-11-01", source=DOH),
    _row("classification_annual.6", 49906.00, "2025-11-01", source=DOH),
    _row("classification_annual.7", 60005.00, "2025-11-01", source=DOH),
    _row("classification_annual.8", 78106.00, "2025-11-01", source=DOH),

    # ---------- Care management deduction and rollover ----------
    _row("care_management.cap_pct", 0.10, "2025-11-01", source=DOH,
         notes="Provider may retain up to 10% of the quarterly budget for care management."),
    _row("rollover.floor_aud", 1000.00, "2025-11-01", source=DOH),
    _row("rollover.pct", 0.10, "2025-11-01", source=DOH,
         notes="Carry-over capped at the greater of $1,000 or 10% of the quarterly budget."),

    # ---------- Lifetime contribution caps ----------
    # Original cap effective from program start.
    _row("lifetime_cap.standard", 135318.69, "2025-11-01", eff_to="2026-03-20",
         source=DOH, notes="Combined cap with non-clinical care contribution in residential aged care."),
    _row("lifetime_cap.no_worse_off", 84571.66, "2025-11-01", eff_to="2026-03-20",
         source=DOH, notes="HCP no-worse-off cohort cap."),
    # 20 March 2026 indexation.
    _row("lifetime_cap.standard", 137917.01, "2026-03-20",
         source=MAC, notes="Indexed 20 March 2026."),
    _row("lifetime_cap.no_worse_off", 86185.23, "2026-03-20",
         source=MAC, notes="Indexed 20 March 2026."),

    # ---------- Time-limited contribution cap ----------
    _row("cap.time_limited_years", 4, "2025-11-01", source=DOH,
         notes="Non-clinical contributions are capped at 4 cumulative years."),

    # ---------- Interim funding ----------
    _row("interim_funding.pct", 0.60, "2025-11-01", source=DOH,
         notes="Interim funding pays 60% of classification budget while waiting; remainder is NOT backdated."),

    # ---------- Restorative Care Pathway ----------
    _row("restorative.budget_aud", 6000.00, "2025-11-01", source=DOH,
         notes="Approximate; per health.gov.au 'a unit of funding of around $6,000 for up to 16 weeks'."),
    _row("restorative.extension_aud", 12000.00, "2025-11-01", source=DOH,
         notes="Additional unit via Support Plan Review."),
    _row("restorative.weeks", 16, "2025-11-01", source=DOH),
    _row("restorative.episodes_per_year", 2, "2025-11-01", source=DOH),
    _row("restorative.months_between_episodes", 3, "2025-11-01", source=DOH,
         notes="Minimum 3 months between non-consecutive restorative episodes."),

    # ---------- End-of-Life Pathway ----------
    _row("eol.budget_aud", 25000.00, "2025-11-01", source=DOH,
         notes="Approximately $25,000 over 12 weeks, extendable to 16."),
    _row("eol.weeks", 12, "2025-11-01", source=DOH),
    _row("eol.max_weeks", 16, "2025-11-01", source=DOH),

    # ---------- AT-HM ----------
    _row("at_hm.validity_months", 12, "2025-11-01", source=DOH,
         notes="AT-HM funding valid 12 months; must be spent, not just committed."),
    _row("at_hm.high_tier_threshold_aud", 15000.00, "2025-11-01", source=DOH,
         notes="High tier ≥ $15,000 in some cases — confirm against current Schedule of Subsidies."),

    # ---------- Contribution category rates ----------
    _row("contribution.clinical_pct", 0.00, "2025-11-01", source=DOH,
         notes="Clinical supports are fully government-funded — zero participant contribution."),
    _row("contribution.independence_band", [0.05, 0.50], "2025-11-01", source=DOH,
         notes="Independence supports: 5–50% means-tested participant contribution."),
    _row("contribution.everyday_band", [0.175, 0.80], "2025-11-01", source=DOH,
         notes="Everyday Living supports: 17.5–80% means-tested participant contribution."),

    # ---------- Stream proportions (MVP default; participant-specific in reality) ----------
    _row("stream_proportion.Clinical", 0.40, "2025-11-01",
         notes="MVP indicative split — real allocation is set in the individualised budget."),
    _row("stream_proportion.Independence", 0.35, "2025-11-01"),
    _row("stream_proportion.Everyday Living", 0.25, "2025-11-01"),

    # ---------- Confirmed program deadlines ----------
    _row("deadline.statement_due_days_after_month_end", 30, "2025-11-01", source=DOH,
         notes="Statement due by the last day of the following month."),
    _row("deadline.provider_exit_notice_days", 14, "2025-11-01", source=DOH),
    _row("deadline.provider_branch_transfer_notice_days", 90, "2025-11-01", source=DOH),
    _row("deadline.provider_initial_agreement_min_days_before_cease", 90, "2025-11-01", source=DOH),
    _row("deadline.death_provider_notify_days", 28, "2025-11-01", source=DOH),
    _row("deadline.death_final_claim_days", 60, "2025-11-01", source=DOH),
    _row("deadline.contribution_letter_validity_days", 120, "2025-11-01", source="https://www.servicesaustralia.gov.au"),
    _row("deadline.referral_code_validity_days", 56, "2025-11-01", source=DOH),
    _row("deadline.no_service_quarters_for_withdrawal", 4, "2025-11-01", source=DOH,
         notes="Four consecutive quarters (one year) with no services risks funding withdrawal."),
    _row("deadline.respite_days_per_year", 63, "2025-11-01", source=DOH,
         notes="Up to 63 subsidised residential respite days per financial year."),
    _row("deadline.cancellation_charge_hours_threshold", 48, "2025-11-01", source=DOH,
         notes="Under-48-hour cancellation can be charged to budget (provider may waive for hospital admissions)."),

    # ---------- Forward-dated policy dates (gated for alerts) ----------
    _row("policy_date.personal_care_free", "2026-10-01", "2025-11-01", source=DOH,
         notes="Announced 22 April 2026 by Aged Care Minister Sam Rae. Personal care moves from Independence to Clinical Supports — zero contribution from 1 October 2026."),
    _row("policy_date.price_caps_start", "2026-07-01", "2025-11-01", source=DOH,
         notes="National provider price caps commence."),
    _row("policy_date.eol_second_round_start", "2027-02-01", "2025-11-01", source=DOH,
         notes="Approximate — 'early 2027' for End-of-Life second-round funding."),
    _row("policy_date.chsp_transition_earliest", "2027-07-01", "2025-11-01", source=DOH,
         notes="CHSP transition into Support at Home, no earlier than 1 July 2027."),
    _row("policy_date.next_classification_indexation", "2026-07-01", "2025-11-01", source=DOH,
         notes="Classification budgets indexed every 1 July."),
    _row("policy_date.next_cap_indexation", "2026-09-20", "2025-11-01", source=MAC,
         notes="Lifetime caps indexed 20 March and 20 September."),
]


def get_seed_rows() -> List[dict]:
    """Return a deep-enough copy so the caller can mutate freely."""
    return [dict(r) for r in SEED_ROWS]
