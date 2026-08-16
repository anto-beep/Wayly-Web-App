# Cross-Platform Blueprint: Web to Mobile

## Detection
- **Source Platform**: Web (`/app/frontend`). Validated by the presence of a mature React application (`package.json`, `src/pages` with 100+ `.jsx` files, complex global context, and Tailwind configuration).
- **Target Platform**: Mobile (`/app/mobile`). Validated by an existing Expo / React Native scaffolding that is partially populated (`app/` routing via `expo-router`, some completed screens).
- **Assumption**: We are acting to complete the remaining cross-platform porting tasks for the mobile app (specifically onboarding, billing, and family settings) to achieve full parity with the web version, as outlined in the PRD backlog.

## Existing App Map (Web)
- **Primary Screens / Routes**:
  - **Marketing & Onboarding**: `/login`, `/signup`, `/onboarding` (Steps: Essentials, Recommended, Authorisation, AllDone), `/verify-email`.
  - **Caregiver Dashboard**: `/app` (Dashboard), `/app/family`, `/app/calendar`.
  - **Journeys & Forms**: `/app/provider-switches`, `/app/care-plans`, `/app/hospital`, `/app/documents`.
  - **AI Tools**: `/ai-tools`, `/ai-tools/statement-decoder`, `/ai-tools/invoice-checker`, `/ai-tools/family-coordinator`.
  - **Settings & Billing**: `/settings` (Tabs: profile, billing, members, digest, notifications, usage, security), `/pricing`.
- **Components & State**:
  - `AuthContext` and `ParticipantsContext` manage global application state via context providers.
  - `api.js` provides Axios interceptors for JWT token lifecycle (refresh, expiry).
  - Responsive layouts using Tailwind CSS and a modular `/src/components` library.
- **Primary User Flows**:
  - **Auth & Onboarding**: Signup -> Persona/Role selection -> Care-recipient fields (Branching logic for 'Family') -> Dashboard.
  - **Billing Setup**: Selecting a subscription plan -> Redirect to Stripe Checkout -> Billing Success.
  - **Family Management**: Settings -> Family Members -> Send email invite -> Manage roles.

## Shared Backend API Surface
The mobile app will reuse the existing FastAPI backend (`/app/backend`) with `Authorization: Bearer <token>` and `X-Participant-Id` headers. Key endpoints for the remaining port:
- **Onboarding & Participants**:
  - `POST /api/participants` (Body: participant details) - Creates a new participant.
  - `GET /api/participants` - Lists available participants.
  - `GET /api/account` - Retrieves account-level settings and persona.
- **Family / Household Management**:
  - `GET /api/household/members` - Lists current household members.
  - `POST /api/household/invite` (Body: email, role) - Sends an invitation email.
  - `DELETE /api/household/members/{member_user_id}` - Revokes access.
- **Payments / Billing**:
  - `POST /api/payments/checkout` - Initializes a Stripe web checkout session.
  - `GET /api/payments/invoices` - Lists historical invoices.
  - *(Note: Mobile will likely require a new endpoint for Stripe SetupIntents, e.g., `POST /api/payments/setup-intent`)*.

## Data Models & Integrations
- **Data Models**: Users, Participants, Statements, Invoices, AI Tool Usage, Household Members.
- **Integrations**:
  - **Stripe**: Handles SaaS subscription plans and card storage.
  - **LLM / Emergent**: Used for decoding statements, generating letters, and AI chats.
- **Target-Platform Variants Needed**:
  - **Stripe SetupIntent**: The web app heavily relies on URL redirects to Stripe Hosted Checkout. On mobile, to provide a native experience and potentially comply with App Store rules, a native `@stripe/stripe-react-native` integration with a backend `SetupIntent` (to securely capture card details without an immediate charge) is required.

## Port Requirements (Target Platform - Mobile)
To complete the React Native / Expo build (`/app/mobile`), the following must be implemented:
- **Full Onboarding Replication**:
  - Build out `app/onboarding.tsx` mimicking the web's `OnboardingRouter.jsx` and its child steps.
  - Implement state-based multi-step form (Persona selection -> Essentials -> Authorisation).
  - Consume `POST /api/participants` to save the created profile before routing to `(tabs)/index.tsx`.
  - **Platform Notes**: Use `KeyboardAvoidingView`, `ScrollView`, and `SafeAreaView` for smooth form entry. Replace web `onClick` with `onPress`.
- **Plan Selection & Stripe SetupIntent (`app/plan-select.tsx` / `app/plan-billing.tsx`)**:
  - Replicate the web `Pricing.jsx` tier cards and feature lists natively using `View` and `Text`.
  - Implement the Stripe native card capture using `@stripe/stripe-react-native` (`CardField` or `PaymentSheet`).
  - **Platform Notes**: Testing this requires a custom development client (Native build) as it will not function inside Expo Go or the Web fallback. 
- **Family Members in Settings (`app/family-members.tsx`)**:
  - Port the web members list and invite management into a native screen accessible from the Settings tab.
  - Use native modal/bottom-sheet patterns for the invite form.
  - Consume `GET /api/household/members` and `POST /api/household/invite`.
- **Visual Parity**:
  - Match web per-screen spacing and contrast.
  - Ensure all new screens support the existing `useTheme()` hook for seamless Light/Dark mode transitions.

## Open Questions / Risks
1. **Stripe SetupIntent Backend**: The frontend PRD mentions a Stripe SetupIntent flow, but it's unclear if the `/api/payments/setup-intent` endpoint exists in `/app/backend` or if it must be created as part of this port.
2. **Testing Native Modules**: Because `@stripe/stripe-react-native` requires a native build, how should automated agents or developers test this locally? Will the `integration_expert` handle compiling the native dev client?
3. **Deep Linking**: Family member invites send an email with a web URL (`/invite/accept`). Universal Links (iOS) and App Links (Android) will need to be configured in `app.json` so tapping the email link on a mobile device opens the Expo app directly.