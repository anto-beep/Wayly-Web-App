# SEO-1.1 — Prebuild-and-commit prerender (PROD HOTFIX)

**Status:** SPEC ONLY — do not implement until signed off. Highest priority; blocks SEO-2.
**Why:** SEO-1 v2 assumed react-snap could prerender in the production Cloud Build. It can't (no headless Chromium there), so prod shipped the empty CRA shell and the build gate broke the deploy. This removes the environmental dependency: prerender is generated in the Chromium-capable **preview** env, committed as static artifacts, and applied deterministically at deploy with **no Chromium needed in Cloud Build**.

## Approach
1. **Generate in preview** (`scripts/prerender-generate.mjs`, needs Chromium — preview only):
   - Run `RUN_PRERENDER=1 yarn build` → react-snap emits `build/<route>/index.html` for the public route list.
   - For each route, EXTRACT and commit only the SEO-critical, asset-hash-free parts to `frontend/prerendered/<route>.json`:
     `{ title, metas:[{name/property, content}], canonical, jsonLd:[…], rootHtml }` where `rootHtml` = the `#root` innerHTML.
   - Write `frontend/prerendered/manifest.json`: `{ generatedAt, mainJsHash, routes:{ "<route>": { contentHash } } }`. `mainJsHash` = hash of the freshly built `build/asset-manifest.json` main entrypoints.
   - Commit `frontend/prerendered/**` to the repo. **This is the only human step** on a content/code change: regenerate in preview + commit.

2. **Apply at deploy** (`scripts/prerender-apply.mjs`, runs in Cloud Build `postbuild`, NO Chromium):
   - For each committed route, take the FRESHLY built `build/index.html` (correct current asset hashes), inject the committed `title` + `metas` + `canonical` + `jsonLd` into `<head>` and set `#root` innerHTML to `rootHtml`, then write `build/<route>/index.html`.
   - **Never copies whole committed HTML** → avoids the JS-chunk-hash mismatch risk between preview and Cloud Build (fresh `<script>` tags always come from the current build).

3. **Fatal gate** (`scripts/seo-verify.mjs`, run after apply; failure FAILS the build):
   - **Missing:** any critical route lacks a committed artifact / applied file → fail.
   - **Empty:** applied `#root` is empty or `<h1>`/`<title>`/description/canonical absent in raw HTML → fail.
   - **Stale:** `manifest.mainJsHash` ≠ the current build's `asset-manifest.json` main hash → the committed prerender was generated from different code → fail with "prerendered HTML is stale — regenerate in preview and recommit." (Deterministic, git-free: the CRA content-hash changes iff code/deps change.)

## Build wiring
- Remove "prerender defaults on" from the deploy path. `postbuild` = `node scripts/prerender-apply.mjs && node scripts/seo-verify.mjs` (both no-Chromium, fatal).
- Add `yarn prerender:generate` (preview-only) for regeneration.
- `RUN_PRERENDER` toggle retired for prod; a `SKIP_PRERENDER_GATE=1` escape hatch may be kept for emergencies (documented, off by default).

## Acceptance evidence (on delivery)
- Paste of **production View Source** for `/`, one tool page, and one article showing real `<title>`, `<h1>`, meta description, canonical, and JSON-LD in the RAW HTML (JS disabled).
- Deliberately staling the manifest fails the build with the stale message.
- Removing a committed artifact fails the build (missing).
- `testing_agent` run covering the applied build + the served routes.

## Open decisions
- Commit scope: full public route list (~50) vs the SEO-critical subset — recommend full public list.
- Keep `SKIP_PRERENDER_GATE` escape hatch? (recommend yes, documented).

## Out of scope
No dynamic-rendering proxy (option c, explicitly rejected). No content changes. SEO-2 (dateModified/IndexNow-on-publish) stays blocked until SEO-1.1 is live + verified in prod.
