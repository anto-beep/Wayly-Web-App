import React, { useCallback, useState } from "react";
import { RefreshControl, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CreditCard, CheckCircle2, ExternalLink, AlertTriangle, Sparkles, Clock } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { invalidateTrialCache } from "@/src/components/TrialBanner";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { daysUntil, formatDate } from "@/src/utils/format";

type Sub = {
  plan?: string;
  status?: string;
  had_trial?: boolean;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
};

const PLAN_META: Record<string, { name: string; price: string; features: string[] }> = {
  free: { name: "Free", price: "$0", features: ["Limited access", "Upgrade any time for the full toolkit"] },
  solo: { name: "Solo", price: "$24.50 / fortnight", features: ["1 caregiver seat, 1 participant tracked", "All AI tools", "Unlimited Statement Decoder"] },
  family: { name: "Family", price: "$49.50 / fortnight", features: ["Up to 4 participants", "Everything in Solo, all AI tools", "Family Wall for shared updates & notes", "Sunday digest emails to the whole family", "Audit log & household coordination"] },
  adviser: { name: "Adviser", price: "Contact us", features: ["For aged-care specialist advisers", "Client export & audit trail", "Branded reports"] },
};

function fmt(s?: string | null): string {
  return formatDate(s);
}

export default function PlanBillingScreen() {
  const { colors } = useTheme();
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<null | "portal" | "cancel" | "reactivate">(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      invalidateTrialCache();
      setSub(await apiFetch<Sub>("/billing/subscription"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const planKey = (sub?.plan || "free").toLowerCase();
  const meta = PLAN_META[planKey] || PLAN_META.free;
  const isTrial = sub?.status === "trialing" || sub?.status === "trial";
  const trialDaysLeft = daysUntil(sub?.trial_ends_at);
  const isCancelling = !!sub?.cancel_at_period_end;
  const statusLabel = isCancelling ? "CANCELS SOON" : isTrial ? "FREE TRIAL" : (sub?.status || "active").toUpperCase();
  const statusTone: "success" | "alert" | "brand" = isCancelling ? "alert" : isTrial ? "brand" : "success";

  const openPortal = async () => {
    setBusy("portal"); setActionError("");
    try {
      const res = await apiFetch<{ url?: string; portal_url?: string }>("/payments/portal", { method: "POST", body: { origin_url: process.env.EXPO_PUBLIC_BACKEND_URL } });
      const url = res?.url || res?.portal_url;
      if (url) await WebBrowser.openBrowserAsync(url);
      else setActionError("Could not open billing right now. Please try again.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not open billing. Please try again.");
    } finally { setBusy(null); }
  };

  const cancel = async () => {
    setBusy("cancel"); setActionError("");
    try { await apiFetch("/billing/cancel", { method: "POST", body: {} }); load(); }
    catch (e) { setActionError(e instanceof ApiError ? e.message : "Could not cancel right now. Please try again."); }
    finally { setBusy(null); }
  };

  const reactivate = async () => {
    setBusy("reactivate"); setActionError("");
    try { await apiFetch("/reactivate-subscription", { method: "POST", body: {} }); load(); }
    catch (e) { setActionError(e instanceof ApiError ? e.message : "Could not reactivate right now. Please try again."); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Plan & Billing" subtitle="Your Wayly subscription" onBack={() => router.back()} />
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
            <T style={{ fontFamily: fonts.heading, fontSize: 30, color: colors.text, marginTop: 4 }}>{meta.name}</T>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.primary, marginTop: 2 }}>{meta.price}</T>
            {planKey !== "free" ? <T variant="small" style={{ marginTop: 2 }}>Billed every 14 days · Includes GST</T> : null}

            {isTrial && sub?.trial_ends_at ? (
              <View testID="billing-trial-countdown" style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.alertSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Clock size={16} color={colors.alert} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.alert }}>
                    {trialDaysLeft === 0 ? "Your free trial ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`}
                  </T>
                </View>
                <T variant="small" style={{ marginTop: 4 }}>Ends {fmt(sub.trial_ends_at)}. Your card is on file — you will be charged for {meta.name} then unless you cancel.</T>
              </View>
            ) : isCancelling && sub?.current_period_end ? (
              <T variant="small" style={{ marginTop: spacing.sm, color: colors.alert }}>Auto-renew is off. You keep {meta.name} until {fmt(sub.current_period_end)}.</T>
            ) : sub?.current_period_end ? (
              <T variant="small" style={{ marginTop: spacing.sm }}>Renews {fmt(sub.current_period_end)}.</T>
            ) : null}

            <View style={{ marginTop: spacing.md, gap: 8 }}>
              {meta.features.map((f, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <CheckCircle2 size={16} color={colors.sage} style={{ marginTop: 2 }} />
                  <T variant="small" style={{ flex: 1, color: colors.text }}>{f}</T>
                </View>
              ))}
            </View>
          </Card>

          {/* What you are paying for */}
          {planKey !== "free" ? (
            <Card testID="billing-breakdown">
              <T variant="label">WHAT YOU ARE PAYING FOR</T>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md }}>
                <T variant="small">Base plan ({meta.name})</T>
                <T style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text }}>{meta.price}</T>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Fortnightly total</T>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{meta.price}</T>
              </View>
              <Pressable testID="billing-manage-participants" onPress={() => router.push("/participants")} style={{ marginTop: spacing.md }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>Manage participants</T>
              </Pressable>
            </Card>
          ) : null}

          {/* Solo / Family switch cards */}
          {planKey !== "free" ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(["solo", "family"] as const).map((k) => {
                const current = planKey === k;
                const m = PLAN_META[k];
                return (
                  <View key={k} testID={`billing-plan-${k}`} style={[styles.switchCard, { backgroundColor: colors.surface, borderColor: current ? colors.primary : colors.border }]}>
                    <T style={{ fontFamily: fonts.headingSemi, fontSize: 16 }}>{m.name}</T>
                    <T variant="small" style={{ marginTop: 2 }}>{m.price}</T>
                    {current ? (
                      <View style={{ marginTop: spacing.sm, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.sageSoft }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.sage }}>Current</T>
                      </View>
                    ) : (
                      <Pressable testID={`billing-switch-${k}`} onPress={() => router.push("/plan-select")} style={{ marginTop: spacing.sm }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>Switch to {m.name}</T>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}


          {actionError ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={16} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{actionError}</T>
            </View>
          ) : null}

          {isTrial ? (
            <Button label="Manage payment method" testID="billing-add-card" icon={CreditCard} onPress={openPortal} loading={busy === "portal"} />
          ) : null}
          <Button label="Change plan" testID="billing-change-plan" icon={Sparkles} variant={isTrial ? "outline" : "primary"} onPress={() => router.push("/plan-select")} />
          <Button label="Manage card & billing" testID="billing-portal" variant="outline" icon={ExternalLink} onPress={openPortal} loading={busy === "portal"} />
          {isCancelling ? (
            <Button label="Reactivate auto-renew" testID="billing-reactivate" variant="outline" onPress={reactivate} loading={busy === "reactivate"} />
          ) : planKey !== "free" ? (
            <Button label="Cancel auto-renew" testID="billing-cancel" variant="outline" onPress={cancel} loading={busy === "cancel"} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switchCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md },
});
