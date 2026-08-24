import React from "react";
import { StyleSheet, View } from "react-native";

import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

export type Stream = { stream: string; allocated: number; spent: number; remaining: number; pct: number; indicative?: boolean };

// Mirrors the web StreamProgress card: stream name, spent of allocated, a
// progress bar, and remaining. Bar turns amber/red as it approaches the cap.
export function StreamProgress({ stream }: { stream: Stream }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, stream.pct ?? 0));
  const barColor = pct >= 100 ? colors.terracotta : pct >= 85 ? colors.alert : colors.sage;
  return (
    <View testID={`stream-${stream.stream}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{stream.stream}</T>
        <T style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.muted }}>{Math.round(pct)}%</T>
      </View>
      <T variant="small" style={{ marginTop: 2 }}>
        {money(stream.spent)} of {money(stream.allocated)}
      </T>
      <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: barColor, borderRadius: 999 }} />
      </View>
      <T variant="small" style={{ marginTop: 6, color: colors.sage }}>{money(stream.remaining)} left</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, flex: 1, minWidth: "100%" },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
});
