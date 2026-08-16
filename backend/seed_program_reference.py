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
    # Corrected 2026-06 against Aged Care Rules 2025, see audit report.
    # Daily figures are the legal source of truth (Aged Care Rules 2025,
    # sections 194-5(2) and 238-5). Annual figures are derived (daily × 365)
    # and rounded to the nearest dollar for display.
    # Effective 1 November 2025, first day of Support at Home.
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
    # Aged Care Rules 2025, section 194-5(3), participants who transitioned
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

    # ---------- AT-HM (Prompt L, full tier set) ----------
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
         notes="Extension to 24 months total, requires evidence."),
    _row("athm.duration.extension_requires_evidence", True, "2025-11-01", source=DOH),
    _row("athm.remote_supplement.pct", 50, "2025-11-01", source=DOH,
         notes="Schedule of Subsidies, MM6/MM7 50% loading applied over and above the standard AT-HM tier."),
    _row("athm.remote_supplement.eligibility", "MM6 or MM7 Modified Monash Model location", "2025-11-01", source=DOH),
    _row("at_hm.high_tier_threshold_aud", 15000.00, "2025-11-01", source=DOH,
         notes="Legacy alias of athm.tier.high.amount_aud, kept for backwards-compatible callers."),

    # ---------- Assistance Dog tier (Prompt K) ----------
    _row("athm.assistance_dog.amount_aud", 2000.00, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 212-5 (Tier amounts for AT classification type ongoing, Assistance dogs)."),
    _row("athm.assistance_dog.period_months", 12, "2025-11-01", source=DOH),
    _row("athm.assistance_dog.rollover", False, "2025-11-01", source=DOH,
         notes="Schedule explicitly: 'cannot accrue or roll over'."),

    # ---------- Short-term pathways (Prompt K) ----------
    _row("pathway.restorative_care.daily_aud", 53.67, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 194-10(2). Non-ongoing targeted care services."),
    _row("pathway.restorative_care.duration_days", 112, "2025-11-01", source=DOH,
         notes="16 weeks."),
    _row("pathway.restorative_care.episode_aud", 6000.00, "2025-11-01", source=DOH,
         notes="Nominal, actual = 53.67 × 112 = 6,011.04."),
    _row("pathway.restorative_care.max_episodes", 2, "2025-11-01", source=DOH,
         notes="Standard plus extension."),
    _row("pathway.restorative_care.max_total_aud", 12000.00, "2025-11-01", source=DOH,
         notes="If extension approved."),

    _row("pathway.end_of_life.daily_aud", 298.04, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 194-10(2). Participants with prognosis of 3 months or less."),
    _row("pathway.end_of_life.duration_days", 84, "2025-11-01", source=DOH,
         notes="12 weeks."),
    _row("pathway.end_of_life.episode_aud", 25000.00, "2025-11-01", source=DOH,
         notes="Nominal, actual = 298.04 × 84 = 25,035.36."),

    # ---------- Primary supplements (Prompt M) ----------
    # Oxygen, Rules section 196-15
    _row("supplement.oxygen.daily_aud", 14.66, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-15."),
    _row("supplement.oxygen.eligibility",
         "Medical practitioner certifies continual need for oxygen. Care plan covers nursing care consumables and provider supplies oxygen equipment.",
         "2025-11-01", source=DOH),
    _row("supplement.oxygen.applies_to", ["ongoing", "short_term_except_strc"], "2025-11-01", source=DOH),

    # Enteral feeding, Rules section 196-20
    _row("supplement.enteral_bolus.daily_aud", 23.25, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-20."),
    _row("supplement.enteral_non_bolus.daily_aud", 26.11, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-20."),
    _row("supplement.enteral.eligibility",
         "Medical practitioner certifies need for non-supplementary enteral feeding. Care plan covers nutrition supports.",
         "2025-11-01", source=DOH),

    # Veterans' supplement, Rules section 196-25
    _row("supplement.veterans.pct_of_base_individual", 11.5, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-25."),
    _row("supplement.veterans.eligibility",
         "Eligible veteran as determined by Department of Veterans' Affairs.", "2025-11-01", source=DOH),

    # Dementia and cognition supplement, Rules section 196-30
    _row("supplement.dementia_cognition.pct_of_base_individual", 11.5, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-30."),
    _row("supplement.dementia_cognition.grandfathered_only", True, "2025-11-01", source=DOH),
    _row("supplement.dementia_cognition.eligibility",
         "Grandfathered HCP recipients only, must have been in receipt of the supplement on 31 October 2025. Ceases on reassessment to a Support at Home classification.",
         "2025-11-01", source=DOH),

    # EACHD top-up, Rules section 196-35
    _row("supplement.eachd_top_up.daily_aud", 3.45, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 196-35."),
    _row("supplement.eachd_top_up.grandfathered_only", True, "2025-11-01", source=DOH),
    _row("supplement.eachd_top_up.eligibility",
         "Participants who were in receipt of an EACH-D package on 31 July 2013.", "2025-11-01", source=DOH),

    # Care management supplement (provider-based), Rules section 205-15
    _row("supplement.care_management_provider.daily_aud", 3.95, "2025-11-01", source=DOH,
         notes="Aged Care Rules 2025 section 205-15."),
    _row("supplement.care_management_provider.applies_to_provider", True, "2025-11-01", source=DOH),
    _row("supplement.care_management_provider.note",
         "Provider-based, does not appear directly on participant statements as a participant amount.",
         "2025-11-01", source=DOH),
    _row("supplement.care_management_provider.eligibility",
         "Provider supplement for delivering services to specific cohorts: older Aboriginal and Torres Strait Islander people; homeless or at-risk-of-homeless; care leavers (including Forgotten Australians and former child migrants); veterans approved for the Veterans' Supplement; participants referred from the care finder program.",
         "2025-11-01", source=DOH),

    # ---------- Contribution category rates ----------
    _row("contribution.clinical_pct", 0.00, "2025-11-01", source=DOH,
         notes="Clinical supports are fully government-funded, zero participant contribution."),
    _row("contribution.independence_band", [0.05, 0.50], "2025-11-01", source=DOH,
         notes="Independence supports: 5-50% means-tested participant contribution."),
    _row("contribution.everyday_band", [0.175, 0.80], "2025-11-01", source=DOH,
         notes="Everyday Living supports: 17.5-80% means-tested participant contribution."),

    # ---------- Stream proportions (MVP default; participant-specific in reality) ----------
    _row("stream_proportion.Clinical", 0.40, "2025-11-01",
         notes="MVP indicative split, real allocation is set in the individualised budget."),
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
         notes="Announced 22 April 2026 by Aged Care Minister Sam Rae. Personal care moves from Independence to Clinical Supports, zero contribution from 1 October 2026."),
    _row("policy_date.price_caps_start", "2026-07-01", "2025-11-01", eff_to="2026-05-19", source=DOH,
         notes="Originally scheduled commencement of national provider price caps. Closed 19 May 2026 after the Australian Government announced an indefinite deferral the next day."),
    _row("policy.price_caps_status", "deferred_indefinitely", "2026-05-20",
         source="https://www.health.gov.au/our-work/support-at-home",
         notes="Australian Government announced on 20 May 2026 that national provider price caps under Support at Home are deferred indefinitely. Providers continue to set their own prices."),
    _row("policy_date.eol_second_round_start", "2027-02-01", "2025-11-01", source=DOH,
         notes="Approximate, 'early 2027' for End-of-Life second-round funding."),
    _row("policy_date.chsp_transition_earliest", "2027-07-01", "2025-11-01", source=DOH,
         notes="CHSP transition into Support at Home, no earlier than 1 July 2027."),
    _row("policy_date.next_classification_indexation", "2026-07-01", "2025-11-01", source=DOH,
         notes="Classification budgets indexed every 1 July."),
    _row("policy_date.next_cap_indexation", "2026-09-20", "2025-11-01", source=MAC,
         notes="Lifetime caps indexed 20 March and 20 September."),

    # ---------- Indicative service prices (October 2025) ----------
    # Source: Department of Health "Summary of indicative Support at Home
    # prices" PDF. These are network medians + ranges, NOT price caps ,
    # providers continue to set their own prices until DoH publishes any
    # post-1-July-2026 figures.
    # Each row carries the median; the matching .lower / .upper rows define
    # the published indicative range.
    _row("indicative_price.nursing_care.median_aud_hour", 150.00, "2025-10-01", source=DOH,
         notes="Indicative median per hour. Range: $125-$179."),
    _row("indicative_price.nursing_care.lower_aud_hour", 125.00, "2025-10-01", source=DOH),
    _row("indicative_price.nursing_care.upper_aud_hour", 179.00, "2025-10-01", source=DOH),

    _row("indicative_price.registered_nurse.median_aud_hour", 160.00, "2025-10-01", source=DOH,
         notes="Range $144-$186."),
    _row("indicative_price.registered_nurse.lower_aud_hour", 144.00, "2025-10-01", source=DOH),
    _row("indicative_price.registered_nurse.upper_aud_hour", 186.00, "2025-10-01", source=DOH),

    _row("indicative_price.enrolled_nurse.median_aud_hour", 140.00, "2025-10-01", source=DOH,
         notes="Range $120-$163."),
    _row("indicative_price.enrolled_nurse.lower_aud_hour", 120.00, "2025-10-01", source=DOH),
    _row("indicative_price.enrolled_nurse.upper_aud_hour", 163.00, "2025-10-01", source=DOH),

    _row("indicative_price.nursing_assistant.median_aud_hour", 110.00, "2025-10-01", source=DOH,
         notes="Range $92-$143."),
    _row("indicative_price.nursing_assistant.lower_aud_hour", 92.00, "2025-10-01", source=DOH),
    _row("indicative_price.nursing_assistant.upper_aud_hour", 143.00, "2025-10-01", source=DOH),

    _row("indicative_price.allied_health.median_aud_hour", 195.00, "2025-10-01", source=DOH,
         notes="Allied health and other therapeutic services. Range $160-$220."),
    _row("indicative_price.allied_health.lower_aud_hour", 160.00, "2025-10-01", source=DOH),
    _row("indicative_price.allied_health.upper_aud_hour", 220.00, "2025-10-01", source=DOH),

    _row("indicative_price.allied_health_assistant.median_aud_hour", 122.00, "2025-10-01", source=DOH,
         notes="Range $105-$167."),
    _row("indicative_price.allied_health_assistant.lower_aud_hour", 105.00, "2025-10-01", source=DOH),
    _row("indicative_price.allied_health_assistant.upper_aud_hour", 167.00, "2025-10-01", source=DOH),

    _row("indicative_price.counsellor.median_aud_hour", 208.00, "2025-10-01", source=DOH,
         notes="Counsellor or psychotherapist. Range $160-$225."),
    _row("indicative_price.counsellor.lower_aud_hour", 160.00, "2025-10-01", source=DOH),
    _row("indicative_price.counsellor.upper_aud_hour", 225.00, "2025-10-01", source=DOH),

    _row("indicative_price.dietitian.median_aud_hour", 200.00, "2025-10-01", source=DOH,
         notes="Dietitian or nutritionist. Range $165-$219."),
    _row("indicative_price.dietitian.lower_aud_hour", 165.00, "2025-10-01", source=DOH),
    _row("indicative_price.dietitian.upper_aud_hour", 219.00, "2025-10-01", source=DOH),

    _row("indicative_price.exercise_physiologist.median_aud_hour", 190.00, "2025-10-01", source=DOH,
         notes="Range $165-$219."),
    _row("indicative_price.exercise_physiologist.lower_aud_hour", 165.00, "2025-10-01", source=DOH),
    _row("indicative_price.exercise_physiologist.upper_aud_hour", 219.00, "2025-10-01", source=DOH),

    _row("indicative_price.occupational_therapist.median_aud_hour", 200.00, "2025-10-01", source=DOH,
         notes="Range $174-$220."),
    _row("indicative_price.occupational_therapist.lower_aud_hour", 174.00, "2025-10-01", source=DOH),
    _row("indicative_price.occupational_therapist.upper_aud_hour", 220.00, "2025-10-01", source=DOH),

    _row("indicative_price.physiotherapist.median_aud_hour", 185.00, "2025-10-01", source=DOH,
         notes="Range $160-$210."),
    _row("indicative_price.physiotherapist.lower_aud_hour", 160.00, "2025-10-01", source=DOH),
    _row("indicative_price.physiotherapist.upper_aud_hour", 210.00, "2025-10-01", source=DOH),

    _row("indicative_price.podiatrist.median_aud_hour", 180.00, "2025-10-01", source=DOH,
         notes="Range $153-$208."),
    _row("indicative_price.podiatrist.lower_aud_hour", 153.00, "2025-10-01", source=DOH),
    _row("indicative_price.podiatrist.upper_aud_hour", 208.00, "2025-10-01", source=DOH),

    _row("indicative_price.psychologist.median_aud_hour", 228.00, "2025-10-01", source=DOH,
         notes="Range $210-$250."),
    _row("indicative_price.psychologist.lower_aud_hour", 210.00, "2025-10-01", source=DOH),
    _row("indicative_price.psychologist.upper_aud_hour", 250.00, "2025-10-01", source=DOH),

    _row("indicative_price.social_worker.median_aud_hour", 200.00, "2025-10-01", source=DOH,
         notes="Range $163-$238."),
    _row("indicative_price.social_worker.lower_aud_hour", 163.00, "2025-10-01", source=DOH),
    _row("indicative_price.social_worker.upper_aud_hour", 238.00, "2025-10-01", source=DOH),

    _row("indicative_price.speech_pathologist.median_aud_hour", 208.00, "2025-10-01", source=DOH,
         notes="Range $187-$236."),
    _row("indicative_price.speech_pathologist.lower_aud_hour", 187.00, "2025-10-01", source=DOH),
    _row("indicative_price.speech_pathologist.upper_aud_hour", 236.00, "2025-10-01", source=DOH),

    # ---- Independence stream
    _row("indicative_price.care_management.median_aud_hour", 120.00, "2025-10-01", source=DOH,
         notes="Range $80-$150."),
    _row("indicative_price.care_management.lower_aud_hour", 80.00, "2025-10-01", source=DOH),
    _row("indicative_price.care_management.upper_aud_hour", 150.00, "2025-10-01", source=DOH),

    _row("indicative_price.restorative_care_management.median_aud_hour", 150.00, "2025-10-01", source=DOH,
         notes="Range $120-$173."),
    _row("indicative_price.restorative_care_management.lower_aud_hour", 120.00, "2025-10-01", source=DOH),
    _row("indicative_price.restorative_care_management.upper_aud_hour", 173.00, "2025-10-01", source=DOH),

    _row("indicative_price.personal_care.median_aud_hour", 100.00, "2025-10-01", source=DOH,
         notes="Range $85-$115."),
    _row("indicative_price.personal_care.lower_aud_hour", 85.00, "2025-10-01", source=DOH),
    _row("indicative_price.personal_care.upper_aud_hour", 115.00, "2025-10-01", source=DOH),

    _row("indicative_price.therapeutic_independent_living.median_aud_hour", 165.00, "2025-10-01", source=DOH,
         notes="Therapeutic services for independent living. Range $140-$220."),
    _row("indicative_price.therapeutic_independent_living.lower_aud_hour", 140.00, "2025-10-01", source=DOH),
    _row("indicative_price.therapeutic_independent_living.upper_aud_hour", 220.00, "2025-10-01", source=DOH),

    _row("indicative_price.remedial_masseuse.median_aud_hour", 150.00, "2025-10-01", source=DOH,
         notes="Range $134-$206."),
    _row("indicative_price.remedial_masseuse.lower_aud_hour", 134.00, "2025-10-01", source=DOH),
    _row("indicative_price.remedial_masseuse.upper_aud_hour", 206.00, "2025-10-01", source=DOH),

    _row("indicative_price.respite.median_aud_hour", 99.00, "2025-10-01", source=DOH,
         notes="Range $85-$112."),
    _row("indicative_price.respite.lower_aud_hour", 85.00, "2025-10-01", source=DOH),
    _row("indicative_price.respite.upper_aud_hour", 112.00, "2025-10-01", source=DOH),

    # ---- Everyday Living stream
    _row("indicative_price.social_support.median_aud_hour", 99.00, "2025-10-01", source=DOH,
         notes="Social support and community engagement. Range $82-$110."),
    _row("indicative_price.social_support.lower_aud_hour", 82.00, "2025-10-01", source=DOH),
    _row("indicative_price.social_support.upper_aud_hour", 110.00, "2025-10-01", source=DOH),

    _row("indicative_price.transport.median_aud_trip", 70.00, "2025-10-01", source=DOH,
         notes="Per trip. Range $40-$97."),
    _row("indicative_price.transport.lower_aud_trip", 40.00, "2025-10-01", source=DOH),
    _row("indicative_price.transport.upper_aud_trip", 97.00, "2025-10-01", source=DOH),

    _row("indicative_price.domestic_assistance.median_aud_hour", 95.00, "2025-10-01", source=DOH,
         notes="Range $83-$109."),
    _row("indicative_price.domestic_assistance.lower_aud_hour", 83.00, "2025-10-01", source=DOH),
    _row("indicative_price.domestic_assistance.upper_aud_hour", 109.00, "2025-10-01", source=DOH),

    _row("indicative_price.home_maintenance.median_aud_hour", 103.00, "2025-10-01", source=DOH,
         notes="Home maintenance and repairs. Range $85-$120."),
    _row("indicative_price.home_maintenance.lower_aud_hour", 85.00, "2025-10-01", source=DOH),
    _row("indicative_price.home_maintenance.upper_aud_hour", 120.00, "2025-10-01", source=DOH),

    _row("indicative_price.meal_delivery.median_aud_meal", 15.00, "2025-10-01", source=DOH,
         notes="Per meal. Range $11-$22."),
    _row("indicative_price.meal_delivery.lower_aud_meal", 11.00, "2025-10-01", source=DOH),
    _row("indicative_price.meal_delivery.upper_aud_meal", 22.00, "2025-10-01", source=DOH),

    _row("indicative_price.meal_preparation.median_aud_hour", 97.00, "2025-10-01", source=DOH,
         notes="Range $82-$110."),
    _row("indicative_price.meal_preparation.lower_aud_hour", 82.00, "2025-10-01", source=DOH),
    _row("indicative_price.meal_preparation.upper_aud_hour", 110.00, "2025-10-01", source=DOH),

    # ---------- HCP legacy fee schedule (20 September 2025 snapshot) ----------
    # Used by services/ce2_engine.py::hcp_comparison to compute the "would-be
    # HCP cost" panel. HCP was replaced by Support at Home on 1 November 2025;
    # participants who entered care before that date retain the last-indexation
    # (20 September 2025) HCP fee schedule under the no-worse-off guarantee.
    # Source: DoH Schedule of Fees and Charges for Residential and Home Care,
    # 20 September 2025 edition.
    _row("hcp.basic_daily_fee.level_1", 12.09, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="DoH Schedule (20 Sep 2025) - Home Care Package Level 1 basic daily fee."),
    _row("hcp.basic_daily_fee.level_2", 12.78, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="DoH Schedule (20 Sep 2025) - Home Care Package Level 2 basic daily fee."),
    _row("hcp.basic_daily_fee.level_3", 13.14, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="DoH Schedule (20 Sep 2025) - Home Care Package Level 3 basic daily fee."),
    _row("hcp.basic_daily_fee.level_4", 13.49, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="DoH Schedule (20 Sep 2025) - Home Care Package Level 4 basic daily fee."),
    _row("hcp.itcf.income_free_area.individual", 34762.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP income-tested care fee income-free area, single, 20 Sep 2025."),
    _row("hcp.itcf.income_free_area.couple", 26871.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF income-free area (couple living together, per partner) at 20 Sep 2025."),
    _row("hcp.itcf.tier2_income_threshold.individual", 66960.40, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF tier-2 upper income threshold (single) at 20 Sep 2025."),
    _row("hcp.itcf.tier2_income_threshold.couple", 51142.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF tier-2 upper income threshold (couple, per partner) at 20 Sep 2025."),
    _row("hcp.itcf.max_daily_rate_tier1", 19.36, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF tier-1 daily cap (income between income-free area and tier-2 threshold)."),
    _row("hcp.itcf.max_daily_rate_tier2", 38.72, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF tier-2 daily cap (income above tier-2 threshold)."),
    _row("hcp.itcf.annual_cap_tier1", 7047.55, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF annual cap for tier-1 payers."),
    _row("hcp.itcf.annual_cap_tier2", 14095.20, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF annual cap for tier-2 payers."),
    _row("hcp.itcf.lifetime_cap", 84571.66, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF lifetime cap. Matches the no-worse-off cohort cap pre-March-2026 numeric value."),
    _row("hcp.itcf.income_taper_pct", 50.0, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="HCP ITCF income taper - 50% of assessable income above the income-free area."),
    _row("lifetime_cap.hcp_transitioned", 84571.66, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2025-09/schedule-of-fees-and-charges-for-residential-and-home-care.pdf",
         notes="Grandfathered HCP participants retain the HCP lifetime cap of $84,571.66 (Sep 2025) under the no-worse-off guarantee, rather than the SAH standard cap of $137,917.01."),

    # ---------- Support at Home means-test constants ----------
    # Used by services/ce2_engine.py::_means_test_constants for the six-step
    # means-test formula in spec section 2.4. Legislated under the Aged Care
    # Act 2024 and the Schedule of Contributions for Support at Home Services.
    _row("means_test.income_free_area.individual", 5668.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test income-free area, single. Income at or below this produces zero income reduction."),
    _row("means_test.income_free_area.couple_member", 4940.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test income-free area, couple living together, per partner. Combined 9880 / 2."),
    _row("means_test.assets_free_area.individual_homeowner", 321500.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test assets-free area, single homeowner. Principal home exempt."),
    _row("means_test.assets_free_area.individual_non_homeowner", 566500.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test assets-free area, single non-homeowner (321500 + 245000 homeowner offset)."),
    _row("means_test.assets_free_area.couple_homeowner", 481500.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test assets-free area, couple homeowner (combined)."),
    _row("means_test.assets_free_area.couple_non_homeowner", 726500.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test assets-free area, couple non-homeowner (481500 + 245000)."),
    _row("means_test.income_limit.individual", 101105.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test income limit, single. Aligns with CSHC upper income limit."),
    _row("means_test.income_limit.couple", 80884.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test income limit (couple, per partner). Combined 161768 / 2."),
    _row("means_test.income_limit.couple_separated_by_illness", 101105.00, "2025-09-20",
         source="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf",
         notes="SAH means-test income limit, couple separated by illness. Each partner assessed as single."),
    _row("means_test.income_taper_pct", 50.0, "2025-11-01",
         source="https://www.health.gov.au/sites/default/files/2025-12/support-at-home-program-participant-contributions.pdf",
         notes="Aged Care Act 2024 - income taper for SAH means-test. 50% of income above the income-free area contributes."),
    _row("means_test.asset_taper_pct", 7.8, "2025-11-01",
         source="https://www.health.gov.au/sites/default/files/2025-12/support-at-home-program-participant-contributions.pdf",
         notes="Aged Care Act 2024 - asset taper for SAH means-test. 7.8% of assets above the assets-free area contributes."),

    # ---------- Wayly-configured CE-2 defaults ----------
    _row("ce2.personal_care_sub_share_of_independence", 0.40, "2025-11-01",
         source="https://wayly.com.au",
         notes="Wayly illustrative default. Assumes personal care is 40% of a household Independence spend when projecting the post-October 2026 change (fully government-funded personal care). Documented default; NOT a published DoH figure. Stored as a fraction (0.40) because the engine uses it directly in 1 - share maths."),
]


def get_seed_rows() -> List[dict]:
    """Return a deep-enough copy so the caller can mutate freely."""
    return [dict(r) for r in SEED_ROWS]
