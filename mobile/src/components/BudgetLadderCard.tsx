/**
 * BudgetLadderCard (mobile) — FUNDTRACK-1 canonical figure ladder.
 * Renders the eight figures A..H from the shared server payload with ONE label
 * per key (ladder.labels), so mobile shows identical values + labels to web.
 * F ("Left for care this quarter") is the headline; H ("Spare for extra care")
 * sits directly beneath it.
 */
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

function Row({ label, value, strong, k, colors }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }} testID={`ladder-row-${k}`}>
      <T style={{ fontSize: 14, color: strong ? colors.heading : colors.muted, fontFamily: strong ? fonts.bodySemi : fonts.body, flex: 1 }}>{label}</T>
      <T testID={`ladder-figure-${k}`} style={{ fontSize: strong ? 18 : 14, color: colors.heading, fontFamily: strong ? fonts.headingSemi : fonts.bodySemi }}>{value}</T>
    </View>
  );
}

export function BudgetLadderCard({ ladder }: { ladder: any }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [confOpen, setConfOpen] = useState(false);
  if (!ladder || !ladder.figures) return null;
  const f = ladder.figures;
  const L = ladder.labels || {};
  const q = ladder.quarter || {};
  const proj = ladder.projection || {};
  const conf = ladder.confidence || {};
  const status = ladder.status;
  const fmtDate = (iso?: string) => { try { return new Date(iso as string).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };

  return (
    <Card testID="budget-ladder-card" style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>This quarter · {q.label}</T>
        <T testID="ladder-as-at" style={{ fontSize: 11, color: colors.muted }}>{q.elapsed_pct}% through</T>
      </View>

      <View style={{ padding: spacing.lg }}>
        <Row k="F" label={L.F} value={money(f.F)} strong colors={colors} />
        <Row k="H" label={L.H} value={money(f.H)} colors={colors} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
        <Row k="D" label={L.D} value={money(f.D)} colors={colors} />
        <Row k="E" label={L.E} value={money(f.E)} colors={colors} />

        {status === "underspend_risk" ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }} testID="ladder-status">
            <AlertTriangle size={15} color="#6B4A0F" style={{ marginTop: 2 }} />
            <T testID="ladder-forfeit" style={{ flex: 1, fontSize: 13, color: "#6B4A0F", fontFamily: fonts.bodyMedium, lineHeight: 19 }}>About {money(proj.forfeit_aud)} of this quarter's care funding looks likely to be returned on {fmtDate(proj.forfeit_date)}. Anything above {money(ladder.carryover_cap_aud)} cannot be carried over. It may be worth talking to your provider about care you need but are not getting.</T>
          </View>
        ) : status === "overspend_risk" ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }} testID="ladder-status">
            <AlertTriangle size={15} color={colors.terracotta} style={{ marginTop: 2 }} />
            <T testID="ladder-shortfall" style={{ flex: 1, fontSize: 13, color: colors.terracotta, fontFamily: fonts.bodyMedium, lineHeight: 19 }}>Booked care is estimated to be about {money(proj.shortfall_aud)} above what is left this quarter. Check those prices or ask your provider to confirm your balance.</T>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, alignItems: "center" }} testID="ladder-status">
            <CheckCircle2 size={15} color={colors.sage} />
            <T style={{ flex: 1, fontSize: 13, color: colors.sage, fontFamily: fonts.bodyMedium }}>On track. Nothing in this budget needs action right now.</T>
          </View>
        )}
        <T style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>{proj.provisional_note}</T>
      </View>

      <Pressable testID="ladder-breakdown-toggle" onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        {open ? <ChevronDown size={16} color={colors.heading} /> : <ChevronRight size={16} color={colors.heading} />}
        <T style={{ fontSize: 13, color: colors.heading }}>Show the full breakdown</T>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Row k="A" label={L.A} value={money(f.A)} colors={colors} />
          <Row k="B" label={L.B} value={`− ${money(f.B)}`} colors={colors} />
          <Row k="C" label={L.C} value={money(f.C)} colors={colors} />
          <Row k="G" label={L.G} value={money(f.G)} colors={colors} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View testID="ladder-confidence" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary + "12", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: conf.level === "high" ? colors.sage : conf.level === "medium" ? "#C2683D" : "#B4472B" }} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.heading }}>Confidence: {conf.level ? conf.level.charAt(0).toUpperCase() + conf.level.slice(1) : "—"}</T>
        </View>
        {(conf.inputs || []).length > 0 ? (
          <Pressable testID="ladder-confidence-toggle" onPress={() => setConfOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Info size={14} color={colors.primary} />
            <T style={{ fontSize: 12, color: colors.primary }}>What this is based on</T>
          </Pressable>
        ) : null}
      </View>
      {confOpen ? (
        <View testID="ladder-confidence-inputs" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 6 }}>
          {(conf.inputs || []).map((inp: any, i: number) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: inp.ok ? colors.sage : colors.terracotta }} />
              <T style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 }}><T style={{ fontFamily: fonts.bodySemi, color: colors.heading }}>{inp.label}: {inp.value}. </T>{inp.detail}</T>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
