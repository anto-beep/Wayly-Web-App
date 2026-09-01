"""Scenario engine schema export, Phase 7.

Single source-of-truth contract for the mobile app (and any future SDK) so
they consume the same lifecycle, flags, event taxonomy, alert types,
advice-boundary directory, and workflow definitions without duplicating
business logic.

Exposed via ``GET /api/scenario/schema`` (public, no auth, the schema itself
is non-sensitive and identical for every participant). The response is
deterministic and includes a stable ``schema_version`` so the mobile app can
detect upgrades and a per-section ``revision`` so partial diffs are cheap.

Keep this module purely declarative, it must not import event-emission or
DB code, only the type catalogues.
"""
from __future__ import annotations
from typing import Any, Dict, List

# Schema version, bump on any breaking change to the contract. Mobile app
# pins to a minimum schema_version and refuses to render if older.
SCHEMA_VERSION = "1.0.0"
# Per-section revision, bump only the sections you change; mobile app can
# diff sections independently. (Bump SCHEMA_VERSION for any breaking change.)
SECTION_REVISIONS = {
    "lifecycle": "1.0.0",
    "flags": "1.0.0",
    "events": "1.0.0",
    "alerts": "1.0.0",
    "boundaries": "1.0.0",
    "workflows": "1.0.0",
}


def _serialise_event_types() -> List[Dict[str, Any]]:
    from scenario_engine.events import EVENT_TYPES
    out: List[Dict[str, Any]] = []
    for key, spec in EVENT_TYPES.items():
        spec_d = spec if isinstance(spec, dict) else dict(spec)
        out.append({
            "key": key,
            "label": spec_d.get("label", key.replace("_", " ").title()),
            "category": spec_d.get("category"),
            "affects": spec_d.get("affects", []),
            "transition": spec_d.get("transition"),
            "flag_changes": spec_d.get("flag_changes", []),
            "payload_keys": spec_d.get("payload_keys", []),
        })
    return out


def _serialise_lifecycle() -> Dict[str, Any]:
    from scenario_engine.lifecycle import (
        LIFECYCLE_STATES, TERMINAL_STATES, INITIAL_STATES, ALLOWED_TRANSITIONS,
    )
    return {
        "states": list(LIFECYCLE_STATES),
        "initial_states": sorted(INITIAL_STATES),
        "terminal_states": sorted(TERMINAL_STATES),
        "allowed_transitions": {s: sorted(list(v)) for s, v in ALLOWED_TRANSITIONS.items()},
    }


def _serialise_flags() -> Dict[str, Any]:
    from scenario_engine.flags import (
        FLAG_GROUPS, ALL_FLAGS, FLAG_PAYLOAD_KEYS, MUTUAL_EXCLUSION,
    )
    return {
        "groups": {g: list(flist) for g, flist in FLAG_GROUPS.items()},
        "all_flags": sorted(ALL_FLAGS),
        "payload_keys": {k: list(v) for k, v in FLAG_PAYLOAD_KEYS.items()},
        "mutual_exclusion": [sorted(list(s)) for s in MUTUAL_EXCLUSION],
        "restricted_flags": ["SAFEGUARDING_ALERT"],
    }


def _serialise_alerts() -> Dict[str, Any]:
    from scenario_engine.alerts import ALERT_TYPES, SEVERITIES, AXES
    return {
        "severities": list(SEVERITIES),
        "axes": list(AXES),
        "types": {
            k: {"severity": v.get("severity"), "axis": v.get("axis")}
            for k, v in ALERT_TYPES.items()
        },
    }


def _serialise_boundaries() -> Dict[str, Any]:
    from scenario_engine.boundaries import (
        CONTACTS, EVENT_BOUNDARIES, ALERT_BOUNDARIES,
    )
    return {
        "levels": ["SAFE_TO_EXPLAIN", "ROUTE_OUT", "ESCALATE"],
        "contacts": dict(CONTACTS),
        "event_advice_boundary": {
            k: {"level": lvl, "contact_keys": list(keys)}
            for k, (lvl, keys) in EVENT_BOUNDARIES.items()
        },
        "alert_advice_boundary": {
            k: {"level": lvl, "contact_keys": list(keys)}
            for k, (lvl, keys) in ALERT_BOUNDARIES.items()
        },
    }


def _serialise_workflows() -> Dict[str, Any]:
    from scenario_engine.workflows import WORKFLOWS
    out: Dict[str, Any] = {}
    for key, w in WORKFLOWS.items():
        out[key] = {
            "key": w["key"],
            "label": w["label"],
            "intro": w["intro"],
            "advice_boundary": w.get("advice_boundary", "SAFE_TO_EXPLAIN"),
            "route_out_contacts": w.get("route_out_contacts", []),
            "follow_up": w.get("follow_up"),
            "steps": [
                {
                    "key": s["key"],
                    "title": s["title"],
                    "body": s["body"],
                    "event_type": s.get("event_type"),
                    "payload_fields": s.get("payload_fields", []),
                    "cta": s.get("cta", "Log this"),
                }
                for s in w["steps"]
            ],
        }
    return out


def build_schema() -> Dict[str, Any]:
    """Build the full schema document. Deterministic, same input → same output."""
    return {
        "schema_version": SCHEMA_VERSION,
        "section_revisions": dict(SECTION_REVISIONS),
        "lifecycle": _serialise_lifecycle(),
        "flags": _serialise_flags(),
        "events": {
            "trigger_sources": _trigger_sources(),
            "types": _serialise_event_types(),
        },
        "alerts": _serialise_alerts(),
        "boundaries": _serialise_boundaries(),
        "workflows": _serialise_workflows(),
    }


def _trigger_sources() -> List[str]:
    from scenario_engine.events import TRIGGER_SOURCES
    return sorted(list(TRIGGER_SOURCES))
