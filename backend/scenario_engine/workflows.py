"""Scenario engine — guided caregiver workflows (Phase 6).

These are calm, step-by-step walkthroughs for the three highest-stakes
journeys a caregiver lands in: a reassessment request, a hospital admission,
and a death in the household. Each step nudges the caregiver to capture the
right participant_event (taxonomy in events.py) so the timeline reflects what
actually happened — and so the alerting engine has a clock to attach to
(e.g. discharge to follow reassessment, hospital discharge to clear the
HOSPITALISED state, the 28d provider-notify and 60d final-claim windows on
death).

The workflows themselves are pure data; the frontend wizard renders them.
The /api/scenario/workflows endpoint surfaces them. The capture endpoint
(events.capture_event) is the only mutation point.
"""
from __future__ import annotations
from typing import Any, Dict, List


def _step(*, key: str, title: str, body: str,
           event_type: str | None = None,
           payload_fields: List[Dict[str, Any]] | None = None,
           cta: str = "Log this") -> Dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "body": body,
        "event_type": event_type,
        "payload_fields": payload_fields or [],
        "cta": cta,
    }


WORKFLOWS: Dict[str, Dict[str, Any]] = {
    "reassessment": {
        "key": "reassessment",
        "label": "Request a reassessment",
        "intro": (
            "A reassessment can be requested when needs have changed since the "
            "last classification. Walk through the steps below — we'll capture "
            "each event on the timeline so everyone's on the same page."
        ),
        "advice_boundary": "SAFE_TO_EXPLAIN",
        "steps": [
            _step(
                key="request",
                title="Step 1 · Log the reassessment request",
                body=(
                    "Record the date you contacted My Aged Care (1800 200 422) "
                    "to ask for a reassessment. This moves the participant into "
                    "the AWAITING_REASSESSMENT state."
                ),
                event_type="reassessment_requested",
                payload_fields=[
                    {"key": "contact_method", "label": "How was it lodged?",
                     "type": "select", "options": ["Phone", "Online", "Through provider"]},
                    {"key": "reference_number", "label": "My Aged Care reference",
                     "type": "text", "optional": True},
                ],
            ),
            _step(
                key="services_australia_letter",
                title="Step 2 · Log any Services Australia letter",
                body=(
                    "If a means-tested contribution letter arrives during the "
                    "reassessment window, log it here so we keep contribution "
                    "amounts current."
                ),
                event_type="services_australia_letter_received",
                payload_fields=[
                    {"key": "letter_date", "label": "Letter date", "type": "date"},
                ],
                cta="Log letter",
            ),
            _step(
                key="completed",
                title="Step 3 · Log the reassessment outcome",
                body=(
                    "When the new classification arrives, log it here. This "
                    "moves the participant back to ACTIVE and updates the "
                    "quarterly budget for the new level."
                ),
                event_type="reassessment_completed",
                payload_fields=[
                    {"key": "new_classification", "label": "New classification level (1–8)",
                     "type": "number", "min": 1, "max": 8},
                ],
                cta="Log outcome",
            ),
        ],
        "follow_up": (
            "If the outcome feels wrong, an assessment can be appealed within "
            "28 days. We can't recommend whether to appeal — talk to your "
            "provider or call OPAN (1800 700 600) for independent advocacy."
        ),
    },
    "hospitalisation": {
        "key": "hospitalisation",
        "label": "Manage a hospital stay",
        "intro": (
            "When a participant is admitted to hospital, Support at Home "
            "services pause. Logging admission and discharge keeps the budget, "
            "the provider, and the family thread in sync."
        ),
        "advice_boundary": "SAFE_TO_EXPLAIN",
        "steps": [
            _step(
                key="admit",
                title="Step 1 · Log the admission",
                body=(
                    "Capture the date of admission and which hospital. This "
                    "moves the participant into the HOSPITALISED state and "
                    "lets the provider pause non-essential services."
                ),
                event_type="hospitalised",
                payload_fields=[
                    {"key": "hospital_name", "label": "Hospital", "type": "text"},
                    {"key": "admission_reason", "label": "Reason for admission",
                     "type": "text", "optional": True},
                ],
            ),
            _step(
                key="notify_provider",
                title="Step 2 · Confirm the provider has been told",
                body=(
                    "Providers should pause home visits immediately on "
                    "admission. If you haven't notified them yet, please do — "
                    "billing for services not delivered should be raised "
                    "during the next statement review."
                ),
                event_type=None,
                cta="I've told them",
            ),
            _step(
                key="discharge",
                title="Step 3 · Log the discharge",
                body=(
                    "When the participant returns home, log discharge so we "
                    "can resume the regular schedule. If a restorative pathway "
                    "is part of the discharge plan, log that next."
                ),
                event_type="discharged_from_hospital",
                payload_fields=[
                    {"key": "discharge_date", "label": "Discharge date", "type": "date"},
                ],
                cta="Log discharge",
            ),
            _step(
                key="restorative",
                title="Step 4 · (Optional) start a restorative pathway",
                body=(
                    "If the hospital discharge plan includes a 12-week "
                    "restorative pathway, log it here so the alternative "
                    "budget applies and the end-date clock starts ticking."
                ),
                event_type="restorative_pathway_started",
                payload_fields=[
                    {"key": "start_date", "label": "Start date", "type": "date"},
                    {"key": "end_date", "label": "Expected end date", "type": "date"},
                    {"key": "episode_number", "label": "Episode number (1, 2…)",
                     "type": "number", "min": 1, "optional": True},
                ],
                cta="Start restorative",
            ),
        ],
        "follow_up": (
            "If the admission was due to a fall, medication mix-up, or carer "
            "burnout, consider asking My Aged Care about reassessment to "
            "make sure the classification still fits."
        ),
    },
    "death": {
        "key": "death",
        "label": "After a participant passes",
        "intro": (
            "We're sorry. There's no rush — these steps can be done in your "
            "own time. They make sure the provider stops billing and any "
            "remaining funding is closed off correctly."
        ),
        "advice_boundary": "ESCALATE",
        "route_out_contacts": ["my_aged_care", "services_australia_fis", "opan"],
        "steps": [
            _step(
                key="deceased",
                title="Step 1 · Log the date",
                body=(
                    "Capture the date the participant passed. We'll keep the "
                    "timeline read-only from this point — no new events can "
                    "be added other than the closing steps below."
                ),
                event_type="deceased",
                payload_fields=[
                    {"key": "date_of_death", "label": "Date", "type": "date"},
                ],
            ),
            _step(
                key="notify_provider",
                title="Step 2 · Notify the provider within 28 days",
                body=(
                    "The provider must be notified so services stop and final "
                    "billing can begin. The 28-day clock starts from the date "
                    "of death. We'll surface a reminder if it's getting close."
                ),
                event_type=None,
                cta="I've told them",
            ),
            _step(
                key="final_claim",
                title="Step 3 · Final statement within 60 days",
                body=(
                    "Providers have 60 days to issue the final statement. "
                    "When it arrives, upload it like any other statement — "
                    "we'll close out the participant timeline."
                ),
                event_type=None,
                cta="I'll watch for it",
            ),
        ],
        "follow_up": (
            "For bereavement support, Beyond Blue (1300 22 4636) and "
            "Lifeline (13 11 14) are available 24/7. For estate and means-"
            "test queries, Services Australia FIS (132 300) is the right "
            "place to start."
        ),
    },
}


def list_workflows() -> Dict[str, Any]:
    """Public summary used by the wizard picker."""
    return {
        "workflows": [
            {"key": w["key"], "label": w["label"], "intro": w["intro"],
             "advice_boundary": w.get("advice_boundary", "SAFE_TO_EXPLAIN"),
             "step_count": len(w["steps"])}
            for w in WORKFLOWS.values()
        ],
    }


def get_workflow(key: str) -> Dict[str, Any] | None:
    w = WORKFLOWS.get(key)
    if not w:
        return None
    # Resolve route_out_contacts (if any) at read time so the boundary
    # directory stays the single source of truth.
    out = dict(w)
    contact_keys = w.get("route_out_contacts") or []
    if contact_keys:
        try:
            from scenario_engine.boundaries import contact_block
            out["route_out_contacts_resolved"] = contact_block(contact_keys)
        except Exception:
            out["route_out_contacts_resolved"] = []
    return out
