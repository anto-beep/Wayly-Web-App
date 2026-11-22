import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Check, ShieldCheck, AlertCircle } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { PLAN_OPTIONS, startCheckout, type PlanKey } from "@/src/lib/plans";
import { apiFetch, clearPendingPlan, planStatusIsValid } from "@/src/lib/api";

// Plan picker used for BOTH first-time signup and reactivation. The 7-day free
// trial is for brand-new accounts only — anyone who has already had a trial or a
// paid plan (i.e. reactivating) is charged immediately with no trial. Eligibility
// is decided server-side; the UI just mirrors it. Stripe Checkout runs in the
// secure web browser (no in-app purchase); card details never touch the app.
export default function PlanSelectScreen() {
  const { colors } = useTheme();
  const { refreshUser, logout, user } = useAuth();
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState("");
  // null = still checking; true = new account (trial); false = reactivation (paid now)
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch<{ eligible?: boolean }>("/billing/trial-eligibility");
        if (alive) setEligible(res?.eligible !== false);
      } catch {
        if (alive) setEligible(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isReactivation = eligible === false;

  const onChoose = async (plan: PlanKey) => {
    setError("");
    setBusyPlan(plan);
    try {
      const opened = await startCheckout(plan, isReactivation ? 0 : 7);
      if (!opened) {
        setError("We couldn't open secure checkout. Please try again.");
        return;
      }
      const me = await apiFetch<{ subscription_status?: string | null }>("/auth/me");
      if (planStatusIsValid(me?.subscription_status)) {
        await clearPendingPlan();
        await refreshUser();
        router.replace(isReactivation ? "/" : "/onboarding");
      } else {
        setError(
          isReactivation
            ? "Your payment wasn't completed, so your plan isn't active yet. Choose a plan to reactivate."
            : "Your payment wasn't completed, so your free trial hasn't started. Choose a plan to continue.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyPlan(null);
    }
  };

  const onCancel = async () => {
    await logout();
    router.replace("/login");
  };

  const buttonLabel = (p: (typeof PLAN_OPTIONS)[number]) =>
    isReactivation ? `Reactivate ${p.name} — ${p.price}` : "Start 7-day free trial";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={isReactivation ? "Reactivate Your Plan" : "Choose Your Plan"} onBack={onCancel} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <View style={{ gap: 6 }}>
          <T variant="small" style={{ lineHeight: 21 }}>
            {isReactivation
              ? "Pick a plan to pick up right where you left off — everything you saved is still here. You'll be charged today; there's no free trial, as you've used Wayly before."
              : "Pick a plan to begin. You won't be charged today — you'll enter your card details securely in your browser, and your trial runs free for 7 days before billing starts."}
          </T>
        </View>

        <Card testID="plan-select-trust" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <ShieldCheck size={20} color={colors.heading} style={{ marginTop: 2 }} />
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

        {eligible === null ? (
          <Loading label="Checking your account…" />
        ) : (
          PLAN_OPTIONS.map((p) => {
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

                {isReactivation && user?.plan === p.key ? (
                  <View style={{ alignSelf: "flex-start", backgroundColor: colors.sageSoft, borderColor: colors.sage, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.heading }}>YOUR PREVIOUS PLAN</T>
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
                  label={buttonLabel(p)}
                  testID={`plan-choose-${p.key}`}
                  onPress={() => onChoose(p.key)}
                  loading={isBusy}
                  disabled={disabled}
                  style={{ marginTop: spacing.md }}
                />
              </Card>
            );
          })
        )}

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
