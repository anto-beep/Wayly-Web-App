# Wayly Mobile Agent Handoff — UI-2 + UI-3 Complete Parity Pack

**Web session dates**: 2026-07-01 (UI-2 phases 0–5) and 2026-07-02 (UI-3 follow-ups)
**Source spec**: `UI-2_Global_Consistency_And_Tool_Display.md` (Antony's prompt). Everything below is already merged and verified on web.
**Builds on**: `MOBILE_AGENT_UI1_DELTA_PROMPT.md` (UI-1 baseline). Read it first.

You are the mobile agent. Bring the Wayly React Native app into **exact parity** with the web work below. Do not silently diverge; ping the web agent if mobile cannot match web without breaking something.

---

# PART A — Fonts and Type (highest priority)

## A1. Fonts — FINAL, LOCKED

The product uses exactly **two brand fonts plus one functional mono**. Nothing else, anywhere:

| Role | Font | Weights | Where |
|---|---|---|---|
| Headings | **Fraunces** (variable serif) | 600 default (400–700 allowed) | Every screen title, card heading, stat heading, tool summary headline |
| Body / UI | **Inter** (variable sans) | 400 / 500 / 600 / 700 | All body copy, buttons, labels, inputs, nav |
| Numbers | **IBM Plex Mono** | 400 / 500 / 600 | ONLY numeric values (see A3) |

- Mobile already loads `Fraunces-Variable.ttf` and `Inter-VariableFont.ttf` via `expo-font` — keep that.
- **Action required**: the mobile mono fallback is currently system `Courier`. Replace with bundled **IBM Plex Mono** (Regular/Medium/SemiBold) in the font manifest and update `Fonts.mono` in `src/lib/theme.ts`.
- One source of truth for font families (UI-2 §1.1). Audit every screen: no `Platform.select` system-font leaks, no Roboto/SF defaults on any user-facing `<Text>`.

## A2. Type scale (UI-2 §1.2)

Mirror the web tokens (`/app/docs/design/type-scale-and-tokens.md`):

| Role | Mobile (fontSize / lineHeight) |
|---|---|
| display-lg | 48 / 52 Fraunces |
| display | 40 / 46 Fraunces |
| heading-1 | 32 / 40 Fraunces |
| heading-2 | 26 / 32 Fraunces |
| heading-3 | 20 / 28 Fraunces |
| heading-4 | 18 / 26 Inter 600 |
| subheading | 15 / 22 Inter, muted |
| body | 15 / 22 Inter |
| **intro/explainer** | **14 / 21 Inter (NEW — see A4)** |
| caption | 12 / 16 Inter, muted |
| overline | 11 / 16 Inter 600, uppercase, letter-spacing 2 |
| mono-number | IBM Plex Mono, tabular figures |

Reference subheading = the copy under the `/app/calendar` page title. The `/app/documents` screen is the reference standard for the authenticated app generally (UI-2 §3.2.5).

## A3. NumberMono rule (UI-2 §4.3 — retrofit COMPLETE on web 2026-07-02)

Every number a tool or dashboard renders (currency, percentages, ranges, years-to-cap) renders in **IBM Plex Mono + tabular figures**. NOT Fraunces, NOT Inter. No exceptions.

Web screens retrofitted — mirror each on mobile:
- **Budget Calculator**: quarterly gross, care-management slice, usable amount, annual budget, per-stream allocations, supplement rows, supplement total, lifetime contributions.
- **Contribution Estimator**: annual/quarterly figures and ranges, per-stream annual labels.
- **Provider Price Checker**: charged, median, indicative range.
- **Statement Decoder result**: gross billed, your contribution, government paid, budget remaining, per-stream gross totals.
- **Classification Self-Check**: annual range (already mono on web).

Mobile implementation: shared `<NumberMono>` Text component — `fontFamily: 'IBMPlexMono'`, `fontVariant: ['tabular-nums']`. Route ALL tool/dashboard numbers through it. Currency shape guard: `$X.YY`, never `$3 90 cents` (Rule 2.5).

## A4. Intro/explainer copy size reductions (NEW 2026-07-02)

Long intro paragraphs dropped from 15–17px to **14px, relaxed line height** on these web screens — match the equivalent mobile screens:
- **AT-HM tracker** (`/app/at-hm`): both intro paragraphs.
- **Care-Plan Changes** (`/app/amendments`): both intro paragraphs.
- **Log a Scenario** (`/app/scenarios`): the subtitle "Walk through a real situation step by step, with Wayly explaining what to do and why." AND the "Life happens…" intro block.
- **Provider Switch workflow** (`/app/provider-switch`): the StepShell intro copy on ALL steps (Step 1 "Most caregivers consider switching providers…" and every later step's intro). One shared style.

Rule going forward: screen intro/explainer blocks are body-small (14px), never larger than body text.

---

# PART B — Global Copy and Formatting Rules (UI-2 Phase 2, all enforced on web)

These apply to every user-facing string: screens, tool outputs, notification/push templates, error messages, empty states, tooltips.

- **Rule 2.1** — Zero `you're` / `we'll`. Expand to `you are` / `we will`.
- **Rule 2.1 extended** — In notification and push templates, expand ALL contractions: `haven't`→`have not`, `hasn't`→`has not`, `don't`→`do not`, `won't`→`will not`, `can't`→`cannot`, `it's`→`it is`, `we've`→`we have`, `didn't`→`did not`, `there's`→`there is`. Possessive apostrophes (`month's`, `statement's`) stay.
- **Rule 2.2** — Zero em dashes (`—`) or en dashes (`–`). Rewrite the sentence; do not swap to `-`. Ranges use "to".
- **Rule 2.3** — Never apostrophise or hyphenate `frontend` / `backend`.
- **Rule 2.4** — **Title Case** every screen title, section heading, card title, tab label ("Audit Log", "Drop In A Statement"). Body copy stays sentence case. NEVER use text-transform capitalize on strings containing apostrophes (produces `Month'S Statement`) — title-case at source. Safe regex if needed: `.replace(/(?<![’'])\b\w/g, c => c.toUpperCase())`.
- **Rule 2.5** — Currency `$1,847` and `$3.90`. Never `$3 90 cents`.
- **Rule 2.6** — Full dates **DD/MM/YYYY**. Month + year **"Month YYYY"** (e.g. "May 2026"). Never `2026-05`.
- **Rule 2.7** — Banned vocabulary: `navigate, unlock, leverage, seamless, embark, delve, robust, harness, empower, percentage, percent`. Rewrite in plain English.

Shared formatters to port (from web `src/lib/formatDate.js` + `src/lib/api.js`):
```ts
formatDate(v): string          // "01/10/2026"
formatDateTime(v): string      // "01/10/2026 14:30"
formatMonthYear(v): string     // "May 2026"
formatMoney(n): string         // "$1,847.00"
humanizeMonths(text): string   // NEW 2026-07-02 — see B1
```

## B1. `humanizeMonths` render-time guard (NEW 2026-07-02)

Never render raw ISO months like `2026-05`. Web added a render-time guard applied to all alert/notification titles + bodies (Recent activity panel, notifications bell, participant timeline):
```ts
export function humanizeMonths(text: string): string {
    if (!text) return text;
    return text.replace(/\b(\d{4})-(0[1-9]|1[0-2])\b(?!-\d)/g,
        (_m, y, mo) => `${MONTHS[Number(mo) - 1]} ${y}`); // "May 2026"
}
```
The backend templates were fixed, but historical records on production still stream through the API. Mobile MUST apply this guard wherever alert/notification `title`/`body` strings are displayed.

---

# PART C — Dark Mode (NEW 2026-07-02, global behavioural change)

## C1. One global preference

- Web previously split marketing vs app appearance keys. That split is **gone**. One stored key, applied on **every** route.
- Mobile parity: one persisted theme preference (AsyncStorage), applied app-wide the moment it is set, surviving restarts. Any screen that ignores the theme is a bug.
- Settings → Appearance caption now reads: *"Your choice applies everywhere on Wayly, on this device."* Match the copy.

## C2. Dark palette tokens

```
bg:      #0B1416    surface: #152425    surface2: #1C2F31    sunken: #060B0C
primary: #4FA8AE    clay:    #E89A6F    sage:     #A8C7AB
text:    #FFFFFF    text2:   #E5E5E5    muted:    #C7C2B8    border: #2A3A3C
```

## C3. Dark-mode text rules (tightened 2026-07-02)

1. **ALL headings are pure white (#FFFFFF)** in dark mode — every Fraunces heading, every card/stat title, h1 through h6 equivalents. No dark-navy or teal-ink text may survive on a dark surface. (Web now overrides hardcoded hexes `#0E2A47`, `#0E4D52`, `#0E1F35` → white.)
2. Success-green text (`#0F5648` light) → bright sage `#A8C7AB` in dark.
3. Teal accent text (teal-600/700) → bright teal `#4FA8AE` in dark.
4. Light-blue tint backgrounds (unread notification rows `#EAF4FB`, "Reviewed" chips `#D5F1E9`) → `surface2` / `rgba(168,199,171,0.18)`.
5. Body text white `#FFFFFF`, secondary `#E5E5E5`, muted `#C7C2B8` — the readability bar is WCAG AAA.

## C4. Switch/toggle contrast (UI-2 §3.2.9 bug — FIXED on web)

- Every switch track carries a **visible inset outline** in both themes: `rgba(17,24,26,0.15)` 1px inset in light, `rgba(255,255,255,0.40)` 1px inset in dark.
- The knob/thumb is **always white** — never let a dark-surface override swallow it. RN: `thumbColor="#FFFFFF"` + explicit `trackColor` for both states.
- On-state track: brand teal (`#0E4D52` light / `#4FA8AE` dark). Off-state: 40% muted.
- Applies to Notification preference toggles, accessibility toggles, every RN `Switch`. Verify WCAG AAA in both modes, both states.

## C5. Account/avatar menu (FIXED on web 2026-07-02)

- Signed-in account menu items are **white text** in dark mode with muted icons; pressed state uses `surface2`.
- The sign-out label is **"Sign Out"** (capital O) — update anywhere mobile says "Sign out".

---

# PART D — AI Tool Output (UI-2 Phase 4 — COMPLETE on web, including summaries)

Applies to all **8 tools**: Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Reassessment Letter, Contribution Estimator, Care Plan Reviewer, Family Coordinator (Aged Care Q&A).

## D1. Structure — identical template across all tools (§4.1, §4.5)

Every tool result opens with a **plain-English summary block BEFORE any tables, numbers or breakdown**. Then detail sections. A user who has used Statement Decoder must recognise every other tool instantly.

Port the web `ToolSummary` component (from `frontend/src/components/ToolShell.jsx`) as `ToolShell.tsx`:

```
ToolSummary props: { toolName, headline, body, tone: "neutral"|"alert"|"success", testId }
Layout:
  - overline row: Sparkles icon (gold) + "{toolName} Summary" (11px uppercase, letter-spacing 2, muted)
  - headline: Fraunces, 20–24px, leading snug
  - body: Inter, 14–16px, relaxed
Tone container styles:
  - neutral: surface bg, standard border
  - alert:   terracotta 8% bg, terracotta 30% border
  - success: sage 10% bg, sage 30% border
Rounded 16px card, padding 20–24.
```

## D2. The AI summary copy per tool (verbatim from the shipped web build)

**Statement Decoder** (`tone`: alert if anomalies else success):
- headline: first sentence of the AI result summary, e.g. "Your March statement looks fine, but two personal-care hours were double-charged."
- body: `We checked every line against Support at Home rules. {We found N thing(s) worth checking with your provider. | Nothing looked out of order.} {AI summary}`

**Budget Calculator** (`tone`: success):
- headline: `Your quarterly usable budget is {$X,XXX.XX}.`
- body: `Wayly worked out your Support at Home budget from your Classification and pension status. That's {$XX,XXX} across the year, split into four quarters. The provider keeps {$X,XXX.XX} per quarter as their 10% care management fee. The rest is what you can spend on care.`

**Provider Price Checker** (`tone`: alert if high, success if low, else neutral):
- headline: `Your provider's price is {verdict label, lowercase}.`
- body: `{assessment sentence} Wayly compared what you pay ({$XX.XX} per {unit}) against the indicative median of {$XX.XX} for the same service on the same stream.`

**Classification Self-Check** (`tone`: alert if reassessment suggested, else neutral):
- headline: `Your answers point to Classification {N}.`
- body: `Based on 12 questions about daily living, mobility, cognition and support, Wayly estimates {label}. That maps to an annual budget between {$XX,XXX} and {$XX,XXX}. This is a self-check to help you prepare, not an official assessment.`

**Contribution Estimator** (`tone`: neutral):
- headline (range basis): `Your quarterly contribution sits between {$X,XXX} and {$X,XXX}.`
- headline (exact basis): `Your estimated contribution is {$X,XXX} per quarter.`
- body: `Wayly worked this out from your pension status, means-tested income and daily fee. On Support at Home the government pays most of the cost; what is shown here is the co-payment that comes out of your budget. {caveat if any}`

**Care Plan Reviewer** (`tone`: alert if any flags else success):
- headline (no flags): `Your care plan looks fine on the six structured checks.`
- headline (flags): `Your care plan has {N} thing(s) worth checking with your provider.`
- body: AI summary, or fallback: `Wayly checked your care plan against six Support at Home rules: budget fit, care management cap, service-list compliance, stream alignment, review-date currency, and goals alignment.`

**Reassessment Letter** (`tone`: success):
- headline: `Your reassessment letter is ready to review.`
- body: `Wayly drafted a short, factual letter to My Aged Care asking for a reassessment. Read it end to end, edit anything that does not sound like you, and send it from your own email. Include the participant's My Aged Care reference number if you have it.`

**Family Coordinator / Aged Care Q&A** — chat interface, exempt from a per-turn summary block by design. Uses its intro paragraph as the equivalent.

## D3. Anomaly rows (§4.2)

Every anomaly must show, using the shared labels dictionary (never invent a label silently):
1. What the anomaly is, in plain English.
2. Where it appears in the source document.
3. What the person can do: view the line / ask a question / report an issue (inline "Report This" affordance — see D5).

## D4. Statement Decoder entitlement copy (§4.4)

The strings "That was your free Statement Decoder use for today" and "Your free use for today" are REMOVED. Replace with:
- "You have used your daily free Statement Decoder run."
- "Solo, Family and Adviser plans include unlimited Statement Decoder runs."

Decoder result order: plain-English summary (2–4 sentences) → "What Changed Since Last Statement" (if a prior statement exists) → "Points To Check" (anomalies) → detailed line-by-line view → disclaimer that Wayly provides information only, not clinical or financial advice.

## D5. Report An Issue (UI-2 Phase 5)

Do NOT build a new component — extend the existing mobile `<Button>` primitive with `variant="report-issue"`:
- Standalone label: **"Something Not Right? Report An Issue"** (Title Case), Flag icon, bottom of every tool result block, consistent placement.
- Inline row affordance label: **"Report This"** next to each anomaly (`ReportRowLink` equivalent).
- Deep-link: `/support/new?category=ai_tool&tool={name}&result_id={id}` — wires into the SUP-0..SUP-3 support-defect model already in the backend.

---

# PART E — Per-Screen Fixes shipped on web (UI-2 Phase 3, mobile equivalents)

- **Statements upload** — title "Drop In A Statement" (Title Case).
- **AT-HM** — rebuilt against tokens; no hard-coded font sizes. Intro paragraphs 14px (A4).
- **Scenarios** — Guided Workflows **Start** button stays visible for expired trials; tap routes to the billing/upgrade flow. Never hide the affordance; a disabled state must show why.
- **Timeline** — (a) apostrophe-safe title casing ("Last Month's Statement Hasn't Arrived", never `Hasn'T`); (b) category filter is a **wrapping chip grid** (`flexWrap: 'wrap'`), not a horizontal scroll bar; (c) `humanizeMonths` on alert titles/bodies (B1).
- **Audit** — title "Audit Log"; zero em dashes.
- **Settings → Profile** — phone number field surfaced. Field: `phone_e164` on the ExternalContact model. Endpoints: `GET /api/sms-contact`, `PATCH /api/sms-contact { phone_e164 }`. Client-side E.164 validation `^\+\d{8,15}$` with a friendly error. Empty state: "Add phone number".
- **Settings → Digest** — zero em dashes.
- **Settings → Notifications** — toggle contrast per C4.
- **Documents** — reference standard; no changes beyond copy rules.

---

# PART F — Read-Only Mode for expired trials (unchanged, restated)

Backend blocks writes with **HTTP 402**:
```json
{ "detail": { "error": "trial_expired", "message": "Your trial has ended. Subscribe to add or change anything.", "upgrade_url": "/settings/billing", "read_only": true } }
```
Mobile must: hide every composer/add/edit/remove affordance for expired users (Family Wall, Thread, Chat, Statement upload, Contacts, Calendar, Hospital, AT-HM, Amendments, Correspondence, Provider Switch, Ratings, Referrals, Documents, Reports, Wellbeing) and show a Subscribe CTA; add an axios/fetch interceptor that blocks writes BEFORE the network call; reads keep working.

---

# PART G — QA Gate and Sign-Off Checklist

1. Copy-QA script over RN source AND notification/push templates (port `backend_copy_qa.py` rules from Part B).
2. Automated WCAG 2.1 AAA contrast checks on every touched screen, light AND dark.
3. Visual regression baselines: dashboard, calendar, documents, at-hm, statement-decoder result.

- [ ] Fraunces + Inter + IBM Plex Mono load on cold start; `Fonts.mono` = IBM Plex Mono (no Courier)
- [ ] All tool/dashboard numbers via shared `<NumberMono>` (spot-check Budget Calculator + Statement Decoder)
- [ ] Every tool result opens with the `ToolSummary` block (copy per D2) before any detail
- [ ] "Something Not Right? Report An Issue" on every tool result; "Report This" on anomaly rows
- [ ] Statement Decoder entitlement copy per D4
- [ ] Dark theme: single preference, persists everywhere + restart; ALL headings #FFFFFF; zero navy-on-dark text
- [ ] Switch knobs white + outlined tracks, AAA in both themes
- [ ] "Sign Out" capitalisation in account menu; menu text white in dark
- [ ] Zero raw `YYYY-MM` in rendered text (`humanizeMonths` guard in place)
- [ ] Zero em/en dashes, zero `you're`/`we'll`, Title Case headings, DD/MM/YYYY dates, `$X.YY` currency
- [ ] Intro/explainer copy at 14px on AT-HM, Amendments, Scenarios, Provider Switch equivalents
- [ ] Expired-trial read-only parity (Part F)

## Test accounts

- `trial30909@example.com` / `TrialPass1!` — plan `family`, `subscription_status = trialing`, household with participant Dorothy Tester (Classification 4, BlueBerry Care). Use for dashboard + tool screenshots.
- For expired-trial read-only checks, ask the web agent for the current expired account state before testing.
