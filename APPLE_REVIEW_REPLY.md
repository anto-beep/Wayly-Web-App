# Wayly — Reply to App Review (Guideline 2.1, iOS App 1.0.1 build 104)

> Paste this into the App Store Connect reply thread, AND copy it into
> App Review Information → Notes (for future submissions).
> Attach the screen recording (.mp4/.mov, under 250 MB) to the reply.

---

Thank you for reviewing Wayly. Below is all requested information, numbered to match your request. We have also added it to the App Review Information → Notes field.

**1. Screen recording**

A screen recording captured on a physical iPhone running the latest iOS is attached. It begins by launching Wayly from the Home screen and shows the typical user flow, in this order:

- Launch from the Home screen (app icon → splash → welcome screen)
- Account registration — creating a new account with email and password
- Login — logging out and signing back in
- Core feature — Statement Decoder: uploading a sample Support at Home statement and viewing the plain-English breakdown
- Second feature — Invoice Checker: checking a provider invoice line by line
- Subscription / paywall screen (shown; no payment completed during the recording)
- Account deletion — Settings → Danger Zone → type-to-confirm → account permanently deleted

Note: Wayly has no public user-generated content, social feed, or user-to-user messaging visible to other users, so content reporting/blocking mechanisms do not apply.

**2. App purpose and target audience**

Wayly helps older Australians and their families understand the aged-care bills they receive under the Australian Government's **Support at Home** program.

Problem it solves: monthly aged-care statements and provider invoices are long, jargon-heavy, and hard to check. Families often cannot tell whether they have been charged correctly, how much government funding is left, or what a care-management fee actually means.

Value it provides: a user uploads their own statement or invoice and Wayly explains it in plain English — flagging possible overcharges, showing what funding remains for the quarter, and answering plain-language questions about their care. The target audience is Australian home-care recipients and the family members who help manage their care (typically adult children acting as carers).

**3. Setup instructions, demo credentials, and sample file**

A demo account is pre-loaded with sample data so you can review every feature immediately without uploading anything:

- Email: `cathy@example.com`
- Password: `testpass123`

This account already contains sample statements and invoices. To review the main features after logging in:
- Dashboard → tap **Upload a Statement** (Statement Decoder) → open an existing statement to see the plain-English breakdown.
- Dashboard → tap **Check an Invoice** (Invoice Checker) → open an existing invoice to see the line-by-line review.
- Dashboard → tap **See My Budget** to view remaining funding.
- Subscription screen: Settings → Plan & Billing.
- **Account deletion:** Settings → **Danger Zone** → type `delete my account` → **Delete account permanently**.

A sample Support at Home statement for the upload flow is attached to this reply. (Please create a throwaway account during the recording and delete *that* account, so the demo account above remains available for review.)

**4. External services used**

- **Authentication:** email + password (our own secure token service), **Sign in with Apple**, and **Google Sign-In**.
- **AI language models:** OpenAI and Anthropic (Claude), used only to translate the user's **own uploaded** statement/invoice into plain English and to answer the user's questions. No third-party or protected datasets are accessed, and user documents are not used to train models.
- **Payments:** Stripe (subscription billing).
- **Email:** Resend (transactional email only — e.g. verification and trial reminders).
- **Database / hosting:** MongoDB, hosted in Australia.

**5. Regional differences**

Wayly is built for Australia. Its content is specific to the Australian Government's Support at Home aged-care program. There are no region-locked features and the app behaves consistently for all users; it is intended for use within Australia.

**6. Regulated industry / third-party material**

Wayly is an independent consumer tool operated by [Wayly — ABN/ACN: _____]. It helps users understand aged-care statements and invoices that **they themselves upload** about **their own** care. Wayly does not deliver aged-care services, is not affiliated with or endorsed by the Australian Government or any care provider, and does not reproduce, host, or distribute any protected third-party material. Every document processed belongs to the user who uploaded it. No special licence or authorisation is required to provide this service.

Please let us know if any further information would help complete the review. Thank you.
