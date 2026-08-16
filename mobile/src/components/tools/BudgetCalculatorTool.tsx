import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, Check } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, moneyWhole } from "@/src/utils/format";
import { CLASSIFICATIONS, SUPPLEMENT_OPTIONS, ENTERAL_TYPE_OPTIONS, OXYGEN_CERTIFICATION_SHORT, toWireSupplements } from "@/src/data/budgetTool";

export default function BudgetCalculatorTool() {
  const { colors } = useTheme();
  const [classification, setClassification] = useState(4);
  const [lifetimeBalance, setLifetimeBalance] = useState("");
  const [annualBurn, setAnnualBurn] = useState("");
  const [isGrandfathered, setIsGrandfathered] = useState(false);
  const [supps, setSupps] = useState<string[]>([]);
  const [enteralType, setEnteralType] = useState("bolus");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const toggleSupp = (v: string) => setSupps((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]));

  const calc = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const wire = toWireSupplements(supps, enteralType);
      const data = await apiFetch("/public/budget-calc", { method: "POST", body: {
        classification,
        is_grandfathered: isGrandfathered,
        current_lifetime_balance: lifetimeBalance === "" ? 0 : Number(lifetimeBalance),
        expected_annual_burn: annualBurn === "" ? null : Number(annualBurn),
        applicable_supplements: wire.length ? wire : null,
      } });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const grandfatheredCap = result?.lifetime_cap_grandfathered ?? 86185.23;
  const standardCap = result?.lifetime_cap_standard ?? 137917.01;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Budget & Lifetime Cap Calculator" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T style={{ fontFamily: fonts.heading, fontSize: 28 }}>Budget & Lifetime Cap Calculator</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            Enter your classification. We will show your annual budget, per-stream allocations, lifetime cap progress, and rollover risk, using the actual Support at Home rules (10% care management, $1,000 rollover floor).
          </T>

          {/* Classification cards */}
          <Card>
            <T variant="label">Support at Home classification</T>
            <View style={styles.grid}>
              {CLASSIFICATIONS.map((c) => {
                const on = classification === c.v;
                return (
                  <Pressable key={c.v} testID={`bc-class-${c.v}`} onPress={() => setClassification(c.v)} style={[styles.classCard, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.sageSoft : colors.surface }]}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Class {c.v}</T>
                    <T style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2 }}>{moneyWhole(c.annual)}/yr</T>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <T variant="small" style={{ marginBottom: 4 }}>Current lifetime cap balance (optional)</T>
                <TextInput testID="bc-lifetime-balance" value={lifetimeBalance} onChangeText={(v) => setLifetimeBalance(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <T variant="small" style={{ marginBottom: 4 }}>Expected annual out-of-pocket contribution (optional)</T>
                <TextInput testID="bc-annual-burn" value={annualBurn} onChangeText={(v) => setAnnualBurn(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="e.g. 1500" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
              </View>
            </View>
            <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 4, lineHeight: 16 }}>This does not change your funded budget. Wayly uses it to estimate how many years of contributions you can make before reaching the lifetime cap.</T>

            {/* Grandfathered */}
            <View style={[styles.gfBox, { borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }}>Grandfathered (was on a Home Care Package before 1 Nov 2025)</T>
                <Switch testID="bc-grandfathered" value={isGrandfathered} onValueChange={setIsGrandfathered} trackColor={{ true: colors.primary }} />
              </View>
              <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 16 }}>
                Grandfathered participants are covered by the Home Care Package no-worse-off arrangement. Lifetime cap is {money(grandfatheredCap)} (lower than the standard Support at Home cap of {money(standardCap)}). Both caps are indexed on 20 March and 20 September each year.
              </T>
            </View>
          </Card>

          {/* Supplements */}
          <Card testID="bc-supplements">
            <T variant="label">Applicable supplements (optional)</T>
            <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 18 }}>{`Tick any supplement the participant's care plan covers. Wayly adds the seeded daily amount on top of the base annual budget. Grandfathered-only options are enabled when the Grandfathered checkbox above is ticked.`}</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {SUPPLEMENT_OPTIONS.map((o) => {
                const disabled = o.grandfatheredOnly && !isGrandfathered;
                const on = supps.includes(o.value);
                return (
                  <View key={o.value}>
                    <Pressable testID={`bc-supplement-${o.value}`} disabled={disabled} onPress={() => toggleSupp(o.value)} style={[styles.suppRow, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.sageSoft : colors.surface }, disabled && { opacity: 0.5 }]}>
                      <View style={[styles.checkbox, { borderColor: on ? colors.primary : colors.muted, backgroundColor: on ? colors.primary : "transparent" }]}>
                        {on ? <Check size={13} color="#fff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{o.label}</T>
                        <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>{o.sub}</T>
                        {o.grandfatheredOnly ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: colors.terracotta, marginTop: 4 }}>GRANDFATHERED HCP ONLY</T> : null}
                      </View>
                    </Pressable>
                    {o.value === "oxygen" && on ? (
                      <View style={[styles.warn, { backgroundColor: colors.goldSoft }]}>
                        <AlertTriangle size={14} color={colors.gold} />
                        <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text, flex: 1, lineHeight: 16 }}>{OXYGEN_CERTIFICATION_SHORT}</T>
                      </View>
                    ) : null}
                    {o.value === "enteral" && on ? (
                      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                        {ENTERAL_TYPE_OPTIONS.map((et) => {
                          const eon = enteralType === et.value;
                          return (
                            <Pressable key={et.value} testID={`bc-enteral-${et.value}`} onPress={() => setEnteralType(et.value)} style={[styles.pill, { borderColor: eon ? colors.primary : colors.border, backgroundColor: eon ? colors.primary : "transparent" }]}>
                              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: eon ? "#fff" : colors.text }}>{et.label} · {et.sub}</T>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
          <Button label="Calculate" testID="bc-submit" icon={Sparkles} onPress={calc} loading={busy} />

          {result ? (
            <Card testID="bc-result">
              <T variant="label">{result.classification_label}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm }}>
                <ResultStat label="Annual budget" value={money(result.annual_total)} colors={colors} />
                <ResultStat label="Usable per quarter" value={money(result.quarterly_usable)} colors={colors} />
                <ResultStat label="Care management (qtr)" value={money(result.care_management_quarterly)} colors={colors} />
                <ResultStat label="Rollover floor" value={money(result.rollover_cap)} colors={colors} />
              </View>
              <T variant="label" style={{ marginTop: spacing.md }}>Per-stream allocation</T>
              {(result.streams || []).map((s: any) => (
                <View key={s.stream} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <T variant="small">{s.stream}{s.indicative ? " · indicative" : ""}</T>
                  <T style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text }}>{money(s.allocated)}</T>
                </View>
              ))}
              {result.streams_note ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 16 }}>{result.streams_note}</T> : null}

              {result.annual_supplements_total ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md }}>
                  <T variant="small">Supplements (annual)</T>
                  <T style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text }}>{money(result.annual_supplements_total)}</T>
                </View>
              ) : null}
              {result.annual_total_with_supplements ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Annual total incl. supplements</T>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{money(result.annual_total_with_supplements)}</T>
                </View>
              ) : null}

              <T variant="label" style={{ marginTop: spacing.md }}>Lifetime cap</T>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <T variant="small">{money(result.lifetime_contributions)} of {money(result.lifetime_cap)} ({(result.lifetime_pct ?? 0).toFixed(1)}%)</T>
                {result.years_to_cap ? <T variant="small">~{result.years_to_cap} yrs to cap</T> : null}
              </View>
              <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
                <View style={{ width: `${Math.min(100, result.lifetime_pct ?? 0)}%`, height: "100%", backgroundColor: colors.sage, borderRadius: 999 }} />
              </View>
            </Card>
          ) : null}

          <ToolExplainer toolKey="budget-calculator" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ResultStat({ label, value, colors }: any) {
  return (
    <View style={{ minWidth: 130, flexGrow: 1 }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  classCard: { flexBasis: "22%", flexGrow: 1, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
  gfBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  suppRow: { flexDirection: "row", gap: 10, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, alignItems: "flex-start" },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  warn: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
});
