#!/usr/bin/env python3
"""Log into the Wayly web app and capture labelled screenshots of every tool
and app ('backend') screen, two views each (above-the-fold + full page).
Outputs labelled PNGs + a contact sheet under /app/ads_build/screens/."""
import os, csv, traceback
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

BASE = "https://statement-renderer.preview.emergentagent.com"
EMAIL, PW = "cathy@example.com", "testpass123"
OUT = "/app/ads_build/screens"
RAW = os.path.join(OUT, "raw")
LAB = os.path.join(OUT, "labelled")
FONT_DIR = "/app/ads_build/fonts"
for d in (RAW, LAB):
    os.makedirs(d, exist_ok=True)

TEAL = (14, 77, 82)
CLAY = (168, 84, 45)

TOOLS = [
    ("ai_tools_index", "/ai-tools", "AI Tools index"),
    ("statement_decoder", "/ai-tools/statement-decoder", "Statement Decoder"),
    ("invoice_checker", "/ai-tools/invoice-checker", "Invoice Checker"),
    ("contribution_estimator", "/ai-tools/contribution-estimator", "Contribution Estimator"),
    ("classification_self_check", "/ai-tools/classification-self-check", "Classification Self-Check"),
    ("provider_price_checker", "/ai-tools/provider-price-checker", "Provider Price Checker"),
    ("support_plan_reviewer", "/ai-tools/support-plan-reviewer", "Support Plan Reviewer"),
    ("letters_follow_ups", "/ai-tools/letters-and-follow-ups", "Letters and Follow-ups"),
    ("budget_calculator", "/ai-tools/budget-calculator", "Budget Calculator"),
    ("family_coordinator", "/ai-tools/family-coordinator", "Family Coordinator"),
]
APP = [
    ("dashboard", "/app", "Dashboard"),
    ("statements", "/app/statements", "Statements"),
    ("invoices", "/app/invoices", "Invoices"),
    ("care_plans", "/app/care-plans", "Care Plans"),
    ("documents", "/app/documents", "Document Vault"),
    ("calendar", "/app/calendar", "Visit Calendar"),
    ("budget_alerts", "/app/budget-alerts", "Budget Alerts"),
    ("at_hm", "/app/at-hm", "AT-HM Tracker"),
    ("reports", "/app/reports", "Reports"),
    ("ask_wayly", "/app/ask-wayly", "Ask Wayly"),
    ("family_wall", "/app/wall", "Family Wall"),
    ("audit_log", "/app/audit", "Audit Log"),
    ("settings", "/settings", "Settings"),
    ("support", "/support", "My Support"),
]


def label_image(src, dst, title, group, view):
    im = Image.open(src).convert("RGB")
    W = im.width
    barh = max(72, int(W / 26))
    pad = int(barh * 0.3)
    canvas = Image.new("RGB", (W, im.height + barh), TEAL)
    canvas.paste(im, (0, barh))
    d = ImageDraw.Draw(canvas)
    tf = ImageFont.truetype(os.path.join(FONT_DIR, "Fraunces.ttf"), int(barh * 0.46))
    try:
        tf.set_variation_by_axes([144, 560, 0, 0])
    except Exception:
        pass
    mf = ImageFont.truetype(os.path.join(FONT_DIR, "IBMPlexMono.ttf"), int(barh * 0.3))
    d.text((pad, int(barh * 0.22)), f"Wayly  ·  {title}", font=tf, fill=(255, 255, 255))
    tag = f"{group.upper()}   {view}"
    tw = d.textlength(tag, font=mf)
    d.text((W - tw - pad, int(barh * 0.34)), tag, font=mf, fill=(230, 210, 190))
    canvas.save(dst, "PNG", optimize=True)


def main():
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        # login
        page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=45000)
        page.fill("[data-testid='login-email-input']", EMAIL)
        page.fill("[data-testid='login-password-input']", PW)
        page.click("[data-testid='login-submit-button']")
        try:
            page.wait_for_url("**/app**", timeout=30000)
        except Exception:
            page.wait_for_timeout(6000)
        print("LOGIN url=", page.url, "token=", bool(page.evaluate("() => localStorage.getItem('kindred_token')")), flush=True)
        # hide the app-install promo banner for cleaner shots (best effort)
        try:
            page.add_style_tag(content="[data-testid='app-install-banner'],#app-install-banner{display:none!important}")
        except Exception:
            pass

        def capture(group, slug, path, title):
            l1 = os.path.join(LAB, f"wayly_{group}_{slug}_01_top.png")
            l2 = os.path.join(LAB, f"wayly_{group}_{slug}_02_full.png")
            if os.path.exists(l1) and os.path.exists(l2):
                rows.append({"file": os.path.basename(l1), "group": group, "screen": title, "view": "above the fold", "path": path})
                rows.append({"file": os.path.basename(l2), "group": group, "screen": title, "view": "full page", "path": path})
                print("SKIP", group, slug, flush=True)
                return
            url = BASE + path
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
            except Exception as e:
                print("GOTO-ERR", slug, repr(e), flush=True)
            page.wait_for_timeout(4200)
            try:
                page.evaluate("() => window.scrollTo(0,0)")
            except Exception:
                pass
            page.wait_for_timeout(300)
            r1 = os.path.join(RAW, f"wayly_{group}_{slug}_01_top.png")
            r2 = os.path.join(RAW, f"wayly_{group}_{slug}_02_full.png")
            page.screenshot(path=r1, full_page=False)
            try:
                page.screenshot(path=r2, full_page=True)
            except Exception as e:
                print("FULL-ERR", slug, repr(e), flush=True)
                r2 = r1
            label_image(r1, l1, title, group, "above the fold")
            label_image(r2, l2, title, group, "full page")
            rows.append({"file": os.path.basename(l1), "group": group, "screen": title, "view": "above the fold", "path": path})
            rows.append({"file": os.path.basename(l2), "group": group, "screen": title, "view": "full page", "path": path})
            print("OK", group, slug, flush=True)

        for slug, path, title in TOOLS:
            capture("tool", slug, path, title)
        for slug, path, title in APP:
            capture("app", slug, path, title)
        browser.close()

    with open(os.path.join(OUT, "index.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "group", "screen", "view", "path"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print("CAPTURED", len(rows), "images", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
