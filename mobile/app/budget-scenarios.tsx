/**
 * BC-2 Budget Scenarios (mobile) — parity with web BudgetScenarios.jsx.
 *
 * Uses the shared /bc2 backend: baseline projection, what-if adjustments
 * (classification / spending pace / indexation), saved scenarios, and
 * side-by-side compare of two saved scenarios. Touch-friendly steppers and
 * a classification chip row replace the web sliders; values + labels match.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { GitCompare, Loader2, Minus, Plus, Save, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole } from "@/src/utils/format";

type Projection = any;
type Scenario = { id: string; label: string; overrides?: any; projection_snapshot?: Projection };

function DeltaPill({ value, invert }: { value?: number | null; invert?: boolean }) {
  const { colors } = useTheme();
  if (value == null || Math.round(Number(value)) === 0) {
    return <T variant="small" style={{ fontSize: 11 }}>no change</T>;
  }
  const raw = Number(value);
  const isCost = invert ? raw < 0 : raw > 0;
  const abs = Math.abs(raw);
  const Icon = isCost ? TrendingUp : TrendingDown;
  const c = isCost ? colors.terracotta : colors.success;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Icon size={13} color={c} />
      <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: c }}>{isCost ? "+" : "-"}{moneyWhole(abs)}</T>
    </View>
  );
}

function ProjectionCard({ title, data, testID, baseline, variant = "baseline" }: {
  title: string; data: Projection; testID: string; baseline?: Projection; variant?: "baseline" | "adjusted";
}) {
  const { colors } = useTheme();
  if (!data) return null;
  const cur = data.current_quarter;
  const adjusted = variant === "adjusted";

  let netSpend = 0;
  if (adjusted && baseline?.next_quarters) {
    data.next_quarters.forEach((q: any, i: number) => {
      const b = baseline.next_quarters[i];
      if (b) netSpend += (q.projected_spend_aud - b.projected_spend_aud);
    });
  }
  const saves = netSpend < -0.5;
  const costs = netSpend > 0.5;

  return (
    <Card testID={testID} style={adjusted ? { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.goldSoft } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T variant="label" style={{ color: adjusted ? colors.gold : colors.muted }}>{title}</T>
        {adjusted ? (
          <Badge testID={`${testID}-badge`} label="What-If" tone="alert" />
        ) : (
          <View style={{ backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>Class {data.classification}</T>
          </View>
        )}
      </View>

      {adjusted && (saves || costs) ? (
        <View testID={`${testID}-net-impact`} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, padding: 10, borderRadius: radius.md, backgroundColor: saves ? colors.successSoft : colors.errorSoft }}>
          {saves ? <TrendingDown size={16} color={colors.success} /> : <TrendingUp size={16} color={colors.terracotta} />}
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: saves ? colors.success : colors.terracotta }}>
            {saves ? `Saves ${moneyWhole(Math.abs(netSpend))} over 3 quarters` : `Extra ${moneyWhole(netSpend)} over 3 quarters`}
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <T variant="small" style={{ fontSize: 11 }}>{cur.quarter_label} spend vs budget</T>
        <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 2 }}>
          {moneyWhole(cur.burn_total_aud)} <T variant="small">/ {moneyWhole(cur.quarterly_budget_aud)}</T>
        </T>
        <T style={{ fontFamily: fonts.body, fontSize: 11, color: cur.headroom_aud < 0 ? colors.terracotta : colors.success, marginTop: 2 }}>
          {moneyWhole(cur.headroom_aud)} headroom
        </T>
      </View>

      <View style={{ marginTop: spacing.md, gap: 6 }}>
        <T variant="label" style={{ color: colors.muted }}>NEXT 3 QUARTERS</T>
        {data.next_quarters.map((q: any, i: number) => {
          const baseQ = baseline?.next_quarters?.[i];
          return (
            <View key={i} testID={`${testID}-q${i}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{q.quarter_label}</T>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{moneyWhole(q.projected_spend_aud)}</T>
              {adjusted && baseQ ? (
                <View style={{ marginLeft: 8 }}><DeltaPill value={q.projected_spend_aud - baseQ.projected_spend_aud} /></View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Stepper({ label, help, value, display, onDec, onInc, testID }: {
  label: string; help?: string; value: number; display: string; onDec: () => void; onInc: () => void; testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 6 }}>
        <Pressable testID={`${testID}-dec`} onPress={onDec} style={[styles.stepBtn, { borderColor: colors.border }]}>
          <Minus size={18} color={colors.primary} />
        </Pressable>
        <T testID={`${testID}-value`} style={{ fontFamily: fonts.monoMedium, fontSize: 18, minWidth: 70, textAlign: "center" }}>{display}</T>
        <Pressable testID={`${testID}-inc`} onPress={onInc} style={[styles.stepBtn, { borderColor: colors.border }]}>
          <Plus size={18} color={colors.primary} />
        </Pressable>
      </View>
      {help ? <T variant="small" style={{ fontSize: 11, marginTop: 4 }}>{help}</T> : null}
    </View>
  );
}

export default function BudgetScenariosScreen() {
  const { activeId, active } = useParticipants();
  const pid = activeId || active?.id || "";
  const { colors } = useTheme();

  const [baseline, setBaseline] = useState<Projection | null>(null);
  const [preview, setPreview] = useState<Projection | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const [cls, setCls] = useState(4);
  const [spendPct, setSpendPct] = useState(0);
  const [indexPct, setIndexPct] = useState(0);
  const [cmp, setCmp] = useState<string[]>([]);

  const overrides = useMemo(() => ({
    classification: Number(cls),
    spend_adjustment_pct: Number(spendPct),
    indexation_percent: Number(indexPct),
  }), [cls, spendPct, indexPct]);

  const loadBaseline = useCallback(async () => {
    if (!pid) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<Projection>(`/bc2/participants/${pid}/projection`);
      setBaseline(data);
      setCls(data.classification || 4);
    } catch { setBaseline(null); }
    finally { setLoading(false); }
  }, [pid]);

  const loadScenarios = useCallback(async () => {
    if (!pid) return;
    try {
      const data = await apiFetch<{ scenarios: Scenario[] }>(`/bc2/participants/${pid}/scenarios`);
      setScenarios(data.scenarios || []);
    } catch { /* ignore */ }
  }, [pid]);

  useFocusEffect(useCallback(() => { loadBaseline(); loadScenarios(); }, [loadBaseline, loadScenarios]));

  // Debounced preview whenever the adjustments change.
  useEffect(() => {
    if (!pid || !baseline) return;
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(() => {
      apiFetch<Projection>(`/bc2/participants/${pid}/projection-preview`, { method: "POST", body: overrides })
        .then((r) => { if (!cancelled) setPreview(r); })
        .catch(() => { if (!cancelled) setPreview(null); })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pid, baseline, overrides]);

  const dirty = useMemo(() => (
    Number(spendPct) !== 0 || Number(indexPct) !== 0 || (baseline && Number(cls) !== baseline.classification)
  ), [spendPct, indexPct, cls, baseline]);

  const saveScenario = async () => {
    setSaveErr("");
    if (!label.trim()) { setSaveErr("Give the scenario a name first."); return; }
    setSaving(true);
    try {
      await apiFetch(`/bc2/participants/${pid}/scenarios`, { method: "POST", body: { label: label.trim(), note: "", overrides } });
      setLabel("");
      loadScenarios();
    } catch { setSaveErr("Could not save the scenario."); }
    finally { setSaving(false); }
  };

  const deleteScenario = async (id: string) => {
    try {
      await apiFetch(`/bc2/participants/${pid}/scenarios/${id}`, { method: "DELETE" });
      setScenarios((s) => s.filter((x) => x.id !== id));
      setCmp((c) => c.filter((x) => x !== id));
    } catch { /* ignore */ }
  };

  const toggleCompare = (id: string) => {
    setCmp((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= 2) return [c[1], id];
      return [...c, id];
    });
  };

  const compareData = cmp.map((id) => scenarios.find((s) => s.id === id)).filter(Boolean) as Scenario[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Budget Scenarios" onBack={() => router.back()} />
      {!pid ? (
        <StatePanel testID="budget-scenarios-no-participant" icon={Wallet} title="Budget Scenarios" message="Pick a participant from the switcher at the top to model budget scenarios." />
      ) : loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <PageIntro
            eyebrow="Budget · What-if"
            title="Budget Scenarios"
            description="Model what happens to the budget if the classification, spending pace, or indexation changed, then save and compare scenarios."
            whatItDoes="Recomputes the quarterly budget projection using your what-if adjustments, without changing the participant's real record."
            howToUse={["Set your assumptions with the controls", "Watch the adjusted projection update against the baseline", "Save a scenario and compare two side-by-side"]}
            whatYouGet={["A live baseline vs adjusted comparison", "Named scenarios you can revisit and compare"]}
          />

          {baseline ? (
            <SmartAISummary
              pageKey="budget-scenarios"
              context={{
                classification: baseline.classification,
                quarter_budget_aud: baseline.current_quarter?.quarterly_budget_aud,
                quarter_spent_aud: baseline.current_quarter?.burn_total_aud,
                headroom_aud: baseline.current_quarter?.headroom_aud,
                adjusted_headroom_aud: preview?.current_quarter?.headroom_aud,
                saved_scenarios_count: scenarios.length,
                classification_now: cls,
                spend_adjustment_pct: spendPct,
                indexation_pct: indexPct,
              }}
            />
          ) : null}

          {!baseline ? (
            <Card testID="budget-scenarios-empty">
              <T variant="small">We couldn&apos;t load a baseline budget for this participant yet. Upload a statement to get started.</T>
              <Button label="Upload a statement" testID="bc2-upload-link" variant="outline" onPress={() => router.push("/upload")} style={{ marginTop: spacing.md, alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 16 }} />
            </Card>
          ) : (
            <>
              {/* Adjustments */}
              <Card testID="bc2-sliders">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <SlidersHorizontal size={16} color={colors.primary} />
                  <T variant="h3">Adjustments</T>
                  {previewing ? <Loader2 size={14} color={colors.muted} /> : null}
                </View>

                <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
                  <View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Classification level</T>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
                        const on = cls === n;
                        return (
                          <Pressable key={n} testID={`bc2-class-${n}`} onPress={() => setCls(n)}
                            style={[styles.classChip, { flexShrink: 0, backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}>
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: on ? "#fff" : colors.text }}>
                              Level {n}{n === baseline.classification ? " (current)" : ""}
                            </T>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <Stepper
                    label={`Spending pace: ${spendPct > 0 ? "+" : ""}${spendPct}%`}
                    help="Higher means faster spend on future quarters"
                    value={spendPct} display={`${spendPct > 0 ? "+" : ""}${spendPct}%`}
                    testID="bc2-slider-spend"
                    onDec={() => setSpendPct((v) => Math.max(-50, v - 5))}
                    onInc={() => setSpendPct((v) => Math.min(50, v + 5))}
                  />

                  <Stepper
                    label={`Indexation: ${indexPct > 0 ? "+" : ""}${indexPct}%`}
                    help="Annual budget uplift applied per future quarter"
                    value={indexPct} display={`${indexPct > 0 ? "+" : ""}${indexPct}%`}
                    testID="bc2-slider-indexation"
                    onDec={() => setIndexPct((v) => Math.max(0, Math.round((v - 0.5) * 10) / 10))}
                    onInc={() => setIndexPct((v) => Math.min(10, Math.round((v + 0.5) * 10) / 10))}
                  />
                </View>

                <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                  <Field label="Save this scenario as" testID="bc2-scenario-label" value={label} onChangeText={setLabel} placeholder="e.g. If reassessed to Level 5" />
                  {saveErr ? <T variant="small" style={{ color: colors.terracotta }}>{saveErr}</T> : null}
                  <Button label={saving ? "Saving..." : "Save scenario"} testID="bc2-save-scenario" icon={Save} loading={saving} disabled={!dirty} onPress={saveScenario} />
                  {!dirty ? <T variant="small" style={{ fontSize: 11 }}>Move a control to create a what-if scenario worth saving.</T> : null}
                </View>
              </Card>

              {/* Baseline vs adjusted */}
              <ProjectionCard title="BASELINE (TODAY)" data={baseline} testID="bc2-baseline-col" variant="baseline" />
              <ProjectionCard title="ADJUSTED (WHAT-IF)" data={preview} baseline={baseline} testID="bc2-adjusted-col" variant="adjusted" />
            </>
          )}

          {/* Saved scenarios + compare */}
          {scenarios.length > 0 ? (
            <Card testID="bc2-scenarios-list">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <GitCompare size={16} color={colors.primary} />
                <T variant="h3">Saved scenarios</T>
              </View>
              <T variant="small" style={{ marginTop: 2 }}>Tick two to compare</T>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {scenarios.map((s) => {
                  const checked = cmp.includes(s.id);
                  return (
                    <View key={s.id} testID={`bc2-scenario-${s.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: checked ? colors.gold : colors.border, borderRadius: radius.md, padding: spacing.md }}>
                      <Pressable testID={`bc2-scenario-check-${s.id}`} onPress={() => toggleCompare(s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[styles.checkbox, { borderColor: checked ? colors.gold : colors.border, backgroundColor: checked ? colors.gold : "transparent" }]}>
                          {checked ? <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 12 }}>✓</T> : null}
                        </View>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, flex: 1 }} numberOfLines={1}>{s.label}</T>
                      </Pressable>
                      <Pressable testID={`bc2-scenario-delete-${s.id}`} onPress={() => deleteScenario(s.id)} hitSlop={10}>
                        <Trash2 size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {compareData.length === 2 ? (
                <View testID="bc2-compare-results" style={{ marginTop: spacing.md, gap: spacing.md }}>
                  {compareData.map((s, idx) => (
                    <ProjectionCard key={s.id} title={s.label.toUpperCase()} data={s.projection_snapshot}
                      baseline={compareData[0].projection_snapshot} testID={`bc2-compare-col-${s.id}`}
                      variant={idx === 0 ? "baseline" : "adjusted"} />
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  classChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
