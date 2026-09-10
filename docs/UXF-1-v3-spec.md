# UXF-1 v3: Unified Feedback States System (Emergent Build Prompt)

**Repo:** anto-beep/Wayly-Web-App
**Version:** UXF-1 v3 (consolidated; supersedes v1 and v2)
**Owner decision status:** All decisions locked. Four factual values are resolved via Phase 0 audit or config, and one design value (dark palette hex set) needs Antony's sign-off during build (see Section 9).
**Applies to:** Every tool, screen and process across the platform, frontend and backend, in both light and dark mode.

---

## 0. How To Read This Prompt

This is a Phase 0 audit-gated build. **Write no implementation code until the Phase 0 audit in Section 5 is delivered and approved.** After approval, the workstreams in Section 6 run in parallel, subject to the build-order note at the end of that section. Acceptance tests in Section 7 must all pass before merge. Surface all infrastructure and risk findings on the first commit per Section 8.

The goal is one **unified feedback system** shared by every tool and screen, so that loading, success, error and empty states look and behave identically everywhere, in both light and dark mode, and cannot drift per tool. This is the central objective: a single feedback layer, composed everywhere, never re-invented per feature.

**What changed in v3.** Three families of state were missing once CE-2, PPC-1, LF-1 and CPR-1 were checked against v2: artifact generation and delivery (3.20), cross-tool data provenance and freshness (3.21, 3.22), and regulatory disclosure and erasure states (3.23, 3.24). These are now first-class, with their own components, workstreams and tests.

---

## 1. Non-Negotiables

These apply to every line of output and every component.

- **Design system:** Teal-Ink (#0E4D52), Sage (#6B8F71, text-safe #425F47), Clay (#C2683D, button fill #A5512B), warm off-white (#FBF8F3). Typography: Fraunces (headings), Inter (body and UI), IBM Plex Mono (numbers). Use existing tokens; do not introduce new colours or fonts.
- **Accessibility:** WCAG 2.1 AAA throughout, in both modes, including skeleton placeholders and low-emphasis confirmation text, which is where contrast quietly fails.
- **Editorial rules (enforced at build time):** Australian English. Title Case headings, sentence case body. Dollar format $1,847. Percent symbol, never the word. No em dashes. Banned vocabulary must not appear in any user-facing copy or code comments intended for users. Wayly voice: warmth, clarity, calm, dignity, evidence.
- **Banned output pattern:** No screen, tool or message ever states overall compliance. Findings carry their own citation and confidence; the platform never declares itself or a document compliant.
- **Monetary constants:** Any dollar figure shown in a feedback state (plan pricing, billing confirmations, quota boundaries) is read from the INDEX-1 registry, never hardcoded in a component or a string.
- **Fixture:** Where a feedback state needs example data in tests or fixtures, use the canonical fixture: Louisa Davids, Classification 8, Glorious Services Pty Ltd, full pensioner. Do not introduce a divergent fixture.
- **Audience:** Older care recipients and stressed adult carers, often on slower devices and unreliable home internet, frequently anxious, sometimes with reduced vision or slower processing. Every state is designed for this person first.

---

## 2. The Governing Principle (applies to all screens)

Feedback weight matches action consequence. Four tiers:

| Tier | Examples | Feedback |
|------|----------|----------|
| **Ambient** | Toggling a filter, sorting, expanding a panel | The result is the feedback. No message. Control state change only. |
| **Quiet** | Saving a note or preference, marking an item read | Small persistent inline confirmation beside the changed control. Optimistic UI permitted (see 3.4). |
| **Standing** | Submitting a ticket, running a tool, generating an artifact, completing onboarding, editing account details | Prominent, persistent, dismissible confirmation in context, with the specific result and next step. |
| **Consequential** | Changing or cancelling a plan, deleting a care plan, erasing data, sharing with the household | Confirm before, then a standing confirmation stating what changed, including access and money in $ and dates. No optimistic UI. |

Most feedback lives in Quiet and Standing, delivered in context and persistent.

---

## 3. Locked Decisions

These are final. Build to them.

### 3.1 Toast policy

No auto-dismissing or self-closing toast carries any information the person needs to notice or act on. Reversible but notable actions use a **persistent** standing confirmation that may include an undo action; the undo stays available until the person dismisses it or the context changes, never on a timer. Truly destructive or irreversible actions use **confirm before** (a dialog), not an act-then-vanishing-undo. No floating auto-closing components anywhere.

### 3.2 Loading pattern selection

Fixed rules, applied everywhere:
- Discrete action under ~2 seconds (save, toggle, payment): spinner or inline button working state.
- Structured content into a known layout (registers, stores, dashboards, tool result pages): skeleton mirroring the final layout.
- Long async job (running a statement, ingesting a care plan, generating an artifact): staged progress with honest labels and a reassurance line. No fake progress bars.
- AI generation (Ask Wayly, tool explanations): a distinct thinking state, then streamed output.
- Universal: never a blank screen; reserve space to prevent layout shift; respect `prefers-reduced-motion`.

### 3.3 Timing thresholds and anti-flicker (Doherty Threshold)

Target a response within ~400ms wherever possible. For loaders:
- Do not show a loading indicator for waits likely under ~400ms. Showing then hiding a skeleton or spinner for a 150ms wait creates a jarring flash.
- Once a loader is shown, hold it for a short minimum (~500ms) so it does not flicker off the instant content arrives.
- These two rules apply to every skeleton, spinner and staged-progress use in the app.

### 3.4 Optimistic UI for high-confidence Quiet-tier actions

For low-risk, high-success actions (marking a finding read, toggling a preference, small edits), show the successful result immediately, reconcile with the backend in the background, and if it fails, roll the change back visibly with a plain recoverable error. Do not use optimistic UI for Consequential-tier or money actions; those wait for real confirmation.

### 3.5 Loading timeouts (the stuck-forever fix)

Every loading state has a maximum wait ceiling. If it is exceeded, the loading state becomes a recoverable error ("This is taking longer than expected") with a retry and a way back. No spinner or staged progress may run without a timeout. The ceiling is a config value per operation type, not hardcoded per screen.

### 3.6 Canonical component library

One shared set, composed everywhere. No bespoke per-tool states. The set:

**Loading**
1. `Skeleton` (layout-mirroring variants per content type: list row, card, table row, result block).
2. `ButtonWorkingState` (inline spinner and disabled state for discrete actions).
3. `StagedProgress` (named steps plus reassurance line, for long async jobs).
4. `AIThinkingStream` (thinking state then token streaming).

**Success**
5. `InlineConfirmation` (Quiet tier, persistent beside the control).
6. `StandingBanner` (Standing tier, persistent, dismissible, in context).
7. `ResultPanel` (tool output success, leads with plain-language summary; Peak-End moment, see 3.16).
8. `AutosaveIndicator` (continuous save state for editing flows).
9. `StepProgress` ("Step 2 of 3" for multi-step processes).

**Error**
10. `FieldError` (validation, linked to its field, re-announced on return).
11. `SectionError` and `PageError` (recoverable and unrecoverable variants, each with retry, go back, or contact support with a reference).

**Empty**
12. `EmptyState` (three variants: first-use, no-results, cleared).

**Consequential and global**
13. `ConfirmDialog` (confirm-before for Consequential and destructive actions).
14. `OfflineBanner` and `SessionExpiryDialog` (global connectivity and session states).
15. `QuotaBoundaryState` (plan and trial limit reached).

**Artifact, provenance and disclosure (new in v3)**
16. `ArtifactGeneration` (generate, deliver and download states for PDFs, letters, emails and meeting artefacts; see 3.20).
17. `CrossToolSourceIndicator` (where borrowed data came from and when; see 3.21).
18. `DataFreshnessIndicator` ("as at" for snapshot-based data; see 3.22).
19. `AutomatedDecisionDisclosure` (Privacy Act disclosure near automated results; see 3.23).

**Primitives**
20. App-level live-region primitives: one polite region (`role="status"`) and one assertive region (`role="alert"`), present in the DOM from load, never added or removed.

### 3.7 Connectivity and offline states

Add a global connectivity awareness layer:
- When the connection is lost, show a calm, persistent, non-alarming banner that the person is offline, and clearly mark actions that cannot be completed until they are back online rather than letting them fail silently.
- Queue or block actions sensibly. Never lose typed input or an upload because the connection dropped.
- On reconnection, confirm quietly that they are back online and complete or offer to retry any blocked action.

### 3.8 Session and timing (WCAG 2.2.1 and AAA Timeouts)

For any authenticated session:
- Warn before the session expires, with enough time to react, and give a one-action way to stay signed in.
- Never drop the person to a login screen mid-task without warning. Protect unsaved input across a re-authentication so nothing is lost.
- This is both a UX requirement and an accessibility requirement at the AAA level being targeted.

### 3.9 Error prevention over recovery (Nielsen heuristic 5)

Prevention ranks above cure. Apply across every input:
- Validate inline as soon as a field can be checked, before submit, keeping the field value.
- Give format hints and sensible defaults so the error does not arise.
- If a submit control is disabled, always show plainly what is still needed. A silently disabled button with no explanation is its own anti-pattern and is not permitted.

### 3.10 Continuous autosave indication

For editing flows (notes, care-plan edits, letter drafts, any draft), show a continuous, honest save state via `AutosaveIndicator`: a quiet "Saving…" then a persistent "Saved" (or "All changes saved"). Addresses the anxiety people carry about unfinished, unsaved work. If a save fails, say so plainly and keep the person's work.

### 3.11 Plan and quota boundary states

Reaching a trial or plan limit (Solo, Family, or trial gating) is a first-class feedback state via `QuotaBoundaryState`, not a failure:
- Explain the limit plainly and without blame.
- Show the path forward calmly. No loss-aversion pressure, alarming countdowns, or other dark patterns. Dignity holds even at a commercial boundary.
- Any dollar figure shown comes from INDEX-1.

### 3.12 In-flow progress for multi-step processes (Goal-Gradient effect)

Any process of more than two steps (onboarding, the Contribution Estimator progressive form, multi-step tool flows, wizards) shows where the person is and how much remains via `StepProgress` ("Step 2 of 3"). Visible progress toward a goal increases completion. Separate from the completion confirmation, which stays a Standing-tier success.

### 3.13 Background job completion

For long jobs the person may move away from (a statement run, a care-plan ingestion, an artifact generation), keep the job's state and confirm completion when they return, or notify them, rather than losing the result because they changed screen. The result must be retrievable, not tied to staying on the page.

### 3.14 Plan change and cancellation

Confirm before the action. The after-state states, in plain language: the new plan name, exactly what access changed, the amount in $, and the next billing date. Cancellation additionally states the date access continues until and that no further charges will occur. Figures come from INDEX-1. Final billing wording is to be checked against Australian Consumer Law before release (flag in Delivery Notes; do not block the build structure on it).

### 3.15 Ticket confirmation

On submission, show: the reference number, that the reply comes by email, where to find the ticket again, and an expected first-response time. The response-time value is read from a config constant (`SUPPORT_FIRST_RESPONSE_TARGET`), not hardcoded or guessed. Align copy and behaviour with the existing SUP triage flow.

### 3.16 Placement driven by psychology laws

Bake these into the components, not left to chance per screen:
- **Peak-End Rule:** the `ResultPanel` (a completed statement, a contribution estimate), the artifact delivery moment (3.20) and the error-recovery moment are the memory-defining points of a Wayly session. They get the most design care: the clearest summary, the calmest reassurance, the most obvious next step.
- **Serial Position and Von Restorff:** in any result, lead with the single most important finding and make it stand out, rather than placing it in the middle of a list where it is least noticed.
- **Hick's Law:** empty states and error states offer one obvious primary action, not a menu of choices.
- **Fitts's Law:** place retry, dismiss and undo controls where the eye and cursor already are (near the thing that changed), not only large enough but close enough.
- **Jakob's Law:** use feedback patterns older users already recognise. Do not invent novel interactions for these states.

### 3.17 Statement Decoder progress (pattern locked, labels from audit)

The decoder uses `StagedProgress` with a reassurance line: *"This can take up to a minute. Your statement is safe and you do not need to do anything."* The stage labels must map to the **real** backend pipeline phases surfaced in Phase 0. Provisional defaults, to be confirmed or replaced against the actual pipeline: "Reading your statement", "Checking the figures", "Preparing your summary". Do not ship invented stages that do not correspond to real phases.

### 3.18 Web and mobile parity, and multimodal feedback

The feedback system maps to the React Native app as the same system, so a state behaves the same on web and mobile. On mobile, add subtle haptic confirmation for key success and error moments as a second channel alongside the visual one. Haptics support, never replace, the visual and screen-reader feedback.

### 3.19 QA lint additions

Extend the existing build-time QA lint to check:
- `prefers-reduced-motion` honoured (no animation when set).
- Contrast AAA on all feedback text including skeletons and low-emphasis confirmations, in both modes.
- Live-region primitives present in the DOM.
- Interactive feedback controls (retry, dismiss, undo) meet the minimum target size.
- No auto-dismiss timer attached to Standing or Consequential confirmations.
- No hardcoded colour values in any component; all reference semantic tokens.
- No pure black surface (`#000000`) or pure white text (`#FFFFFF`) in dark mode.
- No hardcoded dollar figure in any feedback string; all read from INDEX-1.

### 3.20 Artifact generation and delivery (new in v3)

Several tools produce a shareable artifact as their real payoff: the Contribution Estimator's PDF and email summary, the Letters and Follow-ups generated correspondence, the Care Plan Reviewer's meeting artefact, and any shareable tool summary. This is the moment the person has worked toward, so it is a Peak-End moment and gets full treatment via `ArtifactGeneration`. Four states, all required:

1. **Generating.** `StagedProgress` with honest labels and a reassurance line. Generation can be slow on a mobile device or a poor connection, so a bare spinner is not acceptable. Subject to the timeout rule (3.5).
2. **Ready.** A Standing-tier confirmation that names the artifact plainly and gives the action: view, download, or send. State the format and, where useful, that it is safe to share.
3. **Delivered.** When an artifact is emailed, confirm the actual destination address back to the person ("Sent to antony@example.com"), not a generic "Sent". Delivery to the wrong address with a generic confirmation is a silent failure, and for correspondence about someone's care that is a serious one.
4. **Failed.** Generation or send failure never loses the person's inputs or the underlying result. The result stays on screen and remains regenerable. Offer retry, and where sending failed but generation succeeded, offer download as the fallback so the work is not stranded.

Additional locked rules:
- Where an artifact is emailed, the address is confirmed before sending, not assumed from the account, since a carer may be sending to a sibling or a provider.
- A generated artifact is retrievable after the fact per 3.13; the person must not lose it by changing screen.
- Where correspondence is logged (the LF-1 persistent correspondence log), the confirmation states plainly that a copy has been kept and where to find it. New persistent data categories are disclosed in the moment, not only in the Privacy Policy.

### 3.21 Cross-tool data provenance (new in v3)

Session state flows between tools (Contribution Estimator state into the Provider Price Checker "Your Share" card; Statement Decoder data into the Price Checker; classification and provider details shared across tools). Whenever a tool displays or uses data the person entered in a different tool, `CrossToolSourceIndicator` states plainly:
- **Where it came from** ("Using your Contribution Estimator run"),
- **When** ("from 12 October"),
- **How to change it** (one action to update or clear it).

Locked rules:
- The indicator sits with the borrowed data, not in a footnote.
- Borrowed data older than the 90-day cross-tool signal freshness window is shown as stale, with a plain prompt to refresh it, and is never presented as current without qualification.
- Never silently pre-fill a field from another tool with no indication of its origin. An unexplained pre-filled figure about someone's money reads as the system knowing something it should not, which costs exactly the trust the platform is built on.

### 3.22 Data freshness for snapshot-based data (new in v3)

The Provider Price Checker draws on the Department of Health quarterly snapshot series, so results can be based on current or historical data. Any screen showing data from a dated source uses `DataFreshnessIndicator`:
- An "as at" date shown with the data, not buried.
- Where a person is viewing a historical snapshot rather than the latest, that is stated plainly and unmistakably.
- Where a source has been superseded since the person's saved check, say so and offer to re-run against the current snapshot.

The reason this is a feedback state and not a data concern: a figure about what a provider should charge is only meaningful with its date attached, and an undated figure invites a decision made on stale evidence.

### 3.23 Automated decision-making disclosure placement (new in v3)

Ahead of the December 2026 Privacy Act deadline, tools that produce automated determinations must disclose that plainly. `AutomatedDecisionDisclosure` governs placement, not legal wording:
- The disclosure appears with the result it describes, in the `ResultPanel`, not only in the Privacy Policy or a separate page.
- It is plain, calm and non-alarming, consistent with Wayly voice. It states that the result is produced automatically and how the person can question or check it.
- It never states or implies overall compliance, per Section 1.
- Final legal wording is drafted for solicitor review; build the placement and component to accept the approved string rather than inventing one.

### 3.24 Data deletion and erasure states (new in v3)

Right to erasure (in the Price Checker and anywhere else data is deleted, including aggregate scrubbing) is Consequential-tier and gets explicit handling rather than being left implicit:
- **Confirm before**, via `ConfirmDialog`, stating specifically what will be deleted, what will not, and that it cannot be undone.
- **A durable receipt after**, via `StandingBanner`, stating what was deleted and when. A deletion confirmation that vanishes is not a receipt, and for a privacy right the person may need to rely on later, a persistent confirmation is the minimum.
- Where deletion is asynchronous or partial (aggregate scrubbing that runs behind the scenes), say so plainly rather than implying instant total erasure. Do not overstate what has happened.

---

## 4. Dark and Light Mode Specification

Dark mode is a perception and accessibility problem, not a colour inversion. The whole feedback system must hold up in both modes.

### 4.1 Semantic tokens are the foundation

Every feedback component references semantic tokens, never hardcoded hex. At minimum:
- Surfaces: `color-surface-base`, `color-surface-1`, `color-surface-2` (rising elevation).
- Text: `color-text-primary`, `color-text-secondary`, `color-text-tertiary`, `color-text-on-accent`.
- Status: `color-status-error`, `color-status-success`, `color-status-warning`, `color-status-info`.
- Interactive: `color-focus-ring`, `color-border`, brand accents (Teal-Ink, Sage, Clay) as tokens.

A mode is then a token set swap, not a rebuild. This is the single most important structural decision for dark mode.

### 4.2 Do not invert; build a dark-specific set

Inverting the light palette produces harsh, low-quality results. Build a dark token set deliberately to hit AAA.

### 4.3 Avoid pure black and pure white

No pure black (#000000) surface and no pure white (#FFFFFF) text. Pure black causes halation and eye strain and is hardest on astigmatism and dyslexia, both relevant to our audience. Use a warm dark surface family and an off-white text colour.

### 4.4 Keep the brand warmth

Because the light base is a warm off-white (#FBF8F3), the dark theme is a warm dark, not a cold blue-black. Preserves the calm and dignity of the brand rather than feeling clinical. The dark surface family should read as a warm near-black, with rising surfaces getting slightly lighter.

### 4.5 Elevation by surface, not shadow

Shadows barely read on dark backgrounds. Standing banners, confirm dialogs, result panels and any raised feedback surface show elevation by using a lighter surface token, not a drop shadow.

### 4.6 Desaturate status and accent colours for dark mode

Saturated colours vibrate on dark backgrounds and struggle to pass contrast. The status colours (error, success, warning, info) and the brand accents (Teal-Ink, Sage, Clay) get desaturated, luminance-tuned dark-mode variants so that, for example, an error still reads as equally urgent without glowing. Meaning stays constant across modes; luminance and saturation change.

### 4.7 Never status by colour alone (WCAG 1.4.1)

Every status carries an icon and text, not colour only. This matters more in dark mode where colours shift, and it protects colour-blind and low-vision users in both modes.

### 4.8 Skeletons per mode

The skeleton base and shimmer are defined per mode: a soft light shimmer in light mode, a subtle lighter-grey shimmer on the warm dark surface in dark mode. Skeleton contrast is checked in both modes, since low-emphasis placeholders are a common silent contrast failure.

### 4.9 Focus indicators visible in both modes

The focus ring must have a token that stays clearly visible against both the light and dark surfaces. A focus style that works in light mode often disappears in dark mode; both are tested.

### 4.10 Illustrations and icons

Empty-state illustrations and status icons get dark-mode treatment (dark variants or transparent, tone-tuned assets) so they do not sit in a bright box on a dark screen. Prefer filled icons over thin outlines in dark mode for legibility.

### 4.11 Numbers, tables and any data view

Since tools output figures and tables (IBM Plex Mono numbers), define a dark data view: adequate contrast on monospaced figures, clearer table gridlines and, for any chart or visualisation (including the Contribution Estimator government-share visualisation), a dedicated dark theme rather than the light one on a dark page.

### 4.12 Generated artifacts stay light

PDFs, letters and any artifact intended for printing or sending are always generated on a light background regardless of the person's mode. A dark-mode PDF is a printing failure and looks wrong forwarded to a provider. The mode governs the interface, not the artifact.

### 4.13 Mode selection and persistence

Respect the operating system setting (`prefers-color-scheme`) by default, offer a clear manual toggle, and remember the person's choice across sessions. The switch itself is smooth and does not disrupt the current task.

### 4.14 Both modes are first-class

Do not treat light as the real design and dark as a variant. Both are designed and tested to the same AAA standard across every feedback state.

---

## 5. Phase 0 Audit Gate (deliver before any implementation code)

Report the following. Write no feature code until this is reviewed and approved.

1. **Current-state inventory.** For every tool (Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Letters and Follow-ups, Contribution Estimator, Care Plan Reviewer, Family Coordinator), for Ask Wayly, and for every non-tool screen (trial signup, onboarding, account and settings, plan and billing, statements register, Care Plan Store at `/app/care-plans`, tickets, and global route transitions): list the existing loading, success, error and empty states, and how each is currently implemented.
2. **Toast usage.** Every place a transient or auto-dismissing message is currently used, and what information it carries.
3. **Input and file loss risk.** Every error path where typed input or an uploaded file could be lost, with the Statement Decoder and Care Plan Reviewer upload flows called out specifically.
4. **Decoder pipeline phases.** The real, ordered backend phases of a statement run, so Section 3.17 labels can be mapped honestly.
5. **Artifact generation inventory.** Every artifact the platform generates or sends (Contribution Estimator PDF and email, Letters and Follow-ups correspondence, Care Plan Reviewer meeting artefact, any shareable summary), its current generate, deliver, download and failure handling, and its real pipeline phases so 3.20 labels are honest.
6. **Cross-tool session state inventory.** Every place one tool consumes another tool's state, what is displayed or pre-filled from it, and whether the origin and age are currently shown.
7. **Dated data source inventory.** Every screen showing data from a dated or snapshot source (the DoH quarterly series in particular), and whether an "as at" date is currently shown.
8. **Automated decision points.** Every tool output that constitutes an automated determination, for disclosure placement under 3.23.
9. **Deletion and erasure paths.** Every path that deletes user data, whether deletion is synchronous or asynchronous, what is and is not removed, and the current confirmation behaviour.
10. **Live-region and focus handling.** Whether app-level live regions exist, and whether route changes currently move focus to the new heading.
11. **Reduced-motion and contrast.** Current handling of `prefers-reduced-motion`, and any feedback text currently below AAA contrast in either mode.
12. **Blank-screen and layout-shift audit.** Any screen that currently shows a blank state during load, or shifts layout when content arrives.
13. **Colour token inventory.** Every place a colour hex is hardcoded rather than referenced via a token, since this is what will need refactoring for dark mode.
14. **Hardcoded monetary values.** Every dollar figure in a component or string that is not read from INDEX-1.
15. **Session and connectivity.** Current session-expiry behaviour and any existing handling of connection loss.
16. **Dark palette proposal.** A proposed warm-dark token set (surface family, off-white text, desaturated status and brand variants) that echoes the existing light palette and meets AAA. To be signed off by Antony before applied (see Section 9).

---

## 6. Workstreams (parallel after Phase 0)

**A. Shared component library.** Build the twenty components in Section 3.6 as a single library with the design tokens and ARIA baked in. Every later workstream composes from these; no state is built outside the library. Depends on workstream I (tokens) for its colour layer.

**B. App-level primitives.** Add the two live-region primitives to the app shell (present from load). Add route-change focus management that moves focus to the new screen's heading on every genuine context change.

**C. Loading rollout.** Apply Section 3.2 across every screen. Skeletons that mirror final layouts on all structured screens. `StagedProgress` on the decoder, care-plan ingestion and artifact generation. `AIThinkingStream` on Ask Wayly and any AI-generated tool output. Remove every blank-screen load found in Phase 0.

**D. Success rollout.** Apply the tier map to every action. Quiet inline confirmations for settings and small edits. Standing banners for ticket submission, tool completion, onboarding completion, account changes. Result panels lead with a plain-language summary. Trial signup states trial length, end date and what happens at the end.

**E. Error rollout.** Implement the four error kinds: validation (inline, field-linked, value preserved), recoverable system (explain, keep everything entered, retry in place), unrecoverable (plain apology, reassure data is safe where true, an exit and a reference, no raw code as the headline), partial (say specifically what worked and what did not). No error path may clear input or a file. No copy blames the person.

**F. Empty rollout.** Three distinct variants everywhere: first-use (encouraging, one primary action, treated as onboarding), no-results (corrective, offer to clear or widen filters, visually distinct from first-use), cleared (calm, positive resting state). Apply to the Care Plan Store, statements register, tickets, the correspondence log and every tool's pre-first-run screen.

**G. Copy library.** Author every string in Wayly voice, obeying the editorial rules. Success confirms the specific outcome, not a generic word. Errors say what happened then what to do. Empty states explain why and point to one action. Deliver as a single reviewable copy file.

**H. QA lint.** Implement Section 3.19 checks in the build-time lint, running in both modes.

**I. Semantic token architecture and dark and light themes.** *Gates the colour layer of every component; build first among the token-dependent workstreams.* Define the semantic token set (Section 4.1), build the light and dark token sets to AAA using the palette signed off in Section 9, and ensure every component in workstream A references tokens only.

**J. Timing and optimistic behaviour.** Implement the anti-flicker delay and minimum-display rules (3.3), optimistic UI with rollback for Quiet-tier actions (3.4), and loading timeouts to recoverable errors (3.5) across the component library.

**K. Connectivity and session layer.** Build the global offline and reconnection layer (3.7) and the session-expiry warning and unsaved-work protection (3.8).

**L. Error prevention.** Add inline pre-submit validation, format hints, sensible defaults and the explained-disabled-control rule (3.9) across all forms and tool inputs.

**M. New feedback moments.** Continuous autosave indication (3.10), plan and quota boundary states (3.11), in-flow step progress (3.12) and background job completion handling (3.13).

**N. Mobile parity and haptics.** Map the system to the React Native app and add haptic confirmation as a second channel (3.18).

**O. Artifact generation and delivery.** Build `ArtifactGeneration` and apply the four states (3.20) to every artifact found in Phase 0 item 5: the Contribution Estimator PDF and email, Letters and Follow-ups correspondence, the Care Plan Reviewer meeting artefact, and any shareable summary. Includes address confirmation before send, the light-artifact rule (4.12), and correspondence-log disclosure.

**P. Cross-tool provenance and freshness.** Build `CrossToolSourceIndicator` and `DataFreshnessIndicator` and apply them to every case found in Phase 0 items 6 and 7, including the 90-day staleness treatment and the "as at" date on DoH snapshot data.

**Q. Regulatory disclosure and erasure states.** Build `AutomatedDecisionDisclosure` with approved-string injection (3.23) and the erasure confirm-and-receipt pattern (3.24), applied to every point found in Phase 0 items 8 and 9.

Placement rules from 3.16 are applied inside the relevant workstreams (success, error, empty, artifact) rather than as a separate stream.

**Build order.** Workstream I (tokens) is prerequisite for the colour layer of workstream A, and both are prerequisite for workstreams C to G and J to Q. Workstreams B (app-level primitives), H (QA lint) and L (error prevention) can start immediately after Phase 0 approval. Within the token-dependent group, O, P and Q depend only on the components they use and can run alongside C to F.

---

## 7. Acceptance Tests (all must pass before merge)

**Core feedback**
1. No auto-dismissing or self-closing element carries required information anywhere in the app.
2. Every asynchronous action longer than ~400ms shows a loading state. No blank screens remain.
3. Every structured-content screen uses a skeleton matching its final layout, with no layout shift when content arrives.
4. Every Standing and Consequential confirmation is persistent until the person dismisses it or the context changes. None carries an auto-dismiss timer.
5. Every error path preserves typed input and uploaded files. Retry does not clear the form or require re-upload.
6. Every status message is announced through the correct live region. The assertive region is used only for urgent, time-sensitive problems.
7. Field errors are linked to their fields and re-announced when the field regains focus.
8. Every genuine route or context change moves focus to the new screen's heading.
9. With `prefers-reduced-motion` set, all shimmer and transitions are removed.
10. All feedback text meets AAA contrast, including skeletons and low-emphasis confirmations.
11. Retry, dismiss and undo controls meet the minimum target size.
12. Plan change and cancellation show a confirm-before step, and an after-state stating plan, access change, amount in $ and dates.
13. Ticket submission confirmation shows the reference number, reply channel, where to find the ticket, and a response time read from `SUPPORT_FIRST_RESPONSE_TARGET`.
14. First-use, no-results and cleared empty states are visually and behaviourally distinct on every surface.
15. The Statement Decoder shows staged progress mapped to real pipeline phases, with the reassurance line.
16. No screen, tool or message states overall compliance.
17. No banned vocabulary and no em dashes appear in any user-facing string.

**Timing, resilience and prevention**
18. No loading indicator appears for waits under the delay threshold, and once shown, no loader flickers off before its minimum display time.
19. Quiet-tier optimistic actions show success immediately and roll back visibly with a recoverable error on failure. No Consequential or money action uses optimistic UI.
20. Every loading state has a timeout that becomes a recoverable error with retry. No indicator can run indefinitely.
21. Losing the connection shows a calm persistent offline state, no action loses input or an upload, and reconnection is confirmed.
22. Session expiry is warned before it happens, can be extended in one action, and no unsaved work is lost across re-authentication.
23. Inline validation runs before submit where possible, and no submit control is disabled without a visible explanation of what is needed.
24. Editing flows show a continuous, honest save state, and a failed save keeps the person's work.
25. Reaching a trial or plan limit shows a plain, non-punitive boundary state with a calm path forward and no dark patterns.
26. Processes of more than two steps show step progress.
27. A long job the person moved away from is retrievable or notified on completion, not lost.

**Light and dark mode**
28. Every feedback state passes all prior acceptance tests in both light and dark mode.
29. No component uses a hardcoded colour; all reference semantic tokens.
30. No pure black surface or pure white text appears in dark mode, and status colours are desaturated dark-mode variants.
31. Elevation in dark mode is shown by lighter surfaces, not drop shadows.
32. Every status carries an icon and text, never colour alone, in both modes.
33. Focus indicators are clearly visible against both light and dark surfaces.
34. Contrast meets AAA on all feedback text, skeletons, numbers and low-emphasis confirmations in both modes.
35. The mode follows the system setting by default, offers a manual toggle, and persists the choice.
36. Every generated artifact (PDF, letter, emailed summary) renders on a light background regardless of the person's selected mode.

**Artifact, provenance and disclosure**
37. Every artifact shows all four states: staged generating progress with a reassurance line, a ready state naming the artifact with its action, a delivered state, and a failure state.
38. Every emailed artifact confirms the actual destination address back to the person, and the address is confirmed before sending rather than assumed.
39. An artifact generation or send failure loses neither the person's inputs nor the underlying result, the result stays on screen, and a failed send still offers download.
40. Where correspondence is logged, the confirmation states plainly that a copy has been kept and where to find it.
41. Every value borrowed from another tool shows its origin and date beside it, with one action to update or clear it. No field is silently pre-filled from another tool.
42. Borrowed data older than 90 days is shown as stale with a prompt to refresh, and is never presented as current without qualification.
43. Every screen showing snapshot-based data shows its "as at" date, and viewing a historical rather than latest snapshot is stated plainly.
44. Every automated determination shows the disclosure with the result itself, in plain calm language, using the approved string rather than an invented one.
45. Every deletion shows a confirm-before stating specifically what will and will not be deleted and that it cannot be undone, followed by a persistent receipt stating what was deleted and when. Asynchronous or partial deletion is described honestly.

**Data integrity**
46. No dollar figure in any feedback string is hardcoded; all read from INDEX-1.
47. Any fixture data used in feedback tests matches the canonical fixture (Louisa Davids, Classification 8, Glorious Services Pty Ltd).

---

## 8. Delivery Notes (surface on first commit)

- Report any screen or component that cannot meet AAA as built in either mode, with the specific blocker, rather than shipping it below standard.
- Flag any original-file-retention gap found in the decoder or care-plan error paths, since download, comparison and audit features depend on originals being kept.
- Confirm the final billing and cancellation wording has been routed for the Australian Consumer Law check before those strings go live.
- Confirm the automated decision-making disclosure string has been routed for solicitor review, and that the component accepts the approved string rather than shipping a placeholder.
- Flag whether the correspondence-log disclosure (3.20) and any new persistent data category surfaced by this build require a Privacy Policy amendment before public launch, since that is a gated dependency.
- Report the value chosen for `SUPPORT_FIRST_RESPONSE_TARGET` and where it is configured.
- Report the loading-timeout ceilings chosen per operation type and where they are configured.
- Report any deletion path where erasure is asynchronous or partial, so the copy can describe it honestly rather than overstating.
- Note any place where the shared library could not be used and a one-off state was unavoidable, with the reason, so it can be reviewed rather than becoming silent drift.

---

## 9. Values Antony Confirms

1. **Decoder pipeline phase labels** (from Phase 0 item 4).
2. **Artifact generation phase labels** (from Phase 0 item 5), for the Contribution Estimator PDF, Letters and Follow-ups correspondence and the Care Plan Reviewer meeting artefact.
3. **`SUPPORT_FIRST_RESPONSE_TARGET`**, the ticket first-response time shown to users.
4. **Plan-change and cancellation billing copy** after the Australian Consumer Law check.
5. **Automated decision-making disclosure string** after solicitor review.
6. **Dark palette sign-off.** The rules in Section 4 are locked, but the exact dark-mode hex values for the surface family, off-white text and desaturated status and brand variants need Antony's design sign-off, since they define the brand in dark mode and must be validated to hit AAA. Emergent proposes the token set in Phase 0 (item 16); Antony confirms or adjusts before workstream I applies it.

---

## 10. Rollback Plan

The system ships behind a feature flag (`uxf_v3`), staged:

1. **Tokens and library first.** Workstreams I and A land behind the flag with the existing states untouched, so the library can be verified in isolation.
2. **Per-surface rollout.** Enable the flag per surface (one tool at a time), starting with a lower-stakes surface rather than the Statement Decoder, so any systemic problem surfaces before it reaches the highest-anxiety flow.
3. **Rollback granularity.** The flag disables per surface, not only globally, so one bad surface does not force a full revert.
4. **Retain the previous states** until every acceptance test passes on a surface, then remove them in a follow-up cleanup rather than in the same commit, so rollback stays possible.
