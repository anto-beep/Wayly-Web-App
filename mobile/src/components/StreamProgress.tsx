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
  // Each stream gets its own brand colour so the cards read as distinct blocks.
  const TONES: Record<string, { solid: string; soft: string }> = {
    Clinical: { solid: "#0F5648", soft: "rgba(15,86,72,0.14)" },
    Independence: { solid: "#5E7E63", soft: "rgba(94,126,99,0.16)" },
    "Everyday Living": { solid: "#A05545", soft: "rgba(160,85,69,0.15)" },
  };
  const tone = TONES[stream.stream] || { solid: colors.primary, soft: colors.primarySoft };
  return (
    <View testID={`stream-${stream.stream}`} style={[styles.card, { backgroundColor: tone.soft, borderColor: tone.soft, borderLeftColor: tone.solid, borderLeftWidth: 4 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.4, color: tone.solid }}>{stream.stream.toUpperCase()}</T>
        <T style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.muted }}>{Math.round(pct)}%</T>
      </View>
      <T style={{ fontFamily: fonts.heading, fontSize: 22, color: tone.solid, marginTop: 4 }}>{money(stream.remaining)} <T variant="small" style={{ color: colors.muted }}>left</T></T>
      <View style={[styles.bar, { backgroundColor: "rgba(0,0,0,0.06)" }]}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: tone.solid, borderRadius: 999 }} />
      </View>
      <T variant="small" style={{ marginTop: 6, color: colors.muted }}>{money(stream.spent)} of {money(stream.allocated)} this quarter</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, flex: 1, minWidth: "100%" },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
});
