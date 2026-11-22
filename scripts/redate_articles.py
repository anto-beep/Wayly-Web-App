import re

PDF = "/app/frontend/src/data/pdfArticles2026.js"
SEO = "/app/frontend/src/data/seoArticles2026.js"

# slug -> real date (<= today 2026-11-19). Batch 5 newest, prior overrides pushed below.
DATES = {
    # Batch 5 (newest)
    "at-hm-scheme-assistive-technology-home-modifications": "2026-11-19",
    "support-at-home-no-worse-off": "2026-11-18",
    "chsp-extension-2029-what-it-means": "2026-11-18",
    "support-at-home-personal-care-free-1-october-2026": "2026-11-17",
    "support-at-home-personal-care-free-october-2026": "2026-11-17",
    "support-at-home-costs-and-contributions": "2026-11-16",
    "home-care-package-vs-support-at-home": "2026-11-15",
    "support-at-home-vs-home-care-packages-what-changed": "2026-11-14",
    "switching-support-at-home-provider-practical-playbook": "2026-11-13",
    "wayly-statement-decoder-support-at-home-statement-explained": "2026-11-12",
    "wayly-reassessment-letter-generator-support-at-home-reassessment": "2026-11-11",
    "wayly-care-plan-reviewer-support-at-home-care-plan": "2026-11-10",
    "wayly-family-coordinator-managing-parents-aged-care": "2026-11-09",
    # Prior overrides pushed below Batch 5 (were future 11-17..11-22)
    "wayly-contribution-estimator-support-at-home-fees": "2026-11-08",
    "when-to-request-support-at-home-reassessment": "2026-11-08",
    "wayly-budget-calculator-support-at-home-quarterly-budget": "2026-11-08",
    "wayly-provider-price-checker-support-at-home-prices": "2026-11-07",
    "wayly-classification-self-check-support-at-home-levels": "2026-11-07",
    "home-care-package-levels-support-at-home-classifications": "2026-11-07",
    "will-i-pay-more-under-support-at-home-than-home-care-package": "2026-11-06",
    "how-to-switch-support-at-home-provider": "2026-11-06",
}

SEO_DATES = {
    "support-at-home-financial-hardship-assistance": "2026-11-05",
}

def apply(path, mapping):
    with open(path) as f:
        text = f.text if hasattr(f, "text") else f.read()
    for slug, date in mapping.items():
        idx = text.find('slug: "%s"' % slug)
        if idx == -1:
            print("MISSING slug:", slug); continue
        # window = this object up to next "slug:" or 1500 chars
        nxt = text.find('slug: "', idx + 10)
        end = nxt if nxt != -1 else len(text)
        seg = text[idx:end]
        seg2 = re.sub(r'published_at: "\d{4}-\d{2}-\d{2}"', 'published_at: "%s"' % date, seg, count=1)
        seg2 = re.sub(r'updated_at: "\d{4}-\d{2}-\d{2}"', 'updated_at: "%s"' % date, seg2, count=1)
        text = text[:idx] + seg2 + text[end:]
    with open(path, "w") as f:
        f.write(text)
    print("updated", path, "with", len(mapping), "slugs")

apply(PDF, DATES)
apply(SEO, SEO_DATES)
