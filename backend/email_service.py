"""Email service — Resend integration with graceful no-op fallback.

If RESEND_API_KEY is missing or starts with 're_demo_' / 're_test_', emails
are logged to stdout instead of sent. This lets the rest of the app behave
identically in dev and production.
"""
import os
import asyncio
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Lazy import — avoid crashing the app if the resend package isn't installed yet
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
    return os.environ.get("SENDER_EMAIL", "Kindred <onboarding@resend.dev>")


def _team_inbox() -> str:
    return os.environ.get("TEAM_INBOX", "hello@kindred.au")


async def _send(params: Dict[str, Any]) -> Dict[str, Any]:
    """Send via Resend in a thread (resend SDK is sync). Always returns a dict.
    Never raises — on failure we log and return {ok: False, reason: ...}.
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
async def notify_team_contact(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Notify the Kindred team inbox when someone submits /api/contact."""
    intent = (payload.get("intent") or "general").upper()
    name = payload.get("name", "(no name)")
    email = payload.get("email", "(no email)")
    role = payload.get("role", "(no role)")
    rows = []
    for k, v in payload.items():
        if k in {"name", "email"}:
            continue
        if v in (None, ""):
            continue
        rows.append(f"<tr><td style='padding:6px 12px;color:#555;text-transform:uppercase;font-size:11px;letter-spacing:.05em'>{k}</td><td style='padding:6px 12px;color:#1F3A5F'>{_html_escape(str(v))}</td></tr>")
    rows_html = "".join(rows)

    html = f"""<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;background:#FAF7F2;padding:24px;color:#1F3A5F">
  <h2 style="margin:0 0 8px;font-family:Georgia,serif">New {intent} enquiry — {_html_escape(name)}</h2>
  <p style="margin:0 0 16px;color:#555">Reply to <a href="mailto:{_html_escape(email)}">{_html_escape(email)}</a></p>
  <table style="border-collapse:collapse;background:#fff;border:1px solid #e5dfd2;border-radius:8px;overflow:hidden">
    <tr><td style="padding:6px 12px;color:#555;text-transform:uppercase;font-size:11px;letter-spacing:.05em">role</td><td style="padding:6px 12px;color:#1F3A5F">{_html_escape(role)}</td></tr>
    {rows_html}
  </table>
  <p style="margin-top:24px;color:#888;font-size:12px">Sent automatically from Kindred · /api/contact</p>
</body></html>"""

    return await _send({
        "from": _sender(),
        "to": [_team_inbox()],
        "reply_to": email,
        "subject": f"[Kindred · {intent}] {name} ({role})",
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
    html = f"""<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;background:#FAF7F2;padding:24px;color:#1F3A5F">
  <table align="center" style="width:600px;max-width:100%;background:#fff;border-radius:12px;border:1px solid #e5dfd2;overflow:hidden">
    <tr><td style="padding:20px 28px;background:#1F3A5F;color:#fff">
      <div style="font-family:Georgia,serif;font-size:22px">Kindred</div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin-top:4px">{_html_escape(tool_name)}</div>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#1F3A5F">{_html_escape(headline)}</h2>
      <div style="font-size:14px;line-height:1.6;color:#1F3A5F">{body_html}</div>
      <hr style="border:0;border-top:1px solid #e5dfd2;margin:24px 0" />
      <p style="margin:0;font-size:13px;color:#555">Want Kindred to do this every month, automatically? <a href="https://kindred.au/signup" style="color:#1F3A5F;font-weight:600">Start a free 7-day trial</a> — no card needed.</p>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#F0EBE0;color:#888;font-size:11px">
      You received this because you requested it from a public tool on kindred.au. We didn't add you to any list.
      Crisis support: Lifeline 13 11 14 · 1800ELDERHelp 1800 353 374.
    </td></tr>
  </table>
</body></html>"""

    return await _send({
        "from": _sender(),
        "to": [to],
        "subject": f"Your Kindred {tool_name} result",
        "html": html,
    })


def _html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
