# SEO-2 — Content-accurate `dateModified` + change-scoped IndexNow

**Status:** SPEC ONLY — do not implement. **BLOCKED until SEO-1.1 is live and verified in production** (diffing `dateModified` on HTML prod isn't serving is theatre).
**Depends on:** SEO-1.1 (prod serves committed prerendered HTML); `indexnow_service.submit_urls` + `POST /api/admin/indexnow/ping` (already exist).

## Objective
1. Emit `Article.dateModified` sourced from the article's own last content change — **never build-stamped**.
2. After a deploy, ping IndexNow for **only** URLs whose content changed since the last deploy; zero on a no-op deploy.

## Locked decisions
- **dateModified source: explicit `updatedAt` per article.** No git fallback, no hybrid. If `updatedAt` is missing → fall back to `datePublished` AND emit a **build warning** naming the article.
- **Previous-manifest persistence: object storage** (S3, AWS Sydney migration target). **Interim stopgap: a single Mongo doc**, explicitly flagged temporary in code + docs. **Not** a committed file.
- **Trigger: a deploy-pipeline step** that calls `POST /api/admin/indexnow/ping` with the changed URLs. **Not** a backend startup hook.
- **`.git` not required** (follows from explicit `updatedAt`).

## Additions (new guardrails)
- **`datePublished` immutability guard.** For each article URL, FAIL the build if the current `datePublished` differs from the value stored in the previous manifest. (Published date must never silently change.)
- **Build-time logging.** For every article, print one line: `url | updatedAt-source (explicit|fallback-datePublished) | dateModified value`.

## Design
1. **Registry is the single source of dates.** Each article carries `publishedAt` (immutable) and `updatedAt`. `articleLd()`/SeoHead include `datePublished` + `dateModified` (ISO-8601 with AEST offset) for article routes, so the SEO-1.1 prerender bakes them into static HTML. No `Date.now()` in the schema path.
2. **Build manifest** (`scripts/seo-manifest.mjs`): emit `{ "<url>": { datePublished, dateModified } }` from the registry, with the logging + missing-`updatedAt` warning above.
3. **Immutability + change diff** against the previous manifest (object storage; Mongo interim):
   - `datePublished` changed → **fail build**.
   - `dateModified` changed or URL is new → add to `changedUrls`.
4. **Change-scoped ping:** deploy step calls `/api/admin/indexnow/ping` with `changedUrls` (empty → no call). First run with no previous manifest → do NOT mass-ping; log + require one manual `ping-all`.
5. Persist the new manifest as previous for next deploy.

## Acceptance tests
1. Editing one article's copy + its `updatedAt` changes only that article's `dateModified`; siblings unchanged.
2. No-op deploy → empty IndexNow submission, zero `dateModified` changes.
3. Content change → submit log lists exactly the changed URL(s), HTTP 200/202.
4. Article JSON-LD passes Rich Results Test (valid ISO-8601 + offset).
5. Changing a `datePublished` fails the build with the immutability error.
6. Build log prints the per-article date line; a missing `updatedAt` logs a warning and falls back to `datePublished`.

## Open decisions
- Object-storage bucket/prefix + credentials for the manifest (vs. the interim Mongo collection name).
- Exact deploy-pipeline hook point that issues the ping.
