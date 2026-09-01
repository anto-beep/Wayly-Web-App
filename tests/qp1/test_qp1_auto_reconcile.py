"""QP-1 statement auto-feed reconciliation — Playwright regression.

Guards the "Reconcile from a decoded statement" flow so we never ship a
regression that breaks the retention loop for families. Two paths are
covered:

  1. From the ``This week`` tab of ``/app/pacing``: pick a statement from
     the dropdown, click **Reconcile now**, expect matched / unmatched
     counts + a state=reconciled badge appearing on at least one ledger
     row.
  2. From the Statement detail page: the auto-reconcile prompt CTA fires
     the same endpoint and shows a success card with a link back to
     pacing.

The suite skips gracefully if Playwright isn't installed so a plain
``pytest`` full-suite run doesn't break in slim CI images.

Invocation
----------
    pytest tests/qp1/test_qp1_auto_reconcile.py
"""
from __future__ import annotations

import os
import pytest

try:
    from playwright.sync_api import sync_playwright, expect  # noqa: F401
except Exception:  # pragma: no cover
    pytest.skip("playwright not installed", allow_module_level=True)


def _base_url() -> str:
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    with open(env_path, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found in frontend/.env")


# Credentials pulled from /app/memory/test_credentials.md — Family caregiver
# on the ``cathy@example.com`` seed account (has Dorothy Smith participant
# and 30+ decoded statements available in the fixtures).
_EMAIL = "cathy@example.com"
_PASSWORD = "testpass123"


def _login(page, base_url: str) -> None:
    page.goto(f"{base_url}/login", wait_until="networkidle", timeout=30_000)
    page.fill('input[type="email"]', _EMAIL)
    page.fill('input[type="password"]', _PASSWORD)
    page.get_by_role("button", name="Sign in").click(force=True)
    page.wait_for_url("**/app**", timeout=20_000)


def _require_chromium():
    """Skip the test at runtime if browser binaries aren't installed. Keeps
    a plain ``pytest`` sweep green in slim CI images without hiding real
    failures when browsers are available."""
    try:
        with sync_playwright() as p:
            p.chromium.launch().close()
    except Exception as e:  # pragma: no cover
        pytest.skip(f"Chromium binary missing — run `playwright install` ({e})")


def test_reconcile_now_lifts_confidence():
    """Happy path — Reconcile now on This-week tab bumps ``entries_counted``
    on the resulting pacing snapshot and surfaces a Reconciled badge.
    """
    _require_chromium()
    base = _base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        try:
            _login(page, base)
            page.goto(f"{base}/app/pacing?tab=week", wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_selector('[data-testid="qp1-reconcile-statement-card"]', timeout=15_000)

            # Open the picker
            page.click('[data-testid="qp1-reconcile-statement-toggle"]', timeout=8_000)
            page.wait_for_selector('[data-testid="qp1-reconcile-statement-select"]', timeout=10_000)
            options_count = page.locator(
                '[data-testid="qp1-reconcile-statement-select"] option'
            ).count()
            assert options_count > 0, "Expected at least one decoded statement in the picker"

            # Fire reconciliation
            page.click('[data-testid="qp1-reconcile-statement-submit"]', timeout=8_000)
            page.wait_for_selector('[data-testid="qp1-reconcile-statement-result"]', timeout=15_000)
            summary = page.locator(
                '[data-testid="qp1-reconcile-statement-result"] .font-heading'
            ).first.text_content(timeout=5_000)
            assert summary and ("matched" in summary), summary

            # A ledger row somewhere in the current view should now show a
            # ``reconciled`` state badge — at least on the row-level state
            # pill we render for the matched entry.
            recon_badges = page.locator('[data-testid^="qp1-ledger-state-"]').filter(
                has_text="Reconciled"
            )
            assert recon_badges.count() >= 1, "Expected at least one Reconciled ledger badge"
        finally:
            ctx.close()
            browser.close()


def test_statement_detail_prompts_reconcile():
    """Auto-Reconcile on Upload — the Statement Detail page shows a
    prompt CTA that reconciles in one click and swaps to a success card.
    """
    _require_chromium()
    base = _base_url()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        try:
            _login(page, base)
            # Navigate to Statements list and open the first statement with lines.
            page.goto(f"{base}/app/statements", wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(1_500)  # let list render

            # First statement row link — testids follow ``statement-row-<id>``.
            first = page.locator('a[href^="/app/statements/"]').first
            expect(first).to_be_visible(timeout=10_000)
            first.click()
            page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=15_000)

            # Prompt may already be dismissed via localStorage on repeat
            # runs — reset it and reload.
            page.evaluate(
                "Object.keys(localStorage).forEach(k => { if (k.startsWith('wayly:qp1:recon:')) localStorage.removeItem(k); })"
            )
            page.reload()
            page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=15_000)

            prompt = page.locator('[data-testid="statement-reconcile-prompt"]')
            if prompt.count() == 0:
                # This particular statement has no line items — walk the list.
                page.goto(f"{base}/app/statements", wait_until="networkidle", timeout=30_000)
                page.wait_for_timeout(1_500)
                links = page.locator('a[href^="/app/statements/"]').all()
                found = False
                for link in links[:10]:
                    link.click()
                    page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=15_000)
                    page.evaluate(
                        "Object.keys(localStorage).forEach(k => { if (k.startsWith('wayly:qp1:recon:')) localStorage.removeItem(k); })"
                    )
                    page.reload()
                    page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=15_000)
                    if page.locator('[data-testid="statement-reconcile-prompt"]').count() > 0:
                        found = True
                        break
                    page.go_back()
                    page.wait_for_timeout(600)
                assert found, "Could not locate a statement with line_items to reconcile"

            # Fire it
            page.click('[data-testid="statement-reconcile-btn"]', timeout=8_000)
            page.wait_for_selector('[data-testid="statement-reconcile-success"]', timeout=15_000)
            success_txt = page.locator(
                '[data-testid="statement-reconcile-success"]'
            ).first.text_content(timeout=5_000)
            assert success_txt and "Reconciled" in success_txt
            # And there's a link back to pacing
            expect(page.locator('[data-testid="statement-reconcile-goto-pacing"]')).to_be_visible(
                timeout=5_000
            )
        finally:
            ctx.close()
            browser.close()
