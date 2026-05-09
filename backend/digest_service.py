"""Family Digest — builds and sends the weekly "what Cathy paid attention to"
summary to every member of a Family-plan household. Emotional hook first
(wellbeing), then the practical (anomalies + spend + chat).
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import email_service

logger = logging.getLogger(__name__)


def _html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


MOOD_LABEL = {"good": "Good days", "okay": "OK days", "not_great": "Harder days"}
MOOD_COLOUR = {"good": "#7A9B7E", "okay": "#D4A24E", "not_great": "#C5734D"}


async def build_digest(db, household: Dict[str, Any], since_days: int = 7) -> Dict[str, Any]:
    """Aggregate a week's worth of Wayly activity into a JSON digest."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    cutoff_iso = cutoff.isoformat()
    hid = household["id"]

    # Wellbeing — lead with the emotional hook
    wellbeing_cur = db.wellbeing.find(
        {"household_id": hid, "created_at": {"$gte": cutoff_iso}},
        {"_id": 0},
    )
    wellbeing = await wellbeing_cur.to_list(100)
    mood_counts = {"good": 0, "okay": 0, "not_great": 0}
    for w in wellbeing:
        m = w.get("mood")
        if m in mood_counts:
            mood_counts[m] += 1
    last_not_great = None
    for w in sorted(wellbeing, key=lambda x: x.get("created_at", ""), reverse=True):
        if w.get("mood") == "not_great":
            last_not_great = w
            break

    # Anomalies — pull from statements uploaded this week
    stmts_cur = db.statements.find({"household_id": hid, "uploaded_at": {"$gte": cutoff_iso}}, {"_id": 0})
    statements = await stmts_cur.to_list(50)
    top_anomalies: List[Dict[str, Any]] = []
    total_new_spend = 0.0
    for s in statements:
        for a in s.get("anomalies", []) or []:
            top_anomalies.append({
                "severity": a.get("severity", "info"),
                "title": a.get("title", ""),
                "detail": a.get("detail", ""),
                "period": s.get("period_label") or s.get("filename"),
            })
        for li in s.get("line_items", []) or []:
            total_new_spend += float(li.get("total") or 0)
    top_anomalies = sorted(
        top_anomalies,
        key=lambda a: {"alert": 0, "warning": 1, "info": 2}.get(a.get("severity", "info"), 3),
    )[:3]

    # Family thread — last 3 posts
    thread_cur = db.family_messages.find(
        {"household_id": hid, "created_at": {"$gte": cutoff_iso}},
        {"_id": 0},
    ).sort("created_at", -1).limit(3)
    thread = await thread_cur.to_list(3)

    # Caregiver chat — questions asked (user turns)
    chat_count = await db.chat_turns.count_documents(
        {"household_id": hid, "role": "user", "created_at": {"$gte": cutoff_iso}}
    )

    # Caregiver identity — who did all this
    owner = await db.users.find_one({"id": household["owner_id"]}, {"_id": 0})
    caregiver_name = (owner or {}).get("name", "Your caregiver")
    first_name = caregiver_name.split(" ")[0] if caregiver_name else "Your caregiver"
    week_label = f"{(datetime.now(timezone.utc) - timedelta(days=since_days)).strftime('%d %b')} – {datetime.now(timezone.utc).strftime('%d %b')}"

    return {
        "household_id": hid,
        "household_name": household.get("participant_name"),
        "caregiver_name": caregiver_name,
        "caregiver_first_name": first_name,
        "week_label": week_label,
        "since_days": since_days,
        "wellbeing": {
            "counts": mood_counts,
            "total": sum(mood_counts.values()),
            "last_not_great_note": (last_not_great or {}).get("created_at"),
        },
        "anomalies": {
            "count": len([a for s in statements for a in s.get("anomalies", []) or []]),
            "top": top_anomalies,
            "statements_uploaded": len(statements),
            "new_spend": round(total_new_spend, 2),
        },
        "family_thread_recent": [
            {"author": m.get("author_name"), "body": m.get("body", "")[:220], "created_at": m.get("created_at")}
            for m in thread
        ],
        "chat_questions_asked": chat_count,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def render_digest_html(digest: Dict[str, Any]) -> str:
    """Render the digest as brand-styled HTML email body."""
    d = digest
    first_name = _html_escape(d.get("caregiver_first_name") or "Your caregiver")
    participant = _html_escape(d.get("household_name") or "")
    week = _html_escape(d.get("week_label") or "this week")

    # --- Wellbeing block ---
    wb = d.get("wellbeing", {})
    mood_pills = ""
    total = wb.get("total", 0)
    if total == 0:
        wellbeing_body = f"<p style='margin:0;color:#5C6878'>{participant} didn't log a mood this week — that's fine. If you want to nudge them, the Participant view has big friendly buttons.</p>"
    else:
        for m in ["good", "okay", "not_great"]:
            count = wb.get("counts", {}).get(m, 0)
            if count == 0:
                continue
            mood_pills += (
                f"<span style='display:inline-block;margin-right:8px;padding:5px 12px;border-radius:999px;"
                f"background:{MOOD_COLOUR[m]};color:#fff;font-size:12px;font-weight:600'>"
                f"{count} × {MOOD_LABEL[m]}</span>"
            )
        wellbeing_body = (
            f"<div>{mood_pills}</div>"
            f"<p style='margin:12px 0 0;color:#1F3A5F;font-size:14px;line-height:1.55'>"
            f"That's <strong>{total}</strong> check-in{'s' if total != 1 else ''} from {participant} this week."
            + (" <strong style='color:#C5734D'>One hard day</strong> was flagged — {first_name} has been notified." if wb.get("counts", {}).get("not_great", 0) > 0 else "")
            + "</p>"
        ).replace("{first_name}", first_name)

    # --- Anomalies block ---
    an = d.get("anomalies", {})
    if an.get("count", 0) == 0 and an.get("statements_uploaded", 0) == 0:
        anomalies_body = "<p style='margin:0;color:#5C6878'>No new statements this week — nothing to review.</p>"
    else:
        spend_line = (
            f"<p style='margin:0 0 12px;color:#1F3A5F'><strong>${an.get('new_spend', 0):,.2f}</strong> "
            f"across {an.get('statements_uploaded', 0)} new statement"
            f"{'s' if an.get('statements_uploaded', 0) != 1 else ''}.</p>"
        )
        if an.get("count", 0) == 0:
            anomalies_body = spend_line + "<p style='margin:0;color:#7A9B7E;font-size:14px'>✓ Nothing unusual to flag.</p>"
        else:
            items = ""
            for a in an.get("top", []):
                sev = a.get("severity", "info")
                badge_bg = "#C5734D" if sev == "alert" else "#D4A24E" if sev == "warning" else "#7A9B7E"
                items += (
                    f"<li style='margin:0 0 10px;padding:12px 14px;background:#F2EEE5;border-left:3px solid {badge_bg};border-radius:4px;list-style:none'>"
                    f"<div style='font-size:13px;color:#1F3A5F;font-weight:600'>{_html_escape(a.get('title', ''))}</div>"
                    f"<div style='font-size:13px;color:#5C6878;margin-top:4px'>{_html_escape(a.get('detail', ''))}</div>"
                    f"</li>"
                )
            anomalies_body = spend_line + f"<p style='margin:0 0 8px;color:#1F3A5F;font-size:14px'>{first_name} flagged <strong>{an.get('count', 0)}</strong> thing{'s' if an.get('count', 0) != 1 else ''} worth a look:</p><ul style='margin:0;padding:0'>{items}</ul>"

    # --- Family thread block ---
    thread = d.get("family_thread_recent", [])
    if not thread:
        thread_body = ""
    else:
        posts = ""
        for m in thread:
            posts += (
                f"<div style='padding:12px 14px;background:#F2EEE5;border-radius:8px;margin-bottom:8px'>"
                f"<div style='font-size:11px;color:#5C6878;letter-spacing:.06em;text-transform:uppercase'>{_html_escape(m.get('author', ''))}</div>"
                f"<div style='margin-top:4px;font-size:14px;color:#1F3A5F'>{_html_escape(m.get('body', ''))}</div>"
                f"</div>"
            )
        thread_body = (
            f"<h3 style='margin:28px 0 10px;font-family:Georgia,serif;color:#1F3A5F;font-size:18px'>Family thread</h3>"
            f"{posts}"
        )

    # --- Chat count nudge ---
    chat_q = d.get("chat_questions_asked", 0)
    chat_block = ""
    if chat_q > 0:
        chat_block = (
            f"<p style='margin:20px 0 0;color:#5C6878;font-size:13px;font-style:italic'>"
            f"{first_name} asked Wayly <strong>{chat_q}</strong> question{'s' if chat_q != 1 else ''} this week. "
            f"You can see the full history in the app.</p>"
        )

    return f"""<!doctype html>
<html><body style="margin:0;background:#FAF7F2;font-family:Helvetica,Arial,sans-serif;color:#1F3A5F">
  <table align="center" style="width:600px;max-width:100%;background:#fff;border-radius:12px;border:1px solid #e5dfd2;overflow:hidden;margin:24px auto">
    <tr><td style="padding:24px 28px;background:#1F3A5F;color:#fff">
      <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:-.01em">Wayly — the week at {participant}'s</div>
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin-top:6px">{week}</div>
    </td></tr>

    <tr><td style="padding:28px 28px 8px">
      <h2 style="margin:0 0 6px;font-family:Georgia,serif;color:#1F3A5F;font-size:22px">How {participant} has been</h2>
      <p style="margin:0 0 18px;color:#5C6878;font-size:13px">The emotional weather first.</p>
      {wellbeing_body}
    </td></tr>

    <tr><td style="padding:24px 28px 8px">
      <h2 style="margin:0 0 6px;font-family:Georgia,serif;color:#1F3A5F;font-size:22px">Money & alerts</h2>
      <p style="margin:0 0 18px;color:#5C6878;font-size:13px">What {first_name} paid attention to.</p>
      {anomalies_body}
      {thread_body}
      {chat_block}
    </td></tr>

    <tr><td style="padding:16px 28px 28px">
      <a href="https://wayly.com.au/app" style="display:inline-block;background:#D4A24E;color:#1F3A5F;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Open Wayly</a>
    </td></tr>

    <tr><td style="padding:16px 28px;background:#F0EBE0;color:#888;font-size:11px;line-height:1.5">
      You're getting this digest because you're on {participant}'s Family plan. <a href="https://wayly.com.au/settings/notifications" style="color:#1F3A5F">Change what you get</a> · <a href="https://wayly.com.au/trust" style="color:#1F3A5F">Privacy</a> · Crisis: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374.
    </td></tr>
  </table>
</body></html>"""


async def send_digest_to_members(db, household: Dict[str, Any], recipients: List[str], digest: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Deliver the digest to all supplied emails. Records the send in `digest_sends`."""
    if digest is None:
        digest = await build_digest(db, household)
    html = render_digest_html(digest)
    sent: List[Dict[str, Any]] = []
    for to in recipients:
        try:
            res = await email_service._send({
                "from": email_service._sender(),
                "to": [to],
                "subject": f"Wayly — {digest.get('household_name')}'s week ({digest.get('week_label')})",
                "html": html,
            })
            sent.append({"to": to, **res})
        except Exception as e:
            logger.warning("Digest send failed for %s: %s", to, e)
            sent.append({"to": to, "ok": False, "reason": str(e)})
    await db.digest_sends.insert_one({
        "household_id": household["id"],
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "recipients": recipients,
        "summary": {
            "wellbeing_total": digest.get("wellbeing", {}).get("total", 0),
            "anomaly_count": digest.get("anomalies", {}).get("count", 0),
            "statements": digest.get("anomalies", {}).get("statements_uploaded", 0),
        },
        "results": sent,
    })
    return {"ok": True, "recipients": recipients, "results": sent}
