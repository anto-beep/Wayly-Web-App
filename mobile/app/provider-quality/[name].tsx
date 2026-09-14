import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View, Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Shield, CheckCircle2, TrendingUp, AlertTriangle, Phone } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, Screen, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

// PPC-3 mobile · Provider Quality Detail, mirrors web ProviderQualityDetail.jsx.
// Deep-linked from the quality chip on the Price History screen.
const SIGNAL_LABEL: Record<string, string> = {
  many_positive_signals: "Many positive signals",
  mixed_signals: "Mixed signals",
  several_concerns: "Several concerns",
  insufficient_data_for_summary: "Insufficient data",
};

function CompositeCard({ summary, colors }: any) {
  if (!summary || !summary.overall_signal) return null;
  const sig = summary.overall_signal;
  const tone = sig === "many_positive_signals" ? colors.sage : sig === "several_concerns" ? colors.terracotta : sig === "mixed_signals" ? colors.gold : colors.muted;
  const bg = sig === "many_positive_signals" ? colors.sageSoft : sig === "several_concerns" ? colors.errorSoft : sig === "mixed_signals" ? colors.goldSoft : colors.surface2;
  const Icon = sig === "many_positive_signals" ? CheckCircle2 : sig === "several_concerns" ? AlertTriangle : sig === "mixed_signals" ? TrendingUp : Shield;
  const explanation = summary.explanation_tokens?.caregiver || summary.explanation_tokens?.participant_self || "";
  const included = (summary.signals_included || []).join(", ");
  return (
    <Card testID="ppc3-composite-summary" style={{ backgroundColor: bg, borderColor: tone }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Icon size={22} color={tone} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: tone, textTransform: "uppercase" }}>{SIGNAL_LABEL[sig] || "Quality"}</T>
          <T variant="body" style={{ marginTop: 6, color: colors.text }} testID="ppc3-composite-explanation">{explanation}</T>
          <T variant="small" style={{ marginTop: 8, color: colors.muted }}>
            Based on {summary.signals_available_count || 0} public signal{summary.signals_available_count === 1 ? "" : "s"}{included ? `: ${included}.` : "."}
          </T>
        </View>
      </View>
    </Card>
  );
}

function SignalRow({ label, value, source, colors, testID, last }: any) {
  return (
    <View testID={testID} style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      <T variant="small" style={{ color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>{label}</T>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 3 }}>
        <T variant="body" style={{ color: colors.text, fontFamily: fonts.bodyMedium, flex: 1 }}>{value}</T>
        {source ? <T style={{ fontSize: 10, color: colors.muted }}>Source: {source}</T> : null}
      </View>
    </View>
  );
}

function RatingRow({ label, value, onChange, colors, field }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <T variant="body" style={{ color: colors.text }}>{label}</T>
      <View style={{ flexDirection: "row", gap: 6 }} testID={`ppc3-rating-${field}`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Pressable key={n} testID={`ppc3-rating-${field}-${n}`} onPress={() => onChange(n)} style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }}>
              <T style={{ fontSize: 12, color: on ? "#fff" : colors.muted, fontFamily: fonts.bodyMedium }}>{n}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SurveyForm({ providerName, onSubmitted, colors }: any) {
  const [form, setForm] = useState({ care_quality: 4, communication: 4, billing_accuracy: 4, worker_reliability: 4, would_recommend: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await apiFetch("/ppc3/survey-responses", { method: "POST", body: { provider_name: providerName, ...form } });
      setDone(true);
      onSubmitted?.();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not submit rating."); }
    finally { setBusy(false); }
  };
  if (done) {
    return (
      <Card testID="ppc3-survey-done" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage }}>
        <T variant="body" style={{ color: colors.text }}>Thanks — your rating helps other families. It&apos;s aggregated and never published on its own.</T>
      </Card>
    );
  }
  return (
    <Card testID="ppc3-survey-form">
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: colors.muted, textTransform: "uppercase" }}>Rate your experience</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 3 }}>Aggregated with a minimum of 5 responses; individual ratings are never published.</T>
      <View style={{ marginTop: spacing.sm }}>
        <RatingRow label="Care quality" field="care_quality" value={form.care_quality} onChange={(n: number) => set("care_quality", n)} colors={colors} />
        <RatingRow label="Communication" field="communication" value={form.communication} onChange={(n: number) => set("communication", n)} colors={colors} />
        <RatingRow label="Billing accuracy" field="billing_accuracy" value={form.billing_accuracy} onChange={(n: number) => set("billing_accuracy", n)} colors={colors} />
        <RatingRow label="Worker reliability" field="worker_reliability" value={form.worker_reliability} onChange={(n: number) => set("worker_reliability", n)} colors={colors} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
          <T variant="body" style={{ color: colors.text }}>Would you recommend?</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[{ v: true, l: "Yes", id: "yes" }, { v: false, l: "No", id: "no" }].map((o) => {
              const on = form.would_recommend === o.v;
              return (
                <Pressable key={o.id} testID={`ppc3-recommend-${o.id}`} onPress={() => set("would_recommend", o.v)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }}>
                  <T style={{ fontSize: 12, color: on ? "#fff" : colors.muted }}>{o.l}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      {err ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="ppc3-survey-error">{err}</T> : null}
      <Button label="Submit rating" testID="ppc3-survey-submit" onPress={submit} loading={busy} style={{ marginTop: spacing.md }} />
    </Card>
  );
}

export default function ProviderQualityDetail() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ name?: string }>();
  const providerName = typeof params.name === "string" ? params.name : "";
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const r = await apiFetch<any>(`/ppc3/providers/${encodeURIComponent(providerName)}/quality-profile`);
      setProfile(r?.profile || null);
    } catch (e) { if (!silent) setError(e instanceof ApiError ? e.message : "Could not load the quality profile."); }
    finally { if (!silent) setLoading(false); }
  }, [providerName]);
  useEffect(() => { load(); }, [load]);

  const acqsc = profile?.acqsc_compliance_status || {};
  const stars = profile?.star_ratings;
  const wayly = profile?.wayly_aggregated_feedback;
  const ombuds = profile?.ombudsman_public_referrals || [];
  const responses = profile?.provider_responses || [];

  return (
    <Screen edges={["top"]}>
      <AppHeader title="Provider Quality" onBack={() => (router.canGoBack() ? router.back() : router.replace("/price-history"))} />
      {loading ? (
        <Loading label="Loading quality profile…" />
      ) : error ? (
        <StatePanel testID="ppc3-error" icon={AlertTriangle} title="Couldn't load" message={error} actionLabel="Try again" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
          <View>
            <T variant="small" style={{ color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>Provider quality context</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 24, color: colors.text, marginTop: 2 }} testID="ppc3-provider-name">{profile?.provider_official_name || providerName}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 19 }}>
              Every publicly available quality signal we can lawfully surface, combined into one honest picture. This is not a rating or recommendation.
            </T>
          </View>

          <CompositeCard summary={profile?.composite_quality_summary} colors={colors} />

          <Card testID="ppc3-signals">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: colors.muted, textTransform: "uppercase", marginBottom: 2 }}>Signals available</T>
            <SignalRow colors={colors} testID="ppc3-signal-acqsc" label="ACQSC compliance" value={(acqsc.current_status || "status unknown").replace(/_/g, " ")} source={acqsc.source_url ? "ACQSC public register" : "not yet synced"} />
            <SignalRow colors={colors} testID="ppc3-signal-stars" label="Star ratings" value={stars?.overall_rating ? `${stars.overall_rating} / 5` : "not published"} source={stars?.overall_rating ? "My Aged Care" : null} />
            <SignalRow colors={colors} testID="ppc3-signal-wayly" label="Wayly user feedback" value={wayly?.threshold_met_for_publication ? `${wayly.would_recommend_percentage}% recommend (n=${wayly.survey_response_count})` : "not enough data yet"} source={wayly?.threshold_met_for_publication ? "Wayly aggregated survey" : null} />
            <SignalRow colors={colors} testID="ppc3-signal-ombudsman" label="Ombudsman public referrals" value={ombuds.length ? `${ombuds.length} referral(s)` : "none reported"} source={ombuds.length ? "Commonwealth Ombudsman" : null} />
          </Card>

          {responses.length > 0 ? (
            <Card testID="ppc3-provider-responses">
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: colors.muted, textTransform: "uppercase" }}>Provider responses</T>
              {responses.map((r: any, i: number) => (
                <View key={i} style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  <T variant="small" style={{ color: colors.muted }}>{r.submitter_name} · {r.submitter_role}</T>
                  <T variant="body" style={{ color: colors.text, marginTop: 2 }}>{r.response_content}</T>
                </View>
              ))}
            </Card>
          ) : null}

          <SurveyForm providerName={providerName} onSubmitted={() => load(true)} colors={colors} />

          <Card testID="ppc3-opan-referral" style={{ backgroundColor: colors.surface2 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: colors.muted, textTransform: "uppercase" }}>Talk to people who&apos;ve used this provider</T>
            <T variant="body" style={{ color: colors.text, marginTop: 6 }}>Wayly does not connect users directly. The Older Persons Advocacy Network (OPAN) offers free advocacy that can help.</T>
            <Button label="Call OPAN · 1800 700 600" variant="outline" icon={Phone} testID="ppc3-opan-call" onPress={() => Linking.openURL("tel:1800700600")} style={{ marginTop: spacing.md }} />
          </Card>

          <T variant="small" style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
            Every signal has a public source. Wayly does not publish unverified reviews or aggregate worker-level signals.
          </T>
        </ScrollView>
      )}
    </Screen>
  );
}
