import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, X } from "lucide-react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";

/**
 * ViewOnlyBanner — pinned strip shown at the top of every authenticated screen
 * when the user's plan is inactive (cancelled trial, cancelled/ended paid plan,
 * or an unresolved payment failure → access_state === "view_only"). Data stays
 * visible; the only action offered is Reactivate → the plan picker (which goes
 * straight to Stripe Checkout). Dismissible — closing hides it for the current
 * screen only; it returns on the next navigation/reload (writes stay blocked
 * server-side regardless). Admins and active/trial users never see it.
 */
export function ViewOnlyBanner() {
  const { user, viewOnly } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !viewOnly || dismissed) return null;

  return (
    <View
      testID="view-only-banner"
      style={[
        styles.wrap,
        { backgroundColor: colors.gold, paddingTop: insets.top + 8 },
      ]}
    >
      <Lock size={16} color={colors.primaryFg} style={{ marginTop: 1 }} />
      <Text style={[styles.msg, { color: colors.primaryFg }]}>
        Your plan is inactive. Reactivate to pick up right where you left off — everything you&apos;ve
        saved is still here to view.
      </Text>
      <TouchableOpacity
        testID="view-only-banner-reactivate"
        onPress={() => router.push("/plan-select")}
        style={styles.btn}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Reactivate</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="view-only-banner-dismiss"
        onPress={() => setDismissed(true)}
        hitSlop={10}
        activeOpacity={0.7}
      >
        <X size={18} color={colors.primaryFg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  msg: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  // Always a white pill with dark navy text so it stays high-contrast on the
  // terracotta banner in BOTH light and dark themes (the previous theme.text
  // colour was white-on-white in dark mode).
  btn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
  },
  btnText: { fontSize: 12, fontWeight: "700", color: "#1C2B2D" },
});

export default ViewOnlyBanner;
