# Mobile → Web Parity Roadmap (screenshot-driven, in priority order)

Web is the source of truth. Reuse the SAME labels/copy verbatim. All dates DD/MM/YYYY. Never black text on teal/clay — use white (`primaryFg`) / clay. Read colours from `useTheme()`.

## DONE (this session)
- Signup/login cleanup: removed "Wayly" wordmark, "Create account" header, "Join Wayly…" tagline; Title-Case labels + "Required"/"Optional" (shared `Field`); password rules shown upfront; plan cards Solo "1 participant · 1 seat", Family "2 participants · Up to 3 caregiver seats"; "Log Out".
- Earlier: card-at-signup (Stripe Checkout), DD/MM/YYYY formatters, trial banner, email-verify banner, Audit Log, Referrals, Contribution Position (+pension wizard), Support tickets, Cases, Reports PDF.

## P0 — Screen redesigns to EXACTLY match web (each = its own tested batch)
1. **Invoices** (`/app/mobile/app/invoices.tsx`) — eyebrow "ALL INVOICES", H1 "Your Support at Home Invoices", intro copy; three info cards WHAT THIS DOES / HOW TO USE IT / WHAT YOU GET; buttons "Export CSV" + "Check a new invoice"; Smart Summary "Your Wayly Insight" card (GET /invoices insight) with warning rows; sortable TABLE cols: Invoice date · Provider · Uploaded · Amount · Findings · VERDICT (badge "All clear"/"Issues"); tap row → issue register/detail.
2. **Statements** (`statements.tsx`) — same 3 info cards + Smart Summary; buttons "Export CSV" · "Archived" · "Upload statement" (upload = SEPARATE screen `/upload`); search box + Provider/Period/Status filter dropdowns + "N shown"; TABLE cols: Period · Provider · Uploaded · Gross Total · Closing Balance · Status (badge "Flagged · N").
3. **Participants** (`participants.tsx`) — H1 "Participants · N active"; sub "Family plan covers 2, additional participants are $24.50 per fortnight each"; "Current plan: FAMILY · $49.50 per fortnight"; participant CARDS: name + PRIMARY star, "Classification X · Provider", "Covered by Family plan", email chip w/ copy, action row Timeline / Edit details / Share view / Make primary / Remove; "Removed participants" section ("Data kept for 60 days…", Restore / Delete now); "Add participant" button.
4. **Support** (`support.tsx`) — H1 "My Support", sub "Track tickets you have raised…"; 4 stat cards OPEN / AWAITING YOU / RESOLVED / TOTAL; search + All statuses / All tools / Newest first dropdowns; ticket cards (WAY-XXXX, category chip, title, status badge, "Raised … · Updated …"); button "Raise a New Ticket".
5. **Plan & Billing** (`plan-billing.tsx`) — CURRENT PLAN card (crown, "Family $49.50 per fortnight", "Billed every 14 days · Includes GST", "Free trial · N days left  ends <date>", "Cancel plan"); "WHAT YOU ARE PAYING FOR" card (Base plan / Participants X/Y included / Add-ons / Fortnightly total + participant rows "Included in base plan", "Manage participants"); Solo/Family switch cards ("Switch to Solo", "Current").
6. **Dashboard** (`(tabs)/index.tsx`) — add walk-through card ("GET STARTED · ~15 MIN · 4 STOPS", "New to Wayly? Take the guided walk-through.", "Start the walk-through", "Skippable · progress saved"); plan pill "FAMILY PLAN · TRIAL · All 9 tools · 5 family seats · Sunday digest"; Smart Summary "Your Wayly Insight"; header actions "Share with family" / "Upload a statement" / "Key Contacts". (endpoint for walkthrough: check web CaregiverDashboard.)

## P1 — Workflows
7. **Signup persona questions** — mirror web `Signup.jsx`: caregiver/participant toggle; care-recipient fields (their first/last name, relationship, pronouns); Family "add second participant" (first name required + relationship) → POST /v2/participants; ask the right questions per plan × persona.
8. **Stripe return → continue onboarding in-app** — after WebBrowser checkout closes, poll /payments/checkout/status and route into /onboarding automatically.
9. **Date picker** — add a calendar/date picker (DD/MM/YYYY display) to date fields (onboarding DOB etc). Consider `@react-native-community/datetimepicker` via `expo install`.
10. **Initials avatar dropdown** — tapping the header initials opens a menu: Profile, Settings, Plan and Billing, Members, Help & Support. Initials always WHITE on teal/clay.

## P2 — Polish + remaining
11. **Dark-mode contrast sweep** — more clay + white on dark; audit EVERY screen for black text on teal/clay (buttons, badges, plan card, avatars) → switch to `primaryFg`/white.
12. **Capitalisation sweep** — Title-Case every label/heading to match web across all screens.
13. **Wordmark sweep** — remove stray "Wayly" wordmark copy (e.g. login footer "New to Wayly?", a couple of Settings strings) per design.
14. **SD3 statement pairs**, **participant sub-tabs** (attendance/complaints/coordinator/voice-check), **verify-email landing** screen.

Reference: `/app/mobile/BACKEND_HANDOFF.md` (endpoints, colours, tools), web pages under `/app/frontend/src/pages/`.
