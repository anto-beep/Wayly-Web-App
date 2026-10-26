import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CreditCard, Info, ExternalLink } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

// Account/plan management lives on the public Wayly web app, not the API host.
const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL || "https://wayly.com.au";
const BILLING_URL = `${WEB_APP_URL}/settings/billing`;
const PRICING_URL = `${WEB_APP_URL}/pricing`;

type Sub = {
  plan?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
};

const PLAN_NAME: Record<string, string> = { free: "No active plan", solo: "Solo", family: "Family", adviser: "Adviser" };

// Reader app: this screen shows the plan STATUS only. No prices, no card
// management, and no purchasing happen inside the iOS app — a Wayly plan is
// managed on the user's account.
export default function PlanBillingScreen() {
  const { colors } = useTheme();
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try { setSub(await apiFetch<Sub>("/billing/subscription")); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const planKey = (sub?.plan || "free").toLowerCase();
  const subStatus = (sub?.status || "").toLowerCase();
  const periodEnded = sub?.current_period_end ? new Date(sub.current_period_end).getTime() <= Date.now() : false;
  const isExpired = subStatus === "expired" || subStatus === "canceled" || subStatus === "cancelled" || subStatus === "none";
  // A trial that has ended or a cancelled/expired sub (or a cancel whose end
  // date has now passed) means there is NO active plan.
  const planEnded = isExpired || (!!sub?.cancel_at_period_end && periodEnded);
  const noPlan = !sub?.plan || planKey === "free" || planEnded;
  const name = noPlan ? "No active plan" : (PLAN_NAME[planKey] || "No active plan");
  const isTrial = (sub?.status === "trialing" || sub?.status === "trial") && !planEnded;
  const isCancelling = !!sub?.cancel_at_period_end && !periodEnded && !noPlan;
  const statusLabel = noPlan ? "NO ACTIVE PLAN" : isCancelling ? "ENDS SOON" : isTrial ? "FREE TRIAL" : (sub?.status || "active").toUpperCase();
  const statusTone: "success" | "alert" | "brand" = noPlan ? "alert" : isCancelling ? "alert" : isTrial ? "brand" : "success";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Your Plan" subtitle="Your Wayly subscription" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your plan…" />
      ) : error ? (
        <StatePanel testID="billing-error" icon={CreditCard} title="Couldn't load your plan" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card testID="billing-current-plan">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <T variant="label">CURRENT PLAN</T>
              <Badge label={statusLabel} tone={statusTone} />
            </View>
            <T style={{ fontFamily: fonts.heading, fontSize: 30, color: colors.heading, marginTop: 4 }}>{name}</T>
            {isTrial && sub?.trial_ends_at ? (
              <T variant="small" style={{ marginTop: 6 }}>Your free trial ends {formatDate(sub.trial_ends_at)}.</T>
            ) : noPlan ? (
              <T variant="small" style={{ marginTop: 6, color: colors.alert }}>
                {sub?.current_period_end && planEnded
                  ? `Your plan ended on ${formatDate(sub.current_period_end)}. Choose a plan to reactivate — you keep access to all your data.`
                  : "You don't have an active plan. Choose a plan to get started."}
              </T>
            ) : isCancelling && sub?.current_period_end ? (
              <T variant="small" style={{ marginTop: 6, color: colors.alert }}>Your plan stays active until {formatDate(sub.current_period_end)}.</T>
            ) : sub?.current_period_end ? (
              <T variant="small" style={{ marginTop: 6 }}>Renews {formatDate(sub.current_period_end)}.</T>
            ) : null}
          </Card>

          <Card testID="billing-manage-note">
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Info size={18} color={colors.heading} style={{ marginTop: 2 }} />
              <T variant="small" style={{ flex: 1, lineHeight: 21 }}>
                Your plan and card details are managed securely on the web. The button below opens your Wayly account in your browser — nothing is purchased inside the app.
              </T>
            </View>
          </Card>

          <Button
            label={noPlan ? "Choose a plan on the web" : "Manage plan on the web"}
            testID="billing-manage-web"
            icon={ExternalLink}
            onPress={() => { WebBrowser.openBrowserAsync(noPlan ? PRICING_URL : BILLING_URL); }}
          />

          {!noPlan ? (
            <Button label="Manage participants" testID="billing-manage-participants" variant="outline" onPress={() => router.push("/participants")} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
