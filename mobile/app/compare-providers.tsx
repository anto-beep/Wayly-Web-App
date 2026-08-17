import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Star, Trophy, Plus, ThumbsUp } from "lucide-react-native";

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
      <AppHeader title="Compare Providers" subtitle="Ranked from your saved ratings" onBack={() => router.back()} />
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
