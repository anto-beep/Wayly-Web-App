import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CreditCard, CheckCircle2, ExternalLink, AlertTriangle, Sparkles } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

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
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return s; }
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
  const isCancelling = !!sub?.cancel_at_period_end;
  const statusLabel = isCancelling ? "CANCELS SOON" : isTrial ? "FREE TRIAL" : (sub?.status || "active").toUpperCase();
  const statusTone: "success" | "alert" | "brand" = isCancelling ? "alert" : isTrial ? "brand" : "success";

  const openPortal = async () => {
    setBusy("portal"); setActionError("");
    try {
      const res = await apiFetch<{ url?: string; portal_url?: string }>("/portal", { method: "POST", body: { origin_url: process.env.EXPO_PUBLIC_BACKEND_URL } });
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

            {isTrial && sub?.trial_ends_at ? (
              <T variant="small" style={{ marginTop: spacing.sm }}>Free trial ends {fmt(sub.trial_ends_at)}. Your first charge is after that.</T>
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

          <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
            <T variant="small" style={{ lineHeight: 20 }}>
              Wayly is fortnightly billing, in AUD including GST. You can change or cancel any time; changes take effect at the end of your current period, so you never lose access mid-cycle.
            </T>
          </Card>

          {actionError ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={16} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{actionError}</T>
            </View>
          ) : null}

          <Button label="Change plan" testID="billing-change-plan" icon={Sparkles} onPress={() => router.push("/plan-select")} />
          <Button label="Manage billing & payment method" testID="billing-portal" variant="outline" icon={ExternalLink} onPress={openPortal} loading={busy === "portal"} />
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

const styles = StyleSheet.create({});
