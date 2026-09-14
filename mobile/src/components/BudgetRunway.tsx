import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { TrendingUp, PiggyBank, ArrowRight, CalendarDays } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole } from "@/src/utils/format";

type Projection = {
  current_quarter: { quarter_label?: string; quarterly_budget_aud?: number; burn_total_aud?: number; headroom_aud?: number };
  next_quarters: { quarter_label?: string; projected_spend_aud?: number; projected_headroom_aud?: number }[];
  lifetime_cap_position: { lifetime_cap_aud?: number; contributed_to_date_aud?: number; remaining_headroom_aud?: number };
};

function quarterEndPhrase(label?: string): string {
  const m = String(label || "").match(/([A-Za-z]{3})-([A-Za-z]{3})/);
  const ends: Record<string, string> = { Mar: "31 Mar", Jun: "30 Jun", Sep: "30 Sep", Dec: "31 Dec" };
  if (m && ends[m[2]]) return ends[m[2]];
  return "the end of the quarter";
}

export function BudgetRunway({ participantId }: { participantId: string }) {
  const { colors } = useTheme();
  const [data, setData] = useState<Projection | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    if (!participantId) return;
    try {
      const d = await apiFetch<Projection>(`/bc2/participants/${participantId}/projection`);
      setData(d);
    } catch {
      setErr(true);
    }
  }, [participantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err || !participantId || !data) return null;

  const cur = data.current_quarter || {};
  const cap = data.lifetime_cap_position || {};
  const budget = cur.quarterly_budget_aud || 0;
  const burn = cur.burn_total_aud || 0;
  const pct = budget ? Math.min(100, Math.round((burn / budget) * 100)) : 0;
  const capPct = cap.lifetime_cap_aud ? Math.min(100, Math.round((cap.contributed_to_date_aud! / cap.lifetime_cap_aud) * 100)) : 0;
  const over = (cur.headroom_aud || 0) < 0;
  const barColor = pct >= 90 ? colors.terracotta : pct >= 75 ? colors.gold : colors.sage;

  return (
    <Card testID="bc2-projection-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Soft header */}
      <View style={[styles.header, { backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + "1A" }]}><TrendingUp size={18} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: colors.muted }}>BUDGET RUNWAY</T>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text }} numberOfLines={1}>Where your money stands</T>
          </View>
        </View>
        <Pressable testID="bc2-projection-open-scenarios" onPress={() => router.push("/budget-scenarios")} style={[styles.headerBtn, { borderWidth: 1, borderColor: colors.primary + "40", backgroundColor: colors.surface }]}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Adjust</T>
          <ArrowRight size={13} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {/* This quarter */}
        <View style={[styles.block, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={styles.rowBetween}>
            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, flex: 1 }} numberOfLines={1}>This quarter · {cur.quarter_label}</T>
            <T testID="bc2-projection-burn" style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{moneyWhole(burn)} <T style={{ color: colors.muted, fontFamily: fonts.body }}>of {moneyWhole(budget)}</T></T>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.border }]}>
            <View testID="bc2-projection-burn-bar" style={{ width: `${Math.max(2, pct)}%`, height: "100%", backgroundColor: barColor, borderRadius: 999 }} />
          </View>
          <T style={{ fontSize: 13, marginTop: 6, fontFamily: fonts.bodyMedium, color: pct >= 90 ? colors.terracotta : pct >= 75 ? colors.gold : colors.sage }}>
            {over ? `Over budget by ${moneyWhole(Math.abs(cur.headroom_aud || 0))}.` : `${moneyWhole(cur.headroom_aud || 0)} left to spend before ${quarterEndPhrase(cur.quarter_label)}.`}
          </T>
        </View>

        {/* Lifetime cap — soft clay */}
        <View style={[styles.block, { backgroundColor: colors.goldSoft, borderColor: colors.gold + "40" }]}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <PiggyBank size={15} color={colors.gold} />
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>Lifetime cap</T>
            </View>
            <T testID="bc2-projection-cap" style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{moneyWhole(cap.contributed_to_date_aud)} <T style={{ color: colors.muted, fontFamily: fonts.body }}>of {moneyWhole(cap.lifetime_cap_aud)}</T></T>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.gold + "26" }]}>
            <View testID="bc2-projection-cap-bar" style={{ width: `${Math.max(2, capPct)}%`, height: "100%", backgroundColor: capPct >= 80 ? colors.terracotta : capPct >= 60 ? colors.gold : colors.gold, borderRadius: 999 }} />
          </View>
          <T style={{ fontSize: 13, marginTop: 6, color: colors.muted, fontFamily: fonts.body }}>{moneyWhole(cap.remaining_headroom_aud)} of your lifetime contributions still to go.</T>
        </View>

        {/* Next 3 quarters */}
        {data.next_quarters?.length ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
              <CalendarDays size={13} color={colors.muted} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: colors.muted }}>IF SPENDING STAYS THE SAME</T>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {data.next_quarters.map((q, i) => {
                const ok = (q.projected_headroom_aud || 0) >= 0;
                const short = String(q.quarter_label || "").replace(/\s*\d{4}$/, "");
                return (
                  <View key={i} testID={`bc2-projection-next-${i}`} style={[styles.qTile, { borderColor: ok ? colors.sage : colors.terracotta, backgroundColor: (ok ? colors.sage : colors.terracotta) + "14" }]}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted }} numberOfLines={1}>{short}</T>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 2 }}>{moneyWhole(q.projected_spend_aud)}</T>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 2, color: ok ? colors.sage : colors.terracotta }}>{ok ? "Within budget" : `${moneyWhole(Math.abs(q.projected_headroom_aud || 0))} over`}</T>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerIcon: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  block: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  bar: { height: 10, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
  qTile: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
});
