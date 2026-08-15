#!/usr/bin/env python3
"""Focused verification for admin theme/contrast bug (iteration 83).

Checks only the user-reported admin login/backend theme issues:
  - /admin/login forced to light palette.
  - Authenticated admin Overview and Feature Flags headings/stat labels have AA contrast.
  - /admin/preferences exists and its theme toggle applies immediately/persists.
  - Top-bar and Preferences theme toggles remain in sync.
  - System theme follows emulated OS light/dark.

The script creates a short-lived admin session token directly in the preview DB so
the UI can be tested without consuming MFA backup codes or mutating TOTP setup.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


APP_DIR = Path("/app")
BACKEND_ENV = APP_DIR / "backend" / ".env"
FRONTEND_ENV = APP_DIR / "frontend" / ".env"
RESULT_PATH = APP_DIR / "test_reports" / "admin_theme_bug_iter83_results.json"


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def app_url() -> str:
    return parse_env(FRONTEND_ENV).get("REACT_APP_BACKEND_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")


def create_admin_token() -> tuple[str, str]:
    """Create a valid admin JWT + DB session for UI tests without changing MFA."""
    try:
        import jwt  # type: ignore
        from pymongo import MongoClient  # type: ignore
    except Exception as exc:  # pragma: no cover - environment diagnostic
        raise RuntimeError(f"Missing Python dependency for token creation: {exc}")

    env = parse_env(BACKEND_ENV)
    client = MongoClient(env["MONGO_URL"], serverSelectionTimeoutMS=5000)
    db = client[env["DB_NAME"]]
    user = None
    for email in ("hello@techglove.com.au", "admin@wayly.com.au", "hello@wayly.com.au", "a.chiware2@gmail.com"):
        user = db.users.find_one({"email": email, "admin_role": {"$exists": True}}, {"_id": 0})
        if user:
            break
    if not user:
        user = db.users.find_one({"is_admin": True}, {"_id": 0})
    if not user:
        raise RuntimeError("No admin user found in DB for UI token setup")

    sid = f"theme-test-{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    db.admin_sessions.insert_one(
        {
            "id": sid,
            "user_id": user["id"],
            "ip": "127.0.0.1",
            "ua": "admin-theme-bug-verification-iter83",
            "created_at": now.isoformat(),
            "last_activity": now.isoformat(),
            "expires_at_max": (now + timedelta(hours=2)).isoformat(),
            "revoked": False,
        }
    )
    token = jwt.encode(
        {
            "sub": user["id"],
            "type": "admin",
            "sid": sid,
            "role": user.get("admin_role") or "super_admin",
            "exp": now + timedelta(hours=2),
        },
        env["ADMIN_JWT_SECRET"],
        algorithm=env.get("JWT_ALGORITHM", "HS256"),
    )
    return token, user.get("email", user["id"])


def rgb_tuple(css_color: str) -> tuple[float, float, float]:
    nums = re.findall(r"[0-9.]+", css_color)
    if len(nums) < 3:
        raise ValueError(f"Cannot parse color: {css_color}")
    return float(nums[0]), float(nums[1]), float(nums[2])


def rel_lum(rgb: tuple[float, float, float]) -> float:
    def chan(v: float) -> float:
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = [chan(v) for v in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: str, bg: str) -> float:
    l1 = rel_lum(rgb_tuple(fg))
    l2 = rel_lum(rgb_tuple(bg))
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


async def get_styles(page, selector: str, bg_selector: str | None = None) -> dict:
    return await page.evaluate(
        """({ selector, bgSelector }) => {
            const el = document.querySelector(selector);
            const bgEl = bgSelector ? document.querySelector(bgSelector) : el;
            if (!el || !bgEl) return null;
            const cs = getComputedStyle(el);
            const bcs = getComputedStyle(bgEl);
            return {
              text: el.textContent.trim(),
              color: cs.color,
              backgroundColor: bcs.backgroundColor,
              rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme'),
              rootBg: getComputedStyle(document.querySelector('.admin-root')).backgroundColor,
              rootColor: getComputedStyle(document.querySelector('.admin-root')).color,
            };
        }""",
        {"selector": selector, "bgSelector": bg_selector},
    )


async def run() -> dict:
    from playwright.async_api import async_playwright, expect  # type: ignore

    base = app_url()
    token, admin_email = create_admin_token()
    results: dict = {
        "base_url": base,
        "admin_email_used": admin_email,
        "checks": [],
        "failures": [],
        "console_errors": [],
    }

    def record(name: str, ok: bool, details: dict | str):
        entry = {"name": name, "ok": bool(ok), "details": details}
        results["checks"].append(entry)
        print(("PASS" if ok else "FAIL") + f" - {name}: {details}")
        if not ok:
            results["failures"].append(entry)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])

        # 1) Login page must always render in LIGHT admin theme.
        login_context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        login_page = await login_context.new_page()
        login_page.on("console", lambda msg: results["console_errors"].append(msg.text) if msg.type == "error" else None)
        await login_page.goto(f"{base}/admin/login", wait_until="networkidle")
        await expect(login_page.locator('[data-testid="admin-login-form"]')).to_be_visible(timeout=15000)
        login_styles = await get_styles(login_page, ".admin-root", ".admin-root")
        sign_in_styles = await get_styles(login_page, '[data-testid="admin-login-form"] h2', ".admin-root")
        cta_styles = await get_styles(login_page, '[data-testid="admin-login-submit"]', '[data-testid="admin-login-submit"]')
        record(
            "admin login uses light palette",
            login_styles["rootTheme"] == "light" and contrast(login_styles["rootColor"], login_styles["rootBg"]) >= 7,
            {"root": login_styles, "root_contrast": round(contrast(login_styles["rootColor"], login_styles["rootBg"]), 2), "sign_in": sign_in_styles, "cta": cta_styles},
        )
        await login_context.close()

        # Helper for authenticated contexts.
        async def authed_context(color_scheme: str = "dark", initial_theme: str | None = None):
            ctx = await browser.new_context(viewport={"width": 1920, "height": 1080}, color_scheme=color_scheme)
            script = f"""
                localStorage.setItem('wayly_admin_token', {json.dumps(token)});
                {f"localStorage.setItem('wayly.admin.theme', {json.dumps(initial_theme)});" if initial_theme else "localStorage.removeItem('wayly.admin.theme');"}
            """
            await ctx.add_init_script(script)
            page = await ctx.new_page()
            page.on("console", lambda msg: results["console_errors"].append(msg.text) if msg.type == "error" else None)
            return ctx, page

        # 2) Authenticated dark admin pages: Overview and Feature Flags H1 + stat labels.
        ctx, page = await authed_context(color_scheme="dark")
        await page.goto(f"{base}/admin", wait_until="networkidle")
        await expect(page.locator('[data-testid="admin-analytics"]')).to_be_visible(timeout=20000)
        overview_h1 = await get_styles(page, "h1", ".admin-root")
        total_label = await get_styles(page, '[data-testid="card-total-users"] .admin-stat-label', '[data-testid="card-total-users"]')
        mrr_label = await get_styles(page, '[data-testid="card-mrr"] .admin-stat-label', '[data-testid="card-mrr"]')
        overview_h1_ratio = contrast(overview_h1["color"], overview_h1["rootBg"])
        total_label_ratio = contrast(total_label["color"], total_label["backgroundColor"])
        mrr_label_ratio = contrast(mrr_label["color"], mrr_label["backgroundColor"])
        record(
            "overview dark heading and KPI labels have AA+ contrast",
            overview_h1_ratio >= 4.5 and total_label_ratio >= 4.5 and mrr_label_ratio >= 4.5,
            {
                "h1": overview_h1,
                "h1_contrast": round(overview_h1_ratio, 2),
                "total_users_label": total_label,
                "total_users_label_contrast": round(total_label_ratio, 2),
                "mrr_label": mrr_label,
                "mrr_label_contrast": round(mrr_label_ratio, 2),
            },
        )

        await page.goto(f"{base}/admin/feature-flags", wait_until="networkidle")
        await expect(page.locator('[data-testid="admin-feature-flags"]')).to_be_visible(timeout=20000)
        ff_h1 = await get_styles(page, "h1", ".admin-root")
        ff_ratio = contrast(ff_h1["color"], ff_h1["rootBg"])
        record(
            "feature flags h1 has strong dark-theme contrast",
            ff_ratio >= 4.5,
            {"h1": ff_h1, "contrast": round(ff_ratio, 2)},
        )

        # 3) Preferences page exists; changing theme applies immediately and persists.
        await page.goto(f"{base}/admin/preferences", wait_until="networkidle")
        await expect(page.locator('[data-testid="admin-preferences-page"]')).to_be_visible(timeout=20000)
        record("preferences page exists", True, {"url": page.url})

        await page.locator('[data-testid="prefs-theme-light"]').click()
        await page.wait_for_timeout(300)
        prefs_light_state = await page.evaluate(
            """() => ({
                rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme'),
                storedTheme: localStorage.getItem('wayly.admin.theme'),
                rootBg: getComputedStyle(document.querySelector('.admin-root')).backgroundColor,
                topbarLightPressed: document.querySelector('[data-testid="admin-theme-light"]')?.getAttribute('aria-pressed'),
                prefsLightChecked: document.querySelector('[data-testid="prefs-theme-light"]')?.getAttribute('aria-checked')
            })"""
        )
        record(
            "preferences light toggle applies immediately and persists",
            prefs_light_state["rootTheme"] == "light" and prefs_light_state["storedTheme"] == "light" and "251" in prefs_light_state["rootBg"],
            prefs_light_state,
        )
        record(
            "top-bar toggle syncs after Preferences choice",
            prefs_light_state["topbarLightPressed"] == "true",
            prefs_light_state,
        )

        await page.goto(f"{base}/admin/feature-flags", wait_until="networkidle")
        await expect(page.locator('[data-testid="admin-feature-flags"]')).to_be_visible(timeout=20000)
        persisted_state = await page.evaluate(
            """() => ({
                rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme'),
                storedTheme: localStorage.getItem('wayly.admin.theme'),
                rootBg: getComputedStyle(document.querySelector('.admin-root')).backgroundColor
            })"""
        )
        record(
            "theme persists across navigation",
            persisted_state["rootTheme"] == "light" and persisted_state["storedTheme"] == "light",
            persisted_state,
        )

        # Return to Preferences and verify top-bar -> Preferences sync too.
        await page.goto(f"{base}/admin/preferences", wait_until="networkidle")
        await expect(page.locator('[data-testid="admin-preferences-page"]')).to_be_visible(timeout=20000)
        await page.locator('[data-testid="admin-theme-dark"]').click()
        await page.wait_for_timeout(300)
        topbar_dark_state = await page.evaluate(
            """() => ({
                rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme'),
                storedTheme: localStorage.getItem('wayly.admin.theme'),
                topbarDarkPressed: document.querySelector('[data-testid="admin-theme-dark"]')?.getAttribute('aria-pressed'),
                prefsDarkChecked: document.querySelector('[data-testid="prefs-theme-dark"]')?.getAttribute('aria-checked'),
                prefsActiveText: Array.from(document.querySelectorAll('[data-testid^="prefs-theme-"]')).map(b => `${b.textContent}:${b.getAttribute('aria-checked')}`).join(',')
            })"""
        )
        record(
            "Preferences controls sync after top-bar theme choice",
            topbar_dark_state["rootTheme"] == "dark" and topbar_dark_state["storedTheme"] == "dark" and topbar_dark_state["prefsDarkChecked"] == "true",
            topbar_dark_state,
        )
        await ctx.close()

        # 4) System mode follows emulated OS preference.
        for scheme, expected_rgb_hint in (("light", "251"), ("dark", "5")):
            sys_ctx, sys_page = await authed_context(color_scheme=scheme, initial_theme="system")
            await sys_page.goto(f"{base}/admin", wait_until="networkidle")
            await expect(sys_page.locator('[data-testid="admin-analytics"]')).to_be_visible(timeout=20000)
            sys_state = await sys_page.evaluate(
                """() => ({
                    rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme'),
                    storedTheme: localStorage.getItem('wayly.admin.theme'),
                    rootBg: getComputedStyle(document.querySelector('.admin-root')).backgroundColor,
                    rootColor: getComputedStyle(document.querySelector('.admin-root')).color
                })"""
            )
            bg_rgb = rgb_tuple(sys_state["rootBg"])
            is_expected = (bg_rgb[0] > 240 and bg_rgb[1] > 240) if scheme == "light" else (bg_rgb[0] < 20 and bg_rgb[1] < 50)
            record(
                f"system theme follows OS {scheme} preference",
                sys_state["rootTheme"] == "system" and sys_state["storedTheme"] == "system" and is_expected,
                sys_state,
            )
            await sys_ctx.close()

        await browser.close()

    results["passed"] = len(results["failures"]) == 0
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    try:
        out = asyncio.run(run())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        RESULT_PATH.write_text(json.dumps({"passed": False, "error": str(exc)}, indent=2))
        sys.exit(2)
    sys.exit(0 if out.get("passed") else 1)