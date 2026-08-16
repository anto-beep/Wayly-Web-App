# 📱 Mobile Agent — `whoami` Boot Diagnostic

Purpose: on app boot, log a clear banner that tells you (in the Expo Go
JS console) exactly which backend the app is hitting and whether that
backend is reachable. If login is broken, this makes the misconfig
obvious in the first 3 lines of logs.

## Drop-in file

Add **`app/mobile/src/lib/whoami.js`** (or wherever your `lib/` lives).
It has zero dependencies beyond React Native + Expo `Constants`.

```javascript
// src/lib/whoami.js
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
// If you use SecureStore for the auth token instead, swap the import:
// import * as SecureStore from "expo-secure-store";

/**
 * Resolve the API base URL from Expo config / env in the SAME order the
 * app itself should. If this resolves to undefined, localhost, or the
 * wrong host, `wayly` login and every other request will 401 / timeout.
 *
 * Priority:
 *   1. process.env.EXPO_PUBLIC_WAYLY_API_URL  (Expo SDK 49+)
 *   2. Constants.expoConfig.extra.waylyApiUrl (app.config.js "extra")
 *   3. Constants.manifest.extra.waylyApiUrl   (legacy manifest)
 */
export function resolveApiUrl() {
    return (
        process.env.EXPO_PUBLIC_WAYLY_API_URL ||
        Constants?.expoConfig?.extra?.waylyApiUrl ||
        Constants?.manifest?.extra?.waylyApiUrl ||
        null
    );
}

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

function banner(color, title, lines) {
    // Expo Go / Metro renders ANSI in the terminal but strips it on the
    // in-app console — the plain text is still perfectly readable there.
    /* eslint-disable no-console */
    console.log("");
    console.log(`${color}┌── ${title} ──────────────────────────────────${RESET}`);
    for (const l of lines) console.log(`${color}│${RESET} ${l}`);
    console.log(`${color}└──────────────────────────────────────────────${RESET}`);
    console.log("");
    /* eslint-enable no-console */
}

/**
 * Call this from App.js / _layout.tsx BEFORE the first API request.
 *
 *   import { runWhoAmI } from "@/lib/whoami";
 *   useEffect(() => { runWhoAmI(); }, []);
 */
export async function runWhoAmI() {
    const apiUrl = resolveApiUrl();
    const runtime = {
        platform: Platform.OS,                       // "ios" | "android"
        expoVersion: Constants.expoVersion,
        appOwnership: Constants.appOwnership,        // "expo" if Expo Go, "standalone" if built
        deviceName: Constants.deviceName,
        expoRuntimeVersion: Constants.expoRuntimeVersion,
    };

    // 1. Fail-loud if API URL is missing or obviously wrong
    if (!apiUrl) {
        banner(RED, "WAYLY WHOAMI — MISCONFIG", [
            "❌ No API URL resolved.",
            "   Set EXPO_PUBLIC_WAYLY_API_URL in your .env, OR",
            "   Set extra.waylyApiUrl in app.config.js",
            "   Expected value: https://mobile-exact-parity.preview.emergentagent.com",
            "",
            `Runtime: ${JSON.stringify(runtime)}`,
        ]);
        return { ok: false, reason: "no_api_url", runtime };
    }

    // 2. Warn if URL is localhost — Expo Go on a real device cannot reach the dev laptop
    const isLocalhost = /^(https?:\/\/)?(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?/i.test(apiUrl);
    if (isLocalhost && Constants.appOwnership === "expo") {
        banner(YELLOW, "WAYLY WHOAMI — LOCALHOST WARNING", [
            `⚠ API URL = ${apiUrl}`,
            "   On a real device via Expo Go, 'localhost' refers to the PHONE,",
            "   not your dev laptop. Login will fail with a network error.",
            "   Use the preview URL for shared QA:",
            "     https://mobile-exact-parity.preview.emergentagent.com",
            "   OR your LAN IP if running a local backend (e.g. http://192.168.x.x:8001)",
        ]);
    }

    // 3. Probe /api/health — cheap, unauth'd, 200 within a few ms
    let health = null;
    let healthError = null;
    const started = Date.now();
    try {
        const r = await fetch(`${apiUrl}/api/health`, { method: "GET" });
        const body = await r.text();
        let parsed = body;
        try { parsed = JSON.parse(body); } catch { /* keep raw */ }
        health = { status: r.status, ok: r.ok, body: parsed, latency_ms: Date.now() - started };
    } catch (e) {
        healthError = { message: String(e?.message || e), latency_ms: Date.now() - started };
    }

    // 4. If a token is stored, hit /api/auth/me so we know if THIS device is signed in
    let me = null;
    let meError = null;
    let token = null;
    try {
        token = await AsyncStorage.getItem("wayly_access_token");
        // If you use SecureStore: token = await SecureStore.getItemAsync("wayly_access_token");
    } catch { /* no-op */ }

    if (token) {
        try {
            const r = await fetch(`${apiUrl}/api/auth/me`, {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await r.text();
            let parsed = body;
            try { parsed = JSON.parse(body); } catch { /* keep raw */ }
            me = { status: r.status, ok: r.ok, body: parsed };
        } catch (e) {
            meError = String(e?.message || e);
        }
    }

    // 5. Emit the final banner
    const healthOk = health?.ok === true;
    const color = healthOk ? GREEN : RED;
    const lines = [
        `API URL     : ${apiUrl}`,
        `Platform    : ${runtime.platform} · Expo Go: ${runtime.appOwnership === "expo" ? "yes" : "no"}`,
        `Device      : ${runtime.deviceName || "-"}`,
        "",
        `GET /api/health → ${health ? `${health.status} in ${health.latency_ms}ms` : `ERROR ${healthError?.message}`}`,
    ];
    if (healthOk && health?.body) {
        lines.push(`  body: ${typeof health.body === "string" ? health.body : JSON.stringify(health.body)}`);
    }
    if (token) {
        lines.push("");
        lines.push(`GET /api/auth/me (with stored token) → ${me ? me.status : `ERROR ${meError}`}`);
        if (me?.ok && me?.body?.email) {
            lines.push(`  signed in as: ${me.body.email}  ·  plan=${me.body.plan}  ·  role=${me.body.role}`);
        } else if (me && !me.ok) {
            lines.push(`  token appears invalid or expired — call /auth/refresh or force logout`);
        }
    } else {
        lines.push("");
        lines.push(`${DIM}(no stored token — expected on first launch)${RESET}`);
    }
    banner(color, `WAYLY WHOAMI — ${healthOk ? "OK" : "UNREACHABLE"}`, lines);

    return { ok: healthOk, apiUrl, health, me, token: Boolean(token), runtime };
}
```

## Hook it into app boot

**`App.js`** (or `app/_layout.tsx` for Expo Router):

```javascript
import { useEffect } from "react";
import { runWhoAmI } from "@/lib/whoami";

export default function App() {
    useEffect(() => { runWhoAmI(); }, []);
    // …the rest of your providers/router
    return <YourAppRoot />;
}
```

## What you'll see in the Expo Go console

**Happy path (correct URL, backend reachable, no token yet):**
```
┌── WAYLY WHOAMI — OK ────────────────────────────────
│  API URL     : https://mobile-exact-parity.preview.emergentagent.com
│  Platform    : ios · Expo Go: yes
│  Device      : iPhone 15 Pro
│
│  GET /api/health → 200 in 187ms
│    body: {"status":"ok","time":"…"}
│
│  (no stored token — expected on first launch)
└──────────────────────────────────────────────────────
```

**Misconfig — no API URL:**
```
┌── WAYLY WHOAMI — MISCONFIG ────────────────────────
│  ❌ No API URL resolved.
│     Set EXPO_PUBLIC_WAYLY_API_URL in your .env, OR
│     Set extra.waylyApiUrl in app.config.js
│     Expected value: https://mobile-exact-parity.preview.emergentagent.com
└──────────────────────────────────────────────────────
```

**Reachability failure — DNS / offline / wrong host:**
```
┌── WAYLY WHOAMI — UNREACHABLE ──────────────────────
│  API URL     : https://mobile-exact-parity.preview.emergentagent.com
│  GET /api/health → ERROR Network request failed
└──────────────────────────────────────────────────────
```

That last line is the exact symptom you're likely seeing when
`jeremy@test.com` login "does nothing" in Expo Go: the request never
reaches the backend, so no auth logic runs.

## Env config reminder

**`.env`** at the repo root:
```
EXPO_PUBLIC_WAYLY_API_URL=https://mobile-exact-parity.preview.emergentagent.com
```

**`app.config.js`** if you prefer the `extra` route:
```javascript
export default ({ config }) => ({
  ...config,
  extra: {
    waylyApiUrl: process.env.EXPO_PUBLIC_WAYLY_API_URL,
  },
});
```

Rebuild the dev client / restart Expo (`npx expo start -c` to clear
cache) after changing env — Expo Go caches the manifest aggressively.

## Optional: strict-mode fetch wrapper

If you want the misconfig to break loudly on every request (not just
boot), wrap your fetch client:

```javascript
import { resolveApiUrl } from "@/lib/whoami";

export async function api(path, options = {}) {
    const base = resolveApiUrl();
    if (!base) throw new Error("WAYLY_API_URL is not configured");
    if (!path.startsWith("/api/")) throw new Error(`API path must start with /api/: ${path}`);
    return fetch(`${base}${path}`, options);
}
```

This guarantees you never silently hit `undefined/api/auth/login`.
