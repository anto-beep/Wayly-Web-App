import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Global error interceptor — maps backend error codes to friendly toasts.
// Individual call sites can still catch and override.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const detail = error?.response?.data?.detail;
        const detailMsg = typeof detail === "string" ? detail : detail?.message;
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
