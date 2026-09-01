## Bug verification plan — iteration 139

- User-reported bug: logged in as Cathy, clicking the Solo plan CTA on `/pricing` did not open Stripe test checkout and did not redirect to `/billing/success`.
- Affected flow: authenticated pricing CTA -> `POST /api/payments/checkout` -> Stripe Checkout URL redirect; related pricing CTA edge cases for Family, Adviser, and guest Solo gate.
- Skill lookup: No relevant testing skill found for `Stripe checkout Solo pricing`.
- Code/config inspected: `/app/memory/test_credentials.md`, `frontend/src/pages/Pricing.jsx`, `frontend/src/lib/api.js`, `frontend/src/context/AuthContext.jsx`, `backend/routes/payments.py`, `backend/server.py`, frontend/backend env values without exposing secrets, git status/history.
- Direct proof needed: browser/network evidence that Cathy can trigger Solo and Family checkout, API returns 200 JSON with a `https://checkout.stripe.com/` URL, browser lands on Stripe checkout with correct plan/trial text; Adviser stays in-app at `/contact?intent=adviser`; guest Solo goes to `/signup?plan=solo`.
- Important edge cases: authenticated vs guest behavior; non-Stripe Adviser CTA; Stripe sandbox page visibility without submitting card/payment.
