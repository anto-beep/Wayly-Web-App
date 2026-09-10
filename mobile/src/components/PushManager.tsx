import { useEffect } from "react";
import { Alert, Linking, Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/src/context/AuthContext";
import { registerForPush } from "@/src/lib/push";

function routeFromData(data: any) {
  const url = data?.deeplink || data?.action_url;
  if (!url) return;
  if (String(url).startsWith("http")) Linking.openURL(url);
  else router.push(url);
}

// Handles push token registration, notification-tap routing (warm + cold start),
// and the weekly re-enable nudge for users who denied permission. Rendered
// inside the auth provider so it can react to the signed-in user.
export function PushManager() {
  const { user } = useAuth();

  // Register / re-register whenever we have a signed-in user.
  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromData(response.notification.request.content.data || {});
    });

    // Cold-start tap (app was killed).
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromData(response.notification.request.content.data || {});
    });

    // Weekly nudge for users who permanently denied notifications.
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        Alert.alert(
          "Stay in the loop",
          "Turn on notifications to know the moment a statement is decoded or a charge needs checking.",
          [
            {
              text: "Later",
              style: "cancel",
              onPress: () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())),
            },
            {
              text: "Open Settings",
              onPress: () => {
                AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
                Linking.openSettings();
              },
            },
          ]
        );
      } catch {
        /* ignore */
      }
    })();

    return () => {
      tapSub.remove();
    };
  }, []);

  return null;
}
