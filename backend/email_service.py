"""Email service, Resend integration with graceful no-op fallback.

If RESEND_API_KEY is missing or starts with 're_demo_' / 're_test_', emails
are logged to stdout instead of sent. This lets the rest of the app behave
identically in dev and production.
"""
import os
import asyncio
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Lazy import, avoid crashing the app if the resend package isn't installed yet
try:
    import resend  # type: ignore
except Exception:  # pragma: no cover
    resend = None  # type: ignore


def _is_live() -> bool:
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        return False
    if key.startswith("re_demo_") or key.startswith("re_test_") or key in ("changeme", "your_key_here"):
        return False
    if resend is None:
        return False
    return True


def _sender() -> str:
    """Resolve the From address used on every outbound email.

    Precedence: ``RESEND_FROM_EMAIL`` → ``SENDER_EMAIL`` → safe Resend default.
    Both env vars are accepted so older deployments keep working; new ones
    should standardise on ``RESEND_FROM_EMAIL``.
    """
    return (
        os.environ.get("RESEND_FROM_EMAIL")
        or os.environ.get("SENDER_EMAIL")
        or "Wayly <onboarding@resend.dev>"
    )


async def send_email(*, to: str, subject: str, html: str,
                     reply_to: Optional[str] = None) -> Dict[str, Any]:
    """Public, low-level send helper used by ad-hoc callers (admin hardening,
    cron alerts, anywhere outside the templated helpers below). Reads the
    From address from ``_sender()`` so the env var is always honoured."""
    params: Dict[str, Any] = {
        "from": _sender(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to
    return await _send(params)


def _team_inbox() -> str:
    return os.environ.get("TEAM_INBOX", "support@wayly.com.au")


async def _send(params: Dict[str, Any]) -> Dict[str, Any]:
    """Send via Resend in a thread (resend SDK is sync). Always returns a dict.
    Never raises , on failure we log and return {ok: False, reason: ...}.
    """
    if not _is_live():
        logger.info("[email-mock] would send: to=%s subject=%s", params.get("to"), params.get("subject"))
        return {"ok": True, "mocked": True}
    try:
        # Bind the API key on each send (cheap; thread-safe)
        resend.api_key = os.environ["RESEND_API_KEY"]  # type: ignore[attr-defined]
        result = await asyncio.to_thread(resend.Emails.send, params)  # type: ignore[attr-defined]
        return {"ok": True, "id": result.get("id") if isinstance(result, dict) else None}
    except Exception as e:
        logger.warning("Resend send failed: %s", e)
        return {"ok": False, "reason": str(e)}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------
# Friendly labels + presentation for the contact-form details table.
_CONTACT_FIELD_LABELS = {
    "phone": "Phone",
    "context": "Message",
    "size": "Size / scale",
    "biggest_pain": "Biggest pain right now",
    "success_in_six_months": "Success in 6 months",
    "preferred_time": "Preferred call time",
}
# Fields shown elsewhere (summary strip) or internal-only, never repeated in rows.
_CONTACT_SKIP_FIELDS = {
    "name", "first_name", "last_name", "email", "role", "intent",
    "ts", "created_at", "status", "id", "actioned_at", "_id",
}
_CONTACT_ROLE_LABELS = {
    "family": "Family Caregiver", "participant": "Participant",
    "advisor": "Financial Advisor", "provider": "Aged-Care Provider",
    "gp": "GP / Clinician", "press": "Press / Media", "other": "Other",
}
_CONTACT_TIME_LABELS = {
    "morning": "Morning (9-12 AEST)", "lunch": "Lunchtime (12-2 AEST)",
    "afternoon": "Afternoon (2-5 AEST)", "evening": "Evening (5-8 AEST)",
}


def _prettify_contact_value(key: str, value: Any) -> str:
    if key == "preferred_time":
        return _CONTACT_TIME_LABELS.get(str(value), str(value))
    return str(value)


async def notify_team_contact(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Notify the Wayly team inbox when someone submits /api/contact.

    Premium, branded layout via the shared email shell. The details table is
    de-duplicated (role + intent appear once in the summary strip, never again
    as a row), fixing the old double-"role" rendering."""
    from urllib.parse import quote
    from wayly_email_branding import wrap_email_html, button_html, COLORS, BODY_FONT, HEADING_FONT

    intent_raw = payload.get("intent") or "general"
    intent = intent_raw.replace("_", " ").title()
    name = payload.get("name") or "Someone"
    first = (payload.get("first_name") or name.split(" ")[0] or "there").strip()
    email = (payload.get("email") or "").strip()
    role = _CONTACT_ROLE_LABELS.get(payload.get("role"), (payload.get("role") or "").replace("_", " ").title() or "Not given")

    rows = []
    for k, v in payload.items():
        if k in _CONTACT_SKIP_FIELDS or v in (None, ""):
            continue
        label = _CONTACT_FIELD_LABELS.get(k, k.replace("_", " ").title())
        rows.append(
            f'<tr>'
            f'<td style="padding:12px 16px;color:{COLORS["muted"]};font-size:11px;letter-spacing:.08em;'
            f'text-transform:uppercase;vertical-align:top;white-space:nowrap;border-top:1px solid {COLORS["border"]};'
            f'font-family:{BODY_FONT};">{_html_escape(label)}</td>'
            f'<td style="padding:12px 16px;color:{COLORS["text"]};font-size:15px;line-height:1.55;'
            f'border-top:1px solid {COLORS["border"]};font-family:{BODY_FONT};">{_html_escape(_prettify_contact_value(k, v))}</td>'
            f'</tr>'
        )
    rows_html = "".join(rows) or (
        f'<tr><td colspan="2" style="padding:14px 16px;color:{COLORS["muted"]};font-size:14px;'
        f'font-family:{BODY_FONT};">No extra details were provided.</td></tr>'
    )

    reply_button = ""
    if email:
        reply_href = f"mailto:{email}?subject={quote(f'Re: your {intent_raw} enquiry to Wayly')}"
        reply_button = button_html(href=reply_href, label=f"Reply to {first}", colour="teal")

    inner = f"""
      <div style="font-family:{HEADING_FONT};font-size:22px;font-weight:700;color:{COLORS["teal"]};letter-spacing:-.01em;line-height:1.25;">
        {_html_escape(name)}
      </div>
      <div style="margin-top:6px;font-size:14px;font-family:{BODY_FONT};">
        <a href="mailto:{_html_escape(email)}" style="color:{COLORS["clay"]};text-decoration:none;font-weight:600;">{_html_escape(email)}</a>
      </div>
      <div style="margin-top:14px;">
        <span style="display:inline-block;background:{COLORS["teal_light"]};color:{COLORS["teal"]};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;font-family:{BODY_FONT};margin-right:6px;">{_html_escape(intent)} enquiry</span>
        <span style="display:inline-block;background:{COLORS["warm_surface"]};color:{COLORS["muted"]};font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;font-family:{BODY_FONT};">{_html_escape(role)}</span>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
             style="margin-top:20px;border-collapse:collapse;background:{COLORS["white"]};border:1px solid {COLORS["border"]};border-radius:10px;overflow:hidden;">
        {rows_html}
      </table>
      {reply_button}
    """

    html = wrap_email_html(
        title=f"New {intent} enquiry from {name}",
        eyebrow="New enquiry",
        inner_html=inner,
        footer_note="Sent automatically when someone submits the contact form at wayly.com.au.",
    )

    params: Dict[str, Any] = {
        "from": _sender(),
        "to": [_team_inbox()],
        "subject": f"[Wayly · {intent}] {name} ({role})",
        "html": html,
    }
    if email:
        params["reply_to"] = email
    return await _send(params)


async def email_contact_autoreply(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send a warm confirmation to the person who submitted the contact form,
    so they know a real person will follow up. Best-effort; no-op if we have
    no recipient address."""
    from wayly_email_branding import wrap_email_html, note_callout_html, COLORS, BODY_FONT, HEADING_FONT

    to = (payload.get("email") or "").strip()
    if not to:
        return {"ok": False, "reason": "no recipient"}

    first = (payload.get("first_name") or (payload.get("name") or "").split(" ")[0] or "there").strip()
    is_demo = (payload.get("intent") or "general") == "demo"
    their_message = payload.get("context") or payload.get("biggest_pain") or ""

    recap = ""
    if their_message:
        recap = note_callout_html(
            text=f'<strong style="color:{COLORS["teal"]};display:block;margin-bottom:4px;">What you sent us</strong>{_html_escape(their_message)}',
            tone="teal",
        )

    intro = "Thanks for booking a demo with Wayly." if is_demo else "Thanks for reaching out to Wayly."
    action_line = (
        "We'll be in touch within one business day to confirm a time that suits you."
        if is_demo else
        "We'll be in touch within one business day with a written reply."
    )

    inner = f"""
      <h2 style="margin:0 0 12px;font-family:{HEADING_FONT};color:{COLORS["teal"]};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.01em;">
        Hi {_html_escape(first)},
      </h2>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{COLORS["text"]};">{intro}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{COLORS["text"]};">{action_line}</p>
      {recap}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.65;color:{COLORS["muted"]};">
        If anything is urgent, just reply to this email and it will reach a real person on the Wayly team.
      </p>
      <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:{COLORS["text"]};">Warmly,<br>The Wayly team</p>
    """

    html = wrap_email_html(
        title="We've got your message",
        eyebrow="Demo request received" if is_demo else "Message received",
        inner_html=inner,
        footer_note="You received this because you contacted Wayly at wayly.com.au. Crisis support: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374.",
    )

    return await _send({
        "from": _sender(),
        "to": [to],
        "reply_to": _team_inbox(),
        "subject": "Your Wayly demo request, we'll be in touch soon" if is_demo else "We've got your message, we'll be in touch soon",
        "html": html,
    })


async def email_tool_result(
    *,
    to: str,
    tool_name: str,
    headline: str,
    body_html: str,
) -> Dict[str, Any]:
    """Send a public-tool result to the user who requested it."""
    from wayly_email_branding import wrap_email_html, COLORS, BODY_FONT, HEADING_FONT
    inner = f"""
      <h2 style="margin:0 0 14px 0;font-family:{HEADING_FONT};color:{COLORS["teal"]};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.01em;">
        {_html_escape(headline)}
      </h2>
      <div style="font-family:{BODY_FONT};font-size:15px;line-height:1.65;color:{COLORS["text"]};">
        {body_html}
      </div>
      <hr style="border:0;border-top:1px solid {COLORS["border"]};margin:24px 0" />
      <p style="margin:0;font-size:13px;color:{COLORS["muted"]};line-height:1.6;">
        Want Wayly to do this every month, automatically?
        <a href="https://wayly.com.au/signup" style="color:{COLORS["clay"]};font-weight:600;text-decoration:none;">Start a free 7-day trial</a>, no card needed.
      </p>
    """
    html = wrap_email_html(
        title=f"Your Wayly {tool_name} result",
        eyebrow=tool_name,
        inner_html=inner,
        footer_note="You received this because you requested it from a public tool on wayly.com.au. We didn't add you to any list. Crisis support: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374.",
    )
    return await _send({
        "from": _sender(),
        "to": [to],
        "subject": f"Your Wayly {tool_name} result",
        "html": html,
    })


async def email_adviser_invite(
    *,
    to: str,
    client_name: str,
    adviser_name: str,
    invite_url: str,
    adviser_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a branded invitation email from an Adviser to their prospective client.
    Click-through lands on /signup?plan=family&invite=<token> so auto-link kicks
    in the moment they finish onboarding."""
    from wayly_email_branding import wrap_email_html, button_html, note_callout_html, COLORS, BODY_FONT, HEADING_FONT
    notes_block = note_callout_html(
        text=f'<strong style="display:block;margin-bottom:4px;color:{COLORS["teal"]};">Note from {_html_escape(adviser_name)}:</strong>{_html_escape(adviser_notes)}',
        tone="teal",
    ) if adviser_notes else ""
    inner = f"""
      <h2 style="margin:0 0 12px;font-family:{HEADING_FONT};color:{COLORS["teal"]};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.01em;">
        Hi {_html_escape(client_name.split(' ')[0])},
      </h2>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{COLORS["text"]};">
        <strong>{_html_escape(adviser_name)}</strong> has invited you to set up a Wayly account so they can help you stay on top of your <strong>Support at Home</strong> statements, budget, and care.
      </p>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.65;color:{COLORS["muted"]};">
        Wayly is the AI operating system for Australian families navigating Support at Home. We decode confusing aged-care statements, flag overcharges, and track your lifetime budget, so you and your adviser never have to chase paperwork again.
      </p>
      {notes_block}
      {button_html(href=invite_url, label="Accept invitation & start free trial", colour="clay")}
      <ul style="margin:8px 0 0;padding-left:20px;color:{COLORS["muted"]};font-size:13px;line-height:1.9;">
        <li>7-day free trial · no card required</li>
        <li>Your data is yours, share back to your adviser any time, revoke any time</li>
        <li>Australian-hosted, encrypted, never sold</li>
      </ul>
      <hr style="border:0;border-top:1px solid {COLORS["border"]};margin:24px 0" />
      <p style="margin:0;font-size:12px;color:{COLORS["muted"]};line-height:1.6;">
        If the button doesn't work, copy this link:
        <a href="{_html_escape(invite_url)}" style="color:{COLORS["clay"]};word-break:break-all;">{_html_escape(invite_url)}</a>
      </p>
    """
    html = wrap_email_html(
        title=f"{adviser_name} invited you to Wayly",
        eyebrow="An invitation from your financial adviser",
        inner_html=inner,
        footer_note=(
            f"You received this because {adviser_name} entered your email on their Wayly Adviser dashboard. "
            "If this wasn't expected, you can ignore this message, no account has been created for you. "
            "Crisis support: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374."
        ),
    )
    return await _send({
        "from": _sender(),
        "to": [to],
        "reply_to": _team_inbox(),
        "subject": f"{adviser_name} invited you to Wayly",
        "html": html,
    })



def _html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
