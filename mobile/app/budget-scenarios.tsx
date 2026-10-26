/**
 * BSC-1 · Budget Scenarios (mobile) — "Will the money last?"
 *
 * Question-led, forward-looking scenario tool. Full parity with the web
 * BudgetScenarios.jsx: all figures come from the shared /bsc1 engine
 * (server-side Decimal) and this screen renders results only. Replaces the old
 * slider-based /bc2 what-if screen. No duplicate overall-budget — that lives on
 * the dashboard. Mobile uses chip rows + steppers + a bottom-sheet editor in
 * place of the web selects/sliders; values and labels match.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, Minus, Pencil,
  Plus, Save, SlidersHorizontal, Trash2, TrendingUp, Wallet, X,
} from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import HScrollFade from "@/src/components/HScrollFade";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole, shortDate, titleCase } from "@/src/utils/format";

const HERO_BG = "#0E4D52";
const cap = (s?: string) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");

// Distinct, meaning-coded tints for the hero stat pills so each figure reads at
// a glance on the dark hero (soft coloured fill + ring + icon, white value).
const PILL_TONES: Record<string, { bg: string; ring: string; icon: string; label: string }> = {
  neutral: { bg: "rgba(255,255,255,0.12)", ring: "rgba(255,255,255,0.20)", icon: "#CFE6E6", label: "rgba(255,255,255,0.72)" },
  budget: { bg: "rgba(96,165,250,0.22)", ring: "rgba(96,165,250,0.48)", icon: "#BBD9FB", label: "rgba(255,255,255,0.80)" },
  spend: { bg: "rgba(226,160,106,0.24)", ring: "rgba(226,160,106,0.50)", icon: "#F2CDA9", label: "rgba(255,255,255,0.82)" },
  left: { bg: "rgba(127,200,160,0.24)", ring: "rgba(127,200,160,0.50)", icon: "#AEE6C6", label: "rgba(255,255,255,0.82)" },
  over: { bg: "rgba(240,133,122,0.26)", ring: "rgba(240,133,122,0.52)", icon: "#F6B8B0", label: "rgba(255,255,255,0.84)" },
  status: { bg: "rgba(255,255,255,0.14)", ring: "rgba(255,255,255,0.24)", icon: "#CFE6E6", label: "rgba(255,255,255,0.72)" },
};
// The status pill borrows the colour that matches the status so the hero reads
// as a mix of colours, not a wall of teal.
const STATUS_PILL_TONE: Record<string, string> = { on_track: "left", tight: "spend", runs_out: "over", already_over: "over" };

type ChangeType =
  | "add_service" | "change_service" | "remove_service" | "pause_services"
  | "spending_pace" | "price_change" | "one_off_cost" | "classification_change";

type Change = {
  id: string; type: ChangeType; label?: string; service_id?: string; name?: string;
  unit_price?: number; quantity?: number; frequency_per_week?: number; new_quantity?: number;
  weeks?: number; weekly_cost?: number; pct?: number; amount?: number; quarter_index?: number;
  to_classification?: number;
};
type Service = { service_id: string; name: string; plain_name: string; unit: string; unit_price: number };
type Scenario = { id: string; name: string; changes?: Change[]; spend_to_date_aud?: number | null; pace_pct?: number | null; carry_forward_in_aud?: number | null; last_result?: any };

const STATUS_META: Record<string, { label: string; color: string; tone: "success" | "alert" | "error" | "neutral"; Icon: any }> = {
  on_track: { label: "On track", color: "#6B8F71", tone: "success", Icon: CheckCircle2 },
  tight: { label: "Tight", color: "#C2683D", tone: "alert", Icon: Clock },
  runs_out: { label: "Runs out", color: "#C2683D", tone: "alert", Icon: Clock },
  already_over: { label: "Already over", color: "#B4472B", tone: "error", Icon: TrendingUp },
};

const QUESTION_CARDS: { key: ChangeType; title: string; hint: string; Icon: any }[] = [
  { key: "add_service", title: "Add or change a service", hint: "What if we add cleaning, or go from 2 to 3 hours a visit?", Icon: Plus },
  { key: "classification_change", title: "Classification changes", hint: "What if they're reassessed to a higher level?", Icon: SlidersHorizontal },
  { key: "spending_pace", title: "Spending pace", hint: "What if we spend a bit faster or slower?", Icon: TrendingUp },
];
const MORE_SITUATIONS: { key: ChangeType; title: string }[] = [
  { key: "pause_services", title: "Pause services (e.g. hospital stay)" },
  { key: "one_off_cost", title: "A one-off cost (e.g. respite week)" },
  { key: "price_change", title: "Provider price change" },
  { key: "remove_service", title: "Stop a service" },
];

export default function BudgetScenariosScreen() {
  const { activeId, active } = useParticipants();
  const pid = activeId || active?.id || "";
  const { colors } = useTheme();

  const [catalogue, setCatalogue] = useState<Service[]>([]);
  const [result, setResult] = useState<any>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [sheet, setSheet] = useState<{ type: ChangeType; editId?: string; change?: Change } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [spendToDate, setSpendToDate] = useState("");
  const [pacePct, setPacePct] = useState("");
  const [carryIn, setCarryIn] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const lastGood = useRef<any>(null);

  const overrides = useMemo(() => ({
    spend_to_date_aud: spendToDate === "" ? null : Number(spendToDate),
    pace_pct: pacePct === "" ? null : Number(pacePct),
    carry_forward_in_aud: carryIn === "" ? null : Number(carryIn),
  }), [spendToDate, pacePct, carryIn]);

  useEffect(() => {
    apiFetch<{ services: Service[] }>("/bsc1/service-catalogue")
      .then((r) => setCatalogue(r.services || [])).catch(() => setCatalogue([]));
  }, []);

  const loadScenarios = useCallback(async () => {
    if (!pid) return;
    try {
      const data = await apiFetch<{ scenarios: Scenario[] }>(`/bsc1/participants/${pid}/scenarios`);
      setScenarios(data.scenarios || []);
    } catch { /* ignore */ }
  }, [pid]);
  useFocusEffect(useCallback(() => { loadScenarios(); }, [loadScenarios]));

  // Debounced compute whenever changes or adjustments move.
  useEffect(() => {
    if (!pid) { setLoading(false); return; }
    let cancelled = false;
    setComputing(true);
    const t = setTimeout(() => {
      apiFetch("/bsc1/compute", { method: "POST", body: { participant_id: pid, changes, ...overrides } })
        .then((r) => { if (!cancelled) { setResult(r); lastGood.current = r; setStale(false); } })
        .catch(() => { if (!cancelled && lastGood.current) setStale(true); })
        .finally(() => { if (!cancelled) { setComputing(false); setLoading(false); } });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pid, changes, overrides]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScenarios();
    setRefreshing(false);
  };

  const addOrUpdateChange = (change: Change) => {
    setChanges((cur) => {
      if (change.id && cur.some((c) => c.id === change.id)) return cur.map((c) => c.id === change.id ? change : c);
      return [...cur, { ...change, id: change.id || `ch-${Date.now()}` }];
    });
    setSheet(null);
  };
  const removeChange = (id: string) => setChanges((cur) => cur.filter((c) => c.id !== id));
  const resetChanges = () => setChanges([]);

  const saveScenario = async () => {
    setSaveErr("");
    if (!saveName.trim()) { setSaveErr("Give the scenario a name first."); return; }
    try {
      await apiFetch(`/bsc1/participants/${pid}/scenarios`, { method: "POST", body: { name: saveName.trim(), changes, ...overrides } });
      setSaveName("");
      loadScenarios();
    } catch (e: any) { setSaveErr(e?.message || "Could not save the scenario."); }
  };
  const openScenario = (s: Scenario) => {
    setChanges(s.changes || []);
    setSpendToDate(s.spend_to_date_aud == null ? "" : String(s.spend_to_date_aud));
    setPacePct(s.pace_pct == null ? "" : String(s.pace_pct));
    setCarryIn(s.carry_forward_in_aud == null ? "" : String(s.carry_forward_in_aud));
  };
  const deleteScenario = async (id: string) => {
    try { await apiFetch(`/bsc1/scenarios/${id}`, { method: "DELETE" }); setScenarios((s) => s.filter((x) => x.id !== id)); }
    catch { /* ignore */ }
  };

  const hero = result?.hero;
  const meta = hero ? (STATUS_META[hero.status] || STATUS_META.on_track) : STATUS_META.on_track;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Will the Money Last?"
        subtitle={result ? `Caring for ${result.participant_name} · Classification ${result.classification}` : undefined}
        onBack={() => router.back()}
        right={computing ? <Loader2 size={18} color={colors.muted} /> : undefined}
      />
      {!pid ? (
        <StatePanel testID="bsc1-no-participant" icon={Wallet} title="Will the Money Last?"
          message="Pick a participant from the switcher at the top to check the budget." />
      ) : loading ? (
        <Loading label="Working out the budget…" />
      ) : !result ? (
        <View style={{ padding: spacing.lg }}>
          <Card testID="bsc1-empty">
            <T variant="small">We couldn&apos;t work out a budget for this participant yet. Upload a statement to get started.</T>
            <Button label="Upload a statement" testID="bsc1-upload-link" variant="outline" onPress={() => router.push("/upload")}
              style={{ marginTop: spacing.md, alignSelf: "flex-start", paddingHorizontal: 16 }} />
          </Card>
        </View>
      ) : (
        <ScrollView
          testID="bsc1-page"
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* HERO ANSWER */}
          <LinearGradient testID="bsc1-hero" colors={["#0E4D52", "#0A3B3F", "#10474B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={[styles.statusChip, { backgroundColor: meta.color }]}>
                <meta.Icon size={12} color="#fff" />
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.5, color: "#fff" }}>{meta.label.toUpperCase()}</T>
              </View>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.7)" }}>YOUR ANSWER, RIGHT NOW</T>
              {stale ? <T style={{ fontSize: 10, letterSpacing: 0.5, color: "#FCD9A8" }}>· NOT UPDATED</T> : null}
            </View>
            <T testID="bsc1-hero-answer" style={{ fontFamily: fonts.headingSemi, fontSize: 21, lineHeight: 28, color: "#fff", marginTop: spacing.sm }}>{hero.answer}</T>
            <View style={styles.heroPillRow}>
              <HeroPill tone="budget" Icon={Wallet} label="Budget this quarter" value={moneyWhole(hero.available_aud)} />
              <HeroPill tone="spend" Icon={TrendingUp} label="Projected spend" value={moneyWhole(hero.projected_total_aud)} />
              <HeroPill tone={hero.unspent_aud < 0 ? "over" : "left"} Icon={hero.unspent_aud < 0 ? AlertTriangle : CheckCircle2} label={hero.unspent_aud < 0 ? "Projected over" : "Projected left"} value={moneyWhole(hero.unspent_aud)} />
              <HeroPill tone={STATUS_PILL_TONE[hero.status] || "status"} Icon={meta.Icon} label={hero.run_out_date ? "Runs out" : "Status"} value={hero.run_out_date ? shortDate(hero.run_out_date) : meta.label} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, gap: 8, flexWrap: "wrap" }}>
              <T style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.85)", flex: 1 }}>{hero.action_line}</T>
              <View testID="bsc1-confidence" style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
                <T style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: "#0E4D52" }}>Confidence: {cap(result.confidence)}</T>
              </View>
            </View>
          </LinearGradient>

          {/* FUNDING + CONTRIBUTION STRIP */}
          <Card testID="bsc1-funding-strip">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Wallet size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <T variant="small" style={{ flex: 1, lineHeight: 20 }}>
                The government funds <T style={{ fontFamily: fonts.bodySemi, color: colors.heading }}>{moneyWhole(result.funding.quarterly_budget_aud)}</T> this quarter.
                What {result.participant_name} pays depends on their means assessment.
              </T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap", gap: 6 }}>
              <T variant="small">Lifetime cap left: <T style={{ fontFamily: fonts.bodySemi, color: colors.heading }}>{moneyWhole(result.contribution.lifetime_remaining_aud)}</T></T>
              <T testID="bsc1-estimate-link" onPress={() => router.push("/contribution-position")} style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Estimate my contribution</T>
            </View>
          </Card>

          {/* QUESTION CARDS */}
          <View>
            <T variant="h3" style={{ marginBottom: spacing.sm }}>What Do You Want to Check?</T>
            <View testID="bsc1-question-cards" style={{ gap: spacing.sm }}>
              {QUESTION_CARDS.map((q) => (
                <Pressable key={q.key} testID={`bsc1-q-${q.key}`} onPress={() => setSheet({ type: q.key })}
                  style={({ pressed }) => [styles.qCard, { backgroundColor: colors.surface, borderColor: pressed ? colors.gold : colors.border }]}>
                  <View style={[styles.qIcon, { backgroundColor: colors.goldSoft }]}>
                    <q.Icon size={18} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{q.title}</T>
                    <T variant="small" style={{ fontSize: 13, marginTop: 2 }}>{q.hint}</T>
                  </View>
                  <ChevronRight size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
            <Pressable testID="bsc1-more-situations" onPress={() => setMoreOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm }}>
              {moreOpen ? <ChevronDown size={16} color={colors.primary} /> : <ChevronRight size={16} color={colors.primary} />}
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>More situations</T>
            </Pressable>
            {moreOpen ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {MORE_SITUATIONS.map((m) => (
                  <Pressable key={m.key} testID={`bsc1-q-${m.key}`} onPress={() => setSheet({ type: m.key })}
                    style={[styles.qCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <T variant="small" style={{ fontSize: 14 }}>{m.title}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* YOUR CHANGES */}
          {changes.length > 0 ? (
            <Card testID="bsc1-change-list">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T variant="h3">Your Changes</T>
                <Pressable testID="bsc1-reset" onPress={resetChanges} hitSlop={8}><T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, textDecorationLine: "underline" }}>Reset to today</T></Pressable>
              </View>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {changes.map((c) => {
                  const d = (result.change_deltas || []).find((x: any) => x.change_id === c.id);
                  return (
                    <View key={c.id} testID={`bsc1-change-${c.id}`} style={[styles.changeRow, { borderColor: colors.border }]}>
                      <T style={{ fontFamily: fonts.body, fontSize: 14, flex: 1 }} numberOfLines={1}>{c.label || c.name || c.type}</T>
                      {d && d.delta_aud != null ? (
                        <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: d.delta_aud > 0 ? colors.terracotta : colors.success }}>
                          {d.delta_aud > 0 ? "+" : ""}{moneyWhole(d.delta_aud)}/qtr
                        </T>
                      ) : null}
                      <Pressable testID={`bsc1-edit-${c.id}`} onPress={() => setSheet({ type: c.type, editId: c.id, change: c })} hitSlop={8}><Pencil size={16} color={colors.muted} /></Pressable>
                      <Pressable testID={`bsc1-remove-${c.id}`} onPress={() => removeChange(c.id)} hitSlop={8}><X size={16} color={colors.muted} /></Pressable>
                    </View>
                  );
                })}
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Field label="Save this scenario as" testID="bsc1-save-name" value={saveName} onChangeText={(t) => { setSaveName(t); setSaveErr(""); }} placeholder="e.g. If we add cleaning" />
                {saveErr ? <T variant="small" style={{ color: colors.terracotta }}>{saveErr}</T> : null}
                <Button label="Save scenario" testID="bsc1-save" icon={Save} onPress={saveScenario} />
              </View>
            </Card>
          ) : null}

          {/* COMPARE TODAY vs WITH CHANGES */}
          {changes.length > 0 && result.baseline?.quarters ? (
            <Card testID="bsc1-compare">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                <View style={[styles.qIcon, { width: 30, height: 30, backgroundColor: colors.goldSoft }]}>
                  <TrendingUp size={16} color={colors.gold} />
                </View>
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.gold }}>SCENARIO IMPACT</T>
                  <T variant="h3">Compared to Today</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <CompareCol title="Today" q={result.baseline.quarters[0]} />
                <CompareCol title="With your changes" q={result.quarters[0]} highlight />
              </View>
              <View style={{ marginTop: spacing.md, gap: 6 }}>
                <View style={styles.tableHead}>
                  <T style={[styles.th, { flex: 1.3, textAlign: "left", color: colors.muted }]}>Quarter</T>
                  <T style={[styles.th, { flex: 1, color: colors.muted }]}>Today</T>
                  <T style={[styles.th, { flex: 1, color: colors.muted }]}>Changes</T>
                  <T style={[styles.th, { flex: 1.15, color: colors.muted }]}>Diff</T>
                </View>
                {result.quarters.slice(1).map((q: any, i: number) => {
                  const b = result.baseline.quarters[i + 1];
                  const diff = q.projected_total_aud - (b?.projected_total_aud || 0);
                  const up = diff > 0.5, down = diff < -0.5;
                  const pillBg = up ? colors.errorSoft : down ? colors.successSoft : colors.surface2;
                  const pillFg = up ? colors.terracotta : down ? colors.success : colors.muted;
                  return (
                    <View key={q.quarter_label} testID={`bsc1-compare-row-${i}`} style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2 }}>
                      <T style={{ flex: 1.3, fontFamily: fonts.body, fontSize: 12 }} numberOfLines={1}>{q.quarter_label}</T>
                      <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 11, textAlign: "right", color: colors.muted }}>{moneyWhole(b?.projected_total_aud || 0)}</T>
                      <T style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 12, textAlign: "right" }}>{moneyWhole(q.projected_total_aud)}</T>
                      <View style={{ flex: 1.15, alignItems: "flex-end" }}>
                        <View style={{ backgroundColor: pillBg, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <T style={{ fontFamily: fonts.bodyBold, fontSize: 10, color: pillFg }}>{Math.abs(diff) < 0.5 ? "—" : `${up ? "▲ +" : "▼ -"}${moneyWhole(Math.abs(diff))}`}</T>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* ADJUST DRAWER */}
          <Card testID="bsc1-adjust" style={{ padding: 0 }}>
            <Pressable testID="bsc1-adjust-toggle" onPress={() => setAdjustOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SlidersHorizontal size={16} color={colors.heading} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Adjust the detail</T>
              </View>
              {adjustOpen ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
            </Pressable>
            {adjustOpen ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
                <Field label="Spend so far this quarter" testID="bsc1-spend-to-date" keyboardType="numeric" value={spendToDate} onChangeText={setSpendToDate} placeholder="auto" />
                <Field label="Spending pace %" testID="bsc1-pace" keyboardType="numeric" value={pacePct} onChangeText={setPacePct} placeholder="0" />
                <Field label="Carry-forward in" testID="bsc1-carry" keyboardType="numeric" value={carryIn} onChangeText={setCarryIn} placeholder="0" />
                <T variant="small" style={{ fontSize: 11 }}>Indexation is set by government and applied automatically — it isn&apos;t something you adjust here.</T>
              </View>
            ) : null}
          </Card>

          {/* SAVED SCENARIOS */}
          {scenarios.length > 0 ? (
            <Card testID="bsc1-saved">
              <T variant="h3">Saved scenarios <T variant="small">({scenarios.length} of 5)</T></T>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {scenarios.map((s) => {
                  const st = STATUS_META[s.last_result?.hero?.status] || STATUS_META.on_track;
                  return (
                    <View key={s.id} testID={`bsc1-saved-${s.id}`} style={[styles.changeRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{s.name}</T>
                        <T style={{ fontFamily: fonts.body, fontSize: 11, color: st.color, marginTop: 2 }}>{st.label}</T>
                      </View>
                      <Pressable testID={`bsc1-open-${s.id}`} onPress={() => openScenario(s)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Open</T>
                        <ArrowRight size={13} color={colors.primary} />
                      </Pressable>
                      <Pressable testID={`bsc1-delete-${s.id}`} onPress={() => deleteScenario(s.id)} hitSlop={8}><Trash2 size={16} color={colors.muted} /></Pressable>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          <T testID="bsc1-disclaimer" variant="small" style={{ fontSize: 11 }}>{result.disclaimer} Figures as at {shortDate(result.as_of)} · Schedule {result.index1_version}.</T>
        </ScrollView>
      )}

      {sheet ? (
        <ChangeSheet sheet={sheet} catalogue={catalogue} onClose={() => setSheet(null)} onSave={addOrUpdateChange} />
      ) : null}
    </View>
  );
}

function HeroPill({ label, value, tone = "neutral", Icon }: { label: string; value: string; tone?: string; Icon?: any }) {
  const t = PILL_TONES[tone] || PILL_TONES.neutral;
  return (
    <View style={[styles.heroPill, { backgroundColor: t.bg, borderColor: t.ring }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {Icon ? <Icon size={13} color={t.icon} /> : null}
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: t.label }}>{label.toUpperCase()}</T>
      </View>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: "#fff", marginTop: 2 }}>{value}</T>
    </View>
  );
}

function CompareCol({ title, q, highlight }: { title: string; q: any; highlight?: boolean }) {
  const { colors } = useTheme();
  if (!q) return null;
  const over = q.projected_unspent_aud < 0;
  const tone = highlight
    ? { bg: "#FBEEE6", border: "#A5512B", label: "#A5512B", value: "#8A421F" }
    : { bg: "#E6EFF0", border: "#0E4D52", label: "#0E4D52", value: "#0E4D52" };
  return (
    <View testID={`bsc1-compare-col-${highlight ? "changes" : "today"}`} style={[styles.compareCol, { backgroundColor: tone.bg, borderColor: tone.border + "33" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.5, color: tone.label }}>{title.toUpperCase()}</T>
        {highlight ? (
          <View style={{ backgroundColor: tone.border, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 0.5, color: "#fff" }}>NEW</T>
          </View>
        ) : null}
      </View>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 4, color: tone.value }}>{moneyWhole(q.projected_total_aud)}</T>
      <T style={{ fontFamily: fonts.body, fontSize: 11, marginTop: 2, color: over ? "#B4472B" : "#4E7D5A" }}>projected · {over ? "over by " : "left "}{moneyWhole(Math.abs(q.projected_unspent_aud))}</T>
    </View>
  );
}

function Stepper({ label, display, onDec, onInc, testID }: { label: string; display: string; onDec: () => void; onInc: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 6 }}>
        <Pressable testID={`${testID}-dec`} onPress={onDec} style={[styles.stepBtn, { borderColor: colors.border }]}><Minus size={18} color={colors.heading} /></Pressable>
        <T testID={`${testID}-value`} style={{ fontFamily: fonts.monoMedium, fontSize: 17, minWidth: 64, textAlign: "center" }}>{display}</T>
        <Pressable testID={`${testID}-inc`} onPress={onInc} style={[styles.stepBtn, { borderColor: colors.border }]}><Plus size={18} color={colors.heading} /></Pressable>
      </View>
    </View>
  );
}

const TYPE_OPTIONS: { value: ChangeType; label: string }[] = [
  { value: "add_service", label: "Add a service" },
  { value: "change_service", label: "Change a service" },
  { value: "remove_service", label: "Stop a service" },
  { value: "pause_services", label: "Pause services" },
  { value: "spending_pace", label: "Spending pace" },
  { value: "price_change", label: "Provider price change" },
  { value: "one_off_cost", label: "One-off cost" },
  { value: "classification_change", label: "Classification change" },
];
const WHEN_LABELS = ["This quarter", "Next quarter", "In 2 quarters", "In 3 quarters"];

/** One adaptive change editor for all 8 change types (bottom sheet). */
function ChangeSheet({ sheet, catalogue, onClose, onSave }: {
  sheet: { type: ChangeType; editId?: string; change?: Change }; catalogue: Service[];
  onClose: () => void; onSave: (c: Change) => void;
}) {
  const { colors } = useTheme();
  const edit = sheet.change || ({} as Change);
  const [type, setType] = useState<ChangeType>(sheet.type);
  const [serviceId, setServiceId] = useState(edit.service_id || catalogue[0]?.service_id || "");
  const [price, setPrice] = useState(edit.unit_price != null ? String(edit.unit_price) : "");
  const [quantity, setQuantity] = useState(edit.quantity ?? 2);
  const [freq, setFreq] = useState(edit.frequency_per_week ?? 1);
  const [newQuantity, setNewQuantity] = useState(edit.new_quantity ?? 3);
  const [pct, setPct] = useState(edit.pct ?? 10);
  const [amount, setAmount] = useState(String(edit.amount ?? 500));
  const [weeks, setWeeks] = useState(edit.weeks ?? 3);
  const [quarterIndex, setQuarterIndex] = useState(edit.quarter_index ?? 0);
  const [toClass, setToClass] = useState(edit.to_classification ?? 5);

  const svc = catalogue.find((s) => s.service_id === serviceId) || catalogue[0];
  const unitPrice = price === "" ? (svc?.unit_price || 0) : Number(price);
  const needsService = ["add_service", "remove_service", "change_service", "pause_services"].includes(type);

  const build = (): Change => {
    const base = { id: sheet.editId, type } as Change;
    if (type === "add_service") return { ...base, service_id: serviceId, name: svc?.name, label: `Add ${titleCase(svc?.plain_name || svc?.name)}`, unit_price: unitPrice, quantity: Number(quantity), frequency_per_week: Number(freq) };
    if (type === "remove_service") return { ...base, service_id: serviceId, name: svc?.name, label: `Stop ${titleCase(svc?.plain_name || svc?.name)}`, unit_price: unitPrice, quantity: Number(quantity), frequency_per_week: Number(freq) };
    if (type === "change_service") return { ...base, service_id: serviceId, name: svc?.name, label: `${titleCase(svc?.name)}: ${quantity}→${newQuantity} ${svc?.unit || "units"}`, unit_price: unitPrice, quantity: Number(quantity), new_quantity: Number(newQuantity), frequency_per_week: Number(freq) };
    if (type === "pause_services") return { ...base, label: `Pause for ${weeks} week${Number(weeks) === 1 ? "" : "s"}`, weeks: Number(weeks), weekly_cost: Number(unitPrice * Number(quantity) * Number(freq)), quarter_index: Number(quarterIndex) };
    if (type === "spending_pace") return { ...base, label: `Spend ${pct > 0 ? "+" : ""}${pct}%`, pct: Number(pct) };
    if (type === "price_change") return { ...base, label: `Prices ${pct > 0 ? "+" : ""}${pct}%`, pct: Number(pct) };
    if (type === "one_off_cost") return { ...base, label: `One-off ${moneyWhole(Number(amount))}`, amount: Number(amount), quarter_index: Number(quarterIndex) };
    if (type === "classification_change") return { ...base, label: `Reassessed to Level ${toClass}`, to_classification: Number(toClass) };
    return base;
  };

  const Chip = ({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }) => (
    <Pressable testID={testID} onPress={onPress} style={{ flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: active ? "#fff" : colors.text }}>{label}</T>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable testID="bsc1-change-sheet" style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "88%" }} onPress={(e) => e.stopPropagation()}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            <T variant="h2">Set up the change</T>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Select
              label="Type of change"
              testID="bsc1-sheet-type"
              value={type}
              onChange={(v) => setType(v as ChangeType)}
              options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />

            {needsService ? (
              <Select
                label="Service"
                testID="bsc1-sheet-service"
                value={serviceId}
                onChange={setServiceId}
                options={catalogue.map((s) => ({ value: s.service_id, label: titleCase(s.name) }))}
              />
            ) : null}

            {needsService ? (
              <Field label={`Price per ${svc?.unit || "unit"} you pay${svc ? ` (typical ${moneyWhole(svc.unit_price)})` : ""}`}
                testID="bsc1-sheet-price" keyboardType="numeric" value={price} onChangeText={setPrice} placeholder={svc ? String(svc.unit_price) : "Enter price"} />
            ) : null}

            {["add_service", "remove_service", "change_service", "pause_services"].includes(type) ? (
              <View style={{ flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" }}>
                <Stepper testID="bsc1-sheet-qty" label={`${svc?.unit === "hour" ? "Hours each visit" : "Units each visit"}${type === "change_service" ? " (now)" : ""}`}
                  display={String(quantity)} onDec={() => setQuantity((v) => Math.max(0, Number(v) - 1))} onInc={() => setQuantity((v) => Number(v) + 1)} />
                {type === "change_service" ? (
                  <Stepper testID="bsc1-sheet-new-qty" label="Units each visit (new)" display={String(newQuantity)} onDec={() => setNewQuantity((v) => Math.max(0, Number(v) - 1))} onInc={() => setNewQuantity((v) => Number(v) + 1)} />
                ) : (
                  <Stepper testID="bsc1-sheet-freq" label="Times per week" display={String(freq)} onDec={() => setFreq((v) => Math.max(0, Math.round((Number(v) - 0.5) * 10) / 10))} onInc={() => setFreq((v) => Math.round((Number(v) + 0.5) * 10) / 10)} />
                )}
              </View>
            ) : null}

            {type === "pause_services" ? (
              <Stepper testID="bsc1-sheet-weeks" label="For how many weeks" display={String(weeks)} onDec={() => setWeeks((v) => Math.max(1, Number(v) - 1))} onInc={() => setWeeks((v) => Number(v) + 1)} />
            ) : null}

            {(type === "spending_pace" || type === "price_change") ? (
              <Stepper testID="bsc1-sheet-pct" label={type === "spending_pace" ? "Spend faster (+) or slower (−) by %" : "Prices up (+) or down (−) by %"}
                display={`${pct > 0 ? "+" : ""}${pct}%`} onDec={() => setPct((v) => Number(v) - 5)} onInc={() => setPct((v) => Number(v) + 5)} />
            ) : null}

            {type === "one_off_cost" ? (
              <>
                <Field label="Amount" testID="bsc1-sheet-amount" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="500" />
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, marginBottom: 6 }}>When</T>
                  <HScrollFade fadeColor={colors.surface} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                    {WHEN_LABELS.map((w, i) => <Chip key={w} testID={`bsc1-sheet-when-${i}`} active={Number(quarterIndex) === i} label={w} onPress={() => setQuarterIndex(i)} />)}
                  </HScrollFade>
                </View>
              </>
            ) : null}

            {type === "classification_change" ? (
              <View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, marginBottom: 6 }}>Reassessed to level</T>
                <HScrollFade fadeColor={colors.surface} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <Chip key={n} testID={`bsc1-sheet-class-${n}`} active={Number(toClass) === n} label={`Level ${n}`} onPress={() => setToClass(n)} />)}
                </HScrollFade>
              </View>
            ) : null}

            <Button label={sheet.editId ? "Update" : "Add change"} testID="bsc1-sheet-save" icon={Save} onPress={() => onSave(build())} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.lg, overflow: "hidden" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  heroPillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  heroPill: { width: "47%", flexGrow: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  qCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  qIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  qCardSmall: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 12 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  compareCol: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  tableHead: { flexDirection: "row", paddingBottom: 6 },
  tableRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 8 },
  th: { fontFamily: fonts.bodySemi, fontSize: 11, textAlign: "right" },
  stepBtn: { width: 42, height: 42, borderRadius: radius.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
