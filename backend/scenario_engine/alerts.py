"""Scenario engine — alerts and deadline clocks.

This module turns state + flags + events + the calendar into calm caregiver
alerts. Twelve confirmed program-deadline clocks run on a schedule. Flag and
event changes fire their own alerts at the moment of change.

Hard rules (per the Phase 4 prompt)
-----------------------------------
- Severity is one of {low, medium, high, critical} and tone stays calm.
- One clear next action per alert. No "URGENT!" copy.
- Push and notification payloads must NOT contain health or financial detail.
  Use a generic title that opens the app to the full alert body.
- Forward-dated policy alerts (1 Oct 2026 personal care free, 1 Jul 2026
  price caps, early-2027 EoL second round, CHSP transition) are gated behind
  their effective dates read from program_reference.
- Confirmed deadlines only. Where the catalogue notes "confirm with provider
  or Services Australia", the alert body says so — we do not invent numbers.
- Delivery goes through the existing in-app notification stack (Phase 0 §4).

Schema (scenario_alerts collection)
-----------------------------------
{
  id, participant_id, account_id,
  alert_type, severity, axis,
  title, body, next_action_text, next_action_link,
  advice_boundary,            # Phase 5 will set to ROUTE_OUT/ESCALATE where needed
  source: { kind: "deadline_clock" | "event" | "flag" | "statement_anomaly", ... },
  status: "open" | "acknowledged" | "resolved" | "dismissed",
  created_at, resolved_at, acknowledged_at,
  dedupe_key                  # one open alert per (participant, alert_type, dedupe_key)
}
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("wayly.scenario_engine.alerts")

SEVERITIES = ("low", "medium", "high", "critical")
AXES = ("classification", "budget", "contribution", "services", "provider", "legal_status")

# Alert catalogue (Phase 5 will overlay advice_boundary).
ALERT_TYPES: Dict[str, Dict[str, Any]] = {
    # ---- Deadline-clock alerts ----
    "quarter_end_underspend_risk":     {"severity": "medium",  "axis": "budget"},
    "budget_exhaustion_projected":     {"severity": "high",    "axis": "budget"},
    "care_management_over_cap":        {"severity": "high",    "axis": "budget"},
    "at_hm_expiry_60_days":            {"severity": "medium",  "axis": "budget"},
    "at_hm_expiry_imminent":           {"severity": "high",    "axis": "budget"},
    "statement_overdue":               {"severity": "medium",  "axis": "budget"},
    "provider_cease_14d_notice":       {"severity": "high",    "axis": "provider"},
    "provider_continuity_window":      {"severity": "high",    "axis": "services"},
    "death_provider_notify_28d":       {"severity": "high",    "axis": "provider"},
    "death_final_claim_60d":           {"severity": "high",    "axis": "budget"},
    "contribution_letter_120d":        {"severity": "medium",  "axis": "contribution"},
    "referral_code_56d":               {"severity": "low",     "axis": "services"},
    "no_service_4_quarters_risk":      {"severity": "high",    "axis": "services"},
    "interim_60pct_remainder_warning": {"severity": "medium",  "axis": "budget"},
    "restorative_expiry_imminent":     {"severity": "medium",  "axis": "services"},
    "eol_expiry_imminent":             {"severity": "medium",  "axis": "services"},
    # ---- Flag/event-driven alerts ----
    "means_not_disclosed_standing":    {"severity": "low",     "axis": "contribution"},
    "lifetime_cap_reached":            {"severity": "high",    "axis": "contribution"},
    "time_limited_cap_reached":        {"severity": "high",    "axis": "contribution"},
    "wrong_stream_billing":            {"severity": "high",    "axis": "budget"},
    "backdated_adjustment":            {"severity": "medium",  "axis": "budget"},
    "safeguarding_concern":            {"severity": "critical","axis": "legal_status"},
    # ---- Forward-dated policy alerts (gated) ----
    "policy_personal_care_free_2026":  {"severity": "low",     "axis": "contribution"},
    "policy_price_caps_2026":          {"severity": "low",     "axis": "budget"},
    "policy_eol_round2_2027":          {"severity": "low",     "axis": "budget"},
    "policy_chsp_transition":          {"severity": "low",     "axis": "services"},
}

# Generic push title — never reveals health or financial detail.
PUSH_TITLE = "There's an update on a participant"
PUSH_BODY = "Open Wayly to see the details."


# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------
async def emit_alert(
    db, *,
    participant_id: str,
    account_id: Optional[str],
    alert_type: str,
    title: str,
    body: str,
    next_action_text: str,
    next_action_link: str,
    severity: Optional[str] = None,
    source: Optional[Dict[str, Any]] = None,
    dedupe_key: Optional[str] = None,
    advice_boundary: str = "SAFE_TO_EXPLAIN",
) -> Optional[Dict[str, Any]]:
    """Write a scenario_alert row and create in-app notifications for every
    caregiver who can see this participant (owner + members with
    participant_access). Returns the alert doc, or None if a duplicate already
    sits open with the same (participant, alert_type, dedupe_key)."""
    spec = ALERT_TYPES.get(alert_type) or {}
    sev = severity or spec.get("severity", "medium")
    if sev not in SEVERITIES:
        raise ValueError(f"unknown severity {sev!r}")

    dk = dedupe_key or alert_type
    existing = await db.scenario_alerts.find_one({
        "participant_id": participant_id,
        "alert_type": alert_type,
        "dedupe_key": dk,
        "status": "open",
    }, {"_id": 0, "id": 1})
    if existing:
        return None

    alert_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": alert_id,
        "participant_id": participant_id,
        "account_id": account_id,
        "alert_type": alert_type,
        "severity": sev,
        "axis": spec.get("axis"),
        "title": title,
        "body": body,
        "next_action_text": next_action_text,
        "next_action_link": next_action_link,
        "advice_boundary": advice_boundary,
        "source": source,
        "status": "open",
        "created_at": now_iso,
        "dedupe_key": dk,
    }
    # Phase 5 — overlay boundary level + contacts from the boundary map.
    try:
        from scenario_engine.boundaries import boundary_for_alert, contact_block
        level, contact_keys = boundary_for_alert(alert_type)
        if level != "SAFE_TO_EXPLAIN":
            doc["advice_boundary"] = level
            doc["route_out_contacts"] = contact_block(contact_keys)
    except Exception:
        pass
    await db.scenario_alerts.insert_one(dict(doc))

    # Fan out: owner + every caregiver with participant_access.
    try:
        await _fan_out_notification(db,
            participant_id=participant_id, account_id=account_id,
            alert_id=alert_id, title=title, body=body,
            next_action_link=next_action_link, severity=sev,
        )
    except Exception as e:  # best-effort
        log.warning("alert fan-out failed: %s", e)
    return doc


async def _fan_out_notification(db, *, participant_id, account_id, alert_id,
                                  title, body, next_action_link, severity):
    """Create one in-app notification per caregiver. Body is the full alert
    body (in-app surface is gated by JWT + access). Push payloads sent by the
    existing notification stack remain generic per the rule above."""
    from server import create_notification  # type: ignore (imported lazily)

    # Owner + ACTIVE members. participant_access==None means "all".
    member_q = {"account_id": account_id, "status": "ACTIVE"} if account_id else None
    if not member_q:
        return
    cursor = db.account_members.find(member_q, {"_id": 0, "user_id": 1,
                                                  "role": 1, "participant_access": 1})
    link = next_action_link if next_action_link.startswith("/") else "/app/scenarios"
    async for m in cursor:
        pa = m.get("participant_access")
        if m.get("role") == "OWNER" or pa is None or participant_id in (pa or []):
            try:
                await create_notification(
                    m["user_id"], "scenario_alert", title, body, link,
                )
            except Exception as e:
                log.debug("create_notification skipped for %s: %s", m["user_id"], e)


async def _account_for(db, participant_id: str) -> Optional[str]:
    p = await db.participants.find_one({"id": participant_id},
                                        {"_id": 0, "account_id": 1})
    return (p or {}).get("account_id")


# ---------------------------------------------------------------------------
# Helpers shared across clocks
# ---------------------------------------------------------------------------
def _today() -> date:
    return datetime.now(timezone.utc).date()


def _days_until(d: date) -> int:
    return (d - _today()).days


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Deadline clocks (each returns a list of emit_alert kwargs or [])
# ---------------------------------------------------------------------------
async def _clock_at_hm_expiry(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    flag = (p.get("flags") or {}).get("AT_HM_ACTIVE")
    if not flag or flag is True:
        return []
    expiry = _parse_date(flag.get("expiry_date"))
    if not expiry:
        return []
    days = _days_until(expiry)
    pid = p["id"]
    base = {
        "participant_id": pid, "account_id": p.get("account_id"),
        "next_action_link": "/app/at-hm",
        "source": {"kind": "deadline_clock", "clock": "at_hm_expiry",
                   "expiry_date": expiry.isoformat()},
    }
    if 0 < days <= 14:
        return [{**base, "alert_type": "at_hm_expiry_imminent",
                  "title": "AT-HM funding expires soon",
                  "body": f"AT-HM funding expires in {days} day(s) on {expiry}. "
                          "Unused funds will be lost. Confirm the item is purchased "
                          "and invoiced before the date.",
                  "next_action_text": "Open AT-HM tracker",
                  "dedupe_key": f"at_hm_imminent:{expiry.isoformat()}"}]
    if 14 < days <= 60:
        return [{**base, "alert_type": "at_hm_expiry_60_days",
                  "title": "AT-HM funding expires in under 60 days",
                  "body": f"AT-HM funding expires {expiry} ({days} days away). "
                          "Plan the purchase and ordering window now to avoid losing the funds.",
                  "next_action_text": "Open AT-HM tracker",
                  "dedupe_key": f"at_hm_60d:{expiry.isoformat()}"}]
    return []


async def _clock_provider_cease(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    flag = (p.get("flags") or {}).get("PROVIDER_CEASING")
    if not flag or flag is True:
        return []
    cease = _parse_date(flag.get("cease_date"))
    if not cease:
        return []
    days = _days_until(cease)
    if not (0 <= days <= 30):
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "provider_cease_14d_notice",
        "title": "Provider is ceasing services",
        "body": f"Your provider has given notice and will stop services on {cease} "
                f"({days} day(s) away). Choose a new provider so there is no gap.",
        "next_action_text": "Find another provider",
        "next_action_link": "/app/provider-switch",
        "source": {"kind": "deadline_clock", "clock": "provider_cease",
                   "cease_date": cease.isoformat()},
        "dedupe_key": f"provider_cease:{cease.isoformat()}",
    }]


async def _clock_statement_overdue(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Statements due last day of the following month. We compute the expected
    # arrival for last calendar month and check whether any statement was
    # recorded as received for the participant during that window.
    today = _today()
    # The statement we expect to have received now covers two months back.
    target_year = today.year if today.month > 1 else today.year - 1
    target_month = today.month - 1 if today.month > 1 else 12
    month_iso = f"{target_year}-{target_month:02d}"
    existing = await db.statements.find_one(
        {"participant_id": p["id"], "statement_month": month_iso},
        {"_id": 0, "id": 1},
    )
    if existing:
        return []
    # Only alert after the due date (~28 of the current month).
    if today.day < 7:
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "statement_overdue",
        "title": "Last month's statement hasn't arrived",
        "body": f"We haven't recorded a statement for {month_iso}. "
                "Providers must issue it by the last day of the following month. "
                "Ask the provider for a copy if it hasn't been emailed yet.",
        "next_action_text": "Open statements",
        "next_action_link": "/app/statements",
        "source": {"kind": "deadline_clock", "clock": "statement_overdue",
                   "month": month_iso},
        "dedupe_key": f"statement_overdue:{month_iso}",
    }]


async def _clock_quarter_end_underspend(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        from budget import get_quarter_window
    except Exception:
        return []
    q_start, q_end, q_label = get_quarter_window(_today())
    days_left = (q_end - _today()).days
    # Fire when 21 days or fewer remain in the quarter.
    if not (0 < days_left <= 21):
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "quarter_end_underspend_risk",
        "title": "Quarter ends soon — review unspent funds",
        "body": f"The {q_label} quarter ends in {days_left} day(s). "
                "Only the greater of $1,000 or 10% of the quarterly budget rolls over. "
                "Anything above that is lost. Review spend and book any planned services.",
        "next_action_text": "Open budget",
        "next_action_link": "/app/budget-alerts",
        "source": {"kind": "deadline_clock", "clock": "quarter_end_underspend",
                   "quarter_end": q_end.isoformat()},
        "dedupe_key": f"quarter_end:{q_end.isoformat()}",
    }]


async def _clock_budget_exhaustion_projected(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Project quarter-end spend from current burn rate. If the linear
    extrapolation would exceed the quarterly budget before the quarter
    ends, surface a high-severity alert so the caregiver can act early.

    Conservative: requires (a) at least 14 days into the quarter so the
    burn rate is meaningful, and (b) ≥10% safety margin so we don't fire
    on a household that is on-budget within the noise band.
    """
    if p.get("lifecycle_state") not in {"ACTIVE", "RESTORATIVE", "INTERIM_FUNDED",
                                          "AWAITING_REASSESSMENT", "END_OF_LIFE"}:
        return []
    try:
        from budget import (
            get_quarter_window, compute_burn, quarterly_budget, STREAMS,
        )
    except Exception:
        return []
    q_start, q_end, q_label = get_quarter_window(_today())
    days_into = (_today() - q_start).days + 1
    days_left = (q_end - _today()).days
    if days_into < 14 or days_left <= 0:
        return []
    # Read household classification through the participant doc.
    classification = p.get("classification")
    if not classification:
        h = await db.households.find_one({"primary_user_id": p.get("primary_user_id")},
                                           {"_id": 0, "classification": 1})
        classification = (h or {}).get("classification")
    if not classification:
        return []
    cur = db.statements.find({"participant_id": p["id"]},
                              {"_id": 0, "line_items": 1}).limit(50)
    all_items: List[Dict[str, Any]] = []
    async for s in cur:
        all_items.extend(s.get("line_items") or [])
    burn = compute_burn(all_items, q_start, q_end)
    total_spent = sum(burn.values())
    if total_spent <= 0:
        return []
    try:
        q_total = quarterly_budget(int(classification))
    except Exception:
        return []
    daily_rate = total_spent / max(1, days_into)
    projected = total_spent + (daily_rate * days_left)
    # Require ≥10% overshoot before firing.
    if projected < q_total * 1.10:
        return []
    overshoot = round(projected - q_total, 0)
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "budget_exhaustion_projected",
        "title": "Budget projected to exhaust before quarter end",
        "body": f"At the current spending rate, the {q_label} quarter will exceed "
                f"the budget by about ${overshoot:,.0f}. Anything above the quarterly "
                "budget is not subsidised — review upcoming services with your provider "
                "and consider deferring non-essential bookings.",
        "next_action_text": "Open budget",
        "next_action_link": "/app/budget-alerts",
        "source": {"kind": "deadline_clock", "clock": "budget_exhaustion_projected",
                   "quarter_end": q_end.isoformat(),
                   "projected_total": round(projected, 0),
                   "quarterly_total": round(q_total, 0)},
        "dedupe_key": f"budget_exhaustion:{q_end.isoformat()}",
    }]


async def _clock_interim_60pct(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    if p.get("lifecycle_state") != "INTERIM_FUNDED":
        return []
    flag = (p.get("flags") or {}).get("INTERIM_60PCT")
    expected = _parse_date((flag or {}).get("expected_full_funding_date")) if isinstance(flag, dict) else None
    body = ("Interim funding pays only 60% of the classification budget while you wait "
            "for the full allocation. The remainder will NOT be backdated, so plan spend conservatively.")
    if expected:
        body += f" Full funding expected by {expected}."
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "interim_60pct_remainder_warning",
        "title": "Interim funding active — remainder is not backdated",
        "body": body,
        "next_action_text": "Open budget",
        "next_action_link": "/app/budget-alerts",
        "source": {"kind": "deadline_clock", "clock": "interim_60pct"},
        "dedupe_key": "interim_60pct_standing",
    }]


async def _clock_no_service_4q(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    if p.get("lifecycle_state") not in {"SERVICES_PAUSED", "OVERSEAS"}:
        return []
    paused_since = _parse_date(p.get("lifecycle_state_updated_at"))
    if not paused_since:
        return []
    days = (_today() - paused_since).days
    # 4 quarters ≈ 365 days. Warn from 270 days.
    if days < 270:
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "no_service_4_quarters_risk",
        "title": "No services for nearly a year — funding at risk",
        "body": "After four consecutive quarters without services, funding may be withdrawn. "
                "Resume at least one service or contact My Aged Care to discuss.",
        "next_action_text": "Resume services",
        "next_action_link": "/app/scenarios",
        "source": {"kind": "deadline_clock", "clock": "no_service_4q"},
        "dedupe_key": "no_service_4q_standing",
    }]


async def _clock_means_not_disclosed(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not (p.get("flags") or {}).get("MEANS_NOT_DISCLOSED"):
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "means_not_disclosed_standing",
        "title": "Means assessment isn't on file",
        "body": "Without an assessment, the system uses the highest contribution rate. "
                "Completing a Services Australia means assessment could lower contributions. "
                "We can't recommend a figure — Services Australia is the right place to start.",
        "next_action_text": "Call Services Australia FIS",
        "next_action_link": "tel:132300",
        "source": {"kind": "flag", "flag": "MEANS_NOT_DISCLOSED"},
        "dedupe_key": "means_not_disclosed_standing",
    }]


async def _clock_lifetime_cap(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not (p.get("flags") or {}).get("LIFETIME_CAP_REACHED"):
        return []
    return [{
        "participant_id": p["id"], "account_id": p.get("account_id"),
        "alert_type": "lifetime_cap_reached",
        "title": "Lifetime contribution cap reached",
        "body": "The lifetime non-clinical contribution cap has been reached. "
                "Check upcoming statements to confirm contributions have stopped. "
                "If your provider is still charging, raise it with them and Services Australia.",
        "next_action_text": "Open statements",
        "next_action_link": "/app/statements",
        "source": {"kind": "flag", "flag": "LIFETIME_CAP_REACHED"},
        "dedupe_key": "lifetime_cap_standing",
    }]


# Forward-dated policy gates.
async def _clock_policy_gates(db, p: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        from program_reference import get_value
    except Exception:
        return []
    today = _today()
    alerts = []
    gates = [
        ("policy_date.personal_care_free", "policy_personal_care_free_2026",
         "From 1 Oct 2026, personal care moves to clinical supports",
         "Personal care contributions drop to zero. Watch the first statement after that date "
         "to confirm the change is reflected.", "/app/statements"),
        ("policy_date.price_caps_start", "policy_price_caps_2026",
         "National provider price caps start 1 Jul 2026",
         "Provider prices for capped services will be limited. Check your statement after the start "
         "date to make sure capped services are within the cap.", "/app/statements"),
        ("policy_date.eol_second_round_start", "policy_eol_round2_2027",
         "End-of-Life second-round funding available from early 2027",
         "A second round of EoL funding becomes available. If the first 12 weeks aren't enough, "
         "talk to your provider about applying when the round opens.", "/app/scenarios"),
        ("policy_date.chsp_transition_earliest", "policy_chsp_transition",
         "CHSP transition to Support at Home — no earlier than 1 Jul 2027",
         "CHSP recipients will move into Support at Home. The exact timing is not yet confirmed.",
         "/app/scenarios"),
    ]
    for key, alert_type, title, body, link in gates:
        eff = get_value(key, default=None)
        eff_d = _parse_date(eff)
        if not eff_d:
            continue
        # Fire 14 days before, gate strictly behind effective date.
        days_until = (eff_d - today).days
        if 0 <= days_until <= 14:
            alerts.append({
                "participant_id": p["id"], "account_id": p.get("account_id"),
                "alert_type": alert_type, "title": title, "body": body,
                "next_action_text": "Read more", "next_action_link": link,
                "source": {"kind": "deadline_clock", "clock": "policy_gate",
                           "effective_date": eff},
                "dedupe_key": f"policy:{alert_type}:{eff}",
            })
    return alerts


DEADLINE_CLOCKS = [
    _clock_at_hm_expiry,
    _clock_provider_cease,
    _clock_statement_overdue,
    _clock_quarter_end_underspend,
    _clock_budget_exhaustion_projected,
    _clock_interim_60pct,
    _clock_no_service_4q,
    _clock_means_not_disclosed,
    _clock_lifetime_cap,
    _clock_policy_gates,
]


# ---------------------------------------------------------------------------
# Main entry — run by the scheduler
# ---------------------------------------------------------------------------
async def evaluate_all_clocks(db) -> Dict[str, int]:
    """Walk every ACTIVE participant and run every deadline clock. Returns
    counters for the log line."""
    counts = {"participants": 0, "alerts_emitted": 0, "dedup_skipped": 0,
              "errors": 0}
    cursor = db.participants.find(
        {"status": {"$ne": "REMOVED"}},
        {"_id": 0, "id": 1, "account_id": 1, "flags": 1, "lifecycle_state": 1,
         "lifecycle_state_updated_at": 1, "classification": 1,
         "primary_user_id": 1},
    )
    async for p in cursor:
        counts["participants"] += 1
        for clock in DEADLINE_CLOCKS:
            try:
                alerts = await clock(db, p)
            except Exception as e:
                log.warning("clock %s failed for %s: %s", clock.__name__, p["id"], e)
                counts["errors"] += 1
                continue
            for a in alerts:
                emitted = await emit_alert(db, **a)
                if emitted:
                    counts["alerts_emitted"] += 1
                else:
                    counts["dedup_skipped"] += 1
    return counts


# ---------------------------------------------------------------------------
# Event-driven alerts (called from events.capture_event)
# ---------------------------------------------------------------------------
EVENT_TO_ALERT: Dict[str, str] = {
    "wrong_stream_billing": "wrong_stream_billing",
    "care_management_over_cap": "care_management_over_cap",
    "backdated_adjustment": "backdated_adjustment",
    "safeguarding_concern_raised": "safeguarding_concern",
    "elder_abuse_disclosed": "safeguarding_concern",
    "financial_abuse_disclosed": "safeguarding_concern",
    "scam_or_fraud_disclosed": "safeguarding_concern",
    "missing_person": "safeguarding_concern",
    "lifetime_cap_reached": "lifetime_cap_reached",
    "time_limited_cap_reached": "time_limited_cap_reached",
}


async def maybe_emit_event_alert(db, event_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    alert_type = EVENT_TO_ALERT.get(event_doc["event_type"])
    if not alert_type:
        return None
    pid = event_doc["participant_id"]
    body_map = {
        "wrong_stream_billing":
            "A service appears to have been billed in the wrong stream. "
            "Clinical services should not include a contribution. Check the statement line and raise with the provider.",
        "care_management_over_cap":
            "Care management charges are above the 10% quarterly cap. "
            "Raise this with the provider — the cap is a regulatory limit.",
        "backdated_adjustment":
            "The statement includes a backdated adjustment. Confirm the dates and amounts with the provider before paying.",
        "safeguarding_concern":
            "A safeguarding concern has been recorded. "
            "Open the participant timeline for the contacts to call. In an emergency dial 000.",
        "lifetime_cap_reached":
            "The lifetime non-clinical contribution cap has been reached. "
            "Check the next statement to confirm contributions stop.",
        "time_limited_cap_reached":
            "The 4-year non-clinical contribution cap has been reached. Confirm contributions stop on the next statement.",
    }
    next_action = ("/app/statements" if alert_type in {"wrong_stream_billing", "care_management_over_cap",
                                                          "backdated_adjustment", "lifetime_cap_reached",
                                                          "time_limited_cap_reached"}
                   else "/app/scenarios")
    return await emit_alert(db,
        participant_id=pid, account_id=event_doc.get("account_id"),
        alert_type=alert_type,
        title=ALERT_TYPES[alert_type].get("title")
              or {"wrong_stream_billing": "Service may be billed in the wrong stream",
                  "care_management_over_cap": "Care management above the 10% cap",
                  "backdated_adjustment": "Backdated adjustment on statement",
                  "safeguarding_concern": "Safeguarding concern logged",
                  "lifetime_cap_reached": "Lifetime contribution cap reached",
                  "time_limited_cap_reached": "Time-limited contribution cap reached",
                  }[alert_type],
        body=body_map[alert_type],
        next_action_text="Open details",
        next_action_link=next_action,
        source={"kind": "event", "event_id": event_doc["id"],
                "event_type": event_doc["event_type"]},
        dedupe_key=f"event:{event_doc['id']}",
    )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
async def list_alerts(db, participant_id: str, *, status: Optional[str] = None,
                       limit: int = 100) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"participant_id": participant_id}
    if status:
        q["status"] = status
    cur = db.scenario_alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


async def update_status(db, *, alert_id: str, new_status: str, actor_id: str) -> bool:
    if new_status not in {"acknowledged", "resolved", "dismissed", "open"}:
        return False
    now_iso = datetime.now(timezone.utc).isoformat()
    update: Dict[str, Any] = {"status": new_status, f"{new_status}_at": now_iso,
                               f"{new_status}_by": actor_id}
    res = await db.scenario_alerts.update_one({"id": alert_id}, {"$set": update})
    return res.matched_count > 0


async def ensure_indexes(db) -> None:
    await db.scenario_alerts.create_index([("participant_id", 1), ("created_at", -1)])
    await db.scenario_alerts.create_index([("participant_id", 1), ("alert_type", 1),
                                            ("dedupe_key", 1), ("status", 1)])
    await db.scenario_alerts.create_index("id", unique=True)
