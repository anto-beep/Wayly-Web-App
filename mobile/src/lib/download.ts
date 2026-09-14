// Authenticated file download + native share sheet for the Wayly mobile app.
// The statement download/export endpoints are auth-gated, so we cannot just
// open them in a browser. We fetch the bytes with the bearer token, then hand
// the file to the OS share sheet (native) or a browser download (web preview).
import { Platform } from "react-native";
import { cacheDirectory, downloadAsync, writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API, getActiveParticipantId, getToken } from "@/src/lib/api";

function safeName(name: string): string {
  return (name || "file").replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const pid = await getActiveParticipantId();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (pid) headers["X-Participant-Id"] = pid;
  return headers;
}

// Download an /api path to a local file and open the native share sheet.
// On the web preview, fetch the blob and trigger a browser download instead.
// Returns the resulting uri. Throws on failure so callers can show an error.
export async function downloadAndShare(path: string, filename: string): Promise<string> {
  const headers = await authHeaders();

  if (Platform.OS === "web") {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const doc = (globalThis as any).document;
    if (doc) {
      const a = doc.createElement("a");
      a.href = url;
      a.download = safeName(filename);
      doc.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return url;
  }

  const target = `${cacheDirectory}${safeName(filename)}`;
  const res = await downloadAsync(`${API}${path}`, target, { headers });
  if (res.status !== 200) throw new Error(`Download failed (${res.status})`);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri);
  }
  return res.uri;
}

// Write a text string (e.g. a CSV) to a file and open the native share sheet.
// On web, triggers a browser download. Returns the uri/url.
export async function shareTextFile(filename: string, content: string, mime = "text/csv"): Promise<string> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const doc = (globalThis as any).document;
    if (doc) {
      const a = doc.createElement("a");
      a.href = url;
      a.download = safeName(filename);
      doc.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return url;
  }
  const target = `${cacheDirectory}${safeName(filename)}`;
  await writeAsStringAsync(target, content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: mime });
  }
  return target;
}


function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + "=";
  }
  return out;
}

// POST a JSON body to an endpoint that returns a PDF, then open the OS share
// sheet (native) / browser download (web). Used for server-rendered exports
// like the Classification Self-Check PDF. Throws on failure.
export async function sharePostPdf(path: string, body: unknown, filename: string): Promise<string> {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json", Accept: "application/pdf" };
  if (Platform.OS === "web") {
    const res = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const doc = (globalThis as any).document;
    if (doc) {
      const a = doc.createElement("a");
      a.href = url;
      a.download = safeName(filename);
      doc.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return url;
  }
  const res = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const b64 = arrayBufferToBase64(await res.arrayBuffer());
  const target = `${cacheDirectory}${safeName(filename)}`;
  await writeAsStringAsync(target, b64, { encoding: "base64" as any });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: "application/pdf" });
  }
  return target;
}
