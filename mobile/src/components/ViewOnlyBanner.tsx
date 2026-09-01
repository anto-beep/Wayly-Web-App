import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock } from "lucide-react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";

/**
 * ViewOnlyBanner — pinned strip shown at the top of every authenticated screen
 * when the user's plan is inactive (cancelled trial, cancelled/ended paid plan,
 * or an unresolved payment failure → access_state === "view_only"). Data stays
 * visible; the only action offered is Reactivate → Plan & Billing. Admins and
 * active/trial users never see it.
 */
export function ViewOnlyBanner() {
  const { user, viewOnly } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!user || !viewOnly) return null;

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
        Your plan is inactive. Reactivate to add or change anything. You can still view all of your data.
      </Text>
      <TouchableOpacity
        testID="view-only-banner-reactivate"
        onPress={() => router.push("/plan-billing")}
        style={[styles.btn, { backgroundColor: colors.primaryFg }]}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnText, { color: colors.text }]}>Reactivate</Text>
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
  btn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnText: { fontSize: 12, fontWeight: "700" },
});

export default ViewOnlyBanner;
