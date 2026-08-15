"""Route-out and escalate guardrails, Phase 5.

Tags every event type and alert type with an advice_boundary level so the
scenario engine, statement decoder, and AI response paths stay out of
financial and legal advice. The guard also produces the route-out copy and
the correct contact number for each boundary.

Three levels
------------
SAFE_TO_EXPLAIN , Wayly may describe the rule, the number on the statement,
                   or the program mechanic. Default.
ROUTE_OUT       , Wayly explains the question framing only and points to
                   the right authority (My Aged Care, Services Australia FIS,
                   OPAN, ACQSC, or a licensed adviser or solicitor). Never a
                   recommendation, never a definitive figure, never a legal
                   opinion.
ESCALATE        , Safety-critical. Lead with the emergency or safeguarding
                   contact. 000 for emergencies, 1800 ELDERHelp, ACQSC,
                   IDCARE, Scamwatch.

The guard is enforced in two places (Phase 5 wiring):
  1. Alert and event capture, overlays advice_boundary from this map.
  2. AI response paths (Ask Wayly + every tool that returns LLM output) ,
     calls ``classify_boundary_for_query`` before generation; if ROUTE_OUT
     or ESCALATE, the response is replaced with the route-out copy and the
     LLM is not consulted on the substance.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Canonical contact directory
# ---------------------------------------------------------------------------
CONTACTS: Dict[str, Dict[str, str]] = {
    "my_aged_care": {
        "label": "My Aged Care",
        "phone": "1800 200 422",
        "tel_link": "tel:1800200422",
        "blurb": "The Australian Government starting point for assessments, eligibility, and provider information.",
    },
    "services_australia_fis": {
        "label": "Services Australia, Financial Information Service",
        "phone": "132 300",
        "tel_link": "tel:132300",
        "blurb": "Free, independent FIS officers explain how income, assets, gifting, and superannuation affect aged care contributions.",
    },
    "opan": {
        "label": "Older Persons Advocacy Network (OPAN)",
        "phone": "1800 700 600",
        "tel_link": "tel:1800700600",
        "blurb": "Free, confidential advocacy for older people, families, and carers about aged care rights and choices.",
    },
    "acqsc": {
        "label": "Aged Care Quality and Safety Commission",
        "phone": "1800 951 822",
        "tel_link": "tel:1800951822",
        "blurb": "Complaints and concerns about provider conduct, quality, or safety.",
    },
    "financial_adviser": {
        "label": "Licensed financial adviser",
        "phone": "",
        "tel_link": "",
        "blurb": "For RAD / DAP decisions, selling the home, or any definitive means-test calculation. We can't recommend an individual adviser, choose one with aged care experience.",
    },
    "solicitor": {
        "label": "Solicitor",
        "phone": "",
        "tel_link": "",
        "blurb": "For Enduring Power of Attorney, guardianship, contested decisions, or estate matters.",
    },
    "emergency": {
        "label": "Emergency",
        "phone": "000",
        "tel_link": "tel:000",
        "blurb": "Police, fire, or ambulance.",
    },
    "elderhelp": {
        "label": "1800 ELDERHelp",
        "phone": "1800 353 374",
        "tel_link": "tel:1800353374",
        "blurb": "National free phone line for older people who feel mistreated.",
    },
    "idcare": {
        "label": "IDCARE",
        "phone": "1800 595 160",
        "tel_link": "tel:1800595160",
        "blurb": "Free national identity and cyber-incident support.",
    },
    "scamwatch": {
        "label": "Scamwatch",
        "phone": "",
        "tel_link": "https://www.scamwatch.gov.au",
        "blurb": "Report scams to the ACCC.",
    },
}

# ---------------------------------------------------------------------------
# Event-type -> boundary level + contacts
# ---------------------------------------------------------------------------
EVENT_BOUNDARIES: Dict[str, Tuple[str, List[str]]] = {
    # ROUTE_OUT, financial / legal advice
    "services_australia_letter_received": ("ROUTE_OUT", ["services_australia_fis"]),
    "pension_status_changed": ("ROUTE_OUT", ["services_australia_fis"]),
    "means_not_disclosed": ("ROUTE_OUT", ["services_australia_fis"]),
    "hardship_granted": ("ROUTE_OUT", ["services_australia_fis"]),
    "lifetime_cap_reached": ("ROUTE_OUT", ["services_australia_fis"]),
    "time_limited_cap_reached": ("ROUTE_OUT", ["services_australia_fis"]),
    "cshc_acquired": ("ROUTE_OUT", ["services_australia_fis"]),
    "cshc_lost": ("ROUTE_OUT", ["services_australia_fis"]),
    "epoa_registered": ("ROUTE_OUT", ["solicitor"]),
    "guardian_appointed": ("ROUTE_OUT", ["solicitor"]),
    "public_trustee_appointed": ("ROUTE_OUT", ["solicitor"]),
    "assessment_appealed": ("ROUTE_OUT", ["my_aged_care", "opan"]),
    "reassessment_requested": ("ROUTE_OUT", ["my_aged_care"]),
    "moved_to_residential": ("ROUTE_OUT", ["financial_adviser", "my_aged_care"]),
    "consent_withdrawn": ("ROUTE_OUT", ["solicitor", "opan"]),

    # ESCALATE, safety / safeguarding / fraud
    "safeguarding_concern_raised": ("ESCALATE", ["elderhelp", "emergency"]),
    "elder_abuse_disclosed": ("ESCALATE", ["elderhelp", "emergency"]),
    "financial_abuse_disclosed": ("ESCALATE", ["elderhelp", "idcare", "scamwatch"]),
    "scam_or_fraud_disclosed": ("ESCALATE", ["idcare", "scamwatch", "emergency"]),
    "missing_person": ("ESCALATE", ["emergency", "elderhelp"]),
    "natural_disaster_affecting_home": ("ESCALATE", ["emergency"]),
    "capacity_concern_raised": ("ROUTE_OUT", ["my_aged_care", "opan", "solicitor"]),

    # Provider concerns
    "provider_deregistered": ("ROUTE_OUT", ["acqsc", "my_aged_care"]),
}

# ---------------------------------------------------------------------------
# Alert-type -> boundary level + contacts
# ---------------------------------------------------------------------------
ALERT_BOUNDARIES: Dict[str, Tuple[str, List[str]]] = {
    "means_not_disclosed_standing": ("ROUTE_OUT", ["services_australia_fis"]),
    "lifetime_cap_reached": ("ROUTE_OUT", ["services_australia_fis"]),
    "time_limited_cap_reached": ("ROUTE_OUT", ["services_australia_fis"]),
    "safeguarding_concern": ("ESCALATE", ["elderhelp", "emergency"]),
    "contribution_letter_120d": ("ROUTE_OUT", ["services_australia_fis"]),
    "death_provider_notify_28d": ("ROUTE_OUT", ["my_aged_care"]),
    "death_final_claim_60d": ("ROUTE_OUT", ["my_aged_care"]),
    # All others default to SAFE_TO_EXPLAIN.
}


def boundary_for_event(event_type: str) -> Tuple[str, List[str]]:
    return EVENT_BOUNDARIES.get(event_type, ("SAFE_TO_EXPLAIN", []))


def boundary_for_alert(alert_type: str) -> Tuple[str, List[str]]:
    return ALERT_BOUNDARIES.get(alert_type, ("SAFE_TO_EXPLAIN", []))


def contact_block(keys: List[str]) -> List[Dict[str, str]]:
    return [CONTACTS[k] for k in keys if k in CONTACTS]


# ---------------------------------------------------------------------------
# AI guard
# ---------------------------------------------------------------------------
# Plain-language topic patterns. Any match short-circuits the LLM call.
# Keep these specific, we don't want generic Support-at-Home questions to
# route out.
ROUTE_OUT_PATTERNS: List[Tuple[str, List[str], List[str]]] = [
    # (topic_key, keyword list, match if any present, contact keys)
    ("means_test",
     ["means test", "means-test", "income test", "asset test",
      "how much will i pay", "what will my contribution be"],
     ["services_australia_fis"]),
    ("sell_home",
     ["sell the home", "selling the home", "sell my house", "selling my house"],
     ["financial_adviser", "services_australia_fis"]),
    ("gifting",
     ["gifting", "deprivation", "gift money to my kids"],
     ["services_australia_fis"]),
    ("rad_dap",
     ["rad", "refundable accommodation deposit", "dap",
      "daily accommodation payment"],
     ["financial_adviser"]),
    ("classification_appeal",
     ["appeal my classification", "appeal the classification", "dispute classification",
      "wrong classification", "i should be a higher classification"],
     ["my_aged_care", "opan"]),
    ("epoa_guardianship",
     ["enduring power of attorney", "epoa", "guardianship", "guardian",
      "public trustee"],
     ["solicitor"]),
    ("ndis_vs_aged_care",
     ["ndis or aged care", "ndis vs aged care", "should we stay on ndis",
      "switch to aged care", "switch from ndis"],
     ["my_aged_care"]),
    ("estate_probate",
     ["estate", "probate", "will after death", "executor"],
     ["solicitor"]),
]

ESCALATE_PATTERNS: List[Tuple[str, List[str], List[str]]] = [
    ("abuse",
     ["elder abuse", "being abused", "hits her", "hits him",
      "threatened", "neglected"],
     ["elderhelp", "emergency"]),
    ("financial_abuse",
     ["stealing money", "took her money", "took his money",
      "withdrawing from her account"],
     ["elderhelp", "idcare"]),
    ("scam_fraud",
     ["scam", "scammed", "phishing", "fake invoice", "identity theft"],
     ["idcare", "scamwatch"]),
    ("missing_person",
     ["mum is missing", "she's wandered", "he's wandered", "can't find dad",
      "missing person"],
     ["emergency", "elderhelp"]),
    ("disaster",
     ["bushfire", "flood", "evacuated", "house is uninhabitable"],
     ["emergency"]),
]


def classify_boundary_for_query(query: str) -> Tuple[str, List[Dict[str, str]], Optional[str]]:
    """Inspect a free-text question. Return (boundary, contacts, topic_key).

    boundary is one of SAFE_TO_EXPLAIN / ROUTE_OUT / ESCALATE. The function
    is intentionally rule-based, not LLM-based, so the guard is deterministic
    and auditable."""
    if not query:
        return "SAFE_TO_EXPLAIN", [], None
    q = query.lower()
    for topic_key, kws, contact_keys in ESCALATE_PATTERNS:
        if any(kw in q for kw in kws):
            return "ESCALATE", contact_block(contact_keys), topic_key
    for topic_key, kws, contact_keys in ROUTE_OUT_PATTERNS:
        if any(kw in q for kw in kws):
            return "ROUTE_OUT", contact_block(contact_keys), topic_key
    return "SAFE_TO_EXPLAIN", [], None


def route_out_response(query: str, contacts: List[Dict[str, str]],
                        boundary: str, topic_key: Optional[str]) -> str:
    """Build the calm response copy that replaces any LLM output for a
    ROUTE_OUT or ESCALATE query."""
    if boundary == "ESCALATE":
        opener = (
            "This sounds serious. Wayly isn't the right place for advice here, "
            "please reach out to the contacts below straight away."
        )
    else:
        opener = (
            "This is a question we can't answer with a definitive figure or "
            "recommendation, it depends on individual circumstances. The right "
            "place to start is one of these contacts."
        )
    lines = [opener, ""]
    for c in contacts:
        line = f"- **{c['label']}**"
        if c.get("phone"):
            line += f", {c['phone']}"
        if c.get("blurb"):
            line += f". {c['blurb']}"
        lines.append(line)
    lines.append("")
    lines.append("Wayly can help you prepare the question and capture the answer once you have it.")
    return "\n".join(lines)
