import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, Check, CheckCircle2, Sparkles } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { invalidateTrialCache } from "@/src/components/TrialBanner";
import { PLAN_OPTIONS, PlanKey, startCheckout } from "@/src/lib/plans";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Sub = { plan?: string; status?: string };

export default function PlanSelectScreen() {
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [sub, setSub] = useState<Sub | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.allSettled([
        apiFetch<Sub>("/billing/subscription"),
        apiFetch<{ eligible: boolean }>("/billing/trial-eligibility"),
      ]);
      setSub(s.status === "fulfilled" ? s.value : null);
      setEligible(e.status === "fulfilled" ? e.value.eligible : false);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentPlan = (sub?.plan || user?.plan || "free").toLowerCase();

  // Card-capture checkout, exactly like the web. 7-day trial if still
  // eligible, otherwise a straight paid subscription.
  const choosePlan = async (plan: PlanKey) => {
    setBusy(plan); setError("");
    try {
      const opened = await startCheckout(plan, eligible ? 7 : 0);
      invalidateTrialCache();
      await refreshUser();
      await load();
      if (!opened) setError("Could not open secure checkout. Please try again.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open secure checkout. Please try again.");
    } finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Choose your plan" subtitle="Fortnightly, AUD incl GST. Cancel any time." onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading plans…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {eligible ? (
            <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Sparkles size={18} color={colors.sage} />
                <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>
                  7-day free trial on any plan. We take your card securely on Stripe now, but you are not charged until day 8.
                </T>
              </View>
            </Card>
          ) : null}

          {error ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={16} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
            </View>
          ) : null}

          {PLAN_OPTIONS.map((p) => {
            const isCurrent = currentPlan === p.key;
            return (
              <Card key={p.key} testID={`plan-card-${p.key}`} style={p.popular ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T style={{ fontFamily: fonts.heading, fontSize: 24 }}>{p.name}</T>
                  {isCurrent ? <Badge label="CURRENT" tone="success" testID={`plan-current-${p.key}`} /> : p.popular ? <Badge label="MOST POPULAR" tone="brand" /> : null}
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 18, color: colors.primary, marginTop: 2 }}>{p.price} <T variant="small">{p.period}</T></T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Badge label={p.participants.toUpperCase()} tone="neutral" testID={`plan-participants-${p.key}`} />
                  <Badge label={p.seats.toUpperCase()} tone="neutral" testID={`plan-seats-${p.key}`} />
                </View>
                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  {p.bullets.map((f, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <CheckCircle2 size={16} color={colors.sage} style={{ marginTop: 2 }} />
                      <T variant="small" style={{ flex: 1, color: colors.text }}>{f}</T>
                    </View>
                  ))}
                </View>
                {isCurrent ? (
                  <View style={{ marginTop: spacing.md, flexDirection: "row", gap: 6, alignItems: "center", padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                    <Check size={16} color={colors.success} />
                    <T variant="small" style={{ color: colors.text }}>This is your current plan.</T>
                  </View>
                ) : (
                  <Button
                    label={eligible ? `Start 7-day free ${p.name} trial` : `Subscribe to ${p.name}`}
                    testID={eligible ? `plan-trial-${p.key}` : `plan-subscribe-${p.key}`}
                    onPress={() => choosePlan(p.key)}
                    loading={busy === p.key}
                    style={{ marginTop: spacing.md }}
                  />
                )}
              </Card>
            );
          })}

          <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
            <T variant="small" style={{ lineHeight: 20 }}>
              Your card is captured and stored securely by Stripe in your browser (same as the website). You are not charged during a free trial. Manage or remove your card any time from Plan & Billing.
            </T>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
