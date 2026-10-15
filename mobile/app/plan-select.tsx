import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Check, ShieldCheck, AlertCircle } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { PLAN_OPTIONS, startCheckout, type PlanKey } from "@/src/lib/plans";
import { apiFetch, clearPendingPlan, planStatusIsValid } from "@/src/lib/api";

// Required plan step after signup. Choosing a plan opens the secure web-browser
// Stripe Checkout (7-day free trial — no in-app purchase). The app only unlocks
// once a valid subscription/trial exists, so no account can be used without a
// valid plan. Card details are entered in the browser, never inside the app.
export default function PlanSelectScreen() {
  const { colors } = useTheme();
  const { refreshUser, logout } = useAuth();
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState("");

  const onChoose = async (plan: PlanKey) => {
    setError("");
    setBusyPlan(plan);
    try {
      const opened = await startCheckout(plan, 7);
      if (!opened) {
        setError("We couldn't open secure checkout. Please try again.");
        return;
      }
      // startCheckout reconciles the session on return. Confirm the account now
      // has a valid plan/trial before we let it into the app.
      const me = await apiFetch<{ subscription_status?: string | null }>("/auth/me");
      if (planStatusIsValid(me?.subscription_status)) {
        await clearPendingPlan();
        await refreshUser();
        router.replace("/onboarding");
      } else {
        setError("Your payment wasn't completed, so your free trial hasn't started. Choose a plan to continue.");
      }
    } catch {
      setError("Something went wrong starting your trial. Please try again.");
    } finally {
      setBusyPlan(null);
    }
  };

  const onCancel = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Choose Your Plan" onBack={onCancel} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <View style={{ gap: 6 }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.heading }}>
            Start your 7-day free trial
          </T>
          <T variant="small" style={{ lineHeight: 21 }}>
            Pick a plan to begin. You won't be charged today — you'll enter your card details securely in your browser, and your trial runs free for 7 days before billing starts.
          </T>
        </View>

        <Card testID="plan-select-trust" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <ShieldCheck size={20} color={colors.primary} style={{ marginTop: 2 }} />
          <T variant="small" style={{ flex: 1, lineHeight: 20 }}>
            Payment is handled securely by Stripe in your web browser. Wayly never sees your card details.
          </T>
        </Card>

        {error ? (
          <View testID="plan-select-error" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: spacing.md }}>
            <AlertCircle size={18} color={colors.terracotta} style={{ marginTop: 1 }} />
            <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
          </View>
        ) : null}

        {PLAN_OPTIONS.map((p) => {
          const isBusy = busyPlan === p.key;
          const disabled = busyPlan !== null && !isBusy;
          return (
            <Card
              key={p.key}
              testID={`plan-option-${p.key}`}
              style={{
                borderColor: p.popular ? colors.gold : colors.border,
                borderWidth: p.popular ? 2 : 1,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {p.popular ? (
                <View style={{ alignSelf: "flex-start", backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.6, color: "#fff" }}>MOST POPULAR</T>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.heading }}>{p.name}</T>
                <View style={{ alignItems: "flex-end" }}>
                  <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, color: colors.heading }}>{p.price}</T>
                  <T variant="small" style={{ color: colors.muted }}>{p.period}</T>
                </View>
              </View>

              <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
                {p.participants} · {p.seats}
              </T>

              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                {p.bullets.slice(0, 5).map((b) => (
                  <View key={b} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Check size={16} color={colors.sage} style={{ marginTop: 2 }} />
                    <T variant="small" style={{ flex: 1, lineHeight: 19 }}>{b}</T>
                  </View>
                ))}
              </View>

              <Button
                label={`Start 7-day free trial`}
                testID={`plan-choose-${p.key}`}
                onPress={() => onChoose(p.key)}
                loading={isBusy}
                disabled={disabled}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          );
        })}

        <Button
          label="Cancel and sign out"
          testID="plan-select-cancel"
          variant="ghost"
          onPress={onCancel}
          style={{ marginTop: spacing.xs }}
        />
      </ScrollView>
    </View>
  );
}
