#!/usr/bin/env python3
"""Focused verification for admin theme bug (iteration 84).

User bug under test:
  - Admin system must default to LIGHT, not dark.
  - Admin login must render light.
  - /admin/preferences theme controls and top-bar L/S/D controls must stay
    synchronized while both are mounted.
  - Theme persists across reload.
  - Dark-mode admin H1/stat-label contrast remains high.

This script creates a short-lived admin JWT/session directly in the preview DB so
the UI can be tested without consuming MFA codes or mutating admin 2FA setup.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


APP_DIR = Path("/app")
BACKEND_ENV = APP_DIR / "backend" / ".env"
FRONTEND_ENV = APP_DIR / "frontend" / ".env"
RESULT_PATH = APP_DIR / "test_reports" / "admin_theme_bug_iter84_results.json"


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
    return parse_env(FRONTEND_ENV).get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")


def create_admin_token() -> tuple[str, str]:
    import jwt  # type: ignore
    from pymongo import MongoClient  # type: ignore

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

    sid = f"theme-test-iter84-{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    db.admin_sessions.insert_one(
        {
            "id": sid,
            "user_id": user["id"],
            "ip": "127.0.0.1",
            "ua": "admin-theme-bug-verification-iter84",
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


async def admin_state(page) -> dict:
    return await page.evaluate(
        """() => {
            const root = document.querySelector('.admin-root');
            const rootStyle = root ? getComputedStyle(root) : null;
            const get = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) ?? null;
            return {
              url: location.href,
              rootTheme: root?.getAttribute('data-theme') ?? null,
              storedTheme: localStorage.getItem('wayly.admin.theme'),
              rootBg: rootStyle?.backgroundColor ?? null,
              rootColor: rootStyle?.color ?? null,
              topbarLightPressed: get('[data-testid="admin-theme-light"]', 'aria-pressed'),
              topbarSystemPressed: get('[data-testid="admin-theme-system"]', 'aria-pressed'),
              topbarDarkPressed: get('[data-testid="admin-theme-dark"]', 'aria-pressed'),
              prefsLightChecked: get('[data-testid="prefs-theme-light"]', 'aria-checked'),
              prefsSystemChecked: get('[data-testid="prefs-theme-system"]', 'aria-checked'),
              prefsDarkChecked: get('[data-testid="prefs-theme-dark"]', 'aria-checked'),
              activeThemeText: Array.from(document.querySelectorAll('.admin-info-grid .row'))
                .map(r => r.textContent.trim()).find(t => t.startsWith('Active theme')) || null,
            };
        }"""
    )


async def style_for(page, selector: str, bg_selector: str | None = None) -> dict:
    return await page.evaluate(
        """({ selector, bgSelector }) => {
            const el = document.querySelector(selector);
            const bgEl = bgSelector ? document.querySelector(bgSelector) : el;
            if (!el || !bgEl) return null;
            const cs = getComputedStyle(el);
            const bcs = getComputedStyle(bgEl);
            return {
              selector,
              bgSelector,
              text: el.textContent.trim(),
              color: cs.color,
              backgroundColor: bcs.backgroundColor,
              rootTheme: document.querySelector('.admin-root')?.getAttribute('data-theme') ?? null,
            };
        }""",
        {"selector": selector, "bgSelector": bg_selector},
    )


async def run() -> dict:
    from playwright.async_api import async_playwright, expect  # type: ignore

    base = app_url()
    token, admin_email = create_admin_token()
    results = {
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
        browser = await p.chromium.launch(headless=True, executable_path="/root/bin/chromium", args=["--no-sandbox"])

        # Login page must render light regardless of stored/admin auth state.
        login_ctx = await browser.new_context(viewport={"width": 1920, "height": 1080}, color_scheme="dark")
        login_page = await login_ctx.new_page()
        login_page.on("console", lambda msg: results["console_errors"].append(msg.text) if msg.type == "error" else None)
        await login_page.goto(f"{base}/admin/login", wait_until="networkidle")
        await expect(login_page.locator('[data-testid="admin-login-form"]')).to_be_visible(timeout=20000)
        login = await admin_state(login_page)
        login_ratio = contrast(login["rootColor"], login["rootBg"])
        record(
            "admin login renders light theme",
            login["rootTheme"] == "light" and rgb_tuple(login["rootBg"])[0] > 240 and login_ratio >= 7,
            {**login, "root_contrast": round(login_ratio, 2)},
        )
        await login_ctx.close()

        async def authed_context(color_scheme: str = "dark", initial_theme: str | None = None):
            ctx = await browser.new_context(viewport={"width": 1920, "height": 1080}, color_scheme=color_scheme)
            theme_line = (
                f"localStorage.setItem('wayly.admin.theme', {json.dumps(initial_theme)});"
                if initial_theme is not None
                else ""
            )
            await ctx.add_init_script(
                f"""
                localStorage.setItem('wayly_admin_token', {json.dumps(token)});
                {theme_line}
                """
            )
            page = await ctx.new_page()
            page.on("console", lambda msg: results["console_errors"].append(msg.text) if msg.type == "error" else None)
            return ctx, page

        # First-visit authenticated admin URL with no wayly.admin.theme must default to light.
        fresh_ctx, fresh_page = await authed_context(color_scheme="dark", initial_theme=None)
        await fresh_page.goto(f"{base}/admin", wait_until="networkidle")
        await expect(fresh_page.locator('[data-testid="admin-analytics"]')).to_be_visible(timeout=25000)
        fresh = await admin_state(fresh_page)
        fresh_ratio = contrast(fresh["rootColor"], fresh["rootBg"])
        record(
            "first authenticated admin visit defaults to light when localStorage theme is absent",
            fresh["rootTheme"] == "light" and fresh["storedTheme"] is None and rgb_tuple(fresh["rootBg"])[0] > 240 and fresh["topbarLightPressed"] == "true" and fresh_ratio >= 7,
            {**fresh, "root_contrast": round(fresh_ratio, 2)},
        )

        # Open Preferences and verify bidirectional sync while top-bar and prefs are both mounted.
        await fresh_page.goto(f"{base}/admin/preferences", wait_until="networkidle")
        await expect(fresh_page.locator('[data-testid="admin-preferences-page"]')).to_be_visible(timeout=25000)
        start = await admin_state(fresh_page)
        record(
            "preferences page exists with both theme controls visible",
            start["topbarLightPressed"] is not None and start["prefsLightChecked"] is not None,
            start,
        )

        # Repro A: Preferences -> top bar sync.
        await fresh_page.locator('[data-testid="prefs-theme-dark"]').click()
        await fresh_page.wait_for_timeout(350)
        pref_dark = await admin_state(fresh_page)
        record(
            "repro A prefs dark updates top-bar dark immediately",
            pref_dark["rootTheme"] == "dark" and pref_dark["storedTheme"] == "dark" and pref_dark["prefsDarkChecked"] == "true" and pref_dark["topbarDarkPressed"] == "true",
            pref_dark,
        )
        await fresh_page.locator('[data-testid="prefs-theme-light"]').click()
        await fresh_page.wait_for_timeout(350)
        pref_light = await admin_state(fresh_page)
        record(
            "repro A prefs light updates top-bar light immediately",
            pref_light["rootTheme"] == "light" and pref_light["storedTheme"] == "light" and pref_light["prefsLightChecked"] == "true" and pref_light["topbarLightPressed"] == "true",
            pref_light,
        )

        # Repro B: Top bar -> Preferences sync.
        await fresh_page.locator('[data-testid="admin-theme-dark"]').click()
        await fresh_page.wait_for_timeout(350)
        top_dark = await admin_state(fresh_page)
        record(
            "repro B top-bar dark updates prefs dark immediately",
            top_dark["rootTheme"] == "dark" and top_dark["storedTheme"] == "dark" and top_dark["topbarDarkPressed"] == "true" and top_dark["prefsDarkChecked"] == "true",
            top_dark,
        )
        await fresh_page.locator('[data-testid="admin-theme-light"]').click()
        await fresh_page.wait_for_timeout(350)
        top_light = await admin_state(fresh_page)
        record(
            "repro B top-bar light updates prefs light immediately",
            top_light["rootTheme"] == "light" and top_light["storedTheme"] == "light" and top_light["topbarLightPressed"] == "true" and top_light["prefsLightChecked"] == "true",
            top_light,
        )

        # Include the middle "System" segment in the same mounted-control sync check.
        await fresh_page.locator('[data-testid="prefs-theme-system"]').click()
        await fresh_page.wait_for_timeout(350)
        pref_system = await admin_state(fresh_page)
        record(
            "prefs system updates top-bar system immediately",
            pref_system["rootTheme"] == "system" and pref_system["storedTheme"] == "system" and pref_system["prefsSystemChecked"] == "true" and pref_system["topbarSystemPressed"] == "true",
            pref_system,
        )
        await fresh_page.locator('[data-testid="admin-theme-light"]').click()
        await fresh_page.wait_for_timeout(200)
        await fresh_page.locator('[data-testid="admin-theme-system"]').click()
        await fresh_page.wait_for_timeout(350)
        top_system = await admin_state(fresh_page)
        record(
            "top-bar system updates prefs system immediately",
            top_system["rootTheme"] == "system" and top_system["storedTheme"] == "system" and top_system["topbarSystemPressed"] == "true" and top_system["prefsSystemChecked"] == "true",
            top_system,
        )

        # Persist after full page reload.
        await fresh_page.locator('[data-testid="admin-theme-dark"]').click()
        await fresh_page.wait_for_timeout(200)
        await fresh_page.reload(wait_until="networkidle")
        await expect(fresh_page.locator('[data-testid="admin-preferences-page"]')).to_be_visible(timeout=25000)
        reload_dark = await admin_state(fresh_page)
        record(
            "theme choice persists after full reload",
            reload_dark["rootTheme"] == "dark" and reload_dark["storedTheme"] == "dark" and reload_dark["topbarDarkPressed"] == "true" and reload_dark["prefsDarkChecked"] == "true",
            reload_dark,
        )
        await fresh_ctx.close()

        # Dark-mode contrast on Overview and Feature Flags with stored dark mode.
        dark_ctx, dark_page = await authed_context(color_scheme="dark", initial_theme="dark")
        await dark_page.goto(f"{base}/admin", wait_until="networkidle")
        await expect(dark_page.locator('[data-testid="admin-analytics"]')).to_be_visible(timeout=25000)
        overview_h1 = await style_for(dark_page, "h1", ".admin-root")
        total_label = await style_for(dark_page, '[data-testid="card-total-users"] .admin-stat-label', '[data-testid="card-total-users"]')
        mrr_label = await style_for(dark_page, '[data-testid="card-mrr"] .admin-stat-label', '[data-testid="card-mrr"]')
        overview_ratios = {
            "h1": round(contrast(overview_h1["color"], overview_h1["backgroundColor"]), 2),
            "total_users_label": round(contrast(total_label["color"], total_label["backgroundColor"]), 2),
            "mrr_label": round(contrast(mrr_label["color"], mrr_label["backgroundColor"]), 2),
        }
        record(
            "dark overview h1 and stat labels meet requested contrast",
            overview_h1["rootTheme"] == "dark" and overview_ratios["h1"] >= 7 and overview_ratios["total_users_label"] >= 4.5 and overview_ratios["mrr_label"] >= 4.5,
            {"overview_h1": overview_h1, "total_label": total_label, "mrr_label": mrr_label, "ratios": overview_ratios},
        )

        await dark_page.goto(f"{base}/admin/feature-flags", wait_until="networkidle")
        await expect(dark_page.locator('[data-testid="admin-feature-flags"]')).to_be_visible(timeout=25000)
        ff_h1 = await style_for(dark_page, "h1", ".admin-root")
        ff_ratio = round(contrast(ff_h1["color"], ff_h1["backgroundColor"]), 2)
        record(
            "dark feature flags h1 meets requested contrast",
            ff_h1["rootTheme"] == "dark" and ff_ratio >= 7,
            {"feature_flags_h1": ff_h1, "contrast": ff_ratio},
        )
        await dark_ctx.close()

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