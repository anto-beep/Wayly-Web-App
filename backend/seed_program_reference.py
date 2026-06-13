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
    # Corrected 2026-06 against Aged Care Rules 2025 — see audit report.
    # Daily figures are the legal source of truth (Aged Care Rules 2025,
    # sections 194-5(2) and 238-5). Annual figures are derived (daily × 365)
    # and rounded to the nearest dollar for display.
    # Effective 1 November 2025 — first day of Support at Home.
    _row("classification.1.daily_base_individual", 26.46, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 (F2025L01173), section 194-5(2)."),
    _row("classification.1.daily_base_provider",    2.94, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025, section 238-5."),
    _row("classification.1.daily_total",           29.40, "2025-11-01", source=DOH),
    _row("classification_annual.1",            10731.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 sections 194-5(2) + 238-5. 29.40 × 365 = 10,731."),

    _row("classification.2.daily_base_individual", 39.54, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025, section 194-5(2)."),
    _row("classification.2.daily_base_provider",    4.39, "2025-11-01", source=DOH),
    _row("classification.2.daily_total",           43.93, "2025-11-01", source=DOH),
    _row("classification_annual.2",            16034.00, "2025-11-01", source=DOH,
         notes="43.93 × 365 = 16,034.45 → rounded to 16,034."),

    _row("classification.3.daily_base_individual", 54.16, "2025-11-01", source=DOH),
    _row("classification.3.daily_base_provider",    6.02, "2025-11-01", source=DOH),
    _row("classification.3.daily_total",           60.18, "2025-11-01", source=DOH),
    _row("classification_annual.3",            21966.00, "2025-11-01", source=DOH,
         notes="60.18 × 365 = 21,965.70 → rounded to 21,966."),

    _row("classification.4.daily_base_individual", 73.22, "2025-11-01", source=DOH),
    _row("classification.4.daily_base_provider",    8.14, "2025-11-01", source=DOH),
    _row("classification.4.daily_total",           81.36, "2025-11-01", source=DOH),
    _row("classification_annual.4",            29696.00, "2025-11-01", source=DOH,
         notes="81.36 × 365 = 29,696.40 → rounded to 29,696."),

    _row("classification.5.daily_base_individual", 97.88, "2025-11-01", source=DOH),
    _row("classification.5.daily_base_provider",   10.88, "2025-11-01", source=DOH),
    _row("classification.5.daily_total",          108.76, "2025-11-01", source=DOH),
    _row("classification_annual.5",            39697.00, "2025-11-01", source=DOH,
         notes="108.76 × 365 = 39,697.40 → rounded to 39,697."),

    _row("classification.6.daily_base_individual", 118.64, "2025-11-01", source=DOH),
    _row("classification.6.daily_base_provider",    13.18, "2025-11-01", source=DOH),
    _row("classification.6.daily_total",           131.82, "2025-11-01", source=DOH),
    _row("classification_annual.6",             48114.00, "2025-11-01", source=DOH,
         notes="131.82 × 365 = 48,114.30 → rounded to 48,114."),

    _row("classification.7.daily_base_individual", 143.38, "2025-11-01", source=DOH),
    _row("classification.7.daily_base_provider",    15.93, "2025-11-01", source=DOH),
    _row("classification.7.daily_total",           159.31, "2025-11-01", source=DOH),
    _row("classification_annual.7",             58148.00, "2025-11-01", source=DOH,
         notes="159.31 × 365 = 58,148.15 → rounded to 58,148."),

    _row("classification.8.daily_base_individual", 192.59, "2025-11-01", source=DOH),
    _row("classification.8.daily_base_provider",    21.40, "2025-11-01", source=DOH),
    _row("classification.8.daily_total",           213.99, "2025-11-01", source=DOH),
    _row("classification_annual.8",             78106.00, "2025-11-01", source=DOH,
         notes="213.99 × 365 = 78,106.35 → rounded to 78,106."),

    # ---------- Transitional HCP daily figures (Prompt J) ----------
    # Aged Care Rules 2025, section 194-5(3) — participants who transitioned
    # from a Home Care Package on or before 31 October 2025.
    _row("transitional_hcp.1.daily_base_individual",  27.09, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025, section 194-5(3)."),
    _row("transitional_hcp.1.daily_base_provider",     3.01, "2025-11-01", source=DOH),
    _row("transitional_hcp.1.daily_total",            30.10, "2025-11-01", source=DOH),
    _row("transitional_hcp.1.annual_aud",          10986.00, "2025-11-01", source=DOH,
         notes="30.10 × 365 = 10,986.50 → rounded to 10,986."),

    _row("transitional_hcp.2.daily_base_individual",  47.64, "2025-11-01", source=DOH),
    _row("transitional_hcp.2.daily_base_provider",     5.29, "2025-11-01", source=DOH),
    _row("transitional_hcp.2.daily_total",            52.93, "2025-11-01", source=DOH),
    _row("transitional_hcp.2.annual_aud",          19319.00, "2025-11-01", source=DOH,
         notes="52.93 × 365 = 19,319.45 → rounded to 19,319."),

    _row("transitional_hcp.3.daily_base_individual", 103.70, "2025-11-01", source=DOH),
    _row("transitional_hcp.3.daily_base_provider",    11.52, "2025-11-01", source=DOH),
    _row("transitional_hcp.3.daily_total",           115.22, "2025-11-01", source=DOH),
    _row("transitional_hcp.3.annual_aud",          42055.00, "2025-11-01", source=DOH,
         notes="115.22 × 365 = 42,055.30 → rounded to 42,055."),

    _row("transitional_hcp.4.daily_base_individual", 157.21, "2025-11-01", source=DOH),
    _row("transitional_hcp.4.daily_base_provider",    17.47, "2025-11-01", source=DOH),
    _row("transitional_hcp.4.daily_total",           174.68, "2025-11-01", source=DOH),
    _row("transitional_hcp.4.annual_aud",          63758.00, "2025-11-01", source=DOH,
         notes="174.68 × 365 = 63,758.20 → rounded to 63,758."),

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

    # ---------- AT-HM (Prompt L — full tier set) ----------
    _row("at_hm.validity_months", 12, "2025-11-01", source=DOH,
         notes="AT-HM funding valid 12 months; must be spent, not just committed."),
    _row("athm.tier.low.amount_aud", 500.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 212-10. Examples: shower chair, non-slip mats, basic grab rails."),
    _row("athm.tier.medium.amount_aud", 2000.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 212-10. Examples: walking frames, mobility aids."),
    _row("athm.tier.high.amount_aud", 15000.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 212-10 plus exceedance under section 211. Examples: stair lift, bathroom modification. High tier accessible once per lifetime per the Schedule."),
    _row("athm.tier.high.amount_can_exceed", True, "2025-11-01", source=DOH),
    _row("athm.tier.high.exceed_requires_evidence", True, "2025-11-01", source=DOH,
         notes="Exceedance requires prescription or similar clinical evidence."),
    _row("athm.tier.high.one_per_lifetime", True, "2025-11-01", source=DOH),
    _row("athm.duration.initial_months", 12, "2025-11-01", source=DOH),
    _row("athm.duration.extension_months", 12, "2025-11-01", source=DOH,
         notes="Extension to 24 months total — requires evidence."),
    _row("athm.duration.extension_requires_evidence", True, "2025-11-01", source=DOH),
    _row("athm.remote_supplement.pct", 50, "2025-11-01", source=DOH,
         notes="Schedule of Subsidies — MM6/MM7 50% loading applied over and above the standard AT-HM tier."),
    _row("athm.remote_supplement.eligibility", "MM6 or MM7 Modified Monash Model location", "2025-11-01", source=DOH),
    _row("at_hm.high_tier_threshold_aud", 15000.00, "2025-11-01", source=DOH,
         notes="Legacy alias of athm.tier.high.amount_aud — kept for backwards-compatible callers."),

    # ---------- Assistance Dog tier (Prompt K) ----------
    _row("athm.assistance_dog.amount_aud", 2000.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 212-5 (Tier amounts for AT classification type ongoing — Assistance dogs)."),
    _row("athm.assistance_dog.period_months", 12, "2025-11-01", source=DOH),
    _row("athm.assistance_dog.rollover", False, "2025-11-01", source=DOH,
         notes="Schedule explicitly: 'cannot accrue or roll over'."),

    # ---------- Short-term pathways (Prompt K) ----------
    _row("pathway.restorative_care.daily_aud", 53.67, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 194-10(2). Non-ongoing targeted care services."),
    _row("pathway.restorative_care.duration_days", 112, "2025-11-01", source=DOH,
         notes="16 weeks."),
    _row("pathway.restorative_care.episode_aud", 6000.00, "2025-11-01", source=DOH,
         notes="Nominal — actual = 53.67 × 112 = 6,011.04."),
    _row("pathway.restorative_care.max_episodes", 2, "2025-11-01", source=DOH,
         notes="Standard plus extension."),
    _row("pathway.restorative_care.max_total_aud", 12000.00, "2025-11-01", source=DOH,
         notes="If extension approved."),

    _row("pathway.end_of_life.daily_aud", 298.04, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 194-10(2). Participants with prognosis of 3 months or less."),
    _row("pathway.end_of_life.duration_days", 84, "2025-11-01", source=DOH,
         notes="12 weeks."),
    _row("pathway.end_of_life.episode_aud", 25000.00, "2025-11-01", source=DOH,
         notes="Nominal — actual = 298.04 × 84 = 25,035.36."),

    # ---------- Primary supplements (Prompt M) ----------
    # Oxygen — Rules section 196-15
    _row("supplement.oxygen.daily_aud", 14.66, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-15."),
    _row("supplement.oxygen.eligibility",
         "Medical practitioner certifies continual need for oxygen. Care plan covers nursing care consumables and provider supplies oxygen equipment.",
         "2025-11-01", source=DOH),
    _row("supplement.oxygen.applies_to", ["ongoing", "short_term_except_strc"], "2025-11-01", source=DOH),

    # Enteral feeding — Rules section 196-20
    _row("supplement.enteral_bolus.daily_aud", 23.25, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-20."),
    _row("supplement.enteral_non_bolus.daily_aud", 26.11, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-20."),
    _row("supplement.enteral.eligibility",
         "Medical practitioner certifies need for non-supplementary enteral feeding. Care plan covers nutrition supports.",
         "2025-11-01", source=DOH),

    # Veterans' supplement — Rules section 196-25
    _row("supplement.veterans.pct_of_base_individual", 11.5, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-25."),
    _row("supplement.veterans.eligibility",
         "Eligible veteran as determined by Department of Veterans' Affairs.", "2025-11-01", source=DOH),

    # Dementia and cognition supplement — Rules section 196-30
    _row("supplement.dementia_cognition.pct_of_base_individual", 11.5, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-30."),
    _row("supplement.dementia_cognition.grandfathered_only", True, "2025-11-01", source=DOH),
    _row("supplement.dementia_cognition.eligibility",
         "Grandfathered HCP recipients only — must have been in receipt of the supplement on 31 October 2025. Ceases on reassessment to a Support at Home classification.",
         "2025-11-01", source=DOH),

    # EACHD top-up — Rules section 196-35
    _row("supplement.eachd_top_up.daily_aud", 3.45, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-35."),
    _row("supplement.eachd_top_up.grandfathered_only", True, "2025-11-01", source=DOH),
    _row("supplement.eachd_top_up.eligibility",
         "Participants who were in receipt of an EACH-D package on 31 July 2013.", "2025-11-01", source=DOH),

    # Care management supplement (provider-based) — Rules section 205-15
    _row("supplement.care_management_provider.daily_aud", 3.95, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 205-15."),
    _row("supplement.care_management_provider.applies_to_provider", True, "2025-11-01", source=DOH),
    _row("supplement.care_management_provider.note",
         "Provider-based — does not appear directly on participant statements as a participant amount.",
         "2025-11-01", source=DOH),
    _row("supplement.care_management_provider.eligibility",
         "Provider supplement for delivering services to specific cohorts: older Aboriginal and Torres Strait Islander people; homeless or at-risk-of-homeless; care leavers (including Forgotten Australians and former child migrants); veterans approved for the Veterans' Supplement; participants referred from the care finder program.",
         "2025-11-01", source=DOH),

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
    _row("policy_date.price_caps_start", "2026-07-01", "2025-11-01", eff_to="2026-05-19", source=DOH,
         notes="Originally scheduled commencement of national provider price caps. Closed 19 May 2026 after the Australian Government announced an indefinite deferral the next day."),
    _row("policy.price_caps_status", "deferred_indefinitely", "2026-05-20",
         source="https://www.health.gov.au/our-work/support-at-home",
         notes="Australian Government announced on 20 May 2026 that national provider price caps under Support at Home are deferred indefinitely. Providers continue to set their own prices."),
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
