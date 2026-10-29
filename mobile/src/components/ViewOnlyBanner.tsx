import React, { useState } from "react";
import { Pressable, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, X } from "lucide-react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts } from "@/src/theme/tokens";

/**
 * ViewOnlyBanner — a slim, consistent status strip pinned at the very top of
 * every authenticated screen when the plan is inactive (view_only). It is a
 * read-only indicator; tapping it (or "Reactivate") opens the plan picker.
 * Dismissible for the current screen only. On hard-locked screens the AccessGate
 * overlay sits above this, so the lock message is never doubled.
 */
export function ViewOnlyBanner() {
  const { user, viewOnly } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !viewOnly || dismissed) return null;

  return (
    <Pressable
      testID="view-only-banner"
      onPress={() => router.push("/plan-select")}
      style={[styles.wrap, { backgroundColor: colors.gold, paddingTop: insets.top + 6 }]}
    >
      <Lock size={14} color={colors.primaryFg} />
      <Text style={[styles.msg, { color: colors.primaryFg }]} numberOfLines={1}>
        Read-only — reactivate to use Wayly&apos;s tools
      </Text>
      <Text style={[styles.cta, { color: colors.primaryFg }]}>Reactivate</Text>
      <TouchableOpacity
        testID="view-only-banner-dismiss"
        onPress={() => setDismissed(true)}
        hitSlop={10}
        activeOpacity={0.7}
      >
        <X size={16} color={colors.primaryFg} />
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 7,
  },
  msg: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 12.5 },
  cta: { fontFamily: fonts.bodyBold, fontSize: 12, textDecorationLine: "underline" },
});

export default ViewOnlyBanner;
