# Cross-Platform Blueprint: Web to Mobile

## Detection
- **Source Platform**: Web (`/app/frontend`). Validated by the presence of a mature React application with `package.json`, Tailwind config, and `src/pages` containing over 80+ `.jsx` files.
- **Target Platform**: Mobile (`/app/mobile`). Validated by the presence of an Expo / React Native scaffolding using `expo-router` under `app/`.
- **Assumption**: We are building the remaining missing flows on the mobile app to achieve full parity with the web version, specifically focusing on full onboarding, plan selection, Stripe integration, and household management, as identified in `PRD.md`.

## Existing App Map (Web)
- **Screens & Routes**:
  - **Marketing/Onboarding**: `/login`, `/signup`, `/onboarding` (multi-step `OnboardingRouter.jsx` handling persona, role, care-recipient details, and secondary family members).
  - **Billing**: `/pricing` (displays plans and handles Stripe checkout redirects).
  - **Settings**: `/settings` (handles household member lists, invites, email/phone modifications, notification prefs).
- **Components & State**:
  - Uses `AuthContext` and `ParticipantContext` for global state.
  - `api.js` provides Axios interceptors for JWT token lifecycle.
  - Responsive layouts via Tailwind CSS; robust UI component library (cards, inputs, badges).
- **User Flows**:
  - **Auth & Onboarding**: Sign up -> Select Persona -> Care Recipient Details -> Add Family Member (if Family Plan) -> Dashboard.
  - **Billing & Subscription**: View Pricing -> Select Tier -> Stripe Hosted Checkout -> Success Redirect.
  - **Household Management**: Settings -> Family Members -> Send Invite -> Manage Access.

## Shared Backend API Surface
The mobile app will reuse the `/app/backend` FastAPI endpoints with JWT `Authorization: Bearer <token>`.
- **Auth & Accounts**:
  - `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- **Onboarding & Participants**:
  - `GET`, `PUT`, `DELETE /api/onboarding/draft`: Manages onboarding wizard state.
  - `POST /api/participants`: Creates participant.
  - `GET /api/participants`: Lists current user's participants.
- **Household Management**:
  - `GET /api/household`: Fetches current household.
  - `GET /api/household/members`: Lists members.
  - `POST /api/household/invite`: Sends email invite.
  - `DELETE /api/household/members/{member_user_id}`: Revokes access.
- **Payments**:
  - `POST /api/payments/checkout`: Starts a new Stripe session returning `{ "url": "..." }`.

## Data Models & Integrations
- **Data Models**: Users, Participants, Households, Household Members, Statements.
- **Integrations**:
  - **Stripe**: Currently wired for web using a hosted checkout redirection model.
  - **Target-Platform Variants Needed**: The web flow relies on a browser redirect to Stripe Checkout (`/api/payments/checkout`). For native mobile parity without WebView redirects, we require the `@stripe/stripe-react-native` SDK to perform native card capture using a SetupIntent. **A new `/api/payments/setup-intent` or similar endpoint must be created** to issue the client secret.

## Port Requirements (Target Platform - Mobile)
To achieve full parity in `/app/mobile`, the following must be implemented using React Native and Expo:
- **Full Onboarding Replication**:
  - Implement `app/onboarding.tsx` mimicking the web `OnboardingRouter.jsx`.
  - Wire steps to `GET/PUT/DELETE /api/onboarding/draft`.
  - *Platform Notes*: Use `KeyboardAvoidingView` and `ScrollView`. Replace web `onClick` with `onPress`.
- **Plan Selection & Stripe Card Capture**:
  - Replicate the web `Pricing.jsx` tiers natively.
  - Integrate `@stripe/stripe-react-native` `PaymentSheet` or `CardField`.
  - *Platform Notes*: Requires custom dev client to test the native Stripe module. Do not rely on Expo Go.
- **Family Members in Settings**:
  - Replicate the household list and invite form under `app/settings/family-members.tsx` or similar.
  - Consume `/api/household/members` and `/api/household/invite`.
  - *Platform Notes*: Use native bottom sheets or modals for the invite form.
- **Visual Audit Pass**:
  - Ensure dark mode / light mode compatibility using existing `useTheme()` hooks.
  - Match web per-screen spacing and resolve any truncation with `numberOfLines`.

## Open Questions / Risks
1. **Stripe SetupIntent Endpoint**: The backend currently only has `checkout` for web redirection. A `setup-intent` (or equivalent `payment-intent` for native flows) endpoint is missing and must be developed by the integration agent.
2. **Native Testing Environment**: Validating `@stripe/stripe-react-native` requires a native build environment since it cannot be mocked effectively in pure web or Expo Go fallback modes.
