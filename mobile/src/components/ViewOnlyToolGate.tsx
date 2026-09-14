import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Lock } from "lucide-react-native";

import { AppHeader, Button, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

/**
 * ViewOnlyToolGate — wraps a tool screen. When the user's plan is inactive
 * (view_only), the tool is REPLACED by a calm lock screen so nothing can be
 * run or edited. "View tool" reveals the tool read-only (any write is still
 * blocked server-side + by the api guard). Reactivate goes to the plan picker,
 * which sends the user straight to Stripe Checkout. Resets on each mount so it
 * reappears every time the screen is opened.
 */
export function ViewOnlyToolGate({ children }: { children: React.ReactNode }) {
  const { viewOnly } = useAuth();
  const { colors } = useTheme();
  const [reveal, setReveal] = useState(false);

  if (!viewOnly || reveal) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="view-only-tool-gate">
      <AppHeader title="Tool locked" onBack={() => router.back()} />
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.goldSoft }]}>
          <Lock size={26} color={colors.gold} />
        </View>
        <T style={{ fontFamily: fonts.heading, fontSize: 24, color: colors.text, textAlign: "center", marginTop: spacing.md }}>
          This tool is locked
        </T>
        <T variant="bodyMuted" style={{ textAlign: "center", marginTop: spacing.sm, lineHeight: 22 }}>
          Your plan is inactive. Reactivate to run or change anything — everything you&apos;ve already saved stays here to view.
        </T>
        <Button
          label="Reactivate"
          testID="view-only-tool-reactivate"
          onPress={() => router.push("/plan-select")}
          style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
        />
        <Button
          label="View tool (read-only)"
          testID="view-only-tool-reveal"
          variant="outline"
          onPress={() => setReveal(true)}
          style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  iconWrap: { width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

export default ViewOnlyToolGate;
