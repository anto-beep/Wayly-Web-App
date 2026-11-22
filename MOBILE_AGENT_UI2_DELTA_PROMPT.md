# Wayly UI-2 Mobile Agent Handoff — Global Consistency, Copy Rules, AI Tool Display

**Web session date**: 2026-07-01
**Companion prompt** (source of truth for scope): `UI-2_Global_Consistency_And_Tool_Display.md`
**Web-side audit report**: `/app/docs/audits/UI-2-audit-2026-07-01.md`
**Web-side type-scale tokens**: `/app/docs/design/type-scale-and-tokens.md`

You are the mobile agent. Your job is to bring the Wayly React Native mobile app into **exact parity** with the UI-2 web work shipped in this session. All the rules below are already merged and enforced on web; mobile must match them or fail QA.

Also: read the earlier `/app/MOBILE_AGENT_UI1_DELTA_PROMPT.md` first if you have not — that is the UI-1 baseline this handoff builds on.

---

## 1. Fonts (Phase 1)

- **Headings**: Fraunces (weights 400/500/600/700). Use `expo-font` or your Metro font-loader manifest.
- **Body / UI**: Inter (weights 400/500/600/700).
- **Numbers / currency / table figures**: IBM Plex Mono (weights 400/500/600).

Every screen must respect the three families. Do not use system fonts anywhere on user-facing screens. Numbers in dollar amounts, statement tables, budget cards, and adviser scenarios use IBM Plex Mono.

## 2. Type scale (Phase 1)

Mirror `/app/docs/design/type-scale-and-tokens.md`. Semantic roles:

| Role | Web class | Mobile equivalent (RN StyleSheet or `nativewind` class) |
|---|---|---|
| display-lg | `text-5xl sm:text-6xl font-heading` | fontSize 48 / lineHeight 52 |
| display | `text-4xl sm:text-5xl font-heading` | 40 / 46 |
| heading-1 | `text-3xl sm:text-4xl font-heading` | 32 / 40 |
| heading-2 | `text-2xl sm:text-3xl font-heading` | 26 / 32 |
| heading-3 | `text-xl font-heading` | 20 / 28 |
| heading-4 | `text-lg font-semibold` | 18 / 26 |
| subheading | `text-sm sm:text-base leading-relaxed text-muted-k` | 15 / 22, muted-teal |
| body | `text-sm sm:text-base` | 15 / 22 |
| caption | `text-xs text-muted-k` | 12 / 16 |
| overline | `text-[11px] uppercase tracking-[0.18em]` | 11 / 16, uppercase, letter-spacing 2 |
| mono-number | `font-mono tabular-nums` | IBM Plex Mono, tabular figures |

Reference subheading = the copy under the `/app/calendar` page title. Match it on every mobile screen.

## 3. Colour tokens (Phase 1)

Unchanged from UI-1. `primary-k #0E4D52`, `sage #6B8F71`, `clay #C2683D`, `gold #C99A47`, `surface #FBF8F3`. No new colours.

## 4. Copy rules (Phase 2)

These are now enforced by a build-time check on web (`/app/backend/scripts/backend_copy_qa.py`). Mobile must run the same checks against its React Native source before merge:

- **Rule 2.1** — Zero occurrences of `you're` or `we'll`. Expand to `you are` / `we will`.
- **Rule 2.1 extended (per 9.2 = a)** — In **notification and push templates**, expand ALL contractions: `haven't`→`have not`, `hasn't`→`has not`, `don't`→`do not`, `won't`→`will not`, `can't`→`cannot`, `it's`→`it is`, `we've`→`we have`, `didn't`→`did not`, `there's`→`there is`, etc. Possessive apostrophes (`month's`, `statement's`) stay.
- **Rule 2.2** — Zero em dashes (`—`) or en dashes (`–`) in any user-facing string. Rewrite the sentence, do not swap to `-`. Numeric ranges (e.g. "Levels 1 to 8") keep "to" not `–`.
- **Rule 2.3** — Never apostrophise `frontend` or `backend`. No `frontend's`, no `back-end`.
- **Rule 2.4** — **Title Case** every screen title, section heading, card title, tab label. Body copy stays sentence case. Never use `text-transform: capitalize` on strings that contain apostrophes — that produces `Month'S Statement`. Title-case at source instead.
- **Rule 2.5** — Currency `$1,847` and `$3.90`. Never `$3 90 cents`.
- **Rule 2.6** — Full dates as **DD/MM/YYYY**. Month + year as **`Month YYYY`** (e.g. "May 2026"). Never `2026-05`.
- **Rule 2.7 — Banned vocabulary**: `navigate, unlock, leverage, seamless, embark, delve, robust, harness, empower, percentage, percent`. Rewrite in plain English.

Bring these formatters into the mobile shared lib:
```ts
// From web: /app/frontend/src/lib/formatDate.js
export function formatDate(v: Date | string): string;      // → "01/10/2026"
export function formatDateTime(v: Date | string): string;  // → "01/10/2026 14:30"
export function formatMonthYear(v: Date | string): string; // → "May 2026"
// From web: /app/frontend/src/lib/api.js  (formatMoney)
export function formatMoney(n: number): string;            // → "$1,847.00"
```

## 5. Per-screen fixes (Phase 3)

Cross-reference these against your mobile screens and apply the same fix.

### Marketing surface (in-app browser previews if any)

Nothing mobile-specific — marketing pages remain web-only.

### Authenticated app screens

- **`app/statements/upload`** — title becomes `Drop In A Statement` (was "Drop in a statement").
- **`app/at-hm`** — audit and rebuild against tokens. No hard-coded `fontSize: 13`.
- **`app/scenarios`** — Guided Workflows **Start** button stays visible even for expired trials. Tap routes to `/settings/billing` upgrade flow. Never hide the button.
- **`app/timeline`** —
  - Use the fixed title-case function (see snippet below). The bug was `.replace(/\b\w/g, c => c.toUpperCase())` which title-cased letters after apostrophes (`Hasn'T`). Fix: `.replace(/(?<![’'])\b\w/g, c => c.toUpperCase())`.
  - Category filter must be a **wrapping chip grid** (per 9.8 = a), not a horizontal scroll bar.
- **`app/documents`** — reference standard. No changes; just make sure other screens match its type scale.
- **`app/audit`** — h1 becomes `Audit Log` (was "Audit log"). Remove any em dashes.
- **`settings/profile`** — surface `phone_number` from participant profile. Empty state affordance: "Add phone number".
- **`settings/digest`** — remove every em dash.
- **`settings/notifications`** — fix the switch/toggle contrast bug. Track: `primary-k` when on, muted grey when off. Thumb: always white in both themes. Verify WCAG AAA both modes.

## 6. AI tool output (Phase 4)

Applies to every tool: Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Reassessment Letter, Contribution Estimator, Care Plan Reviewer, Family Coordinator (**8 tools total** — not 9).

Every tool output must:

1. **Open with a plain-English summary section** BEFORE any tables, numbers, or breakdown. Summary uses Fraunces heading + Inter body. Written for a family member, no jargon, no acronyms without expansion.
2. **Numbers in IBM Plex Mono.** No exceptions.
3. **Anomaly rows** show: what the anomaly is (plain English), where it appears in the source, and what to do (view line / ask question / report issue). Use a shared labels dictionary. If a label does not exist, propose it — never invent one silently.
4. **Statement Decoder entitlement copy** — the strings "That was your free Statement Decoder use for today" and "Your free use for today" are removed. Replace with:
   - Web now shows: "You have used your daily free Statement Decoder run." + "Solo, Family and Adviser plans include unlimited Statement Decoder runs."
   - Match this on mobile.
5. **Cross-tool consistency** — the visual template above is identical across all eight tools. A user who has used Statement Decoder must recognise every other tool immediately.

## 7. Report An Issue (Phase 5, decision 9.9 = extend existing)

**Do not build a new component.** Extend the existing mobile `<Button>` primitive with a `variant="report-issue"` prop that renders:

- Consistent placement (bottom-right of primary content area).
- Label: `Something Not Right? Report An Issue` (Title Case).
- Inline "Report This" affordance next to any tool anomaly.
- Wires into the SUP-0..SUP-3 support-defect model already in the backend.

## 8. Read-only mode (from prior session, still relevant)

The web app now hides every composer/input/action button when the user's trial has expired. Match this behaviour on mobile:

- Family Wall composer → replace with "Subscribe to share moments" panel.
- Family Thread input → hide entirely, show Subscribe CTA.
- Chat / Ask Wayly composer → hide input, hide "Start fresh chat", hide suggestion chips.
- Statement upload dropzone → replace with Subscribe panel.
- Contacts panel: hide Add / Edit / Remove buttons.
- Calendar / Hospital / AT-HM / Amendments / Correspondence / Provider Switch / Ratings / Referrals / Documents / Reports / Wellbeing → hide every "Add", "Log", "Generate", "Remove" affordance. Reads must still work.

Backend already blocks writes with **HTTP 402** and payload:
```json
{
  "detail": {
    "error": "trial_expired",
    "message": "Your trial has ended. Subscribe to add or change anything.",
    "upgrade_url": "/settings/billing",
    "read_only": true
  }
}
```
Route users to `/settings/billing`. There is a defense-in-depth axios interceptor on web; add the same in mobile axios so writes are blocked BEFORE the network call.

## 9. QA gate (per decision 9.10 = cover email + notifications)

The mobile PR must:

1. Pass a copy-QA gate that scans mobile source AND notification/push templates for the Rule 2 violations. Port `/app/backend/scripts/backend_copy_qa.py` logic into a mobile-side script.
2. Pass automated contrast checks against WCAG 2.1 AAA on every touched screen, both light and dark mode.
3. Visual regression tests (Detox / RN screenshot lib) covering: dashboard, calendar, documents, at-hm, statement-decoder result. Baseline these post-parity.

## 10. Not in scope for mobile this pass

- Legislative figures (unchanged from PP-1 / PP-2).
- The mobile-only push registration (owned by the mobile team's PN prompt).
- IndexNow / SEO work — web-only.
- Read-only mode was already covered — but the composer-hide details in section 8 above are new since the last handoff.

---

## Test account for expired-trial parity verification

```
Email:    trial30909@example.com
Password: TrialPass1!
Plan:     free
Status:   subscription_status = expired
```

Login as this account and confirm every composer/action described in Section 8 is hidden or replaced with a Subscribe CTA. Same expectation applies to the mobile app.

## Sign-off checklist for the mobile PR

- [ ] All three font families load on cold start (Fraunces, Inter, IBM Plex Mono).
- [ ] Type-scale tokens file exists at `/mobile/docs/type-scale.md` mirroring the web one.
- [ ] Zero em/en dashes in RN source (grep must return 0 outside dev comments).
- [ ] Zero `you're`/`we'll` in RN source.
- [ ] Zero "Audit log" (lowercase); every occurrence is "Audit Log".
- [ ] `formatMonthYear` in shared lib; no `YYYY-MM` in any user-facing string.
- [ ] Every write-side affordance hidden for expired trials.
- [ ] Every AI tool opens with a plain-English summary before detail.
- [ ] Switch toggle contrast passes WCAG AAA in both themes.
- [ ] Statement Decoder no longer says "That was your free Statement Decoder use for today".
- [ ] "Report An Issue" button appears on every tool result screen at consistent placement and label.

Ping the web agent (this session) if you find a case where mobile can't match web without breaking something else — do not silently diverge.

---

## Update — 2026-07-02 delivered on web

- **Timeline chip-grid (§3.2.4 / 9.8a) — done.** `ParticipantTimeline.jsx` filters now render as a wrapping chip grid using `flex flex-wrap gap-2` instead of a horizontal scroll bar. Mirror this on mobile: `flexWrap: "wrap"` on the RN filter row.
- **Phone number on `/settings/profile` (§3.2.7) — done.** Field name is `phone_e164` on the `ExternalContact` model. Wired via `GET /api/sms-contact` and `PATCH /api/sms-contact { phone_e164 }`. E.164 format validation (`^\+\d{8,15}$`) is enforced client-side with a friendly error. Mobile must add the same input on its Profile tab and hit the same endpoints.
- **Plain-English summary on every tool (§4) — done.** New shared component: `frontend/src/components/ToolShell.jsx` exports `ToolSummary`, `ReportIssueButton`, `ReportRowLink`, `NumberMono`. Wired into 7 of 8 tools (Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Contribution Estimator, Care Plan Reviewer, Reassessment Letter). The 8th tool (Aged Care Q&A / FamilyCoordinator) is a chat interface and uses the marketing intro paragraph as its equivalent — a summary block per turn does not fit chat.
  - Mobile: port `ToolShell.tsx` with the same `ToolSummary` / `ReportIssueButton` / `NumberMono` API. Prepend a summary block at the top of every tool result.
- **Report An Issue placement (§5) — done.** All 8 tools already import and render `ReportIssueButton variant="inline"` at the bottom of the result block, wired to the SUP-1 flow. `<Button variant="report-issue">` added to `components/ui/button.jsx`. Mobile: match the placement and label ("Something Not Right? Report An Issue" for the standalone variant; "Report an Issue With This Result" for the inline variant already used inside tool result cards).
- **Font-mono swap for numbers still pending.** All tools currently render numbers with `font-heading + tabular-nums`, which resolves to Fraunces + tabular figures. Mobile should render numbers in IBM Plex Mono via a shared `<NumberMono>` component; on web the same shared helper exists in `ToolShell.jsx` but hasn't been retro-fitted into every existing numeric span across the 8 tools. A follow-up sweep is required on both platforms.

## New test account for parity screenshots

- `trial30909@example.com` / `TrialPass1!` now has: plan `family`, `subscription_status = trialing`, active household `215a02bf-b676-459c-8d39-abf7b39d8c62` with participant `Dorothy Tester` (Classification 4, BlueBerry Care). Use it for dashboard + tools screenshots on both web and mobile.
