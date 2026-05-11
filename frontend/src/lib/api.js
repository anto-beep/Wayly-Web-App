import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

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

// Global error interceptor — maps backend error codes to friendly toasts.
// Individual call sites can still catch and override.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const detailMsg = extractErrorMessage(error, "");
        // Don't double-toast on auth probe calls
        const isAuthMe = error?.config?.url?.includes("/auth/me");
        if (status === 429) {
            toast.warning(detailMsg || "You've reached the usage limit. Sign up free for more.");
        } else if (status === 503) {
            toast.error(detailMsg || "Our AI is taking a short break. Try again in a few minutes.");
        } else if (status === 401 && !isAuthMe) {
            // Let individual forms show the field-level error for login 401s
        }
        return Promise.reject(error);
    }
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
