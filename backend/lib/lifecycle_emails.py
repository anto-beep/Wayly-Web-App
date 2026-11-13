"""Behaviour-based lifecycle marketing emails (Phase 2).

ONE optional guidance email during the real 7-day Stripe trial, and ONE optional
post-trial win-back — both strictly gated. The authoritative trial state is the
`subscriptions` read-model (status='trialing' + trial_ends_at + had_trial), which
is synced from Stripe. We NEVER touch registration / checkout / onboarding /
trial / billing behaviour; we only read the confirmed state.

Safety posture:
  * LIFECYCLE_EMAILS_MODE = off (default) | test_only | live
      - off       → nothing runs
      - test_only → only synthetic test accounts (example.com / test.com / +test)
                    can receive; real customers are skipped
      - live      → real customers (requires approval)
  * Every send re-checks, IMMEDIATELY before sending: marketing consent +
    email-verified + suppression (can_send_marketing) AND the central frequency
    governor (marketing_frequency.can_send_now). No queue, so no stale backlog.
  * Idempotent via per-subscription markers (lifecycle_midtrial_sent_at /
    lifecycle_postwin_sent_at).
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone, timedelta

from lib.email_governance import (
    can_send_marketing, make_email_token, marketing_unsub_headers,
    EmailHashSecretMissing,
)
from lib import marketing_frequency as mf
import email_service

log = logging.getLogger("wayly.lifecycle")


def _mode() -> str:
    return (os.environ.get("LIFECYCLE_EMAILS_MODE", "off") or "off").lower()


def lifecycle_enabled() -> bool:
    return _mode() in ("test_only", "live")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _frontend_base() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL")
            or "https://wayly.com.au").rstrip("/")


def _is_test_recipient(email: str) -> bool:
    try:
        from routes.email_verification import is_test_account
        return bool(is_test_account(email))
    except Exception:  # pragma: no cover
        dom = (email or "").lower().rsplit("@", 1)[-1]
        return dom in ("example.com", "test.com")


def _match(sub: dict) -> dict:
    return {"id": sub["id"]} if sub.get("id") else {"user_id": sub["user_id"]}


async def _send_lifecycle(db, user: dict, *, kind: str, subject: str,
                          html_inner: str, text_body: str, now: datetime,
                          mode: str):
    """Returns (ok, reason). Performs ALL immediate-before-send re-checks."""
    email = user.get("email") or ""
    # 1. consent + email-verified + suppression (central gate).
    ok, reason = await can_send_marketing(db, user=user, email=email)
    if not ok:
        return False, reason
    # 2. frequency governor (rolling caps + 72h + trial quota).
    try:
        fok, freason = await mf.can_send_now(db, email, now=now)
    except EmailHashSecretMissing:
        return False, "hash_unavailable"
    if not fok:
        return False, freason
    # 3. mode / test-account gate (preview safety).
    if mode == "test_only" and not _is_test_recipient(email):
        return False, "not_test_account"
    # 4. build + send (branded HTML + plain-text alt + List-Unsubscribe).
    base = _frontend_base()
    unsub = make_email_token(user["id"], email, "unsub")
    prefs = make_email_token(user["id"], email, "prefs")
    from wayly_email_branding import wrap_email_html
    footer = (f"You're receiving this because you have a Wayly account and chose to "
              f"get helpful emails. Unsubscribe any time: {base}/email/unsubscribe?token={unsub}"
              f" · Manage preferences: {base}/email/preferences?token={prefs}")
    html = wrap_email_html(title=subject, eyebrow="Wayly", inner_html=html_inner,
                           footer_note=footer)
    text = (text_body.rstrip()
            + f"\n\nUnsubscribe: {base}/email/unsubscribe?token={unsub}"
            + "\nInformation only, not advice. Wayly Pty Ltd · wayly.com.au")
    res = await email_service.deliver(
        to=email, subject=subject, html=html, text=text,
        headers=marketing_unsub_headers(base, unsub),
        idempotency_key=f"lifecycle:{kind}:{user['id']}")
    if not res.get("ok"):
        return False, (res.get("error") or "send_failed")
    await mf.record_send(db, email, category="lifecycle", kind=kind, now=now)
    return True, "sent"


def _midtrial_content(first: str, base: str):
    html = (
        f"<h2 style='margin:0 0 14px;color:#0E4D52;font-size:22px;font-weight:700;'>"
        f"Hi {first}, here's the quickest way to see Wayly work</h2>"
        "<p style='margin:0 0 14px;font-size:15px;line-height:1.65;color:#13303A;'>"
        "You've still got full access to every Wayly tool for the rest of your free "
        "trial. The fastest way to feel the value is to run one real document through it.</p>"
        "<p style='margin:0 0 14px;font-size:15px;line-height:1.65;color:#13303A;'>"
        "<strong>Try the Statement Decoder</strong> — paste or upload an aged-care "
        "statement and Wayly explains every line in plain English and flags anything "
        "worth questioning.</p>"
        f"<p style='margin:18px 0;'><a href='{base}/ai-tools/statement-decoder' "
        "style='display:inline-block;background:#A5512B;color:#fff;text-decoration:none;"
        "padding:12px 22px;border-radius:999px;font-weight:600;'>Decode a statement</a></p>"
        "<p style='margin:0 0 14px;font-size:15px;line-height:1.65;color:#13303A;'>"
        "Prefer to start elsewhere? The Invoice Checker and Ask Wayly are a tap away "
        "from your dashboard.</p>"
        "<p style='margin:16px 0 0;font-size:13px;color:#8a8378;'>No rush — your trial "
        "keeps full access until it ends. Information only, not advice.</p>"
    )
    text = (
        f"Hi {first}, here's the quickest way to see Wayly work.\n\n"
        "You've still got full access to every Wayly tool for the rest of your free "
        "trial. The fastest win is to run one real document through it: try the "
        "Statement Decoder — paste or upload an aged-care statement and Wayly explains "
        "every line in plain English and flags anything worth questioning.\n\n"
        f"Decode a statement: {base}/ai-tools/statement-decoder\n\n"
        "Prefer to start elsewhere? The Invoice Checker and Ask Wayly are a tap away "
        "from your dashboard. No rush — your trial keeps full access until it ends."
    )
    return html, text


def _postwin_content(first: str, base: str):
    html = (
        f"<h2 style='margin:0 0 14px;color:#0E4D52;font-size:22px;font-weight:700;'>"
        f"Still here whenever aged care gets confusing, {first}</h2>"
        "<p style='margin:0 0 14px;font-size:15px;line-height:1.65;color:#13303A;'>"
        "Your Wayly trial has wrapped up. Whenever a confusing statement, invoice or "
        "care-plan letter lands, Wayly can decode it in plain English and flag anything "
        "worth questioning — so you can feel on top of it again.</p>"
        "<p style='margin:0 0 14px;font-size:15px;line-height:1.65;color:#13303A;'>"
        "Your saved information is safe and still in your account.</p>"
        f"<p style='margin:18px 0;'><a href='{base}/pricing' "
        "style='display:inline-block;background:#0E4D52;color:#fff;text-decoration:none;"
        "padding:12px 22px;border-radius:999px;font-weight:600;'>See your options</a></p>"
        "<p style='margin:16px 0 0;font-size:13px;color:#8a8378;'>No pressure — we'll be "
        "here when you need us. Information only, not advice.</p>"
    )
    text = (
        f"Still here whenever aged care gets confusing, {first}.\n\n"
        "Your Wayly trial has wrapped up. Whenever a confusing statement, invoice or "
        "care-plan letter lands, Wayly can decode it in plain English and flag anything "
        "worth questioning. Your saved information is safe and still in your account.\n\n"
        f"See your options: {base}/pricing\n\n"
        "No pressure — we'll be here when you need us."
    )
    return html, text


async def process_lifecycle_once(db, *, now: datetime | None = None,
                                 mode: str | None = None) -> dict:
    """One idempotent pass. Returns counts; sends nothing unless mode is
    test_only/live and every gate passes."""
    now = now or _now()
    mode = (mode or _mode()).lower()
    out = {"mode": mode, "midtrial_sent": 0, "midtrial_skipped": 0,
           "postwin_sent": 0, "postwin_skipped": 0}
    if mode not in ("test_only", "live"):
        return out

    base = _frontend_base()
    td = mf.TRIAL_DAYS

    # --- 1. Mid-trial guidance: ~48–72h after trial start -------------------
    # Trial start = trial_ends_at - td. 48–72h after start ⇒ trial_ends_at in
    # [now + (td-3)d, now + (td-2)d]. This is ≥48h after the trial-start email
    # and ≥2 days before the day-5 "two days left" notification.
    lo = (now + timedelta(days=td - 3)).isoformat()
    hi = (now + timedelta(days=td - 2)).isoformat()
    cur = db.subscriptions.find(
        {"status": "trialing", "trial_ends_at": {"$gte": lo, "$lte": hi},
         "lifecycle_midtrial_sent_at": {"$exists": False}}, {"_id": 0}).limit(100)
    async for sub in cur:
        user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0})
        if not user:
            continue
        # FIRST-USE gate: if they've done anything meaningful, they're
        # progressing → send NOTHING (mark so we don't re-evaluate).
        try:
            from services.trial_wins import compute_trial_wins
            wins = await compute_trial_wins(db, user)
        except Exception:
            wins = []
        if wins:
            await db.subscriptions.update_one(_match(sub), {"$set": {
                "lifecycle_midtrial_sent_at": now.isoformat(),
                "lifecycle_midtrial_result": "skipped_progressing"}})
            out["midtrial_skipped"] += 1
            continue
        first = (user.get("name") or "there").split(" ")[0]
        html_inner, text_body = _midtrial_content(first, base)
        ok, reason = await _send_lifecycle(
            db, user, kind="trial_midtrial",
            subject="A two-minute win inside your Wayly trial",
            html_inner=html_inner, text_body=text_body, now=now, mode=mode)
        await db.subscriptions.update_one(_match(sub), {"$set": {
            "lifecycle_midtrial_sent_at": now.isoformat(),
            "lifecycle_midtrial_result": ("sent" if ok else f"skipped:{reason}")}})
        out["midtrial_sent" if ok else "midtrial_skipped"] += 1

    # --- 2. Post-trial win-back: >= 7 days after a NON-converted trial end ---
    cutoff = (now - timedelta(days=7)).isoformat()
    cur2 = db.subscriptions.find(
        {"status": {"$in": ["expired", "canceled"]}, "had_trial": True,
         "trial_ends_at": {"$lte": cutoff},
         "lifecycle_postwin_sent_at": {"$exists": False}}, {"_id": 0}).limit(100)
    async for sub in cur2:
        user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0})
        if not user:
            continue
        # Converted since? (any active sub OR user flipped active) → no win-back.
        active = await db.subscriptions.find_one(
            {"user_id": sub["user_id"], "status": "active"}, {"_id": 1})
        if active or user.get("subscription_status") == "active":
            await db.subscriptions.update_one(_match(sub), {"$set": {
                "lifecycle_postwin_sent_at": now.isoformat(),
                "lifecycle_postwin_result": "skipped_converted"}})
            out["postwin_skipped"] += 1
            continue
        first = (user.get("name") or "there").split(" ")[0]
        html_inner, text_body = _postwin_content(first, base)
        ok, reason = await _send_lifecycle(
            db, user, kind="trial_postwin",
            subject="Your Wayly tools are here whenever you need them",
            html_inner=html_inner, text_body=text_body, now=now, mode=mode)
        await db.subscriptions.update_one(_match(sub), {"$set": {
            "lifecycle_postwin_sent_at": now.isoformat(),
            "lifecycle_postwin_result": ("sent" if ok else f"skipped:{reason}")}})
        out["postwin_sent" if ok else "postwin_skipped"] += 1

    return out
