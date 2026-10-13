import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useAuth } from "@/src/context/AuthContext";
import { Screen, T } from "@/src/components/ui";
import { WaylyLoader } from "@/src/components/WaylyLoader";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { getPendingPlan, planStatusIsValid } from "@/src/lib/api";

// Calm, premium app-open splash: the Wayly mark draws itself while auth
// resolves — no spinner, no jolt.
function CalmSplash() {
  const { colors, isDark } = useTheme();
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(700)}>
          <WaylyLoader size={104} white={isDark} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(350).duration(900)}>
          <T style={[styles.label, { color: colors.muted }]}>Getting things ready…</T>
        </Animated.View>
      </View>
    </Screen>
  );
}

export default function Index() {
  const { user, loading } = useAuth();
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    getPendingPlan().then(setPending);
  }, []);

  if (loading || pending === null) return <CalmSplash />;

  if (!user) return <Redirect href="/login" />;

  // A fresh signup that hasn't completed its Stripe checkout is held on
  // /plan-select until a valid plan/trial exists — no plan-less account use.
  if (pending && !planStatusIsValid(user.subscription_status)) {
    return <Redirect href="/plan-select" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  label: { fontFamily: fonts.body, fontSize: 14, letterSpacing: 0.3 },
});
