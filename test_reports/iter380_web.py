"""Iteration 380 - Wayly SEO/AEO build verification (web only)."""
import json

RESULTS = {}

async def _goto(page, path, wait="networkidle"):
    url = f"https://statement-renderer.preview.emergentagent.com{path}"
    await page.goto(url, wait_until=wait, timeout=45000)
    await page.wait_for_timeout(400)

# capture console errors
console_errors = []
page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

await page.set_viewport_size({"width": 1366, "height": 900})

# ---- 1) Templates index ----
try:
    await _goto(page, "/resources/templates")
    await page.wait_for_selector('[data-testid="templates-result-count"]', timeout=15000)
    all_count = (await page.text_content('[data-testid="templates-result-count"]')).strip()
    cards_all = await page.locator('[data-testid^="template-"]').count()
    RESULTS["templates_index_initial_count_text"] = all_count
    RESULTS["templates_index_initial_cards"] = cards_all

    # cluster chips
    chips = {}
    for cid in ["all", "money", "assessment", "complaints", "changing", "family"]:
        sel = f'[data-testid="templates-cluster-{cid}"]'
        exists = await page.locator(sel).count()
        chips[cid] = exists
    RESULTS["templates_cluster_chips_present"] = chips

    # Click Complaints -> expect 3
    await page.click('[data-testid="templates-cluster-complaints"]', force=True)
    await page.wait_for_timeout(400)
    complaints_text = (await page.text_content('[data-testid="templates-result-count"]')).strip()
    cards_complaints = await page.locator('[data-testid^="template-"]').count()
    RESULTS["templates_cluster_complaints"] = {"count_text": complaints_text, "cards": cards_complaints}

    # Reset to All
    await page.click('[data-testid="templates-cluster-all"]', force=True)
    await page.wait_for_timeout(300)

    # Search 'refund' -> expect 1
    await page.fill('[data-testid="templates-search"]', "refund")
    await page.wait_for_timeout(500)
    search_text = (await page.text_content('[data-testid="templates-result-count"]')).strip()
    cards_search = await page.locator('[data-testid^="template-"]').count()
    RESULTS["templates_search_refund"] = {"count_text": search_text, "cards": cards_search}

    # empty state - search gibberish
    await page.fill('[data-testid="templates-search"]', "zzzqqqnoresult")
    await page.wait_for_timeout(400)
    empty_cards = await page.locator('[data-testid^="template-"]').count()
    body = await page.text_content("body")
    RESULTS["templates_search_empty"] = {"cards": empty_cards, "has_empty_text": any(k in body.lower() for k in ["no templates","no results","no match","nothing found"])}
    # clear
    await page.fill('[data-testid="templates-search"]', "")
    await page.wait_for_timeout(300)
    after_clear = await page.locator('[data-testid^="template-"]').count()
    RESULTS["templates_after_clear_cards"] = after_clear
except Exception as e:
    RESULTS["templates_index_error"] = str(e)

# ---- 2) Loop all 20 template detail pages ----
SLUGS = [
    "support-at-home-statement-query-letter","rate-query-letter","aged-care-invoice-dispute-letter",
    "aged-care-overcharge-refund-request","care-management-fee-query","personal-care-contribution-check-letter",
    "request-service-records-visit-logs","aged-care-financial-hardship-application","services-australia-contribution-query",
    "final-statement-and-unspent-funds-request","my-aged-care-reassessment-request","gp-letter-request-for-aged-care-reassessment",
    "care-plan-review-questions","aged-care-complaint-letter-to-provider","aged-care-quality-and-safety-commission-commission-complaint",
    "opan-aged-care-advocate-call-sheet","switching-support-at-home-providers-checklist","registered-supporter-checklist",
    "aged-care-family-meeting-agenda","advance-care-planning-conversation-guide"
]
# fix typo in constant
SLUGS[14] = "aged-care-quality-and-safety-commission-complaint"
template_results = {}
for slug in SLUGS:
    r = {"slug": slug}
    try:
        await _goto(page, f"/resources/templates/{slug}", wait="domcontentloaded")
        await page.wait_for_timeout(600)
        h1 = await page.locator("h1").first.text_content()
        r["h1"] = (h1 or "").strip()
        r["copy_btn"] = await page.locator('[data-testid="template-copy-btn"]').count() > 0
        r["docx_btn"] = await page.locator('[data-testid="template-docx-btn"]').count() > 0
        r["faq"] = await page.locator('[data-testid="template-faq"]').count() > 0
        r["escalation"] = await page.locator('[data-testid="template-escalation"]').count() > 0
        r["tool_cta"] = await page.locator('[data-testid="template-tool-cta"]').count() > 0
        bc = await page.locator('nav[aria-label*="readcrumb"], nav.breadcrumb, [class*="readcrumb"]').count()
        r["breadcrumbs"] = bc > 0
        text = (await page.text_content("body") or "").lower()
        r["has_last_checked"] = "last checked" in text or "last reviewed" in text or "last updated" in text
    except Exception as e:
        r["error"] = str(e)
    template_results[slug] = r
RESULTS["template_detail_results"] = template_results

# ---- 3) Care Plan Review template content ----
try:
    await _goto(page, "/resources/templates/care-plan-review-questions", wait="domcontentloaded")
    await page.wait_for_timeout(500)
    h1 = (await page.locator("h1").first.text_content() or "").strip()
    body_text = (await page.text_content("body") or "").lower()
    RESULTS["care_plan_review"] = {
        "h1": h1,
        "h1_is_checklist_title": "care plan review question checklist" in h1.lower(),
        "contains_12_questions": "12 questions" in body_text or "twelve questions" in body_text or "12 most important" in body_text,
    }
except Exception as e:
    RESULTS["care_plan_review_error"] = str(e)

# ---- 4) Articles index filter/sort/search ----
try:
    await _goto(page, "/resources/articles")
    await page.wait_for_selector('[data-testid="articles-result-count"]', timeout=15000)
    initial_count_text = (await page.text_content('[data-testid="articles-result-count"]')).strip()
    initial_cards = await page.locator('[data-testid^="articles-card-"]').count()
    RESULTS["articles_initial"] = {"count_text": initial_count_text, "cards": initial_cards}
    # sort chip exists
    RESULTS["articles_sort_present"] = await page.locator('[data-testid="articles-sort"]').count() > 0
    # search 'complain' -> expect 1 (main agent smoke test)
    await page.fill('[data-testid="articles-search"]', "complain")
    await page.wait_for_timeout(500)
    search_count = (await page.text_content('[data-testid="articles-result-count"]')).strip()
    search_cards = await page.locator('[data-testid^="articles-card-"]').count()
    RESULTS["articles_search_complain"] = {"count_text": search_count, "cards": search_cards}
    await page.fill('[data-testid="articles-search"]', "")
    await page.wait_for_timeout(300)
    # look for new article slugs on page
    page_html = await page.content()
    RESULTS["articles_slug_hits"] = {
        "complaints_article": "how-to-complain-about-aged-care-commission" in page_html,
        "athm_article": "at-hm-scheme-assistive-technology-home-modifications" in page_html,
    }
    # try sort flip
    try:
        await page.click('[data-testid="articles-sort"]', force=True)
        await page.wait_for_timeout(400)
        RESULTS["articles_sort_clicked"] = True
    except Exception as e:
        RESULTS["articles_sort_click_err"] = str(e)
except Exception as e:
    RESULTS["articles_index_error"] = str(e)

# ---- 5) New article: how-to-complain-about-aged-care-commission ----
try:
    await _goto(page, "/resources/articles/how-to-complain-about-aged-care-commission", wait="domcontentloaded")
    await page.wait_for_timeout(600)
    h1 = (await page.locator("h1").first.text_content() or "").strip()
    body_text = await page.text_content("body") or ""
    page_html = await page.content()
    RESULTS["article_complaints"] = {
        "h1": h1[:120],
        "has_toc": "contents" in body_text.lower() or "table of contents" in body_text.lower() or await page.locator('[class*="toc"], nav[aria-label*="contents"]').count() > 0,
        "has_faq_accordion": await page.locator('button[aria-expanded], details, [class*="accordion"]').count() > 0,
        "link_to_templates": "/resources/templates/" in page_html,
        "link_to_invoice_checker": "/ai-tools/invoice-checker" in page_html,
        "body_len": len(body_text),
    }
except Exception as e:
    RESULTS["article_complaints_error"] = str(e)

# ---- 6) New article: AT-HM scheme ----
try:
    await _goto(page, "/resources/articles/at-hm-scheme-assistive-technology-home-modifications", wait="domcontentloaded")
    await page.wait_for_timeout(600)
    h1 = (await page.locator("h1").first.text_content() or "").strip()
    body_text = await page.text_content("body") or ""
    page_html = await page.content()
    RESULTS["article_athm"] = {
        "h1": h1[:120],
        "has_table": "<table" in page_html.lower(),
        "mentions_tiers": any(k in body_text.lower() for k in ["low","medium","high","$500","$2,000","$15,000"]),
        "has_faq": await page.locator('button[aria-expanded], details, [class*="accordion"]').count() > 0,
        "body_len": len(body_text),
    }
except Exception as e:
    RESULTS["article_athm_error"] = str(e)

# ---- 7) CHSP routes ----
try:
    await _goto(page, "/chsp/extension-2029", wait="domcontentloaded")
    await page.wait_for_timeout(600)
    ext_text = (await page.text_content("body") or "").lower()
    RESULTS["chsp_extension_2029"] = {
        "mentions_2029": "2029" in ext_text,
        "mentions_30_june": "30 june 2029" in ext_text or "30/06/2029" in ext_text,
        "mentions_standalone": "standalone" in ext_text or "not merging" in ext_text or "not merge" in ext_text,
    }
    await _goto(page, "/chsp/transition-2027", wait="domcontentloaded")
    await page.wait_for_timeout(1200)
    final_url = page.url
    RESULTS["chsp_transition_redirect"] = {
        "final_url": final_url,
        "redirects_to_extension_2029": "extension-2029" in final_url,
    }
except Exception as e:
    RESULTS["chsp_error"] = str(e)

# ---- 8) Organization JSON-LD check (any public page) ----
try:
    await _goto(page, "/", wait="domcontentloaded")
    await page.wait_for_timeout(800)
    html = await page.content()
    org_hits = {
        "has_organization": '"@type":"Organization"' in html or '"@type": "Organization"' in html,
        "legal_name": "Wayly Pty Ltd" in html,
        "has_slogan": '"slogan"' in html,
        "has_areaServed": '"areaServed"' in html,
    }
    RESULTS["organization_jsonld"] = org_hits
except Exception as e:
    RESULTS["organization_error"] = str(e)

RESULTS["console_errors_sample"] = console_errors[:15]
RESULTS["console_errors_count"] = len(console_errors)

print("====== RESULTS JSON ======")
print(json.dumps(RESULTS, indent=2, default=str))
print("====== END ======")
