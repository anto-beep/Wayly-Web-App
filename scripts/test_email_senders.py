"""Send one of every distinct Wayly email template to a test recipient and
print the From address + Resend send id for each. Used to verify the
RESEND_FROM_EMAIL env override is honoured across the whole codebase."""
import asyncio
import os
import sys

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import email_service
from digest_service import build_digest, render_digest_html
from smoke_status import _send as smoke_send

TO = sys.argv[1] if len(sys.argv) > 1 else "antonychiware@live.com.au"


async def main() -> None:
    from_addr = email_service._sender()
    print(f"\nResolved From address: {from_addr}\n")
    print(f"Sending all 6 templates to {TO}\n")

    results = []

    # Resend free tier rate-limits at 2 req/sec — pace each send.
    PACE_MS = 600

    # 1. Welcome / email-verify
    r1 = await email_service.email_tool_result(
        to=TO,
        tool_name="Verify your email",
        headline="Confirm your Wayly account, Antony",
        body_html=(
            "<p>Welcome to Wayly. Tap the button below to confirm this email address.</p>"
            "<p><a href='https://wayly.com.au/verify?token=test_token' "
            "style='display:inline-block;background:#2BC4D6;color:#0E2A47;"
            "padding:10px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600'>Confirm email</a></p>"
            "<p style='color:#6B7280;font-size:13px'>If you didn't create a Wayly account, ignore this email.</p>"
        ),
    )
    results.append(("1. Welcome / email-verify", "email_tool_result", r1))
    await asyncio.sleep(PACE_MS / 1000)

    # 2. Password reset
    r2 = await email_service.email_tool_result(
        to=TO,
        tool_name="Password reset",
        headline="Reset your Wayly password",
        body_html=(
            "<p>Someone (hopefully you) requested a password reset for your Wayly account.</p>"
            "<p><a href='https://wayly.com.au/reset?token=test_token' "
            "style='display:inline-block;background:#0E2A47;color:#fff;padding:10px 20px;"
            "border-radius:8px;text-decoration:none'>Reset password</a></p>"
            "<p style='color:#6B7280;font-size:13px'>This link expires in 60 minutes.</p>"
        ),
    )
    results.append(("2. Password reset", "email_tool_result", r2))
    await asyncio.sleep(PACE_MS / 1000)

    # 3. Family-member invitation
    r3 = await email_service.email_tool_result(
        to=TO,
        tool_name="Wayly family invitation",
        headline="Cathy invited you to Dorothy's Wayly",
        body_html=(
            "<p>Cathy wants you involved as a <strong>family member</strong> on Dorothy's Wayly household.</p>"
            "<p><a href='https://wayly.com.au/invite?token=test_token' "
            "style='display:inline-block;background:#2BC4D6;color:#0E2A47;"
            "padding:10px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600'>Accept invitation</a></p>"
            "<p style='color:#6B7280;font-size:13px'>Invitation expires in 14 days.</p>"
        ),
    )
    results.append(("3. Family-member invite", "email_tool_result", r3))
    await asyncio.sleep(PACE_MS / 1000)

    # 4. Adviser invitation (uses email_adviser_invite — distinct template)
    r4 = await email_service.email_adviser_invite(
        to=TO,
        client_name="Antony Test",
        adviser_name="Mark Adviser",
        invite_url="https://wayly.com.au/signup?plan=family&invite=test_token",
        adviser_notes="Looking forward to helping you simplify Dad's care funding.",
    )
    results.append(("4. Adviser → client invite", "email_adviser_invite", r4))
    await asyncio.sleep(PACE_MS / 1000)

    # 5. Public-tool result (Statement Decoder)
    r5 = await email_service.email_tool_result(
        to=TO,
        tool_name="Statement Decoder",
        headline="Your March statement — 3 things to look at",
        body_html=(
            "<p>Hi Antony,</p>"
            "<p>We decoded your most recent BlueBerry Care statement. Here's what stood out:</p>"
            "<ul>"
            "<li><strong>Care management is over the 10% cap</strong> — $58 above the monthly limit.</li>"
            "<li><strong>Wrong stream billing</strong> — a $42 clinical line was charged to your everyday-living budget.</li>"
            "<li><strong>Quarter ends in 17 days</strong> — $1,240 unspent. Anything above the rollover cap is lost.</li>"
            "</ul>"
            "<p>Sign in to review and chase your provider.</p>"
        ),
    )
    results.append(("5. Tool result (Statement Decoder)", "email_tool_result", r5))
    await asyncio.sleep(PACE_MS / 1000)

    # 6. Weekly digest — uses email_service._send under the hood (digest_service.py)
    r6 = await email_service._send({
        "from": email_service._sender(),
        "to": [TO],
        "subject": "Wayly — Dorothy Anderson's week (Mar 4–10)",
        "html": (
            "<!doctype html><html><body style='font-family:Helvetica,Arial,sans-serif;"
            "background:#EAF4FB;padding:24px;color:#0E2A47'>"
            "<h1>Dorothy's week</h1>"
            "<p>Two anomalies flagged · 1 new statement · Family wall stayed quiet.</p>"
            "<p>This is a sample weekly digest used to verify the From address.</p>"
            "</body></html>"
        ),
    })
    results.append(("6. Weekly digest", "_send (digest_service)", r6))

    print("─" * 72)
    print(f"{'#':<35} {'helper':<28} {'Resend id / result'}")
    print("─" * 72)
    for label, helper, res in results:
        ok = res.get("ok")
        identifier = res.get("id") or res.get("reason") or ("mocked" if res.get("mocked") else "—")
        status = "✓ sent" if ok and not res.get("mocked") else ("(mock)" if res.get("mocked") else "✗ failed")
        print(f"{label:<35} {helper:<28} {status}  {identifier}")
    print("─" * 72)
    print(f"\nAll messages used From: {from_addr}")


if __name__ == "__main__":
    asyncio.run(main())
