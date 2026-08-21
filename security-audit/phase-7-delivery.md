# Phase 7 — Dependency Security — DELIVERY REPORT

Date: 2026-02-07
Scope: backend `requirements.txt`, frontend `package.json`, new
`/app/.github/dependabot.yml`.

## What was shipped

### 1. Backend dependency bumps
Verified with `pip-audit` before and after; full 47-test regression sweep
**still passes** after every bump.

| Package | Before | After | Why |
|---|---|---|---|
| `fastapi` | 0.110.1 | **0.136.3** | Pulls in patched `starlette` (4 CVEs gone) |
| `starlette` | 0.37.2 | **1.2.1** | CVE-2024-47874, CVE-2025-54121, PYSEC-2026-161 |
| `PyJWT` | 2.12.1 | **2.13.0** | Hardens `decode` error paths |
| `urllib3` | 2.6.3 | **2.7.0** | Patched cookie-header parsing |
| `aiohttp` | 3.13.5 | **3.14.0** | Multiple fixes |
| `idna` | 3.11 | **3.18** | Punycode handling |
| `python-multipart` | 0.0.24 | **0.0.32** | Header parsing robustness |
| `pymongo` | 4.5.0 | **4.17.0** | Bulk + retry-policy fixes (with matching motor bump) |
| `motor` | 3.3.1 | **3.7.1** | Matches the new pymongo |

### 2. Backend deps left intentionally pinned

| Package | Version | Reason |
|---|---|---|
| `openai` | 1.99.9 | Hard-pinned by `emergentintegrations==0.1.0` (Emergent Universal LLM key) |
| `litellm` | 1.80.0 | Transitive — newer litellm requires `openai>=2.20.0` which would break the LLM integration |
| `pip` | 26.0.1 | Package manager, not a runtime dep |

**Accepted-risk mitigations for the litellm CVEs**:
* All LLM inputs pass through the Phase 4 prompt-injection sanitiser.
* All LLM calls are rate-limited (Phase 3).
* Wayly never feeds raw user-typed prompts directly to `litellm` — only sanitised, schema-bound payloads.
* Action item logged to track an Emergent SDK upgrade releasing a newer-litellm-compatible build.

### 3. Frontend dependency bumps

| Package | Before | After | Why |
|---|---|---|---|
| `axios` | 1.8.4 | **1.17.0** | 8 high-severity follow-redirects / DoS / SSRF advisories |
| `react-router-dom` | 7.5.1 | **7.17.0** | 9 high-severity advisories in the 6.x branch — 7.x patched |

**Production-affecting frontend vulnerabilities: BEFORE 34, AFTER 0** (verified via `yarn audit --groups dependencies`).

The remaining `yarn audit` noise (181 entries) is **entirely in `react-scripts` devDeps** — CRA's transitive jest / webpack-dev-server toolchain. None of those ship to the browser bundle. Migrating off CRA to Vite or Next.js is a separate ~3-day project, tracked outside this audit.

### 4. Dependabot configuration
New `/app/.github/dependabot.yml`:

* **Weekly** schedule (Mondays 06:00 Sydney) for pip + npm; **monthly** for GitHub Actions.
* Groups patch-level updates into a single PR per ecosystem (low noise).
* Ignores `openai` (we can't bump independently of `emergentintegrations`).
* Ignores `litellm` (transitive pin via openai).
* Labels every PR with `dependencies` + the affected stack.

### 5. Regression sweep
Full test sweep across Phases 1+2+3+4+5: **47 / 47 PASS** with every new version.

Frontend login + dashboard reach: verified via Playwright screenshot — no runtime errors.

## Risk register impact (Phase 0 baseline → now)

* **HIGH** 4 starlette CVEs → **FIXED**
* **HIGH** pyjwt + urllib3 + aiohttp + idna outdated → **FIXED**
* **HIGH** axios SSRF / DoS chain in frontend → **FIXED**
* **HIGH** react-router 6.x advisories → **FIXED**
* **MEDIUM** litellm CVEs → accepted risk with documented mitigations (waiting on emergentintegrations release)
* **LOW** no Dependabot → **FIXED**

## Files changed

```
backend/
  requirements.txt        regenerated via `pip freeze` after bumps

frontend/
  package.json            axios + react-router-dom bumped
  yarn.lock               regenerated

.github/
  dependabot.yml          NEW
```
