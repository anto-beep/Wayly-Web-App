import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { TrendingUp } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

type Pacing = { envelope?: number; actual_spent?: number; projected_end_of_quarter_total?: number; pace_status?: string; over_under_aud?: number; quarter?: { label?: string; total_days?: number; elapsed_days?: number }; daily_run_rate_aud?: number };
type History = { history?: { label?: string; envelope?: number; spent?: number; pace_status?: string }[]; rollover_cap_aud?: number };

function paceMeta(s?: string) {
  switch ((s || "").toLowerCase()) {
    case "over": return { label: "Over pace", color: "#B7791F" };
    case "under": return { label: "Under pace", color: "#1B5733" };
    default: return { label: "On track", color: "#1B5733" };
  }
}

export default function PacingScreen() {
  const { activeId } = useParticipants();
  const { colors } = useTheme();
  const [p, setP] = useState<Pacing | null>(null);
  const [h, setH] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [pacing, hist] = await Promise.all([
        apiFetch<Pacing>(`/qp1/pacing?participant_id=${activeId}`),
        apiFetch<History>(`/qp1/pacing/history?participant_id=${activeId}`).catch(() => null),
      ]);
      setP(pacing); setH(hist);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const pace = paceMeta(p?.pace_status);
  const envPct = p?.envelope ? Math.round(((p.actual_spent || 0) / p.envelope) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Quarterly Pacing" subtitle={p?.quarter?.label} onBack={() => router.back()} />
      {loading ? <Loading /> : error || !p ? (
        <StatePanel testID="pacing-error" icon={TrendingUp} title="Couldn't load pacing" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Card>
            <T style={{ fontFamily: fonts.heading, fontSize: 24, color: pace.color }}>{pace.label}</T>
            <View style={styles.row}>
              <Stat label="ENVELOPE" value={money(p.envelope)} colors={colors} />
              <Stat label="SPENT SO FAR" value={money(p.actual_spent)} colors={colors} />
              <Stat label="PROJECTED" value={money(p.projected_end_of_quarter_total)} colors={colors} />
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
              <View style={{ width: `${Math.min(envPct, 100)}%`, height: "100%", backgroundColor: pace.color, borderRadius: 999 }} />
            </View>
            <T variant="small" style={{ marginTop: 6 }}>
              {envPct}% of envelope{p.quarter?.elapsed_days != null ? ` · ${p.quarter.elapsed_days} of ${p.quarter.total_days} days elapsed` : ""}
            </T>
            {p.daily_run_rate_aud != null ? <T variant="small" style={{ marginTop: 4 }}>Daily run rate: {money(p.daily_run_rate_aud)}</T> : null}
          </Card>

          {h?.history?.length ? (
            <Card testID="pacing-history">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>History</T>
              {h.history.map((q, i) => (
                <View key={i} style={[styles.hrow, { borderBottomColor: colors.border }]}>
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, flex: 1 }}>{q.label}</T>
                  <T style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>{money(q.spent)} / {money(q.envelope)}</T>
                </View>
              ))}
              {h.rollover_cap_aud != null ? <T variant="small" style={{ marginTop: spacing.sm }}>Rollover cap: {money(h.rollover_cap_aud)}</T> : null}
            </Card>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, colors }: any) {
  return (
    <View style={{ flex: 1 }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>{label}</T>
      <T style={{ fontFamily: fonts.monoMedium, fontSize: 15, marginTop: 2 }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: 4 },
  hrow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1 },
});
