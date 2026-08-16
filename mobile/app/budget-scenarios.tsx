import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Wallet } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { money, moneyWhole } from "@/src/utils/format";

type Budget = { quarterly_usable?: number; streams?: { spent: number }[]; lifetime_cap?: number; lifetime_contributions?: number };
type Pacing = { projected_end_of_quarter_total?: number; quarter?: { elapsed_days?: number; total_days?: number } };

export default function BudgetScenariosScreen() {
  const { activeId } = useParticipants();
  const { colors } = useTheme();
  const [b, setB] = useState<Budget | null>(null);
  const [p, setP] = useState<Pacing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [budget, pace] = await Promise.all([
        apiFetch<Budget>("/budget/current"),
        apiFetch<Pacing>(`/qp1/pacing?participant_id=${activeId}`).catch(() => null),
      ]);
      setB(budget); setP(pace);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const spent = (b?.streams || []).reduce((a, s) => a + (s.spent || 0), 0);
  const usable = b?.quarterly_usable || 0;
  const projected = p?.projected_end_of_quarter_total ?? spent;
  const projAnnual = projected * 4;
  const capLeft = (b?.lifetime_cap || 0) - (b?.lifetime_contributions || 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Budget Scenarios" subtitle="What the numbers project" onBack={() => router.back()} />
      {loading ? <Loading /> : error || !b ? (
        <StatePanel testID="scenarios-error" icon={Wallet} title="Couldn't load scenarios" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Card testID="scenario-current">
            <T variant="label" style={{ color: colors.muted }}>AT CURRENT PACE</T>
            <View style={styles.line}><T variant="body">Projected this quarter</T><T style={styles.val}>{moneyWhole(projected)}</T></View>
            <View style={styles.line}><T variant="body">Quarterly budget</T><T style={styles.val}>{moneyWhole(usable)}</T></View>
            <View style={styles.line}><T variant="body">Projected over / under</T><T style={[styles.val, { color: projected > usable ? colors.alert : colors.success }]}>{money(usable - projected)}</T></View>
          </Card>

          <Card testID="scenario-annual">
            <T variant="label" style={{ color: colors.muted }}>PROJECTED FULL YEAR</T>
            <View style={styles.line}><T variant="body">Annual spend (x4 quarters)</T><T style={styles.val}>{moneyWhole(projAnnual)}</T></View>
          </Card>

          <Card testID="scenario-cap">
            <T variant="label" style={{ color: colors.muted }}>LIFETIME CONTRIBUTION CAP</T>
            <View style={styles.line}><T variant="body">Contributed so far</T><T style={styles.val}>{money(b.lifetime_contributions)}</T></View>
            <View style={styles.line}><T variant="body">Cap</T><T style={styles.val}>{moneyWhole(b.lifetime_cap)}</T></View>
            <View style={styles.line}><T variant="body">Headroom remaining</T><T style={[styles.val, { color: colors.success }]}>{money(capLeft)}</T></View>
          </Card>

          <T variant="small" style={{ textAlign: "center" }}>Build and save detailed what-if scenarios on the web app.</T>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  val: { fontFamily: fonts.monoMedium, fontSize: 15 },
});
