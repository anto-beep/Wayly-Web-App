import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Star, Trophy, Plus, ThumbsUp, ShieldCheck, ShieldAlert, Shield } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type RawRating = { id: string; provider_name: string; stars: number; would_recommend?: boolean | null; comment?: string | null };
type Agg = { provider: string; avg: number; count: number; recommendPct: number };

function StarsRow({ value, color, muted }: { value: number; color: string; muted: string }) {
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={16} color={n <= rounded ? color : muted} fill={n <= rounded ? color : "transparent"} />
      ))}
    </View>
  );
}

export default function CompareProvidersScreen() {
  const { colors } = useTheme();
  const [ratings, setRatings] = useState<RawRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<any[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [cmpError, setCmpError] = useState("");

  const toggleSelect = (name: string) => {
    setCmpError("");
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const runComparison = async () => {
    if (selected.length < 2) { setCmpError("Pick 2 or 3 providers to compare."); return; }
    setComparing(true); setCmpError(""); setComparison(null);
    try {
      const data = await apiFetch<{ comparison: any[] }>("/ppc3/provider-comparison", {
        method: "POST",
        body: { provider_names: selected },
      });
      setComparison(data?.comparison || []);
    } catch {
      setCmpError("Couldn't load the quality signals for those providers. Please try again.");
    } finally {
      setComparing(false);
    }
  };

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<RawRating[]>("/provider-ratings");
      setRatings(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const aggregates = useMemo<Agg[]>(() => {
    const map = new Map<string, { sum: number; count: number; rec: number }>();
    for (const r of ratings) {
      const key = r.provider_name?.trim() || "Unknown provider";
      const cur = map.get(key) || { sum: 0, count: 0, rec: 0 };
      cur.sum += r.stars || 0;
      cur.count += 1;
      cur.rec += r.would_recommend ? 1 : 0;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([provider, v]) => ({ provider, avg: v.sum / v.count, count: v.count, recommendPct: Math.round((v.rec / v.count) * 100) }))
      .sort((a, b) => b.avg - a.avg);
  }, [ratings]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      {loading ? (
        <Loading label="Comparing providers…" />
      ) : error ? (
        <StatePanel testID="compare-providers-error" icon={Star} title="Couldn't load providers" actionLabel="Retry" onAction={load} />
      ) : aggregates.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel
            testID="compare-providers-empty"
            icon={Trophy}
            title="Nothing to compare yet"
            message="Rate a few providers and Wayly ranks them here by average stars and how often you'd recommend them."
            actionLabel="Add a rating"
            onAction={() => router.push("/ratings")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <PageIntro
            eyebrow="Compare Providers"
            title="Side-by-Side Quality Context"
            description="Compare 2 or 3 providers on the signals that actually matter. Every price sits next to a quality context, because the cheapest provider is not always the best value, and the dearest is not always safer."
            whatItDoes={`Pulls published complaint, workforce, and rating signals for each named provider and lines them up in one view. Wayly does not compute a "best" provider, you decide.`}
            howToUse={[
              "Enter 2 or 3 provider names.",
              "Tap Compare, signals are fetched from public regulator sources.",
              "Read the quality summary chip and drill into any concerning signal.",
              "Use the take-away with your family to make an informed choice.",
            ]}
            whatYouGet={[
              "A quality chip for each provider (positive / mixed / concerns).",
              "Signal-level context, not a hollow star rating.",
              "A shareable comparison you can save or send to family.",
            ]}
          />
          <SmartAISummary
            pageKey="provider-comparison"
            context={{
              providers: aggregates.slice(0, 6).map((a) => ({
                name: a.provider,
                average_stars: Math.round(a.avg * 10) / 10,
                rating_count: a.count,
                recommend_pct: a.recommendPct,
              })),
              compared_count: aggregates.length,
            }}
          />

          {/* PPC-3 quality-signal comparison (regulator sources) */}
          <Card testID="ppc3-compare-panel">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Compare quality signals</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>
              Pick 2 or 3 providers to line up published complaint, workforce and rating signals from public regulator sources.
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
              {aggregates.map((a) => {
                const on = selected.includes(a.provider);
                return (
                  <Card key={a.provider} testID={`ppc3-select-${a.provider}`} style={{ padding: 0 }}>
                    <T
                      onPress={() => toggleSelect(a.provider)}
                      style={{ fontFamily: fonts.bodyMedium, fontSize: 12, overflow: "hidden", color: on ? "#fff" : colors.text, backgroundColor: on ? colors.primary : "transparent", borderWidth: 1, borderColor: on ? colors.primary : colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}
                    >
                      {a.provider}
                    </T>
                  </Card>
                );
              })}
            </View>
            {cmpError ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="ppc3-compare-error">{cmpError}</T> : null}
            <Button label={comparing ? "Comparing…" : `Compare ${selected.length || ""} providers`.trim()} testID="ppc3-compare-run" icon={ShieldCheck} loading={comparing} disabled={selected.length < 2} onPress={runComparison} style={{ marginTop: spacing.sm }} />

            {comparison?.map((p) => {
              const sig = (p.composite_quality_summary?.overall_signal || "unknown") as string;
              const SigIcon = sig === "positive" ? ShieldCheck : sig === "concerns" ? ShieldAlert : Shield;
              const sigColor = sig === "positive" ? colors.sage : sig === "concerns" ? colors.terracotta : colors.gold;
              return (
                <Card key={p.id} testID={`ppc3-compare-card-${p.provider_name_normalised}`} style={{ marginTop: spacing.sm, backgroundColor: colors.surface2 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{p.provider_official_name}</T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <SigIcon size={15} color={sigColor} />
                    <T variant="small" style={{ color: sigColor, fontFamily: fonts.bodySemi, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>{sig.replace(/_/g, " ")}</T>
                  </View>
                  <View style={{ marginTop: spacing.sm, gap: 6 }}>
                    <SignalRow label="ACQSC" value={(p.acqsc_compliance_status?.current_status || "unknown").replace(/_/g, " ")} colors={colors} />
                    <SignalRow label="Star rating" value={p.star_ratings?.overall_rating ? `${p.star_ratings.overall_rating}/5` : "not published"} colors={colors} />
                    <SignalRow label="Wayly recommend %" value={p.wayly_aggregated_feedback?.threshold_met_for_publication ? `${p.wayly_aggregated_feedback.would_recommend_percentage}%` : "insufficient data"} colors={colors} />
                    <SignalRow label="Public referrals" value={String((p.ombudsman_public_referrals || []).length)} colors={colors} />
                  </View>
                  <T
                    testID={`ppc3-compare-details-${p.provider_name_normalised}`}
                    onPress={() => router.push(`/provider-quality/${encodeURIComponent(p.provider_official_name)}` as any)}
                    style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13, marginTop: spacing.sm }}
                  >
                    See full details →
                  </T>
                </Card>
              );
            })}
          </Card>

          {aggregates.map((a, i) => (
            <Card key={a.provider} testID={`compare-provider-${i}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={[styles.rank, { backgroundColor: i === 0 ? colors.gold : colors.surface2 }]}>
                  {i === 0 ? <Trophy size={18} color="#fff" /> : <T style={{ fontFamily: fonts.bodySemi, color: colors.muted }}>{i + 1}</T>}
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{a.provider}</T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <StarsRow value={a.avg} color={colors.gold} muted={colors.border} />
                    <T variant="small">{a.avg.toFixed(1)} · {a.count} rating{a.count > 1 ? "s" : ""}</T>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
                <ThumbsUp size={14} color={colors.sage} />
                <T variant="small" style={{ color: colors.sage }}>{a.recommendPct}% would recommend</T>
              </View>
            </Card>
          ))}

          <Button label="Add another rating" testID="compare-providers-add" icon={Plus} variant="outline" onPress={() => router.push("/ratings")} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rank: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

function SignalRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <T variant="small" style={{ color: colors.muted }}>{label}</T>
      <T variant="small" style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>{value}</T>
    </View>
  );
}
