import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AlertTriangle, Check, CheckCircle2, Sparkles } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const PLANS = [
  {
    key: "solo",
    name: "Solo",
    price: "$24.50",
    period: "per fortnight",
    blurb: "For one caregiver looking after one person.",
    features: ["1 caregiver seat, 1 participant", "All 9 AI tools", "Unlimited Statement Decoder", "Caregiver dashboard & budget tracker"],
  },
  {
    key: "family",
    name: "Family",
    price: "$49.50",
    period: "per fortnight",
    blurb: "For families sharing the load across the household.",
    features: ["Up to 4 participants", "Everything in Solo", "Family Wall for shared updates", "Sunday digest for the whole family", "Audit log & household coordination"],
    highlight: true,
  },
];

type Sub = { plan?: string; status?: string };

export default function PlanSelectScreen() {
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [sub, setSub] = useState<Sub | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const startTrial = async (plan: string) => {
    setBusy(`trial-${plan}`); setError(""); setNotice("");
    try {
      await apiFetch("/billing/start-trial", { method: "POST", body: { plan } });
      await refreshUser();
      await load();
      setNotice(`Your 7-day free ${plan} trial has started. No card needed.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start your trial. Please try again.");
    } finally { setBusy(null); }
  };

  const subscribe = async (plan: string) => {
    setBusy(`sub-${plan}`); setError(""); setNotice("");
    try {
      const res = await apiFetch<{ url?: string }>("/billing/checkout", { method: "POST", body: { plan, origin_url: SITE_BASE } });
      if (res?.url) { await WebBrowser.openBrowserAsync(res.url); await refreshUser(); await load(); }
      else setError("Could not open secure checkout. Please try again.");
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
                <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>Start with a 7-day free trial on any plan. No card required.</T>
              </View>
            </Card>
          ) : null}

          {error ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={16} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
            </View>
          ) : null}
          {notice ? <T variant="small" testID="plan-select-notice" style={{ color: colors.success }}>{notice}</T> : null}

          {PLANS.map((p) => {
            const isCurrent = currentPlan === p.key;
            return (
              <Card key={p.key} testID={`plan-card-${p.key}`} style={p.highlight ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T style={{ fontFamily: fonts.heading, fontSize: 24 }}>{p.name}</T>
                  {isCurrent ? <Badge label="CURRENT" tone="success" testID={`plan-current-${p.key}`} /> : p.highlight ? <Badge label="POPULAR" tone="brand" /> : null}
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 18, color: colors.primary, marginTop: 2 }}>{p.price} <T variant="small">{p.period}</T></T>
                <T variant="small" style={{ marginTop: 6 }}>{p.blurb}</T>
                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  {p.features.map((f, i) => (
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
                ) : eligible ? (
                  <Button label={`Start free ${p.name} trial`} testID={`plan-trial-${p.key}`} onPress={() => startTrial(p.key)} loading={busy === `trial-${p.key}`} style={{ marginTop: spacing.md }} />
                ) : (
                  <Button label={`Subscribe to ${p.name}`} testID={`plan-subscribe-${p.key}`} onPress={() => subscribe(p.key)} loading={busy === `sub-${p.key}`} style={{ marginTop: spacing.md }} />
                )}
              </Card>
            );
          })}

          <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
            <T variant="small" style={{ lineHeight: 20 }}>
              Payment and your card are handled securely by Stripe in your browser. You are not charged during a free trial. Manage your card or cancel any time from Plan & Billing.
            </T>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
