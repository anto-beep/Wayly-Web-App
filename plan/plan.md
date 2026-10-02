# Wayly — Plain-English outputs, real letter drafting, Statement Decoder redesign, and more

This covers everything requested, to be built in one pass across both the web app and the mobile app.

---

## 1. "Draft a letter" produces a real, ready-to-send letter (highest priority)

**Problem today:** choosing "Draft a letter" carries the issues across but does not actually write a letter, and the form fields are left empty.

**What will change:**
- Every "Draft a letter" action writes a **complete draft letter**, not just a list of issues. The letter body will include: a greeting, a short plain-English context about the participant and situation, each issue turned into a clear question/request, a request for a written response by a date, and a sign-off.
- The letter's form fields will be **pre-filled** from what the tool already knows: participant name, who it's going to, the type of request, and a plain-English "what's changed / what you're asking for" summary. Everything stays editable before sending.
- The **same behaviour everywhere** — it works identically no matter which tool or page the letter starts from, on both web and mobile.
- The **carried-over issues panel is redesigned** to be easy to follow (numbered, grouped, scannable) instead of one dense coloured block.

**A "Draft a letter" option will be added to the output of every tool that finds issues:**
- Invoice Checker
- Statement Decoder
- Provider Price Checker
- Support Plan Reviewer (already has it — will be made consistent)
- Contribution Estimator

> Assumption: the letter is generated using the app's existing AI writing capability (no new account or key needed). Draft quality depends on that AI; the user always reviews and edits before sending.

---

## 2. Statement Decoder summary — completely redesigned (key tool)

**Problem today:** the "Statement Decoder Summary" is one long wall of text with too many numbers crammed together, hard to read, and it repeats things already listed in the issues.

**What will change:**
- Replace the paragraph with a **short, visual, sectioned layout** — cards and simple graphics rather than prose.
- Key figures shown as **big, clearly-labelled numbers** with light graphics, for example:
  - who paid what (a simple split showing the user's share vs the government's share),
  - a breakdown of spending by category,
  - budget used vs remaining for the quarter.
- **No jargon or technical language.**
- **Does not repeat** anything already shown in the "what we found" issues list.
- Only keeps what actually helps someone understand their statement at a glance; unnecessary text and figures removed.

---

## 3. Plain-English pass across tool outputs (web + mobile)

- Rewrite the Invoice Checker output and other tool outputs into everyday language.
- Remove or replace confusing terms such as "lifetime cap indicative check", "indicative", "stream", "archetype", "classification", etc., with plain wording (with a one-line explanation only where a term genuinely can't be avoided).

---

## 4. Cleaner page headers in the logged-in app

- The page headers in the signed-in app will be redesigned to look cleaner and drop the jargon.
- Reference example: the Correspondence page header currently reads *"Archetype: Request · Recipient: provider cm · How this flag works"* — this kind of clutter will be replaced with a clean, plain-English header.

> Assumption: "the header section in the backend" means these in-app page headers (shown in the Correspondence screenshot), not the FastAPI server. Please correct this if a different header was meant.

---

## 5. Duplicate statement / invoice detection

- When a statement or invoice is added, the system checks whether a matching one already exists and **warns the user before saving**, so the same document isn't processed twice.

> Assumption on what counts as a duplicate: the same participant + same provider + same billing period (or an identical total from the same provider for the same dates). The warning can be dismissed and the item kept if it really is new. Please adjust if the rule should be stricter or looser.

---

## 6. Landing and Features pages rebuilt (web + mobile)

- Rebuilt with bold brand-colour panels (Clay / Teal / Sage / Terracotta), crisp white legible text, and **custom-generated brand graphics** (as previously chosen).

---

## 7. Guided Journeys refresh (web + mobile)

- Add colour, real graphics, and light animation so the section feels alive rather than plain.

---

## 8. Expired-plan reactivate prompt

- Restore a clear prompt/banner for lapsed subscribers that nudges them to renew.

---

## Decisions to confirm (or these assumptions will be used)

1. **Header meaning (item 4):** in-app page headers (assumed), not the server.
2. **Duplicate rule (item 5):** same participant + provider + billing period, or identical total from the same provider/dates.
3. **Which tools get "Draft a letter" (item 1):** Invoice Checker, Statement Decoder, Provider Price Checker, Support Plan Reviewer, Contribution Estimator.

Everything above is intended to ship together in one pass, on both the web and mobile apps.
