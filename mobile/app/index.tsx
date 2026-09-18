import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useAuth } from "@/src/context/AuthContext";
import { Screen, T } from "@/src/components/ui";
import { WaylyLoader } from "@/src/components/WaylyLoader";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

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

  if (loading) return <CalmSplash />;

  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  label: { fontFamily: fonts.body, fontSize: 14, letterSpacing: 0.3 },
});
