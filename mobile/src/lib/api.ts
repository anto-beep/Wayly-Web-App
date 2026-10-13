// Shared API client for the Wayly mobile app. Mirrors the web interceptor:
// attaches Authorization: Bearer <token> + X-Participant-Id, and transparently
// refreshes the access token on a 401 using the stored refresh token.
import { Platform } from "react-native";
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

// ---- Pending-plan gate ----------------------------------------------------
// A fresh email/password signup creates the account (so checkout can be run
// against it) but MUST NOT be able to use the app until a valid Stripe
// checkout (7-day trial) is completed. We set this flag at signup and clear it
// once the subscription is active/trialing. The app-open gate (app/index.tsx)
// routes a flagged account to /plan-select until it has a valid plan — so no
// one can create and use an account without a valid plan.
export const PENDING_PLAN_KEY = "wayly_pending_plan";
export async function setPendingPlan(): Promise<void> { await storage.setItem(PENDING_PLAN_KEY, "1"); }
export async function getPendingPlan(): Promise<boolean> { return !!(await storage.getItem<string>(PENDING_PLAN_KEY, "")); }
export async function clearPendingPlan(): Promise<void> { await storage.removeItem(PENDING_PLAN_KEY); }

// True when a subscription status grants app access (active paid or an open trial).
export function planStatusIsValid(subscriptionStatus?: string | null): boolean {
  const s = (subscriptionStatus || "").toLowerCase();
  return s === "active" || s === "trialing" || s === "trial";
}

// ---- View-only (read-only) mode ------------------------------------------
// Mirrors the web api.js guard. AuthContext flips this whenever /auth/me
// reports access_state === "view_only" (cancelled trial, cancelled/ended paid
// plan, or an unresolved payment failure). When ON, any write that isn't an
// allow-listed prefix is rejected locally with a friendly 402 before hitting
// the network — a defense-in-depth layer alongside the backend 402 middleware.
let _readOnlyMode = false;
export function setReadOnlyMode(flag: boolean): void {
  _readOnlyMode = !!flag;
}
export function isReadOnlyMode(): boolean {
  return _readOnlyMode;
}
export const READ_ONLY_MESSAGE =
  "Your plan is inactive. You can still view everything you've saved.";
const _READ_ONLY_ALLOW_PREFIXES = [
  "/auth/",
  "/billing/",
  "/payments/", // reactivation / checkout — view-only users must be able to subscribe
  "/stripe/",
  "/users/me",
  "/admin/",
  "/health",
  "/contact",
  "/support/",
];
function _isAllowedReadOnlyWrite(path = ""): boolean {
  const u = path.replace(/^\/api/, "");
  return _READ_ONLY_ALLOW_PREFIXES.some((p) => u.startsWith(p));
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

type StreamHandlers = {
  onDelta: (text: string) => void;
  onDone: (full: string, sessionId?: string, extra?: any) => void;
  onError: (message: string) => void;
};

/**
 * Stream Ask Wayly replies token-by-token over Server-Sent Events.
 *
 * React Native's fetch cannot read a streaming response body, so we use
 * XMLHttpRequest and parse incremental `responseText` in onprogress. Returns
 * an abort() function. The backend emits `data: {"delta":"..."}` frames and a
 * final `data: {"done":true,"full":"<clean reply>","session_id":"..."}`.
 */
export async function streamChat(body: Record<string, any>, h: StreamHandlers): Promise<() => void> {
  return streamPost("/chat/stream", body, h);
}

/**
 * Stream an Ask Wayly (AW-2) reply for an existing conversation. The done frame
 * carries `{done, full, assistant_message}` which arrives via onDone's `extra`.
 */
export async function streamAw2(cid: string, userMessage: string, h: StreamHandlers): Promise<() => void> {
  return streamPost(`/aw2/conversations/${cid}/messages/stream`, { user_message: userMessage }, h);
}

async function streamPost(path: string, body: Record<string, any>, h: StreamHandlers): Promise<() => void> {
  if (_readOnlyMode && !_isAllowedReadOnlyWrite(path)) {
    h.onError(READ_ONLY_MESSAGE);
    return () => {};
  }
  const token = await getToken();
  const pid = await getActiveParticipantId();
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API}${path}`);
  xhr.setRequestHeader("Content-Type", "application/json");
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  if (pid) xhr.setRequestHeader("X-Participant-Id", pid);

  let processed = 0; // index into responseText already consumed
  let pending = "";
  let finished = false;

  const handleFrame = (frame: string) => {
    const line = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!line) return;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr) return;
    try {
      const evt = JSON.parse(jsonStr);
      if (evt.done) {
        finished = true;
        h.onDone(evt.full || "", evt.session_id, evt);
      } else if (typeof evt.delta === "string") {
        h.onDelta(evt.delta);
      }
    } catch {
      /* ignore partial/non-JSON */
    }
  };

  const consume = () => {
    const text = xhr.responseText || "";
    if (text.length <= processed) return;
    pending += text.slice(processed);
    processed = text.length;
    let idx: number;
    while ((idx = pending.indexOf("\n\n")) !== -1) {
      const frame = pending.slice(0, idx);
      pending = pending.slice(idx + 2);
      if (frame.trim()) handleFrame(frame);
    }
  };

  xhr.onprogress = consume;
  xhr.onload = () => {
    consume();
    if (!finished) h.onError("The reply ended unexpectedly. Please try again.");
  };
  xhr.onerror = () => {
    if (!finished) h.onError("Sorry, something went wrong. Please try again.");
  };
  xhr.ontimeout = () => {
    if (!finished) h.onError("That took too long. Please try a shorter question.");
  };
  xhr.timeout = 90000;
  xhr.send(JSON.stringify(body));

  return () => {
    try {
      xhr.abort();
    } catch {
      /* noop */
    }
  };
}

export async function apiFetch<T = any>(path: string, opts: ReqOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, auth = true, isForm = false } = opts;
  const m = method.toUpperCase();

  // View-only guard: block writes locally (except allow-listed billing/auth).
  if (
    _readOnlyMode &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(m) &&
    !_isAllowedReadOnlyWrite(path)
  ) {
    throw new ApiError(402, READ_ONLY_MESSAGE, {
      detail: { error: "trial_expired", message: READ_ONLY_MESSAGE, read_only: true },
    });
  }

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

// ---- Native-safe file upload ---------------------------------------------
// React Native's fetch()+FormData silently fails for file:// uploads in
// release / TestFlight builds (works only in the Expo dev/web preview). On
// native we stream the file with expo-file-system (File.upload, multipart),
// which is reliable in production builds; on web we keep fetch()+FormData.
// Mirrors apiFetch: attaches the bearer token + X-Participant-Id, honours the
// view-only guard, refreshes the token once on 401, parses JSON, and throws
// ApiError on a non-2xx response.
export type UploadPart = { uri: string; name: string; mimeType?: string };

export async function uploadFile<T = any>(
  path: string,
  file: UploadPart,
  opts: { fieldName?: string; fields?: Record<string, string>; auth?: boolean } = {}
): Promise<T> {
  const { fieldName = "file", fields = {}, auth = true } = opts;

  if (_readOnlyMode && !_isAllowedReadOnlyWrite(path)) {
    throw new ApiError(402, READ_ONLY_MESSAGE, {
      detail: { error: "trial_expired", message: READ_ONLY_MESSAGE, read_only: true },
    });
  }

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = {};
    if (auth) {
      const token = await getToken();
      if (token) h["Authorization"] = `Bearer ${token}`;
      const pid = await getActiveParticipantId();
      if (pid) h["X-Participant-Id"] = pid;
    }
    return h;
  };

  const send = async (headers: Record<string, string>): Promise<{ status: number; body: string }> => {
    if (Platform.OS === "web") {
      const form = new FormData();
      const blob = await (await fetch(file.uri)).blob();
      form.append(fieldName, blob, file.name);
      Object.entries(fields).forEach(([k, v]) => form.append(k, v));
      const res = await fetch(`${API}${path}`, { method: "POST", headers, body: form });
      return { status: res.status, body: await res.text() };
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require("expo-file-system");
    const res = await new FS.File(file.uri).upload(`${API}${path}`, {
      httpMethod: "POST",
      uploadType: FS.UploadType.MULTIPART,
      fieldName,
      mimeType: file.mimeType || "application/octet-stream",
      headers,
      parameters: fields,
    });
    return { status: res.status, body: res.body };
  };

  let headers = await buildHeaders();
  let out = await send(headers);
  if (out.status === 401 && auth) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      headers = await buildHeaders();
      out = await send(headers);
    }
  }

  let data: any = null;
  try {
    data = out.body ? JSON.parse(out.body) : null;
  } catch {
    data = out.body;
  }
  if (out.status < 200 || out.status >= 300) {
    const detail =
      (data && (data.detail?.message || data.detail || data.message)) || `Request failed (${out.status})`;
    throw new ApiError(out.status, typeof detail === "string" ? detail : "Request failed", data);
  }
  return data as T;
}
