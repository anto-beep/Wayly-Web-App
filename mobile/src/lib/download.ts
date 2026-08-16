// Authenticated file download + native share sheet for the Wayly mobile app.
// The statement download/export endpoints are auth-gated, so we cannot just
// open them in a browser. We fetch the bytes with the bearer token, then hand
// the file to the OS share sheet (native) or a browser download (web preview).
import { Platform } from "react-native";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
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
