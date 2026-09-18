import { useEffect } from "react";
import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/src/context/AuthContext";
import { Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

// Calm, Headspace-style app-open splash: a gently breathing brand mark that
// fades in while auth resolves — no spinner, no jolt.
function CalmSplash() {
  const { colors, isDark } = useTheme();
  const breath = useSharedValue(1);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1.06, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath]);

  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(700)} style={markStyle}>
          <WaylyMark size={84} white={isDark} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(300).duration(900)}>
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
