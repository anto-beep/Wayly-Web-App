"""Participant event capture and taxonomy.

A participant_event is the unit through which everything that happens to a
participant flows: hospitalisations, classification changes, provider exits,
Services Australia letters, statement-decoder anomalies, policy effective
dates. Every event lands in the same shape, every event maps to the six
"what-changed" axes, and many events propose a lifecycle transition or flag
change that the Phase 2 guard then applies (or surfaces for confirmation if
the proposed transition is not allowed).

Schema
------
participant_events {
  id, participant_id, account_id,
  event_type, sub_type,
  trigger_source: caregiver | statement | manual | system,
  effective_date  (when it happened, ISO date),
  captured_date   (when it was logged, ISO datetime),
  note            (free-text),
  payload         (structured event-specific data),
  source          ({kind, statement_id, line_item_id, ...} — citation chip),
  affects: { classification, budget, contribution, services, provider, legal_status }  (booleans),
  proposed: { lifecycle_transition, flag_changes, transition_applied: bool, transition_status },
  audit_ids       (array of participant_state_audit row ids written for this event),
  advice_boundary  (set by Phase 5; defaults to SAFE_TO_EXPLAIN),
  created_at, created_by, created_by_name
}

Phase 3 deliberately does NOT yet wire alerts. The capture function runs the
proposed transition through the Phase 2 guard, but no notifications are sent.
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("wayly.scenario_engine.events")

# Six "what-changed" axes — every event ticks one or more.
AXES = [
    "affects_classification",
    "affects_budget",
    "affects_contribution",
    "affects_services",
    "affects_provider",
    "affects_legal_status",
]

# Trigger sources.
TRIGGER_SOURCES = {"caregiver", "statement", "manual", "system"}

# ---------------------------------------------------------------------------
# Event-type catalogue
# ---------------------------------------------------------------------------
# Each event_type maps to: group, axes hit, proposed lifecycle transition (or
# None), proposed flag changes (list of (flag, value, payload_keys) tuples or
# empty), human-readable label.

# Tuples encode (flag_name, target_value_field_in_payload_OR_True, payload_keys_to_lift)
# When target_value_field is True/False, we set the flag to that bool.
# When it's a string, we read payload[that_key] (treated as bool unless dict).

EventTypeSpec = Dict[str, Any]


def _ev(label: str, group: str, axes: List[str], *,
         transition: Optional[str] = None,
         flag_changes: Optional[List[Dict[str, Any]]] = None,
         label_au: Optional[str] = None) -> EventTypeSpec:
    return {
        "label": label,
        "label_au": label_au or label,
        "group": group,
        "axes": axes,
        "transition": transition,
        "flag_changes": flag_changes or [],
    }


# axes shorthand
A_CLASS = "affects_classification"
A_BUDGET = "affects_budget"
A_CONTRIB = "affects_contribution"
A_SERV = "affects_services"
A_PROV = "affects_provider"
A_LEGAL = "affects_legal_status"


def _flag(name: str, value: Any = True, payload_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    return {"flag": name, "value": value, "payload_keys": payload_keys or []}


EVENT_TYPES: Dict[str, EventTypeSpec] = {
    # ---------------- classification_and_assessment ----------------
    "assessment_completed": _ev(
        "Assessment completed", "classification_and_assessment",
        [A_CLASS, A_SERV], transition="ACTIVE",
        flag_changes=[_flag("ONGOING_CLASSIFICATION_4")]),  # exact level set from payload
    "classification_changed": _ev(
        "Classification changed", "classification_and_assessment",
        [A_CLASS, A_BUDGET]),
    "reassessment_requested": _ev(
        "Reassessment requested", "classification_and_assessment",
        [A_CLASS], transition="AWAITING_REASSESSMENT"),
    "reassessment_completed": _ev(
        "Reassessment completed", "classification_and_assessment",
        [A_CLASS, A_BUDGET], transition="ACTIVE"),
    "assessment_appealed": _ev(
        "Assessment appealed", "classification_and_assessment",
        [A_CLASS, A_LEGAL]),
    "interim_funding_started": _ev(
        "Interim funding started (60%)", "classification_and_assessment",
        [A_BUDGET], transition="INTERIM_FUNDED",
        flag_changes=[_flag("INTERIM_60PCT", True,
                            ["expected_full_funding_date"])]),
    "restorative_pathway_started": _ev(
        "Restorative Care Pathway started", "classification_and_assessment",
        [A_BUDGET, A_SERV], transition="RESTORATIVE",
        flag_changes=[_flag("RESTORATIVE_ACTIVE", True,
                            ["start_date", "end_date", "episode_number"])]),
    "restorative_pathway_ended": _ev(
        "Restorative Care Pathway ended", "classification_and_assessment",
        [A_SERV], transition="ACTIVE",
        flag_changes=[_flag("RESTORATIVE_ACTIVE", False)]),
    "eol_pathway_started": _ev(
        "End-of-Life Pathway started", "classification_and_assessment",
        [A_BUDGET, A_SERV], transition="END_OF_LIFE",
        flag_changes=[_flag("EOL_ACTIVE", True,
                            ["start_date", "expected_end_date"])]),
    "eol_pathway_extended": _ev(
        "End-of-Life Pathway extended", "classification_and_assessment",
        [A_BUDGET]),

    # ---------------- health_and_life ----------------
    "hospitalised": _ev(
        "Hospitalised", "health_and_life",
        [A_SERV], transition="HOSPITALISED"),
    "discharged_from_hospital": _ev(
        "Discharged from hospital", "health_and_life",
        [A_SERV], transition="ACTIVE"),
    "entered_respite": _ev(
        "Entered respite", "health_and_life",
        [A_SERV], transition="IN_RESPITE"),
    "left_respite": _ev(
        "Left respite", "health_and_life",
        [A_SERV], transition="ACTIVE"),
    "capacity_concern_raised": _ev(
        "Capacity concern raised", "health_and_life",
        [A_LEGAL], flag_changes=[_flag("CAPACITY_CONCERN")]),
    "safeguarding_concern_raised": _ev(
        "Safeguarding concern raised", "health_and_life",
        [A_LEGAL], flag_changes=[_flag("SAFEGUARDING_ALERT")]),
    "deceased": _ev(
        "Deceased", "health_and_life",
        [A_SERV, A_BUDGET, A_PROV], transition="DECEASED"),

    # ---------------- residential_and_location ----------------
    "moved_to_residential": _ev(
        "Moved to residential aged care", "residential_and_location",
        [A_SERV, A_BUDGET, A_PROV], transition="MOVED_TO_RESIDENTIAL"),
    "moved_overseas_temporarily": _ev(
        "Moved overseas temporarily", "residential_and_location",
        [A_SERV], transition="OVERSEAS"),
    "returned_from_overseas": _ev(
        "Returned from overseas", "residential_and_location",
        [A_SERV], transition="ACTIVE"),
    "moved_to_remote_area": _ev(
        "Moved to a remote area", "residential_and_location",
        [A_SERV], flag_changes=[_flag("REMOTE")]),
    "moved_to_mps_area": _ev(
        "Moved to a Multi-Purpose Service area", "residential_and_location",
        [A_SERV], flag_changes=[_flag("MPS")]),

    # ---------------- financial_means_testing ----------------
    "services_australia_letter_received": _ev(
        "Services Australia letter received", "financial_means_testing",
        [A_CONTRIB]),
    "means_not_disclosed": _ev(
        "Means assessment not disclosed", "financial_means_testing",
        [A_CONTRIB], flag_changes=[_flag("MEANS_NOT_DISCLOSED")]),
    "pension_status_changed": _ev(
        "Pension status changed", "financial_means_testing",
        [A_CONTRIB]),
    "hardship_granted": _ev(
        "Financial hardship granted", "financial_means_testing",
        [A_CONTRIB],
        flag_changes=[_flag("HARDSHIP_GRANTED", True,
                            ["effective_from", "effective_to", "supplement_type"])]),
    "lifetime_cap_reached": _ev(
        "Lifetime contribution cap reached", "financial_means_testing",
        [A_CONTRIB], flag_changes=[_flag("LIFETIME_CAP_REACHED")]),
    "time_limited_cap_reached": _ev(
        "Time-limited contribution cap reached", "financial_means_testing",
        [A_CONTRIB], flag_changes=[_flag("TIME_LIMITED_CAP_REACHED")]),
    "cshc_acquired": _ev(
        "Commonwealth Seniors Health Card acquired", "financial_means_testing",
        [A_CONTRIB], flag_changes=[_flag("CSHC_HOLDER", True)]),
    "cshc_lost": _ev(
        "Commonwealth Seniors Health Card lost", "financial_means_testing",
        [A_CONTRIB], flag_changes=[_flag("CSHC_HOLDER", False)]),

    # ---------------- relationship_household ----------------
    "registered_supporter_added": _ev(
        "Registered supporter added", "relationship_household",
        [A_LEGAL], flag_changes=[_flag("HAS_REGISTERED_SUPPORTER")]),
    "epoa_registered": _ev(
        "Enduring Power of Attorney registered", "relationship_household",
        [A_LEGAL], flag_changes=[_flag("HAS_EPOA")]),
    "guardian_appointed": _ev(
        "Guardian appointed", "relationship_household",
        [A_LEGAL], flag_changes=[_flag("HAS_GUARDIAN")]),
    "public_trustee_appointed": _ev(
        "Public Trustee appointed", "relationship_household",
        [A_LEGAL], flag_changes=[_flag("PUBLIC_TRUSTEE")]),
    "caregiver_added": _ev(
        "Caregiver added to account", "relationship_household", [A_LEGAL]),
    "caregiver_removed": _ev(
        "Caregiver removed from account", "relationship_household", [A_LEGAL]),

    # ---------------- provider_and_service ----------------
    "provider_changed": _ev(
        "Provider changed", "provider_and_service",
        [A_PROV],
        flag_changes=[_flag("SWITCHING_PROVIDER", False),
                       _flag("PROVIDER_ACTIVE", True)]),
    "provider_cease_notified": _ev(
        "Provider gave notice they are ceasing", "provider_and_service",
        [A_PROV, A_SERV],
        flag_changes=[_flag("PROVIDER_CEASING", True,
                            ["notice_date", "cease_date"])]),
    "provider_deregistered": _ev(
        "Provider deregistered", "provider_and_service",
        [A_PROV, A_SERV], flag_changes=[_flag("PROVIDER_DEREGISTERED")]),
    "service_paused": _ev(
        "Services paused", "provider_and_service",
        [A_SERV], transition="SERVICES_PAUSED"),
    "service_resumed": _ev(
        "Services resumed", "provider_and_service",
        [A_SERV], transition="ACTIVE"),
    "branch_transfer_notified": _ev(
        "Branch transfer notified by provider", "provider_and_service",
        [A_PROV]),
    "switching_provider_started": _ev(
        "Switching provider started", "provider_and_service",
        [A_PROV], flag_changes=[_flag("SWITCHING_PROVIDER", True)]),

    # ---------------- budget_and_funding ----------------
    "statement_received": _ev(
        "Monthly statement received", "budget_and_funding", [A_BUDGET]),
    "care_management_over_cap": _ev(
        "Care management billed above 10% cap", "budget_and_funding", [A_BUDGET]),
    "wrong_stream_billing": _ev(
        "Service billed against the wrong stream", "budget_and_funding", [A_BUDGET]),
    "backdated_adjustment": _ev(
        "Backdated adjustment on statement", "budget_and_funding", [A_BUDGET]),
    "quarter_end_underspend_risk": _ev(
        "Quarter-end underspend at risk of forfeiture", "budget_and_funding", [A_BUDGET]),
    "budget_exhaustion_projected": _ev(
        "Budget projected to exhaust before quarter end", "budget_and_funding", [A_BUDGET]),
    "at_hm_approved": _ev(
        "AT-HM funding approved", "budget_and_funding",
        [A_BUDGET, A_SERV],
        flag_changes=[_flag("AT_HM_ACTIVE", True,
                            ["expiry_date", "tier", "approved_aud"])]),
    "at_hm_purchased": _ev(
        "AT-HM item purchased", "budget_and_funding", [A_BUDGET]),
    "at_hm_expiring": _ev(
        "AT-HM funding expiring soon", "budget_and_funding", [A_BUDGET]),
    "supplement_granted": _ev(
        "Supplement granted", "budget_and_funding", [A_BUDGET, A_CONTRIB]),

    # ---------------- program_policy (forward-dated, gated in Phase 4) ----
    "policy_personal_care_free_2026": _ev(
        "Personal care moves to Clinical (1 Oct 2026)",
        "program_policy", [A_CONTRIB]),
    "policy_price_caps_2026": _ev(
        "National provider price caps commence (1 Jul 2026)",
        "program_policy", [A_BUDGET]),
    "policy_eol_round2_2027": _ev(
        "End-of-Life second-round funding (early 2027)",
        "program_policy", [A_BUDGET]),
    "policy_chsp_transition": _ev(
        "CHSP transition to Support at Home (from 1 Jul 2027)",
        "program_policy", [A_SERV]),
    "indexation_classification": _ev(
        "Classification budget indexation (1 Jul)",
        "program_policy", [A_BUDGET]),
    "indexation_cap": _ev(
        "Lifetime cap indexation (20 Mar / 20 Sep)",
        "program_policy", [A_CONTRIB]),

    # ---------------- administrative_identity ----------------
    "identity_change": _ev(
        "Identity detail changed (name, DOB)", "administrative_identity", []),
    "consent_withdrawn": _ev(
        "Consent to share data withdrawn", "administrative_identity",
        [A_LEGAL]),
    "referral_code_issued": _ev(
        "Referral code issued (56-day validity)", "administrative_identity",
        [A_SERV]),
    "referral_code_expired": _ev(
        "Referral code expired", "administrative_identity", [A_SERV]),

    # ---------------- outlier_edge_case (all ESCALATE in Phase 5) -----------
    "elder_abuse_disclosed": _ev(
        "Elder abuse disclosed", "outlier_edge_case",
        [A_LEGAL], flag_changes=[_flag("SAFEGUARDING_ALERT")]),
    "financial_abuse_disclosed": _ev(
        "Financial abuse disclosed", "outlier_edge_case",
        [A_LEGAL, A_CONTRIB], flag_changes=[_flag("SAFEGUARDING_ALERT")]),
    "scam_or_fraud_disclosed": _ev(
        "Scam or fraud disclosed", "outlier_edge_case",
        [A_LEGAL], flag_changes=[_flag("SAFEGUARDING_ALERT")]),
    "missing_person": _ev(
        "Participant reported missing", "outlier_edge_case",
        [A_LEGAL], flag_changes=[_flag("SAFEGUARDING_ALERT")]),
    "natural_disaster_affecting_home": _ev(
        "Natural disaster affecting participant's home", "outlier_edge_case",
        [A_SERV]),
}


# ---------------------------------------------------------------------------
# Group ordering (matches the prompt and the catalogue) for the picker UI
# ---------------------------------------------------------------------------
GROUP_ORDER = [
    "classification_and_assessment",
    "health_and_life",
    "residential_and_location",
    "financial_means_testing",
    "relationship_household",
    "provider_and_service",
    "budget_and_funding",
    "program_policy",
    "administrative_identity",
    "outlier_edge_case",
]

GROUP_LABELS = {
    "classification_and_assessment": "Classification & assessment",
    "health_and_life": "Health & life",
    "residential_and_location": "Residential & location",
    "financial_means_testing": "Financial & means testing",
    "relationship_household": "Relationships & household",
    "provider_and_service": "Provider & service",
    "budget_and_funding": "Budget & funding",
    "program_policy": "Programme policy",
    "administrative_identity": "Administrative & identity",
    "outlier_edge_case": "Outlier & edge case",
}


def taxonomy() -> Dict[str, Any]:
    """Return the public-safe event taxonomy for the capture UI."""
    groups: Dict[str, List[Dict[str, Any]]] = {g: [] for g in GROUP_ORDER}
    for et, spec in EVENT_TYPES.items():
        groups[spec["group"]].append({
            "event_type": et,
            "label": spec["label"],
            "label_au": spec["label_au"],
            "axes": spec["axes"],
            "transition": spec["transition"],
            "flag_changes": spec["flag_changes"],
        })
    for g in groups:
        groups[g].sort(key=lambda x: x["label"])
    return {
        "groups": [{"key": g, "label": GROUP_LABELS[g], "events": groups[g]}
                   for g in GROUP_ORDER],
    }


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------
class EventRejected(Exception):
    pass


async def capture_event(
    db,
    *,
    participant_id: str,
    account_id: Optional[str],
    event_type: str,
    sub_type: Optional[str] = None,
    trigger_source: str,
    effective_date: str,           # YYYY-MM-DD
    note: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    source: Optional[Dict[str, Any]] = None,
    actor_id: str,
    actor_name: Optional[str] = None,
    apply_transitions: bool = True,
) -> Dict[str, Any]:
    """Log an event. Applies any proposed lifecycle transition through the
    Phase 2 guard. Returns the persisted event including
    ``proposed.transition_status`` so the caregiver UI can decide whether to
    re-route (e.g. "proposed transition is not allowed — confirm?")."""
    spec = EVENT_TYPES.get(event_type)
    if spec is None:
        raise EventRejected(f"unknown event_type {event_type!r}")
    if trigger_source not in TRIGGER_SOURCES:
        raise EventRejected(f"invalid trigger_source {trigger_source!r}")

    payload = payload or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    event_id = str(uuid.uuid4())
    affects = {a: (a in spec["axes"]) for a in AXES}

    proposed = {
        "lifecycle_transition": spec["transition"],
        "flag_changes": list(spec["flag_changes"] or []),
        "transition_applied": False,
        "transition_status": "not_proposed" if not spec["transition"] else "pending",
        "flag_results": [],
    }
    audit_ids: List[str] = []

    # Apply lifecycle transition (Phase 2 guard).
    if apply_transitions and spec["transition"]:
        from scenario_engine.lifecycle import (
            apply_transition, TransitionRejected,
        )
        try:
            res = await apply_transition(
                db, participant_id=participant_id, account_id=account_id,
                to_state=spec["transition"], actor_id=actor_id,
                actor_name=actor_name,
                reason=f"event:{event_type}",
                source={"kind": "event", "event_id": event_id,
                        "event_type": event_type},
            )
            proposed["transition_applied"] = True
            proposed["transition_status"] = "applied"
            proposed["from_state"] = res["from_state"]
            audit_ids.append(res["audit_id"])
        except TransitionRejected as e:
            # Surface for caregiver confirmation rather than failing the event.
            proposed["transition_status"] = "blocked"
            proposed["transition_block_reason"] = str(e)

    # Apply flag changes (each through the Phase 2 flag setter).
    if apply_transitions and spec["flag_changes"]:
        from scenario_engine.flags import set_flag, FlagRejected
        for fc in spec["flag_changes"]:
            flag_name = fc["flag"]
            target_value = fc.get("value", True)
            flag_payload = None
            if isinstance(target_value, bool) and target_value:
                # Lift requested payload keys from the event payload (when provided).
                pk = fc.get("payload_keys") or []
                if pk:
                    flag_payload = {k: payload.get(k) for k in pk if k in payload}
            try:
                fres = await set_flag(
                    db, participant_id=participant_id, account_id=account_id,
                    flag=flag_name,
                    value=bool(target_value) if isinstance(target_value, bool) else True,
                    payload=flag_payload,
                    actor_id=actor_id, actor_name=actor_name,
                    reason=f"event:{event_type}",
                    source={"kind": "event", "event_id": event_id,
                            "event_type": event_type},
                )
                proposed["flag_results"].append({
                    "flag": flag_name, "ok": True, "new": fres["new"],
                    "audit_id": fres["audit_id"],
                })
                audit_ids.append(fres["audit_id"])
            except FlagRejected as e:
                proposed["flag_results"].append({
                    "flag": flag_name, "ok": False, "error": str(e),
                })

    doc = {
        "id": event_id,
        "participant_id": participant_id,
        "account_id": account_id,
        "event_type": event_type,
        "sub_type": sub_type,
        "trigger_source": trigger_source,
        "effective_date": effective_date,
        "captured_date": now_iso,
        "note": note,
        "payload": payload,
        "source": source,
        "affects": affects,
        "proposed": proposed,
        "audit_ids": audit_ids,
        "advice_boundary": "SAFE_TO_EXPLAIN",   # Phase 5 will overwrite
        "created_at": now_iso,
        "created_by": actor_id,
        "created_by_name": actor_name,
    }
    await db.participant_events.insert_one(dict(doc))
    return doc


async def list_events(db, participant_id: str,
                       *, limit: int = 100,
                       cursor_date: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"participant_id": participant_id}
    if cursor_date:
        q["created_at"] = {"$lt": cursor_date}
    cur = db.participant_events.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


async def ensure_indexes(db) -> None:
    await db.participant_events.create_index([("participant_id", 1), ("created_at", -1)])
    await db.participant_events.create_index([("account_id", 1), ("event_type", 1)])
    await db.participant_events.create_index("id", unique=True)
