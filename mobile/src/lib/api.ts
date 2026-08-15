// Shared API client for the Wayly mobile app. Mirrors the web interceptor:
// attaches Authorization: Bearer <token> + X-Participant-Id, and transparently
// refreshes the access token on a 401 using the stored refresh token.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;

// One shared namespace/key pair for auth, read + written the same way
// everywhere (secure*). A mismatch silently logs the user out.
export const TOKEN_KEY = "kindred_token";
export const REFRESH_KEY = "kindred_refresh_token";
export const ACTIVE_PARTICIPANT_KEY = "wayly_active_participant_id";

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "");
}
export async function setTokens(token: string, refresh?: string | null): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
  if (refresh) await storage.secureSet(REFRESH_KEY, refresh);
}
export async function clearTokens(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
  await storage.secureRemove(REFRESH_KEY);
}
export async function getActiveParticipantId(): Promise<string> {
  return (await storage.getItem<string>(ACTIVE_PARTICIPANT_KEY, "")) || "";
}
export async function setActiveParticipantId(id: string): Promise<void> {
  if (id) await storage.setItem(ACTIVE_PARTICIPANT_KEY, id);
  else await storage.removeItem(ACTIVE_PARTICIPANT_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await storage.secureGet<string>(REFRESH_KEY, "");
  if (!refresh) return null;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.token) {
      await setTokens(data.token, data.refresh_token);
      return data.token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type ReqOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  auth?: boolean; // attach bearer token (default true)
  isForm?: boolean; // body is FormData
  _retried?: boolean;
};

export async function apiFetch<T = any>(path: string, opts: ReqOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, auth = true, isForm = false } = opts;
  const h: Record<string, string> = { ...headers };
  if (!isForm && body !== undefined) h["Content-Type"] = "application/json";

  if (auth) {
    const token = await getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
    const pid = await getActiveParticipantId();
    if (pid) h["X-Participant-Id"] = pid;
  }

  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Transparent refresh on 401 (once).
  if (res.status === 401 && auth && !opts._retried) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      return apiFetch<T>(path, { ...opts, _retried: true });
    }
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail?.message || data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed", data);
  }
  return data as T;
}
