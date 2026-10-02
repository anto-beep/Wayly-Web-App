#!/usr/bin/env python3
"""Wayly production smoke test.

Logs into the deployed Wayly app as the sentinel `smoke@wayly.com.au`
account and walks through the routes most likely to break first:

  /app             dashboard
  /app/chat        Ask Wayly (Claude proxy)
  /app/statements  statement list
  /app/budget      Support at Home budget

Each step:
  - clears prior page-errors
  - navigates with a 20 s budget
  - hard-asserts the page is the expected one (no 404 / no error boundary)
  - records render time + any console error

At the end the script POSTs an HMAC-signed report to:
  POST {SMOKE_API_BASE}/api/internal/smoke-report
which the backend persists to Mongo (`smoke_runs` collection) and emails
TEAM_INBOX on failure.

ENV (all read at runtime — pass via GitHub Actions secrets):
  SMOKE_TARGET_URL     — e.g. https://wayly.com.au
  SMOKE_API_BASE       — e.g. https://wayly.com.au   (where /api lives)
  SMOKE_EMAIL          — smoke@wayly.com.au
  SMOKE_PASSWORD       — the password printed by seed_smoke_account.py
  SMOKE_HMAC_SECRET    — same value as backend .env
  SMOKE_RUN_ID         — optional; defaults to GITHUB_RUN_ID or uuid

Exit codes:
  0  all steps passed (and report acknowledged)
  1  one or more steps failed
  2  could not even reach the backend (network/DNS/SSL)
"""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any

import urllib.request


STEPS = [
    {"path": "/app",            "label": "dashboard"},
    {"path": "/app/chat",       "label": "chat"},
    {"path": "/app/statements", "label": "statements"},
    {"path": "/app/budget",     "label": "budget"},
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run() -> Dict[str, Any]:
    target = os.environ["SMOKE_TARGET_URL"].rstrip("/")
    email = os.environ["SMOKE_EMAIL"]
    password = os.environ["SMOKE_PASSWORD"]

    started = datetime.now(timezone.utc)
    results: List[Dict[str, Any]] = []

    # Lazy import so failure to install Playwright is reported cleanly.
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as e:
        return _fail_report(started, [{"name": "import_playwright", "ok": False, "error": str(e), "duration_ms": 0}])

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        page_errors: List[str] = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        # -------- step: login --------
        step_started = datetime.now(timezone.utc)
        try:
            await page.goto(f"{target}/login", wait_until="domcontentloaded", timeout=20000)
            await page.fill('input[type="email"]', email)
            await page.fill('input[type="password"]', password)
            await page.click('button[type="submit"]')
            await page.wait_for_url(f"{target}/app**", timeout=20000)
            results.append({
                "name": "login",
                "ok": True,
                "duration_ms": _elapsed(step_started),
            })
        except Exception as e:
            results.append({
                "name": "login",
                "ok": False,
                "error": str(e)[:300],
                "duration_ms": _elapsed(step_started),
            })
            await browser.close()
            return _build_report(started, results)

        # -------- step: each route --------
        for st in STEPS:
            page_errors.clear()
            step_started = datetime.now(timezone.utc)
            ok = True
            err = None
            try:
                resp = await page.goto(f"{target}{st['path']}", wait_until="domcontentloaded", timeout=20000)
                if resp is None:
                    raise RuntimeError("no response")
                if resp.status >= 500:
                    raise RuntimeError(f"HTTP {resp.status}")
                # Bounce-to-login means our auth dropped — fail hard.
                if page.url.rstrip("/").endswith("/login"):
                    raise RuntimeError("redirected to /login — session lost")
                # Give the SPA a moment to mount and the error boundary a chance
                # to fire if a render throws.
                await page.wait_for_timeout(1500)
                if await page.query_selector('[data-testid="server-error"]'):
                    raise RuntimeError("ErrorBoundary triggered")
                # Look for the generic 500 copy as a fallback in case the testid
                # is missing (older builds).
                body_text = await page.evaluate("document.body.innerText || ''")
                if "Something on our side broke" in body_text:
                    raise RuntimeError("500 page rendered")
                if page_errors:
                    raise RuntimeError(f"page errors: {page_errors[:2]}")
            except Exception as e:
                ok = False
                err = str(e)[:300]
            results.append({
                "name": f"GET {st['path']}",
                "ok": ok,
                "duration_ms": _elapsed(step_started),
                "error": err,
            })

        await browser.close()
        return _build_report(started, results)


def _elapsed(since: datetime) -> int:
    return int((datetime.now(timezone.utc) - since).total_seconds() * 1000)


def _build_report(started: datetime, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    finished = datetime.now(timezone.utc)
    return {
        "run_id": os.environ.get("SMOKE_RUN_ID") or os.environ.get("GITHUB_RUN_ID") or str(uuid.uuid4()),
        "environment": os.environ.get("SMOKE_ENV", "production"),
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_ms": int((finished - started).total_seconds() * 1000),
        "ok": all(r["ok"] for r in results),
        "steps": results,
        "git_sha": os.environ.get("GITHUB_SHA"),
        "runner": os.environ.get("GITHUB_RUN_ID") and f"github-actions/{os.environ.get('GITHUB_WORKFLOW', 'smoke')}" or "manual",
    }


def _fail_report(started: datetime, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    return _build_report(started, results)


def submit_report(report: Dict[str, Any]) -> None:
    api_base = os.environ["SMOKE_API_BASE"].rstrip("/")
    secret = os.environ["SMOKE_HMAC_SECRET"].encode()
    body = json.dumps(report, separators=(",", ":")).encode()
    sig = hmac.new(secret, body, hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        f"{api_base}/api/internal/smoke-report",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Smoke-Signature": sig,
            "User-Agent": "wayly-smoke/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        sys.stderr.write(f"smoke-report POST → {resp.status}\n")
        sys.stderr.write(resp.read().decode() + "\n")


def main() -> int:
    report = asyncio.run(run())
    print(json.dumps(report, indent=2))
    try:
        submit_report(report)
    except Exception as e:
        sys.stderr.write(f"submit_report failed: {e}\n")
        # Submission failure still means smoke failed (the team should know).
        return 2 if report["ok"] else 1
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
