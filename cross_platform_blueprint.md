# Cross-Platform Blueprint: Web to Mobile

## Detection
- **Source Platform**: Web (`/app/frontend`) – The directory contains a massive, fully-featured React application (>100 pages, Tailwind CSS, React Router, complex auth and contexts).
- **Target Platform**: Mobile (`/app/mobile`) – The directory contains an almost empty Expo project scaffolding (`expo-router` setup, basic `app.json`, `+html.tsx`). 
- **Assumption**: We are building the mobile version of the Wayly Caregiver Dashboard, aiming for parity with the existing web app.

## Existing App Map (Web)
- **Primary Screens / Routes**:
  - **Marketing & Onboarding**: `/` (Landing), `/login`, `/signup`, `/onboarding`.
  - **Caregiver Dashboard**: `/app` (Dashboard), `/app/family`, `/app/calendar`.
  - **Statements & Invoices**: `/app/statements` (list, detail, upload, compare), `/app/invoices`.
  - **AI Tools**: `/ai-tools`, `/ai-tools/statement-decoder`, `/ai-tools/invoice-checker`, `/app/ask-wayly`.
  - **Settings & Billing**: `/settings`, `/settings/billing`, `/settings/profile`.
- **Components & State**:
  - `AuthContext` and `ParticipantsContext` (Global state, uses `localStorage`).
  - Complex nested layouts: `Layout.jsx` with sidebar navigation (which becomes a bottom nav + drawer on narrow screens).
  - API interceptors (`api.js`) for token refresh and trial expiration blocking (Read-Only Mode).
- **Primary User Flows**:
  - Auth -> Onboarding -> Participant Context Switcher.
  - Uploading documents (Invoices/Statements) -> Viewing LLM-processed insights and financial aggregations.
  - Interacting with `Ask Wayly` via chat UI.

## Shared Backend API Surface
The new mobile frontend will reuse the same FastAPI backend (`/app/backend`) without modification. Key endpoints include:
- **Auth**: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`
- **Statements**: `GET /api/statements`, `GET /api/statements/{id}`, `POST /api/statements/upload`, `POST /api/sd3/statements/{sid}/decode-v2/stream` (SSE stream)
- **Invoices**: `GET /api/invoices`, `POST /api/invoices/upload`
- **Participants**: `GET /api/participants`, `POST /api/participants`
- **Payments (Stripe)**: `POST /api/payments/checkout`, `GET /api/payments/invoices`
- **Notifications**: `GET /api/notifications`

*All API calls on mobile will need `Authorization: Bearer <token>` and `X-Participant-Id: <id>` headers mirroring the web interceptors.*

## Data Models & Integrations
- **Data Models**: Users, Households, Participants, Statements, Invoices, Chat Threads.
- **Integrations**: 
  - **Stripe**: Handles subscriptions. 
  - **LLM / Emergent**: Document decoding and smart summaries.
- **Target-Platform Variants Needed**: 
  - Stripe Checkout on the web redirects `window.location`. On mobile, it will require `expo-web-browser` to open the Stripe portal, or deep-linking to return to the app.

## Port Requirements (Target Platform - Mobile)
To build this on the React Native / Expo stack (`/app/mobile`), the following translations are required:
- **Routing**: Migrate `react-router-dom` to `expo-router` file-based routing. Use a `(tabs)` layout to replicate the web's mobile view: `Dashboard`, `Family Wall`, `Statements`, and a `More` tab (drawer/modal) for the remaining sidebar links.
- **UI & Layout**: 
  - Translate HTML/Tailwind (`div`, `span`, `img`) to React Native components (`View`, `Text`, `Image`).
  - Use `SafeAreaView` or `useSafeAreaInsets()` to handle notches and dynamic islands.
  - Implement `KeyboardAvoidingView` or `ScrollView` wrappers for form-heavy screens (e.g., Auth, Onboarding).
- **Interactions**: Replace `onClick` with `onPress` (via `TouchableOpacity` or `Pressable`).
- **Environment**: Replace `REACT_APP_BACKEND_URL` with `EXPO_PUBLIC_BACKEND_URL`.
- **Storage**: Replace `localStorage` (used for `kindred_token`, `kindred_refresh_token`, `wayly_active_participant_id`) with `expo-secure-store` or `@react-native-async-storage/async-storage`.
- **File Uploads**: Replace the browser `<input type="file" />` with `expo-document-picker` for PDF/Doc and `expo-image-picker` for photos. Generate standard `FormData` or base64 streams as expected by the backend.
- **SSE Streams**: For `Ask Wayly` and streaming document decoding, React Native requires specialized polyfills or a library like `react-native-sse` since native `fetch` streams can be problematic.

## Open Questions / Risks
1. **MVP Scope**: The web app has over 100 pages. Should the initial mobile rollout include ALL modules (e.g., `CarerSelfAssessment`, `BudgetScenarios`), or just the core tabs (Dashboard, Statements, Ask Wayly)?
2. **Billing / App Store Guidelines**: The web app uses Stripe for SaaS plans. If shipped to the App Store / Play Store, Apple/Google might enforce Native In-App Purchases instead of embedded Stripe webviews, risking app rejection.
3. **Deep Linking**: The web uses URLs for email verification (`/verify-email?token=...`). We will need to configure Universal Links (iOS) and App Links (Android) to route these back into the Expo app.