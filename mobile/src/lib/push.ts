// Mobile push notification client (Emergent managed relay).
// Native-only: every call is guarded so the web preview never touches
// expo-notifications (its APIs crash on web).
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

import { API } from "@/src/lib/api";

// Register this device's native token with the backend. Called after login and
// on every app open (tokens rotate; backend upserts). Never blocks app flow.
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice || !userId) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${API}/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch {
    /* non-blocking */
  }
}
