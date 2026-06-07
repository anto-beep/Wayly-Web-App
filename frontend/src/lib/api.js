import axios from "axios";
import { toast } from "sonner";
import { tagRequestId } from "@/lib/sentry";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Auto-inject the active participant id on every request so the backend can
// scope statements / documents / calendar / digest etc. to the participant the
// caregiver is currently looking at. Read from the same key the
// ParticipantsContext writes to.
api.interceptors.request.use((config) => {
    try {
        const pid = window.localStorage.getItem("wayly_active_participant_id");
        if (pid) {
            config.headers = config.headers || {};
            config.headers["X-Participant-Id"] = pid;
        }
    } catch { /* ignore */ }
    return config;
});

/**
 * Safely extract a human-readable string from an axios error response.
 * FastAPI raises HTTPException with `detail` that may be either a plain
 * string OR a structured object (e.g. {error, message, next_available_at}).
 * Rendering the object directly into JSX crashes React, so every call site
 * MUST go through this helper.
 */
export function extractErrorMessage(err, fallback = "Something went wrong. Try again.") {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
        return detail.message;
    }
    const msg = err?.response?.data?.message;
    if (typeof msg === "string") return msg;
    return fallback;
}

// --- Phase 1 security: refresh-token rotation -----------------------------
// On any 401 the interceptor below tries to swap the stored refresh token
// for a fresh access token, then retries the original request once. If the
// refresh itself fails the user is logged out (tokens cleared).
let _refreshPromise = null;
async function _tryRefreshAccessToken() {
    if (_refreshPromise) return _refreshPromise;
    const refresh = localStorage.getItem("kindred_refresh_token");
    if (!refresh) return null;
    _refreshPromise = (async () => {
        try {
            const { data } = await axios.post(
                `${API}/auth/refresh`,
                { refresh_token: refresh },
                { headers: { "Content-Type": "application/json" } },
            );
            if (data?.token) {
                setAuthToken(data.token);
                if (data.refresh_token) {
                    localStorage.setItem("kindred_refresh_token", data.refresh_token);
                }
                return data.token;
            }
            return null;
        } catch {
            // Refresh failed → kill all stored creds. The next /auth/me check
            // in AuthContext will flip the user state to null.
            setAuthToken(null);
            try { localStorage.removeItem("kindred_refresh_token"); } catch { /* ignore */ }
            return null;
        } finally {
            _refreshPromise = null;
        }
    })();
    return _refreshPromise;
}

// Global error interceptor — maps backend error codes to friendly toasts,
// AND auto-retries one time on 401 using the refresh token.
api.interceptors.response.use(
    (response) => {
        // Cross-stack request correlation: tag the active Sentry scope with the
        // backend request id so a frontend error can be jumped to its server log.
        try {
            const rid = response?.headers?.["x-request-id"];
            if (rid) tagRequestId(rid);
        } catch { /* ignore */ }
        return response;
    },
    async (error) => {
        try {
            const rid = error?.response?.headers?.["x-request-id"];
            if (rid) tagRequestId(rid);
        } catch { /* ignore */ }
        const status = error?.response?.status;
        const detailMsg = extractErrorMessage(error, "");
        const url = error?.config?.url || "";
        const isAuthRoute = url.includes("/auth/refresh") || url.includes("/auth/login") || url.includes("/auth/signup");

        if (status === 401 && !isAuthRoute && !error.config?._retried) {
            error.config._retried = true;
            const fresh = await _tryRefreshAccessToken();
            if (fresh) {
                error.config.headers = error.config.headers || {};
                error.config.headers.Authorization = `Bearer ${fresh}`;
                return api.request(error.config);
            }
        }

        if (status === 429) {
            toast.warning(detailMsg || "You've reached the usage limit. Sign up free for more.");
        } else if (status === 503) {
            toast.error(detailMsg || "Our AI is taking a short break. Try again in a few minutes.");
        }
        return Promise.reject(error);
    },
);

export function setAuthToken(token) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        localStorage.setItem("kindred_token", token);
    } else {
        delete api.defaults.headers.common.Authorization;
        localStorage.removeItem("kindred_token");
    }
}

export function setRefreshToken(refresh) {
    if (refresh) localStorage.setItem("kindred_refresh_token", refresh);
    else localStorage.removeItem("kindred_refresh_token");
}

// Impersonation — if an admin started a read-only impersonation session
// (admin panel → User Profile → "Impersonate"), the impersonation JWT
// overrides the normal user token. All mutations are blocked client-side.
api.interceptors.request.use((cfg) => {
    const imp = localStorage.getItem("wayly_impersonation_token");
    if (imp) {
        cfg.headers = cfg.headers || {};
        cfg.headers.Authorization = `Bearer ${imp}`;
        const method = (cfg.method || "get").toLowerCase();
        if (["post", "put", "patch", "delete"].includes(method)) {
            // Allow auth/me probes — they're GETs so this branch never hits anyway.
            return Promise.reject(new Error("Impersonation is read-only — all writes are disabled."));
        }
    }
    return cfg;
});

const stored = localStorage.getItem("kindred_token");
if (stored) {
    api.defaults.headers.common.Authorization = `Bearer ${stored}`;
}

export function formatAUD(n) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
    }).format(n || 0);
}

export function formatAUD2(n) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
    }).format(n || 0);
}
