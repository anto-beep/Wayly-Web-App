import React from "react";
import { StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Compass, Home, ChevronLeft } from "lucide-react-native";

import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { Screen, T, Button } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";

// Friendly catch-all for any route expo-router can't match — a stale/expired
// notification link, an old deep link, or anything that would otherwise show
// the default black "Unmatched route" error. We never dead-end the user:
// there's always a clear way back to the dashboard.
export default function NotFoundScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const homeHref = user ? "/(tabs)" : "/login";

  const goHome = () => router.replace(homeHref as any);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else goHome();
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: "center" }}>
          <View style={[styles.badge, { backgroundColor: colors.sageSoft }]}>
            <Compass size={34} color={colors.sage} />
          </View>
          <T style={[styles.title, { color: colors.text }]}>This page isn't available</T>
          <T style={[styles.body, { color: colors.muted }]}>
            The link you followed may have moved, or the item it pointed to is no
            longer here. Nothing's wrong with your account — let's get you back.
          </T>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.actions}>
          <Button
            testID="notfound-home"
            label={user ? "Go to home" : "Go to sign in"}
            icon={Home}
            onPress={goHome}
          />
          {router.canGoBack() ? (
            <Button
              testID="notfound-back"
              label="Go back"
              variant="outline"
              icon={ChevronLeft}
              onPress={goBack}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xl },
  badge: { width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { fontFamily: fonts.heading, fontSize: 24, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: spacing.sm, maxWidth: 320 },
  actions: { width: "100%", maxWidth: 360 },
});
