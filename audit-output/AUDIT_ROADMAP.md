# Wayly — SEO/AEO/A11y/Perf Audit Roadmap

Active engagement initiated Feb 2026.

## Decisions locked (user-confirmed)
- **Audit scope:** production https://wayly.com.au for accuracy, fixes ship via preview → redeploy
- **Stack:** stay on CRA + react-helmet-async + FastAPI (no Next.js migration)
- **Phase 4 cadence:** publish all 16 new pages as-is (no per-page approval gate)
- **PostHog:** leave on every public page for now (revisit later)
- **Lighthouse CI:** GitHub Action posting scores on push, not blocking
- **Author byline:** plain text "Antony Chiware", no link, no credential line
- **Reviewer placeholder:** literal string "To be confirmed" until user names someone
- **Correction email:** hello@wayly.com.au (monitored)
- **Review cadence:** quarterly (1 Jan / 1 Apr / 1 Jul / 1 Oct) + on material policy change
- **Pricing schema:** $0 / $19 / $39 / $299 AUD/mo (Free / Solo / Family / Adviser) — confirmed current
- **Phase 4 scope:** levels hub + 8 level pages + FAQ + Ask Wayly + 4 problem guides + /about = 16 pages
- **Phase 6:** any colour/copy/visual change requires user approval first
- **Phase 7:** chase mobile Performance 80+ via code-split + image/font/script work

## Phase 0 baseline (Feb 4, 2026 against wayly.com.au production)

- 38 URLs in sitemap, all return 200
- **13 pages serving broken meta** (default index.html title): 7 tool pages + 6 legal pages
- **24 pages missing all JSON-LD schema**
- **0/8 sampled URLs pass mobile Performance 80+ target** (range 53-60; LCP 5.7-6.6s)
- **127 axe violations** across 12 pages, dominated by `dlitem` (72 nodes, Glossary) + `color-contrast` (38 nodes, 11 pages) + `nested-interactive` (15 nodes, 11 pages)
- 2 broken external links (legacy Kindred app store IDs)
- Accessibility 91-99 ✅ (close to 95 target), CLS ~0 ✅, image alt coverage 100% ✅, theme-color present ✅
- Full report: `/app/audit-output/baseline-report.md`

## Phase 1+2+3 shipped (Feb 4, 2026)

- SeoHead wired into 7 tool pages (was only in `loading` branch) + LegalPage shared layout → 13 broken pages now serve correct meta
- Org + WebSite SearchAction schemas hoisted into SeoHead so every page emits them
- /pricing Product + 4 Offer schemas added
- Article byline (Antony Chiware) + "Reviewed by: To be confirmed" + Published/Updated dates + trust footer rendered on all 11 articles
- published_at/updated_at/author added to 8 SEO tool articles
- 2 broken Kindred store links replaced with "Coming soon" non-link badges
- **React.lazy() code-split applied to ~80 routes**, main bundle 1.8 MB → 596 KB, Suspense fallback wired
- Glossary `dlitem` a11y fix (72 nodes eliminated)
- Full report: `/app/audit-output/phase-1-2-3-report.md`

## Awaiting user action
**Redeploy preview → production**, then re-baseline Lighthouse against wayly.com.au to confirm:
- mobile Performance ≥ 80 (predicted 78-85)
- LCP ≤ 2.5s (predicted ~2.0-2.5s)
- All 13 previously-broken pages now have title/canonical/og:locale/og:image

## Phases 4-9 remaining
- **Phase 4:** 16 new pages — `/support-at-home-levels` + level-1 through level-8 + `/faq` + `/ask-wayly` + 4 problem guides + `/about`
- **Phase 5:** internal link hub-and-spoke audit (8 tool pages ↔ 8 tool articles cross-links, Related Guides section, link Phase 4 pages into pillars)
- **Phase 6:** full a11y sweep — colour-contrast palette fixes (requires user approval), nested-interactive, label, aria-required-children, WCAG 2.1 AA across all routes
- **Phase 7:** image/font/script audit beyond code-split — image WebP/AVIF, font-display swap + subset, defer 3p scripts, preconnect critical origins, lazy below-fold images, Lighthouse CI GitHub Action
- **Phase 8:** full broken-link sweep, redirect chain audit, custom 404/500 verification
- **Phase 9:** confirm Plausible / Google Search Console / Bing Webmaster Tools setup, goal-tracking events for trial-start / signup / upgrade / free-decode-used
