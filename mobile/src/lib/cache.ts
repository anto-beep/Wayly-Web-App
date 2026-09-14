// Lightweight on-device cache for offline access to recently viewed data.
// Backed by the app storage util (AsyncStorage native / IndexedDB web).
// Values are serialized to a JSON string since the storage util only accepts
// primitive values.
import { storage } from "@/src/utils/storage";

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    await storage.setItem(`cache:${key}`, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    /* best-effort */
  }
}

export async function cacheGet<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const raw = await storage.getItem<string>(`cache:${key}`, "");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed) return parsed;
    return null;
  } catch {
    return null;
  }
}
