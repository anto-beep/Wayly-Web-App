import React from "react";
import { Linking, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Badge, Button, Card, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, spacing } from "@/src/theme";
import { shortDate } from "@/src/utils/format";

// Plan purchases/upgrades are intentionally NOT done in-app (App Store rules).
// We open the Wayly web billing page in the device browser instead.
const BILLING_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/settings/billing`;

const PLAN_BLURB: Record<string, string> = {
  free: "Basic access. Upgrade to unlock full statement decoding and family features.",
  solo: "Full decoding and Ask Wayly for one participant.",
  family: "Everything in Solo, plus multiple participants and the family wall.",
  adviser: "Adviser workspace across your linked clients.",
};

export default function SettingsScreen() {
  const { user } = useAuth();
  const plan = (user?.plan || "free").toLowerCase();
  const planLabel = plan.replace(/^\w/, (c) => c.toUpperCase());
  const status = user?.subscription_status || "free";
  const tone = status === "active" ? "success" : status === "trialing" ? "alert" : "neutral";

  const openBilling = () => Linking.openURL(BILLING_URL);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Plan & billing" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card testID="plan-card" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <T variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>CURRENT PLAN</T>
              <T style={{ fontFamily: fonts.heading, fontSize: 30, color: "#fff", marginTop: 4 }}>{planLabel}</T>
            </View>
            <Badge label={status.toUpperCase()} tone={tone as any} testID="settings-subscription-badge" />
          </View>
          <T style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: 14, marginTop: spacing.sm, lineHeight: 21 }}>
            {PLAN_BLURB[plan] || PLAN_BLURB.free}
          </T>          {user?.trial_ends_at && status === "trialing" ? (
            <T variant="small" style={{ color: "rgba(255,255,255,0.75)", marginTop: spacing.sm }}>
              Trial ends {shortDate(user.trial_ends_at)}
            </T>
          ) : null}
          {user?.cancel_at_period_end ? (
            <T variant="small" style={{ color: "#F4C9C4", marginTop: spacing.sm }}>
              Your plan is set to cancel at the end of the current period.
            </T>
          ) : null}
        </Card>

        <Card testID="manage-plan-card">
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
            <Ionicons name="information-circle" size={22} color={colors.sage} />
            <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text }}>
              To change or upgrade your plan, or update your payment details, we’ll open your Wayly billing page in your
              browser. You’ll come right back to the app when you’re done.
            </T>
          </View>
          <Button
            label="Manage plan in browser"
            testID="manage-plan-button"
            icon="open-outline"
            onPress={openBilling}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <T variant="small" style={{ textAlign: "center", marginTop: spacing.sm }}>
          Billing is handled securely on the web. In-app purchases aren’t available yet.
        </T>
      </ScrollView>
    </View>
  );
}
