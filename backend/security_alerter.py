"""Wayly — in-process security alerter (Phase 4 of the monitoring brief).

A small Mongo-backed sliding-window counter on top of the structured security
events already emitted from `observability.py`. When a threshold is crossed we:

  1. Insert a row into `security_alerts` (idempotent — one alert per
     (rule, key) bucket within the cooldown window so the team isn't paged
     repeatedly for the same incident).
  2. Emit an `ALERT_FIRED` JSON log line for downstream log aggregators.
  3. (Best-effort) send a notification email to `hello@wayly.com.au` via the
     existing Resend service. Mocked in preview unless RESEND_API_KEY is real.

We intentionally do NOT rely on a Redis sorted-set or an external alerting
provider here — the goal is "works out of the box in the existing stack".

Rules (per the brief):
  - AUTH_LOGIN_FAILURE   > 20 / 5min  per single IP        → HIGH
  - AUTH_LOGIN_FAILURE   > 50 / 5min  per single email     → HIGH (cred stuffing)
  - PARTICIPANT_ACCESS   > 50 distinct participant_ids / 10min per user_id → HIGH (scraping)
  - ADMIN_ACTION         > 30 / 5min  per single admin_id  → CRITICAL (compromised admin)
  - FILE_UPLOAD          scan_result == "infected"         → CRITICAL (single event)

Each alert carries `severity`, `rule`, `subject`, `count`, `window_seconds`,
`first_seen`, `last_seen`, `resolved`, `resolved_by`, `resolved_at`,
`resolution_note`. Subjects (ip / email / user_id) are stored as SHA-256
truncated hashes for credential stuffing — full ids only for our own user_id
/ admin_id (Wayly-owned).
"""
from __future__ import annotations
import os
import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger("wayly.security.alerter")

# ---------------------------------------------------------------------------
# Thresholds — keep in one place so the runbook + dashboard stay in sync.
# ---------------------------------------------------------------------------
RULE_THRESHOLDS = {
    "LOGIN_FAILURE_PER_IP": {
        "event": "AUTH_LOGIN_FAILURE",
        "window_s": 300,
        "limit": 20,
        "severity": "HIGH",
        "description": "Brute-force or credential-stuffing from a single IP",
    },
    "LOGIN_FAILURE_PER_EMAIL_HASH": {
        "event": "AUTH_LOGIN_FAILURE",
        "window_s": 300,
        "limit": 50,
        "severity": "HIGH",
        "description": "Credential stuffing — many failed logins against the same account",
    },
    "PARTICIPANT_SCRAPE": {
        "event": "PARTICIPANT_ACCESS",
        "window_s": 600,
        "limit": 50,
        "severity": "HIGH",
        "description": "Possible scraping — single user accessed > 50 distinct participants in 10 min",
    },
    "ADMIN_ACTION_SPIKE": {
        "event": "ADMIN_ACTION",
        "window_s": 300,
        "limit": 30,
        "severity": "CRITICAL",
        "description": "Admin action spike — possibly compromised admin account",
    },
    "MALWARE_UPLOAD": {
        "event": "FILE_UPLOAD",
        "window_s": 1,
        "limit": 1,
        "severity": "CRITICAL",
        "description": "ClamAV flagged an uploaded file as infected",
    },
    "DECODER_COST_RUNAWAY": {
        "event": "DECODER_RUN",
        "window_s": 3600,
        "limit_aud": 20.0,
        "severity": "HIGH",
        "description": "Statement Decoder cost > $20 AUD in 60 min for a single user",
    },
}

ALERT_COOLDOWN_S = int(os.environ.get("WAYLY_ALERT_COOLDOWN_S", "1800"))  # 30 min default


# ---------------------------------------------------------------------------
# Hashing helpers — keep alerts grouped without retaining raw PII.
# ---------------------------------------------------------------------------

def _hash(v: str) -> str:
    return hashlib.sha256((v or "").encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Public API — call from sec-event helpers / hot code paths in server.py
# ---------------------------------------------------------------------------

async def record_login_failure(db, *, ip: Optional[str], email: Optional[str]) -> None:
    now = datetime.now(timezone.utc)
    if ip:
        await db.security_event_counters.insert_one({
            "event": "AUTH_LOGIN_FAILURE", "subject": f"ip:{ip}", "ts": now,
        })
        await _check_rule(db, "LOGIN_FAILURE_PER_IP", subject_value=ip, now=now)
    if email:
        eh = _hash(email.lower())
        await db.security_event_counters.insert_one({
            "event": "AUTH_LOGIN_FAILURE", "subject": f"email:{eh}", "ts": now,
        })
        await _check_rule(db, "LOGIN_FAILURE_PER_EMAIL_HASH", subject_value=eh, now=now)


async def record_participant_access(db, *, user_id: str, participant_id: str) -> None:
    now = datetime.now(timezone.utc)
    await db.security_event_counters.insert_one({
        "event": "PARTICIPANT_ACCESS",
        "subject": f"user:{user_id}",
        "participant_id": participant_id,
        "ts": now,
    })
    # Threshold is over DISTINCT participant_ids in the window — special case.
    rule = RULE_THRESHOLDS["PARTICIPANT_SCRAPE"]
    since = now - timedelta(seconds=rule["window_s"])
    distinct = await db.security_event_counters.distinct(
        "participant_id",
        {"event": "PARTICIPANT_ACCESS", "subject": f"user:{user_id}", "ts": {"$gte": since}},
    )
    count = len([p for p in distinct if p])
    if count > rule["limit"]:
        await _fire_alert(
            db, rule_key="PARTICIPANT_SCRAPE", subject_value=user_id,
            count=count, now=now, since=since,
        )


async def record_admin_action(db, *, admin_id: str, action_type: str) -> None:
    now = datetime.now(timezone.utc)
    await db.security_event_counters.insert_one({
        "event": "ADMIN_ACTION", "subject": f"admin:{admin_id}",
        "action_type": action_type, "ts": now,
    })
    await _check_rule(db, "ADMIN_ACTION_SPIKE", subject_value=admin_id, now=now)


async def record_malware_upload(db, *, user_id: str, filename: str, scan_result: str) -> None:
    """One-shot CRITICAL alert — no windowing, fires every infected upload."""
    now = datetime.now(timezone.utc)
    await db.security_event_counters.insert_one({
        "event": "FILE_UPLOAD", "subject": f"user:{user_id}",
        "scan_result": scan_result, "filename": filename[:120], "ts": now,
    })
    if (scan_result or "").lower().startswith("infected"):
        await _fire_alert(
            db, rule_key="MALWARE_UPLOAD", subject_value=user_id,
            count=1, now=now, since=now,
            extra={"filename": filename[:120], "scan_result": scan_result},
        )


async def check_decoder_cost(db, *, user_id: str) -> None:
    """Sum cost_aud_est for this user over the last hour. Fire HIGH alert if
    above the runaway threshold. Called after every DECODER_RUN so the rule
    catches both single-shot expensive runs and a sustained burn."""
    if not user_id:
        return
    rule = RULE_THRESHOLDS["DECODER_COST_RUNAWAY"]
    now = datetime.now(timezone.utc)
    since = now - timedelta(seconds=rule["window_s"])
    pipeline = [
        {"$match": {
            "user_id": user_id,
            "ts": {"$gte": since.isoformat()},
        }},
        {"$group": {"_id": None, "total_aud": {"$sum": "$cost_aud_est"}}},
    ]
    try:
        agg = await db.llm_calls.aggregate(pipeline).to_list(length=1)
    except Exception:
        return
    total = float((agg[0].get("total_aud") if agg else 0) or 0)
    if total > rule["limit_aud"]:
        await _fire_alert(
            db, rule_key="DECODER_COST_RUNAWAY", subject_value=user_id,
            count=int(total * 100),  # cents — for sort-stable display
            now=now, since=since,
            extra={"total_aud": round(total, 4)},
        )


# ---------------------------------------------------------------------------
# Internal — generic windowed-threshold check + alert emit
# ---------------------------------------------------------------------------

async def _check_rule(db, rule_key: str, *, subject_value: str, now: datetime) -> None:
    rule = RULE_THRESHOLDS[rule_key]
    since = now - timedelta(seconds=rule["window_s"])
    # Match the matching subject prefix this rule cares about
    if rule_key == "LOGIN_FAILURE_PER_IP":
        subject_filter = f"ip:{subject_value}"
    elif rule_key == "LOGIN_FAILURE_PER_EMAIL_HASH":
        subject_filter = f"email:{subject_value}"
    elif rule_key == "ADMIN_ACTION_SPIKE":
        subject_filter = f"admin:{subject_value}"
    else:
        return
    count = await db.security_event_counters.count_documents({
        "event": rule["event"], "subject": subject_filter, "ts": {"$gte": since},
    })
    if count > rule["limit"]:
        await _fire_alert(
            db, rule_key=rule_key, subject_value=subject_value,
            count=count, now=now, since=since,
        )


async def _fire_alert(
    db, *, rule_key: str, subject_value: str, count: int,
    now: datetime, since: datetime, extra: Optional[Dict[str, Any]] = None,
) -> None:
    rule = RULE_THRESHOLDS[rule_key]
    # Cooldown: don't re-fire the same (rule, subject) within ALERT_COOLDOWN_S.
    cooldown_since = now - timedelta(seconds=ALERT_COOLDOWN_S)
    existing = await db.security_alerts.find_one({
        "rule": rule_key,
        "subject": subject_value,
        "resolved": {"$ne": True},
        "last_seen": {"$gte": cooldown_since},
    })
    if existing:
        # Update last_seen / count for the existing open alert.
        await db.security_alerts.update_one(
            {"_id": existing["_id"]},
            {"$set": {"last_seen": now, "count": count}},
        )
        return

    doc = {
        "rule": rule_key,
        "severity": rule["severity"],
        "description": rule["description"],
        "subject": subject_value,
        "count": count,
        "window_seconds": rule["window_s"],
        "first_seen": since,
        "last_seen": now,
        "created_at": now,
        "resolved": False,
        "resolved_by": None,
        "resolved_at": None,
        "resolution_note": None,
    }
    if extra:
        doc.update(extra)
    res = await db.security_alerts.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    logger.warning(
        "ALERT_FIRED",
        extra={
            "event_type": "ALERT_FIRED",
            "rule": rule_key,
            "severity": rule["severity"],
            "subject": subject_value,
            "count": count,
            "window_seconds": rule["window_s"],
        },
    )

    # Best-effort email notification
    try:
        await _notify_admins(rule_key, subject_value, count, rule)
    except Exception as e:
        logger.warning("alerter email send failed: %s", e)


async def _notify_admins(rule_key: str, subject: str, count: int, rule: dict) -> None:
    try:
        import email_service
        to_addr = os.environ.get("SECURITY_ALERT_EMAIL", "hello@wayly.com.au")
        subject_line = f"[Wayly {rule['severity']}] {rule_key} — {count} events"
        body_html = (
            f"<p><b>Rule:</b> {rule_key} ({rule['severity']})</p>"
            f"<p><b>Description:</b> {rule['description']}</p>"
            f"<p><b>Subject:</b> <code>{subject}</code></p>"
            f"<p><b>Count:</b> {count} in {rule['window_s']}s window</p>"
            f"<p>Open /admin/security-alerts to review.</p>"
        )
        await email_service.email_tool_result(
            to=to_addr,
            tool_name="Security alert",
            headline=subject_line,
            body_html=body_html,
        )
    except Exception as e:
        logger.warning("alerter email send wrapper failed: %s", e)


# ---------------------------------------------------------------------------
# Background cleanup — drop counter rows older than the longest window.
# Called from the existing scheduler in server.py (no new task needed).
# ---------------------------------------------------------------------------

_MAX_WINDOW_S = max(r["window_s"] for r in RULE_THRESHOLDS.values())


async def prune_counters(db) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_MAX_WINDOW_S * 2)
    res = await db.security_event_counters.delete_many({"ts": {"$lt": cutoff}})
    return res.deleted_count


# ---------------------------------------------------------------------------
# Read-side helpers (admin UI)
# ---------------------------------------------------------------------------

async def list_alerts(db, *, limit: int = 50, only_open: bool = False) -> list:
    q: Dict[str, Any] = {}
    if only_open:
        q["resolved"] = False
    cursor = db.security_alerts.find(q, {"_id": 1, "rule": 1, "severity": 1,
                                          "description": 1, "subject": 1, "count": 1,
                                          "window_seconds": 1, "first_seen": 1,
                                          "last_seen": 1, "created_at": 1,
                                          "resolved": 1, "resolved_by": 1,
                                          "resolved_at": 1, "resolution_note": 1,
                                          "filename": 1, "scan_result": 1})
    cursor = cursor.sort([("created_at", -1)]).limit(limit)
    out = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        for k in ("first_seen", "last_seen", "created_at", "resolved_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        out.append(d)
    return out


async def resolve_alert(db, *, alert_id: str, admin_id: str, note: str = "") -> bool:
    from bson import ObjectId
    try:
        oid = ObjectId(alert_id)
    except Exception:
        return False
    r = await db.security_alerts.update_one(
        {"_id": oid},
        {"$set": {
            "resolved": True,
            "resolved_by": admin_id,
            "resolved_at": datetime.now(timezone.utc),
            "resolution_note": note[:500],
        }},
    )
    return r.modified_count > 0


async def alert_stats(db) -> dict:
    """For the dashboard overview tile."""
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    open_count = await db.security_alerts.count_documents({"resolved": False})
    last_24h = await db.security_alerts.count_documents({"created_at": {"$gte": since_24h}})
    critical_open = await db.security_alerts.count_documents({"resolved": False, "severity": "CRITICAL"})
    return {"open": open_count, "last_24h": last_24h, "critical_open": critical_open}
