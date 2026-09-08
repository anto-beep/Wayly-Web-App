# Auth Testing Playbook (Wayly — Web + Mobile)

The Wayly backend uses **JWT Bearer tokens** (`kindred_token` access + `kindred_refresh_token`) for ALL API calls on both web and mobile. Google login uses Emergent OAuth: the frontend obtains a `session_id` from `https://auth.emergentagent.com/?redirect=...` and exchanges it at `POST /api/auth/google-session { session_id }` → `{ token, refresh_token, user }`. Email/password uses `POST /api/auth/login` and `POST /api/auth/signup`.

## Mobile auth flow (Expo)
1. `redirectUrl` = `Linking.createURL('auth')` on native; `window.location.origin + '/'` on Expo web preview. NEVER hardcode.
2. Open `https://auth.emergentagent.com/?redirect=<encoded redirectUrl>` via `WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)` (native) or `window.location.href` (web preview).
3. Parse `session_id` from `result.url` fragment (native) or `window.location.hash`/`search` (web).
4. `POST /api/auth/google-session { session_id }` → store `token`/`refresh_token` via `expo-secure-store` (native) or `localStorage` (web preview).
5. All API calls send `Authorization: Bearer <token>` and `X-Participant-Id: <active participant id>`.

## Backend testing (shared, Bearer)
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
# login
curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"cathy@example.com","password":"<pwd>"}'
# me
curl -s "$API/api/auth/me" -H "Authorization: Bearer <token>"
```

## Test identities
- Super Admin: hello@techglove.com.au (see /app/memory/test_credentials.md)
- Test Caregiver: cathy@example.com

Checklist:
- /api/auth/login and /api/auth/signup return {token, refresh_token, user}
- /api/auth/me returns user for a Bearer token
- Google: /api/auth/google-session exchanges session_id → tokens
- Mobile stores tokens in expo-secure-store and sends Bearer on every call
