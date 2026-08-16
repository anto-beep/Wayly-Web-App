# Wayly — Phase 1+2+3+7 (partial) Implementation Report

Generated after Phase 0 baseline. Production not yet redeployed — changes live in preview only.

## ✅ Phase 1: Technical SEO foundations

| Change | Files | Impact |
| --- | --- | --- |
| Wire `<SeoHead>` into all 7 tool routes (previously only rendered in `loading` branch, so `blocked` and authed branches served the default index.html title) | `pages/tools/{Budget,Care,Class,Contr,Family,Price,Reass}*.jsx` (+2 SeoHead per file = 14 insertions) | Drops "pages missing canonical/og:locale" from 13 → 6 |
| Wire `<SeoHead>` into `<LegalPage>` shared layout, pass `path` + `description` from each of the 6 legal pages | `pages/legal/LegalPage.jsx` + `Terms`, `Privacy`, `Cookies`, `Accessibility`, `AIDisclaimer`, `AIIntent` | Drops the remaining 6 → 0 |
| Replace the two broken Kindred app-store links (`play.google.com/.../au.kindred.app`, `apps.apple.com/.../id000000000`) with non-link "Coming soon" badges. Real URLs go in the same const when apps ship. | `components/AppStoreBadges.jsx` | Eliminates 2 hard-404 external links |
| `og:locale=en_AU` already in SeoHead defaults — verified, no change needed | `seo/SeoHead.jsx` | sitewide ✅ |
| Canonical defaults — already present in SeoHead — verified | same | sitewide ✅ |
| `theme-color=#1F3A5F` — already in `public/index.html` | n/a | sitewide ✅ |

## ✅ Phase 2: Schema markup expansion

| Schema | Where it now emits | Previously |
| --- | --- | --- |
| `Organization` | **Every page** (hoisted into SeoHead base) | Homepage only |
| `WebSite` with `SearchAction` | **Every page** (hoisted into SeoHead base) | Homepage only |
| `SoftwareApplication` | All 8 tool landing pages (was already on Statement Decoder, the SeoHead wiring fix in Phase 1 makes the other 7 emit their existing `_toolJsonLd`) | Statement Decoder only |
| `Product` + 4 × `Offer` (Free $0, Solo $19, Family $39, Adviser $299 AUD/mo) | `/pricing` | Missing |
| `FAQPage` | `/pricing`, all 11 articles | unchanged ✅ |
| `Article` + `Person`(author: Antony Chiware) + `BreadcrumbList` + `HowTo` | All 11 articles | already present, author key now consistently "Antony Chiware" instead of "Wayly editorial" fallback |

**Still to add (deferred to a follow-up):** `CollectionPage`+`ItemList` on `/resources/articles`, `/resources/glossary`, `/resources/templates`, `/ai-tools`. These all currently emit Organization+WebSite (from the hoist) which already lifts them above "no schema" — incremental gain.

## ✅ Phase 3: E-E-A-T trust signals on YMYL content

| Change | Where |
| --- | --- |
| Added `published_at` / `updated_at` / `author: { name: "Antony Chiware" }` to all 8 SEO tool articles (3 caregiver articles already had it) | `data/seoToolArticles.js` |
| Visible byline rendered on every article header: `By Antony Chiware · Reviewed by: To be confirmed · Published [date] · Updated [date] · X min read` (testids: `article-byline`, `article-reviewer`, `article-published`, `article-updated`) | `pages/resources/Articles.jsx` |
| "Last reviewed" trust footer at the end of every article, including the gov-source citation policy and a `mailto:hello@wayly.com.au` correction path (testid `article-trust-footer`) | same |
| Article JSON-LD `author` now `Antony Chiware` (was "Wayly editorial" fallback) | same |

**Reviewer placeholder:** every article and the trust footer say "Reviewed by: To be confirmed" exactly. Replace globally with one search-and-replace when you name a reviewer.

**Editorial standards section:** brief said add this to /about. /about doesn't exist yet — folded into Phase 4 scope (build /about with full editorial-standards section).

**Per-claim citations:** primary-source links to health.gov.au / myagedcare.gov.au / agedcarequality.gov.au / opan.org.au were already present in the existing 11 articles' body copy. No claims flagged as un-cited.

## 🟡 Phase 7 (partial): performance code-split

The biggest Lighthouse finding by far — mobile Performance 33-60, LCP 5.7-6.6s. Root cause: every route eagerly imported in `App.js`, shipping ~80 components' JS in the initial bundle.

**Change:** Converted **all routes except Landing + AuthCallback + Layout** to `React.lazy()`, wrapped `<Routes>` in `<Suspense fallback={<Loading />}>`.

| Bundle | Before (estimated) | After (production build) |
| --- | --- | --- |
| main.js | ~1.8 MB (single file) | **596 KB** (initial) + 80+ route chunks lazy-loaded on demand |
| Largest route chunk | n/a | typically 30-120 KB per page |
| Total JS | same total weight, but **most isn't shipped on first paint** | 11 MB across all chunks, browser only fetches the route the user actually visits |

**Build verified ✅** — `yarn build` produces all chunks, no compile errors.

**Predicted Lighthouse improvement on production after redeploy:**
- Landing LCP: 5.7s → ~2.0-2.5s (the entire bundle no longer blocks first paint)
- Mobile Performance: 53 → 78-85
- Desktop Performance: 32 → 70-85 (was actually lower than mobile due to main-thread JS swamping local CPU)

**This needs production deploy to verify.** From this preview pod I can't reproduce production CDN behaviour, but the bundle size delta is concrete and the LCP improvement should follow.

## 🟢 Phase 6 (one quick win): accessibility

- `dlitem` violation (72 nodes, single page — Glossary): fixed. Was rendering `<dt>`/`<dd>` outside a `<dl>` container, axe flagged every one. Replaced with `<div>` (the styling is unchanged, just semantics).

Remaining a11y items (deferred):
- `color-contrast` 38 nodes / 11 pages — needs palette decision. Would require shifting `muted-k` from current value to one with 4.5:1 contrast on cream surfaces. **Brand-colour adjacent — flagging per your "don't change colours without my approval" rule.**
- `nested-interactive` 15 nodes / 11 pages — likely a `<button>` inside a `<Link>` in shared layout. Will hunt down in Phase 6 proper.
- `label`, `aria-required-children` — single instances each, will fix in Phase 6 proper.

## ❌ NOT YET STARTED

- Phase 4: 15 new pages (levels hub + 8 level pages + FAQ + Ask Wayly + 4 problem guides)
- Phase 5: internal link hub-and-spoke audit (cross-link the 8 tool pages ↔ 8 tool articles, add Related Guides section, link new Phase 4 pages into pillars)
- Phase 6 full sweep (a11y beyond the dlitem quick win)
- Phase 7 image/font/script audit beyond code-split
- Phase 8: full broken-link sweep + custom 404/500 verification
- Phase 9: Plausible/PostHog/GSC/Bing confirmation

## Files changed this batch (16)

```
frontend/src/App.js                                  ← lazy() + Suspense, +80 lines
frontend/src/seo/SeoHead.jsx                         ← Org+WebSite hoist
frontend/src/pages/Landing.jsx                       ← deduped Org+WebSite (now from SeoHead)
frontend/src/pages/Pricing.jsx                       ← Product + 4 Offers schema
frontend/src/pages/resources/Articles.jsx            ← byline/reviewer/dates/trust footer/JSON-LD author
frontend/src/pages/resources/Glossary.jsx            ← dlitem a11y fix
frontend/src/pages/legal/LegalPage.jsx               ← SeoHead wiring + path/description props
frontend/src/pages/legal/{Terms,Privacy,Cookies,Accessibility,AIDisclaimer,AIIntent}.jsx ← path+description
frontend/src/pages/tools/{Budget,Care,Class,Contr,Family,Price,Reass}*.jsx ← SeoHead in all branches
frontend/src/components/AppStoreBadges.jsx           ← "Coming soon" non-link badges
frontend/src/data/seoToolArticles.js                 ← published_at/updated_at/author on 8 tool articles
```
