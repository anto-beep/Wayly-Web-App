import asyncio
import json
import os
import re
import shutil
import time
from pathlib import Path

import requests
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


BASE_URL = os.environ.get("WAYLY_BASE_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")
EMAIL = os.environ.get("WAYLY_TEST_EMAIL", "cathy@example.com")
PASSWORD = os.environ.get("WAYLY_TEST_PASSWORD", "testpass123")
OUT_PATH = Path("/app/test_reports/bug_verification_114_playwright_results.json")


AUTH_DASH_PATHS = [
    "/app",
    "/app/csc/stream-mix-and-iat",
    "/app/athm/projects",
    "/app/chsp/tools",
    "/app/ask-wayly",
    "/app/carer/self-assessment",
    "/app/statements",
    "/app/documents",
    "/app/reports",
    "/app/care-plans",
    "/app/wall",
]

ANON_DASH_PATHS = [
    "/ai-tools",
    "/ai-tools/invoice-checker",
    "/ai-tools/statement-decoder",
]

TOOL_SMOKE_PATHS = [
    "/ai-tools/invoice-checker",
    "/ai-tools/statement-decoder",
    "/ai-tools/budget-calculator",
    "/ai-tools/classification-self-check",
    "/ai-tools/provider-price-checker",
]


def api_login():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["token"], data.get("refresh_token"), data.get("user")


def snippet_around(text, needle):
    idx = text.find(needle)
    if idx < 0:
        return ""
    start = max(0, idx - 80)
    end = min(len(text), idx + 80)
    return text[start:end].replace("\n", " ")


async def wait_page_settled(page):
    await page.wait_for_load_state("domcontentloaded", timeout=15000)
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except PlaywrightTimeoutError:
        pass
    await page.wait_for_timeout(1800)
    await page.locator("body").wait_for(state="visible", timeout=10000)


async def collect_visible_text_check(page, path):
    await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=30000)
    await wait_page_settled(page)
    text = await page.evaluate("() => document.body ? document.body.innerText : ''")
    em = text.count("—")
    en = text.count("–")
    compiled_overlay = "Compiled with problems" in text or "Failed to compile" in text
    return {
        "path": path,
        "url": page.url,
        "text_length": len(text),
        "em_dash_count": em,
        "en_dash_count": en,
        "compiled_overlay": compiled_overlay,
        "em_dash_snippet": snippet_around(text, "—"),
        "en_dash_snippet": snippet_around(text, "–"),
    }


async def install_tokens(context, token, refresh):
    init = [
        f"localStorage.setItem('kindred_token', {json.dumps(token)});",
        "localStorage.removeItem('wayly_impersonation_token');",
    ]
    if refresh:
        init.append(f"localStorage.setItem('kindred_refresh_token', {json.dumps(refresh)});")
    await context.add_init_script("\n".join(init))


async def check_cta(page, tool_key, authed):
    path = f"/ai-tools/{tool_key}"
    await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=30000)
    await wait_page_settled(page)
    if authed:
        expected_testid = f"tool-cta-authed-{tool_key}"
        other_testid = f"tool-cta-{tool_key}"
        locator = page.get_by_test_id(expected_testid)
        await locator.wait_for(state="attached", timeout=12000)
        text = await locator.inner_text()
        btn = page.get_by_test_id(f"tool-cta-authed-btn-{tool_key}")
        href = await btn.get_attribute("href")
        other_count = await page.get_by_test_id(other_testid).count()
        return {
            "tool_key": tool_key,
            "authed": True,
            "expected_testid_found": await locator.count() > 0,
            "heading_ok": "Open This Tool In Your Wayly App" in text,
            "button_href": href,
            "button_deeplink_ok": bool(href and href.startswith("/app/")),
            "anonymous_cta_count": other_count,
            "text": re.sub(r"\s+", " ", text)[:300],
        }
    expected_testid = f"tool-cta-{tool_key}"
    other_testid = f"tool-cta-authed-{tool_key}"
    locator = page.get_by_test_id(expected_testid)
    await locator.wait_for(state="attached", timeout=12000)
    text = await locator.inner_text()
    btn = page.get_by_test_id(f"tool-cta-btn-{tool_key}")
    href = await btn.get_attribute("href")
    other_count = await page.get_by_test_id(other_testid).count()
    return {
        "tool_key": tool_key,
        "authed": False,
        "expected_testid_found": await locator.count() > 0,
        "trial_button_ok": "Start Your 7-Day Free Trial" in text,
        "button_href": href,
        "button_signup_ok": href == "/signup",
        "authed_cta_count": other_count,
        "text": re.sub(r"\s+", " ", text)[:300],
    }


async def athm_ui_and_api_check(page, token):
    headers = {"Authorization": f"Bearer {token}"}
    participants_resp = requests.get(f"{BASE_URL}/api/core/participants", headers=headers, timeout=30)
    participants_payload = {"status": participants_resp.status_code, "body": participants_resp.text[:500]}
    participants_resp.raise_for_status()
    participants = participants_resp.json().get("participants") or []
    primary = next((p for p in participants if p.get("is_primary")), participants[0] if participants else None)
    if not primary:
        raise RuntimeError("No participant available for Cathy")
    participant_id = primary["id"]

    await page.goto(f"{BASE_URL}/app/athm/projects", wait_until="domcontentloaded", timeout=30000)
    await wait_page_settled(page)
    await page.get_by_test_id("athm-projects-root").wait_for(state="visible", timeout=12000)
    await page.get_by_test_id("athm-new-project").click()
    project_title = f"Dash QA OT Referral {int(time.time())}"
    await page.get_by_test_id("athm-project-title").fill(project_title)
    await page.get_by_test_id("athm-project-need").fill("Bathroom safety referral check")
    await page.get_by_test_id("athm-project-description").fill("Created by iteration 114 focused bug verification.")
    await page.get_by_test_id("athm-project-save").click()
    card = page.locator("[data-testid^='athm-project-card-']", has_text=project_title)
    await card.wait_for(state="visible", timeout=15000)
    testid = await card.get_attribute("data-testid")
    project_id = testid.replace("athm-project-card-", "") if testid else None
    await card.click()
    section = page.get_by_test_id(f"athm-ot-referrals-{project_id}")
    upload_btn = page.get_by_test_id(f"athm-ot-referral-upload-{project_id}")
    await section.wait_for(state="visible", timeout=12000)
    await upload_btn.wait_for(state="visible", timeout=12000)

    get_resp = requests.get(f"{BASE_URL}/api/athm1/projects/{project_id}/ot-referrals", headers=headers, timeout=30)
    get_json = None
    try:
        get_json = get_resp.json()
    except Exception:
        pass
    unauth_get = requests.get(f"{BASE_URL}/api/athm1/projects/{project_id}/ot-referrals", timeout=30)
    unauth_attach = requests.post(
        f"{BASE_URL}/api/athm1/projects/{project_id}/ot-referrals/attach",
        json={"document_id": "mocked-doc-id-for-auth-check", "notes": "auth guard check"},
        timeout=30,
    )
    fake_attach = requests.post(
        f"{BASE_URL}/api/athm1/projects/{project_id}/ot-referrals/attach",
        json={"document_id": "mocked-doc-id-for-auth-check", "notes": "auth guard check"},
        headers=headers,
        timeout=30,
    )
    return {
        "participant_probe": participants_payload,
        "participant_id": participant_id,
        "project_title": project_title,
        "project_id": project_id,
        "section_visible": await section.is_visible(),
        "upload_button_visible": await upload_btn.is_visible(),
        "upload_button_text": await upload_btn.inner_text(),
        "get_status": get_resp.status_code,
        "get_body": get_json if get_json is not None else get_resp.text[:500],
        "get_has_referrals_array": isinstance(get_json, dict) and isinstance(get_json.get("referrals"), list),
        "unauth_get_status": unauth_get.status_code,
        "unauth_attach_status": unauth_attach.status_code,
        "authed_fake_attach_status": fake_attach.status_code,
        "authed_fake_attach_body": fake_attach.text[:500],
    }


async def main():
    token, refresh, user = api_login()
    results = {
        "base_url": BASE_URL,
        "login_user": user,
        "auth_dash_checks": [],
        "anon_dash_checks": [],
        "cta_checks": [],
        "tool_smoke_checks": [],
        "athm_check": None,
        "console_errors": [],
        "page_errors": [],
        "failures": [],
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            executable_path=shutil.which("chromium") or shutil.which("google-chrome"),
            args=["--no-sandbox"],
        )
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        await install_tokens(context, token, refresh)
        page = await context.new_page()
        page.on("console", lambda msg: results["console_errors"].append({"type": msg.type, "text": msg.text, "url": page.url}) if msg.type in ("error",) else None)
        page.on("pageerror", lambda exc: results["page_errors"].append({"message": str(exc), "url": page.url}))

        for path in AUTH_DASH_PATHS:
            try:
                item = await collect_visible_text_check(page, path)
            except Exception as exc:
                item = {"path": path, "error": repr(exc)}
                results["failures"].append(f"auth dash check failed for {path}: {exc!r}")
            results["auth_dash_checks"].append(item)

        for tool_key in ["invoice-checker", "statement-decoder"]:
            try:
                results["cta_checks"].append(await check_cta(page, tool_key, authed=True))
            except Exception as exc:
                results["failures"].append(f"authed CTA check failed for {tool_key}: {exc!r}")
                results["cta_checks"].append({"tool_key": tool_key, "authed": True, "error": repr(exc)})

        try:
            results["athm_check"] = await athm_ui_and_api_check(page, token)
        except Exception as exc:
            results["failures"].append(f"ATHM UI/API check failed: {exc!r}")
            results["athm_check"] = {"error": repr(exc)}

        anon_context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        anon_page = await anon_context.new_page()
        anon_page.on("console", lambda msg: results["console_errors"].append({"type": msg.type, "text": msg.text, "url": anon_page.url}) if msg.type in ("error",) else None)
        anon_page.on("pageerror", lambda exc: results["page_errors"].append({"message": str(exc), "url": anon_page.url}))
        for path in ANON_DASH_PATHS:
            try:
                item = await collect_visible_text_check(anon_page, path)
            except Exception as exc:
                item = {"path": path, "error": repr(exc)}
                results["failures"].append(f"anon dash check failed for {path}: {exc!r}")
            results["anon_dash_checks"].append(item)

        for tool_key in ["invoice-checker", "statement-decoder"]:
            try:
                results["cta_checks"].append(await check_cta(anon_page, tool_key, authed=False))
            except Exception as exc:
                results["failures"].append(f"anonymous CTA check failed for {tool_key}: {exc!r}")
                results["cta_checks"].append({"tool_key": tool_key, "authed": False, "error": repr(exc)})

        for path in TOOL_SMOKE_PATHS:
            try:
                item = await collect_visible_text_check(anon_page, path)
                item["render_ok"] = not item.get("compiled_overlay") and "error" not in item
            except Exception as exc:
                item = {"path": path, "render_ok": False, "error": repr(exc)}
                results["failures"].append(f"tool smoke failed for {path}: {exc!r}")
            results["tool_smoke_checks"].append(item)
        await anon_context.close()
        await context.close()
        await browser.close()

    # Summarise deterministic pass/fail flags.
    all_dash_checks = results["auth_dash_checks"] + results["anon_dash_checks"]
    results["dash_failure_pages"] = [
        c for c in all_dash_checks
        if c.get("em_dash_count", 0) or c.get("en_dash_count", 0) or c.get("compiled_overlay") or c.get("error")
    ]
    results["cta_failures"] = [
        c for c in results["cta_checks"]
        if c.get("error")
        or (c.get("authed") and not (c.get("expected_testid_found") and c.get("heading_ok") and c.get("button_deeplink_ok")))
        or ((not c.get("authed")) and not (c.get("expected_testid_found") and c.get("trial_button_ok") and c.get("button_signup_ok")))
    ]
    athm = results.get("athm_check") or {}
    results["athm_failure"] = bool(
        athm.get("error")
        or not athm.get("section_visible")
        or not athm.get("upload_button_visible")
        or not athm.get("get_has_referrals_array")
        or athm.get("get_status") != 200
        or athm.get("unauth_get_status") not in (401, 403)
        or athm.get("unauth_attach_status") not in (401, 403)
        or athm.get("authed_fake_attach_status") != 404
    )
    results["tool_smoke_failures"] = [c for c in results["tool_smoke_checks"] if not c.get("render_ok")]
    OUT_PATH.write_text(json.dumps(results, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(results, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())