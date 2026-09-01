# Cross-Platform Port Blueprint

## 1. Detection
- **Source Platform**: Web (`/app/frontend`). Evidenced by React CRA setup (`react-scripts`, `react-snap`), `src/pages` containing 70+ components (`.jsx`), and DOM-based styling (Tailwind CSS, Radix UI).
- **Target Platform**: Mobile (`/app/mobile`). Evidenced by Expo Router initialization (`app/`, `app.json`), React Native dependencies (`react-native`, `expo`), and `BACKEND_HANDOFF.md` stipulating exact parity with the web app specifically for the caregiver surface.

## 2. Existing App Map (Web)
### Screens & Routes
- **Marketing / Public**: `/features`, `/pricing`, `/about`, `/contact`, `/trust`, `/legal/*` (pre-rendered via `react-snap`).
- **Authentication**: `Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`, `PasswordReset.jsx`, `AuthCallback.jsx`.
- **Caregiver Core Flows**: 
  - `CaregiverDashboard.jsx` (Central hub)
  - `ParticipantProfile.jsx`, `ParticipantCases.jsx` (Loved one details)
  - `StatementsList.jsx`, `StatementDetail.jsx`, `StatementCompare.jsx` (Decoding & managing aged care statements)
  - `InvoicesList.jsx`, `InvoiceDetail.jsx` (Tracking expenses)
  - `DocumentVault.jsx` (Secure storage for care docs)
- **Specialized AI Tools**: `BudgetScenarios.jsx`, `CarePlanDetail.jsx`, `ProviderSwitches.jsx`, `Reports.jsx`, `ChspTools.jsx`, `CarerSelfAssessment.jsx`, `FamilyCoordinator.jsx`.

### Components & State
- **UI Kit**: Relies heavily on Radix UI primitives and Tailwind CSS. Forms powered by `react-hook-form` and `zod`.
- **State/API**: Centralized via `api.js` (Axios) wrapping the `/api` prefix, with JWT token rotation stored in `localStorage`. Includes a read-only trial-expired interceptor.

## 3. Shared Backend API Surface
The FastAPI backend (`/app/backend`) is mounted at `/api` and serves both platforms. The mobile app MUST reuse these exact endpoints. Key reusable routes:
- **Auth**: `POST /auth/login`, `POST /auth/signup`, `GET /auth/me`, `POST /auth/refresh`
- **Participants**: `GET /participants`, `GET /v2/participants`, `POST /participants/{id}/share-link`
- **Statements**: `GET /statements`, `GET /statements/{id}`, `POST /statements/upload-job/{id}`
- **Invoices**: `GET /invoices`, `POST /invoices/{id}/save-to-vault`
- **Budgets & Pacing**: `GET /qp1/schedules`, `GET /qp1/pacing`, `GET /qp1/ledger`
- **Documents**: `GET /documents`, `POST /documents/upload`
- **Support / Feedback**: `GET /support/tickets`, `POST /support/tickets`
- **Account / Billing**: `GET /account`, `POST /payments/reactivate-subscription`

## 4. Data Models & Integrations
### Core MongoDB Collections
- `users` (Auth & profiles)
- `participants` (Care recipient details)
- `statements`, `invoices` (Financial docs)
- `documents` (Vault storage)
- `cases`, `lf1_correspondence`, `provider_switches`, `chsp_profiles` (Tooling data)
- `subscriptions`, `stripe_webhook_events` (Billing status)

### Integrations (Needs Mobile Translation)
- **Auth**: Web uses `@react-oauth/google`. Mobile needs `expo-auth-session` or Google Sign-In SDK.
- **Payments**: Web uses Stripe Elements. Mobile subscriptions might violate Apple/Google IAP policies unless properly bridged or shifted to out-of-app purchase.
- **Storage**: AWS Boto3 (S3). Mobile must upload using `expo-file-system` and multipart/form-data.
- **AI**: OpenAI & Google Generative AI (Server-side, opaque to the client).

## 5. Port Requirements (Target Platform - Mobile)
- **Framework Setup**: Use Expo Router (`app/`) with Stack and Tabs navigation (`app/(tabs)`).
- **Styling**: Replace Tailwind CSS with React Native `StyleSheet` mappings reading from a shared color token system (`theme/tokens.ts` mirroring web). Avoid hardcoding hex values.
- **API Client**: Replace `localStorage` token storage in `api.js` with `expo-secure-store` or `@react-native-async-storage/async-storage`. Keep the request/response interceptors (401 rotation, read-only mode).
- **Component Replacements**:
  - `<div>` / `<span>` → `<View>` / `<Text>`
  - `<input type="file">` → `expo-document-picker`
  - Charting (`Recharts`) → Need to evaluate an RN alternative (e.g., `react-native-svg-charts` or `victory-native`).
  - Web Modals (Radix Dialog) → React Native Modal or `react-native-bottom-sheet`.
- **Keyboard & Safeties**: Ensure all forms use `KeyboardAvoidingView` or `react-native-keyboard-aware-scroll-view`. Use `useSafeAreaInsets()` for top/bottom padding instead of web padding variables.
- **Navigation Flows**:
  - `CaregiverDashboard.jsx` maps to `app/(tabs)/index.tsx`.
  - `DocumentVault.jsx` maps to `app/(tabs)/documents.tsx`.
  - Deep linking from email requires configuring `expo-linking` schemes matching the web routes.

## 6. Open Questions / Risks
- **In-App Purchases vs Stripe**: Will the caregiver app allow subscription upgrades inside the mobile app? If so, Apple/Google IAP requires significant backend modeling changes. If not, users must be sent to the web version to pay.
- **PDF Viewing**: Web relies heavily on `react-pdf`. React Native does not natively render PDFs without `react-native-pdf` (which can be hard to link in Expo Go) or opening them in a `<WebView>`.
- **Push Notifications**: Web notifications are limited. Mobile will likely need robust integration with `expo-notifications`.
- **Marketing Pages Scope**: Should marketing routes (`/features`, `/pricing`) be strictly excluded from the mobile bundle, or shown via WebView if accessed?