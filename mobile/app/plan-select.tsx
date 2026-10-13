import React from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Info } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

// Reader app: no plans, prices, or purchasing are offered inside the iOS app.
// A Wayly plan is managed on the user's account; this screen is informational.
export default function PlanSelectScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Your plan" subtitle="Managed on your Wayly account" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card testID="plan-select-info">
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Info size={20} color={colors.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text }}>Your Wayly plan is managed on your account</T>
              <T variant="small" style={{ marginTop: 8, lineHeight: 21 }}>
                Sign in with an account that already has an active Wayly plan to use every feature. You can review your plan from your Wayly account at wayly.com.au.
              </T>
            </View>
          </View>
        </Card>
        <Button label="Back" testID="plan-select-back" variant="outline" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}
