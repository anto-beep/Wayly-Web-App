"""LF-1 v1.2, Letters & Follow-ups core module.

Loads the recipient directory YAML, exposes situation → archetype mapping,
and the constants callers need to build the correspondence log entries.

The letter generation engine (Iteration 2) lives in a separate module
(`services/lf1_generate.py`) so this file stays deterministic-only.
"""
from __future__ import annotations

from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Recipient directory (WS3, INDEX-1 pattern)
# ---------------------------------------------------------------------------

_RECIPIENT_YAML = Path(__file__).parent.parent / "data" / "lf1" / "recipient_directory.yaml"


def _load_recipient_directory() -> dict:
    if not _RECIPIENT_YAML.exists():
        return {"version": "0", "recipients": []}
    with _RECIPIENT_YAML.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    raw.setdefault("recipients", [])
    return raw


_DIRECTORY = _load_recipient_directory()


def list_recipients() -> list[dict]:
    return list(_DIRECTORY.get("recipients", []))


def get_recipient(key: str) -> dict | None:
    for r in _DIRECTORY.get("recipients", []):
        if r.get("key") == key:
            return r
    return None


def directory_metadata() -> dict:
    return {
        "version": _DIRECTORY.get("version"),
        "last_reviewed": _DIRECTORY.get("last_reviewed"),
        "review_cadence": _DIRECTORY.get("review_cadence"),
        "count": len(_DIRECTORY.get("recipients", [])),
    }


# ---------------------------------------------------------------------------
# Situation → Archetype mapping (WS1)
# ---------------------------------------------------------------------------
# The user picks a plain-English situation on the front door; the tool
# resolves internally to an archetype (letter type) + default recipient.

SITUATIONS = [
    {
        "id": 1,
        "label": "{name}'s condition has changed and they need more help",
        "short_label": "Condition change, more help",
        "archetype": "request",
        "default_recipient": "mac",
        "intake_variant": "reassessment_condition_change",
        "response_window_days": 28,
    },
    {
        "id": 2,
        "label": "{name} has just been in hospital or had a significant health event",
        "short_label": "Post-hospital reassessment",
        "archetype": "request",
        "default_recipient": "mac",
        "intake_variant": "rcp_request",
        "response_window_days": 28,
    },
    {
        "id": 3,
        "label": "I don't agree with a charge on the statement",
        "short_label": "Statement charge disputed",
        "archetype": "dispute",
        "default_recipient": "provider_cm",
        "intake_variant": "fee_dispute",
        "response_window_days": 14,
    },
    {
        "id": 4,
        "label": "Services on the plan aren't being delivered",
        "short_label": "Services not delivered",
        "archetype": "complaint",
        "default_recipient": "provider_cm",
        "intake_variant": "service_delivery",
        "response_window_days": 14,
    },
    {
        "id": 5,
        "label": "The care manager isn't responding to us",
        "short_label": "Care manager unresponsive",
        "archetype": "escalation",
        "default_recipient": "provider_senior",
        "intake_variant": "cm_unresponsive",
        "response_window_days": 10,
    },
    {
        "id": 6,
        "label": "I want to change something about the care plan",
        "short_label": "Care plan amendment",
        "archetype": "request",
        "default_recipient": "provider_cm",
        "intake_variant": "care_plan_amendment",
        "response_window_days": 14,
    },
    {
        "id": 7,
        "label": "I want to change providers or care managers",
        "short_label": "Provider / care manager change",
        "archetype": "notification",
        "default_recipient": "provider_cm",
        "intake_variant": "provider_transfer",
        "response_window_days": 14,
    },
    {
        "id": 8,
        "label": "I don't agree with an assessment outcome",
        "short_label": "Assessment outcome disputed",
        "archetype": "dispute",
        "default_recipient": "mac",
        "intake_variant": "assessment_dispute",
        "response_window_days": 28,
    },
    {
        "id": 9,
        "label": "We can't afford the current contributions",
        "short_label": "Hardship notification",
        "archetype": "notification",
        "default_recipient": "services_australia_aged_care",
        "intake_variant": "hardship",
        "response_window_days": 28,
    },
    {
        "id": 10,
        "label": "I want to formally complain to a regulator",
        "short_label": "Regulator complaint",
        "archetype": "escalation",
        "default_recipient": "acqsc",
        "intake_variant": "regulator_complaint",
        "response_window_days": 90,
    },
    {
        "id": 11,
        "label": "I'm worried about {name}'s safety",
        "short_label": "Safeguarding, phone first",
        "archetype": "guided_pathway",
        "default_recipient": "elder_abuse_helpline",
        "intake_variant": "elder_abuse",
        "response_window_days": None,
    },
    {
        "id": 12,
        "label": "I need to respond to something they sent",
        "short_label": "Response draft",
        "archetype": "response_draft",
        "default_recipient": None,   # matched to the inbound sender
        "intake_variant": "response_draft",
        "response_window_days": None,
    },
]


# Placeholder shown in situation labels when no participant name is available.
DEFAULT_PARTICIPANT_LABEL = "your loved one"


def render_situation_label(label_template: str, participant_name: str | None = None) -> str:
    """Interpolate a situation label with the active participant's first name.

    The gendered situations (1, 2, 11) carry a ``{name}`` placeholder. When
    a participant is selected in the switcher, we substitute their first
    name. When nothing is active, we fall back to ``your loved one`` so
    the copy stays warm and gender-neutral for both female and male
    participants.

    Non-templated labels pass through unchanged.
    """
    if "{name}" not in (label_template or ""):
        return label_template
    name = (participant_name or "").strip()
    if not name:
        name = DEFAULT_PARTICIPANT_LABEL
    else:
        # Use only the first token so "Louisa Chen" reads as "Louisa's ..."
        name = name.split()[0]
    return label_template.replace("{name}", name)


ARCHETYPES = {
    "request": {
        "label": "Request",
        "tone": "polite, formal, evidence-led",
        "opan_footer": False,
        "supports_complaint_modes": False,
    },
    "dispute": {
        "label": "Dispute",
        "tone": "firm, factual, chronological",
        "opan_footer": False,
        "supports_complaint_modes": False,
    },
    "complaint": {
        "label": "Complaint",
        "tone": "factual, evidence-heavy, remedy-focused",
        "opan_footer": True,
        "supports_complaint_modes": True,
    },
    "escalation": {
        "label": "Escalation",
        "tone": "chronology-led, references prior letters",
        "opan_footer": True,
        "supports_complaint_modes": True,
    },
    "notification": {
        "label": "Notification",
        "tone": "formal, brief, record-of-decision",
        "opan_footer": False,
        "supports_complaint_modes": False,
    },
    "response_draft": {
        "label": "Response Draft",
        "tone": "referenced to inbound, chronology-preserving",
        "opan_footer": False,
        "supports_complaint_modes": False,
    },
    "guided_pathway": {
        "label": "Guided pathway",
        "tone": None,
        "opan_footer": False,
        "supports_complaint_modes": True,
    },
}


def get_situation(situation_id: int) -> dict | None:
    for s in SITUATIONS:
        if s["id"] == int(situation_id):
            return s
    return None


def get_archetype(archetype_key: str) -> dict | None:
    return ARCHETYPES.get(archetype_key)


# ---------------------------------------------------------------------------
# Correspondence log helpers
# ---------------------------------------------------------------------------

# Recipient types (fixed enum on the model). ``provider_cm`` and
# ``provider_senior`` do NOT come from the directory, they are per-provider
# entries cached on the participant profile.
RECIPIENT_TYPES = frozenset({
    "mac", "acqsc", "complaints_commissioner", "ombudsman",
    "provider_cm", "provider_senior", "services_australia_aged_care",
    "opan", "elder_abuse_helpline", "police_emergency", "public_advocate_generic",
    "other",
})

# Sender identity enum (WS4).
SENDER_IDENTITIES = frozenset({
    "participant", "family_caregiver", "recorded_representative", "poa",
})

# Complaint mode enum. Only meaningful for complaint / escalation / guided
# pathway archetypes.
COMPLAINT_MODES = frozenset({"open", "confidential", "anonymous"})

# Status transitions.
CORRESPONDENCE_STATUSES = frozenset({
    "draft", "sent", "awaiting_response", "responded",
    "escalated", "closed",
})

# Direction enum (WS8, inbound / outbound).
DIRECTIONS = frozenset({"inbound", "outbound"})

# Inbound source enum.
INBOUND_SOURCES = frozenset({"email", "portal", "post", "phone_note"})

# Send channels.
SEND_CHANNELS = frozenset({"email", "post", "portal", "phone", "multi"})

# Output formats.
OUTPUT_FORMATS = frozenset({"email", "pdf", "mac_portal"})


def default_response_window_days(situation_id: int | None, archetype: str | None) -> int | None:
    """Return the default follow-up window in days for the given situation.

    When a situation is provided, honour its explicit value (including a
    ``None`` value that says "no default follow-up"). Only fall back to the
    archetype-level default when no situation was supplied.
    """
    if situation_id is not None:
        s = get_situation(situation_id)
        if s is not None:
            return s.get("response_window_days")
    # Archetype-level defaults when no situation.
    return {
        "request": 14,
        "dispute": 14,
        "complaint": 14,
        "escalation": 10,
        "notification": 14,
        "response_draft": 14,
        "guided_pathway": None,
    }.get(archetype)


# ---------------------------------------------------------------------------
# Terms footer (locked decision #20)
# ---------------------------------------------------------------------------

TERMS_FOOTER_COPY = (
    "Letters & Follow-ups is a drafting assistant, not legal advice. "
    "You are responsible for reviewing every letter before sending it. "
    "The Wayly team can help you understand your options, but we do not send "
    "letters on your behalf, and we do not represent you in dealings with providers, "
    "My Aged Care, the Aged Care Quality and Safety Commission, or the Ombudsman."
)


# ---------------------------------------------------------------------------
# Elder abuse safety copy (WS14), reviewed against OPAN + 1800RESPECT
# conventions. Placeholder copy for iteration 4 refinement.
# ---------------------------------------------------------------------------

ELDER_ABUSE_SAFETY_COPY = {
    "headline": "Please call first before writing anything.",
    "body": (
        "If you are worried about your parent's safety, a written letter is rarely "
        "the fastest path to protection. Please call one of the following before "
        "you draft anything:"
    ),
    "contacts": [
        {
            "label": "1800ELDERHelp, National elder abuse phone line",
            "phone": "1800 353 374",
            "note": "24-hour confidential support. No cost. No caller ID.",
        },
        {
            "label": "OPAN, Older Persons Advocacy Network",
            "phone": "1800 700 600",
            "note": "Free advocacy. Can attend meetings with you and your parent.",
        },
        {
            "label": "Police (imminent danger only)",
            "phone": "000",
            "note": "If you believe your parent is in immediate danger, call 000.",
        },
    ],
    "letter_gate_disclosure": (
        "If you still want to prepare a written record, for example, to keep for "
        "your own records, or to attach to a formal complaint later, Wayly can "
        "help you build a structured safeguarding note. This is not a persuasion "
        "letter; it is a factual record of your concerns."
    ),
}
