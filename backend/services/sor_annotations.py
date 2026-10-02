"""SD-3 · Statement of Rights annotations.

Maps decoded statement findings to the participant's rights under the aged care
Statement of Rights, so that alongside "here is what looks wrong" the tool also
tells the person "here is the right this touches, and here is what you can do".

Data-driven and read-only. No clinical or legal advice; plain-language pointers
plus the free advocacy pathway (OPAN).
"""
from __future__ import annotations

from typing import Any, Dict, List

# Rights catalogue (plain-language summaries of the aged care Statement of Rights).
RIGHTS: Dict[str, Dict[str, str]] = {
    "clear_information_costs": {
        "title": "The right to clear information about your care and its cost",
        "plain": "You have the right to a statement you can understand, showing what you were charged and why.",
        "what_you_can_do": "Ask your provider to explain any charge in plain language. They must respond.",
    },
    "correct_billing": {
        "title": "The right to be charged correctly",
        "plain": "You should only pay for services that were actually delivered, at the correct rate and from the correct budget.",
        "what_you_can_do": "Query anything that looks doubled up, mis-classified or higher than agreed, and ask for a correction.",
    },
    "informed_of_changes": {
        "title": "The right to be told about changes to your care and fees",
        "plain": "Your provider should tell you before your fees or services change, not surprise you afterwards.",
        "what_you_can_do": "Ask for written notice of any backdated adjustment or fee change and the reason for it.",
    },
    "control_choices": {
        "title": "The right to make choices and control your own care",
        "plain": "It is your budget. You have a say in how it is spent and what supports you receive.",
        "what_you_can_do": "If money is going unused or on things you did not choose, raise it with your provider.",
    },
    "make_a_complaint": {
        "title": "The right to raise concerns without it affecting your care",
        "plain": "You can give feedback or make a complaint, and your provider cannot treat you differently for doing so.",
        "what_you_can_do": "Raise it with your provider first. If it is not resolved, the Aged Care Quality and Safety Commission can help.",
    },
    "advocacy_support": {
        "title": "The right to a free independent advocate",
        "plain": "You can have someone speak up alongside you, at no cost, through the Older Persons Advocacy Network.",
        "what_you_can_do": "Call OPAN on 1800 700 600 for free, confidential advocacy support.",
    },
}

# Baseline rights that apply to every statement.
BASELINE_RIGHT_IDS = ["clear_information_costs", "make_a_complaint", "advocacy_support"]

# Finding category → applicable right ids. Categories mirror the anomaly-to-event
# groupings used by the statement decoder.
CATEGORY_TO_RIGHTS: Dict[str, List[str]] = {
    "care_management_over_cap": ["correct_billing", "clear_information_costs", "make_a_complaint"],
    "wrong_stream_billing": ["correct_billing", "clear_information_costs", "make_a_complaint"],
    "means_not_disclosed": ["clear_information_costs", "informed_of_changes"],
    "backdated_adjustment": ["informed_of_changes", "clear_information_costs"],
    "at_hm_expiring": ["control_choices", "clear_information_costs"],
    "at_hm_purchased": ["control_choices", "clear_information_costs"],
    "quarter_end_underspend_risk": ["control_choices"],
}

# Rule key → category (subset of the decoder's own mapping, kept local so this
# module has no import-time dependency on server.py).
RULE_TO_CATEGORY: Dict[str, str] = {
    "RULE_1": "care_management_over_cap",
    "RULE_1B": "care_management_over_cap",
    "RULE_1_CARE_MGMT_CAP": "care_management_over_cap",
    "RULE_1B_CARE_MGMT_MONTHLY": "care_management_over_cap",
    "RULE_4": "wrong_stream_billing",
    "RULE_9_WRONG_STREAM": "wrong_stream_billing",
    "RULE_9_CLINICAL_CONTRIB": "wrong_stream_billing",
    "RULE_9_CONTRIBUTION_MISMATCH": "wrong_stream_billing",
    "RULE_11": "wrong_stream_billing",
    "RULE_11_BROKERED_PREMIUM": "wrong_stream_billing",
    "RULE_16_STREAM_DISCREPANCY": "wrong_stream_billing",
    "RULE_9_PENSION_STATUS_UNKNOWN": "means_not_disclosed",
    "RULE_10": "backdated_adjustment",
    "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS": "backdated_adjustment",
    "RULE_12_AT_HM_ACTIVE": "at_hm_expiring",
    "RULE_19_AT_HM_LARGE_CLAIM": "at_hm_purchased",
    "RULE_13_QUARTERLY_UNDERSPEND": "quarter_end_underspend_risk",
    "RULE_13_MID_QUARTER_UPDATE": "quarter_end_underspend_risk",
}


def _rule_key(anomaly: Any) -> str:
    if isinstance(anomaly, str):
        return anomaly
    if isinstance(anomaly, dict):
        return anomaly.get("rule_key") or anomaly.get("rule") or ""
    return ""


def annotate_statement(anomalies: List[Any]) -> Dict[str, Any]:
    """Return the Statement of Rights annotations for a decoded statement.

    Each returned right lists the finding categories that triggered it, so the
    UI can show "this right is relevant because we found X"."""
    triggered: Dict[str, set] = {}  # right_id -> set of categories

    for anomaly in anomalies or []:
        rk = _rule_key(anomaly)
        category = RULE_TO_CATEGORY.get(rk)
        if not category:
            continue
        for right_id in CATEGORY_TO_RIGHTS.get(category, []):
            triggered.setdefault(right_id, set()).add(category)

    annotations: List[Dict[str, Any]] = []
    ordered_ids = list(triggered.keys()) + [r for r in BASELINE_RIGHT_IDS if r not in triggered]
    for right_id in ordered_ids:
        if right_id not in RIGHTS:
            continue
        annotations.append({
            "right_id": right_id,
            **RIGHTS[right_id],
            "triggered_by": sorted(triggered.get(right_id, set())),
            "is_baseline": right_id in BASELINE_RIGHT_IDS and right_id not in triggered,
        })

    return {
        "annotations": annotations,
        "count": len(annotations),
        "source": "Aged care Statement of Rights (plain-language summary)",
        "disclaimer": "This is general information about your rights, not legal advice.",
    }
