import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, Info, RefreshCw, Repeat, TrendingUp, X } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatMonthYear, money, moneyWhole } from "@/src/utils/format";

type Cap = { used_to_date: number; total_cap: number; remaining: number; years_at_current_pace?: number | null; years_at_current_pace_bucket?: string; based_on_statement_ids?: string[]; days_since_program_entry?: number };
type Range = { low?: number; high?: number; band_percent?: number; confidence?: string; range_explanation_tokens?: { caregiver?: string } };
type AP = { financial_year_label?: string; annual_estimate: number; annual_estimate_range?: Range; weekly_estimate: number; quarterly_estimate: number; government_share_annual: number };
type Recon = { id: string; month_start?: string; reconciliation_period_month?: string; estimated_contribution: number; actual_contribution: number; variance_flag: string; variance_percentage?: number; automated_explanation_tokens?: { caregiver?: string } };
type Hardship = { id: string; notification_tokens?: { caregiver?: string } };

const FLAG_LABEL: Record<string, string> = {
  minor_variance: "Minor", notable_variance: "Notable", significant_variance: "Significant",
  step_change_variance: "Step change", none_reconciled: "No data",
};
const FLAG_TONE: Record<string, "success" | "alert" | "error" | "neutral"> = {
  minor_variance: "success", notable_variance: "alert", significant_variance: "alert",
  step_change_variance: "error", none_reconciled: "neutral",
};
const CONF_TONE: Record<string, "success" | "alert" | "neutral"> = { high: "success", medium: "alert", low: "neutral" };

const PENSION_OPTS = [
  { v: "full_pension", label: "Full Age Pension" },
  { v: "part_pension", label: "Part Age Pension" },
  { v: "cshc", label: "Commonwealth Seniors Health Card" },
  { v: "self_funded", label: "Self-funded retiree" },
  { v: "unsure", label: "Not sure" },
];
const PENSION_LABEL: Record<string, string> = Object.fromEntries(PENSION_OPTS.map((o) => [o.v, o.label]));

function PensionWizard({ participantId, onCommitted }: { participantId: string; onCommitted: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [newStatus, setNewStatus] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setOpen(false); setStep(1); setNewStatus(""); setPreview(null); setError(""); };
  const today = new Date().toISOString().slice(0, 10);

  const runPreview = async () => {
    setBusy(true); setError("");
    try {
      const r = await apiFetch<any>(`/ce3/participants/${participantId}/pension-change/preview`, { method: "POST", body: { new_pension_status: newStatus, effective_date: today } });
      setPreview(r); setStep(2);
    } catch (e: any) { setError(e?.message || "Could not preview the change."); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setError("");
    try {
      await apiFetch(`/ce3/participants/${participantId}/pension-change/commit`, { method: "POST", body: { new_pension_status: newStatus, effective_date: today } });
      reset(); onCommitted();
    } catch (e: any) { setError(e?.message || "Could not apply the change."); }
    finally { setBusy(false); }
  };

  const delta = preview?.delta || {};

  return (
    <>
      <Button label="Change pension status" testID="ce3-pension-change-open" variant="outline" icon={Repeat} onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={reset}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <T style={{ fontFamily: fonts.heading, fontSize: 22 }}>Change pension status</T>
              <Pressable testID="ce3-pension-close" hitSlop={8} onPress={reset}><X size={22} color={colors.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {step === 1 ? (
                <View style={{ gap: spacing.sm }}>
                  <T variant="small">If circumstances change, update the pension status so estimates stay accurate.</T>
                  {PENSION_OPTS.map((o) => {
                    const active = newStatus === o.v;
                    return (
                      <Pressable key={o.v} testID={`ce3-pension-opt-${o.v}`} onPress={() => setNewStatus(o.v)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center" }}>
                          {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                        </View>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{o.label}</T>
                      </Pressable>
                    );
                  })}
                  {error ? <T variant="small" style={{ color: colors.terracotta }}>{error}</T> : null}
                  <Button label="Preview impact" testID="ce3-pension-preview-btn" onPress={runPreview} loading={busy} disabled={!newStatus} style={{ marginTop: spacing.sm }} />
                </View>
              ) : (
                <View style={{ gap: spacing.md }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>
                    {PENSION_LABEL[preview?.current_pension_status] || "Current"} → {PENSION_LABEL[preview?.new_pension_status] || newStatus}
                  </T>
                  {preview?.no_prior_projection ? (
                    <T variant="small">We do not have a prior projection to compare, but the new status will be applied from today.</T>
                  ) : (
                    <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                      {[["Annual", "annual"], ["Quarterly", "quarterly"], ["Weekly", "weekly"]].map(([label, k]) => (
                        delta[k as string] != null ? (
                          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                            <T variant="small">{label} contribution</T>
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: delta[k as string] > 0 ? colors.terracotta : colors.success }}>
                              {delta[k as string] > 0 ? "+" : ""}{money(delta[k as string])}
                            </T>
                          </View>
                        ) : null
                      ))}
                    </Card>
                  )}
                  {preview?.lifetime_cap_impact?.new_years_at_current_pace ? (
                    <T variant="small">New pace: approximately {Math.round(preview.lifetime_cap_impact.new_years_at_current_pace)} years until the lifetime cap.</T>
                  ) : null}
                  {error ? <T variant="small" style={{ color: colors.terracotta }}>{error}</T> : null}
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Button label="Back" testID="ce3-pension-back" variant="ghost" onPress={() => setStep(1)} style={{ flex: 1 }} />
                    <Button label="Apply change" testID="ce3-pension-commit-btn" onPress={commit} loading={busy} style={{ flex: 2 }} />
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function ContributionPositionScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [cap, setCap] = useState<Cap | null>(null);
  const [ap, setAp] = useState<AP | null>(null);
  const [rows, setRows] = useState<Recon[]>([]);
  const [hardship, setHardship] = useState<Hardship[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeId) { setLoading(false); return; }
    setError("");
    try {
      const [capR, apR, listR, hardR] = await Promise.all([
        apiFetch<Cap>(`/ce3/participants/${activeId}/lifetime-cap`),
        apiFetch<AP>(`/ce3/participants/${activeId}/annual-projection`),
        apiFetch<{ reconciliations?: Recon[] }>(`/ce3/participants/${activeId}/reconciliations?months_back=12`),
        apiFetch<{ triggers?: Hardship[] }>(`/ce3/participants/${activeId}/hardship/triggers?only_open=true`).catch(() => ({ triggers: [] })),
      ]);
      setCap(capR); setAp(apR); setRows(listR?.reconciliations || []); setHardship(hardR?.triggers || []);
    } catch (e: any) {
      setError(e?.message || "Could not load your contribution position.");
    } finally { setLoading(false); }
  }, [activeId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refreshCap = async () => {
    setRefreshing(true);
    try { setCap(await apiFetch<Cap>(`/ce3/participants/${activeId}/lifetime-cap/refresh`, { method: "POST", body: {} })); }
    catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  const reconcileThisMonth = async () => {
    setReconciling(true);
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    try {
      await apiFetch(`/ce3/participants/${activeId}/reconciliations/reconcile`, { method: "POST", body: { period_month: month } });
      const listR = await apiFetch<{ reconciliations?: Recon[] }>(`/ce3/participants/${activeId}/reconciliations?months_back=12`);
      setRows(listR?.reconciliations || []);
    } catch { /* ignore */ }
    finally { setReconciling(false); }
  };

  const usedPct = cap && cap.total_cap ? Math.min(100, (cap.used_to_date / cap.total_cap) * 100) : 0;
  const years = cap?.years_at_current_pace;
  const conf = ap?.annual_estimate_range?.confidence || "low";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Contribution Position" subtitle={active?.display_name ? `Where ${active.display_name} stands` : "Where you stand on contributions"} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Working out your position…" />
      ) : error ? (
        <StatePanel icon={AlertTriangle} title="Could not load" message={error} />
      ) : !cap || !ap ? (
        <StatePanel icon={TrendingUp} title="Nothing to show yet" message="Decode a statement first, then your lifetime cap and projection will appear here." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <PageIntro
            eyebrow="Contribution Position"
            title="Where You Stand on Contributions"
            description="One page that answers three questions: how much of the lifetime cap have I used, how much will I likely pay this year, and does what I've been charged actually match the estimate?"
            whatItDoes="Combines the lifetime cap accumulator, an annual projection with a confidence band, and month-by-month reconciliation of expected vs actual contributions."
            howToUse={[
              "Review your lifetime cap headroom at the top.",
              "Compare this year's projection with what's been charged so far.",
              "Open any month with a variance to investigate the underlying invoices.",
              "If contributions are causing hardship, open the hardship walkthrough.",
            ]}
            whatYouGet={[
              "Certainty about how much you've paid vs what remains.",
              "Early warning if this year's contributions are running high.",
              "A direct hand-off to the hardship pathway when needed.",
            ]}
          />
          {/* Lifetime cap */}
          <Card testID="ce3-lifetime-cap-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="label">LIFETIME CAP</T>
              <Button label="Refresh" testID="ce3-cap-refresh" variant="ghost" icon={RefreshCw} onPress={refreshCap} loading={refreshing} />
            </View>
            <T style={{ fontFamily: fonts.body, fontSize: 15, marginTop: 4 }}>
              You have paid <T style={{ fontFamily: fonts.bodySemi }}>{money(cap.used_to_date)}</T> toward your <T style={{ fontFamily: fonts.bodySemi }}>{moneyWhole(cap.total_cap)}</T> lifetime cap.
            </T>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, marginTop: spacing.md, overflow: "hidden" }}>
              <View style={{ width: `${Math.max(0.5, usedPct)}%`, height: 8, backgroundColor: colors.primary }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <T variant="small">{usedPct.toFixed(2)}% used</T>
              <T variant="small" testID="ce3-cap-remaining">Remaining {moneyWhole(cap.remaining)}</T>
            </View>
            {years !== null && years !== undefined ? (
              <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                <T variant="label">YEARS AT CURRENT PACE</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 34, marginTop: 2 }} testID="ce3-cap-years">approximately {Math.round(years)} years</T>
                <T variant="small" style={{ marginTop: 4 }}>Based on {cap.based_on_statement_ids?.length || 0} decoded statement(s) over {cap.days_since_program_entry || 0} days.</T>
                {(cap.years_at_current_pace_bucket === "gt_50" || cap.years_at_current_pace_bucket === "20_to_50") ? (
                  <T variant="small" style={{ marginTop: 8, color: colors.success }}>The lifetime cap is the most Australia asks anyone to contribute over a lifetime. For most people it is a very long way off.</T>
                ) : null}
                {cap.years_at_current_pace_bucket === "lt_5" ? (
                  <T variant="small" style={{ marginTop: 8, color: colors.terracotta }}>Approaching the lifetime cap. Reaching it is a good thing, it means you will not have to contribute further.</T>
                ) : null}
              </View>
            ) : (
              <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", gap: 8 }}>
                <Info size={16} color={colors.muted} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1 }}>We need at least 30 days of statement data before we can project years at current pace.</T>
              </View>
            )}
          </Card>

          {/* Hardship */}
          {hardship.length > 0 ? (
            <Card testID="ce3-hardship-banner" style={{ backgroundColor: colors.alertSoft, borderColor: colors.alertSoft }}>
              <T variant="label" style={{ color: colors.alert }}>HARDSHIP PATHWAY AVAILABLE</T>
              <T style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 4, color: colors.text }}>{hardship[0].notification_tokens?.caregiver || "Contributions may be causing hardship. Support is available."}</T>
            </Card>
          ) : null}

          {/* Annual projection */}
          <Card testID="ce3-annual-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="label">ANNUAL PROJECTION{ap.financial_year_label ? ` · ${ap.financial_year_label}` : ""}</T>
              {(ap.annual_estimate || 0) > 0 ? <Badge label={`${conf.toUpperCase()} CONFIDENCE`} tone={CONF_TONE[conf] || "neutral"} testID="ce3-annual-confidence" /> : null}
            </View>
            <T style={{ fontFamily: fonts.heading, fontSize: 34, marginTop: 6 }} testID="ce3-annual-estimate">{moneyWhole(ap.annual_estimate)}</T>
            <T variant="small" style={{ marginTop: 2 }}>Range {moneyWhole(ap.annual_estimate_range?.low || 0)}, {moneyWhole(ap.annual_estimate_range?.high || 0)} (±{ap.annual_estimate_range?.band_percent || 0}%)</T>
            {ap.annual_estimate_range?.range_explanation_tokens?.caregiver ? <T variant="small" style={{ marginTop: 8 }}>{ap.annual_estimate_range.range_explanation_tokens.caregiver}</T> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              {[["Weekly", money(ap.weekly_estimate)], ["Quarterly", money(ap.quarterly_estimate)], ["Gov/yr", moneyWhole(ap.government_share_annual)]].map(([l, v]) => (
                <View key={l} style={{ flex: 1 }}>
                  <T variant="label">{l}</T>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 2 }}>{v}</T>
                </View>
              ))}
            </View>
          </Card>

          {/* Pension change wizard */}
          {activeId ? <PensionWizard participantId={activeId} onCommitted={load} /> : null}

          {/* Reconciliation */}
          <Card testID="ce3-reconciliation-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="label">RECONCILIATION</T>
              <Button label="Reconcile this month" testID="ce3-reconcile-btn" variant="outline" onPress={reconcileThisMonth} loading={reconciling} />
            </View>
            {rows.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                <TrendingUp size={22} color={colors.muted} />
                <T variant="small" style={{ marginTop: 8, textAlign: "center" }}>Reconciliation compares what you were estimated to pay against what you were actually charged. Tap Reconcile to start.</T>
              </View>
            ) : (
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {rows.map((r) => (
                  <View key={r.id} testID={`ce3-reconcile-row-${r.reconciliation_period_month}`} style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: r.variance_flag === "step_change_variance" ? colors.terracotta : colors.border, backgroundColor: colors.surface2 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{formatMonthYear(r.month_start || r.reconciliation_period_month)}</T>
                      <Badge label={FLAG_LABEL[r.variance_flag] || r.variance_flag} tone={FLAG_TONE[r.variance_flag] || "neutral"} />
                    </View>
                    <T variant="small" style={{ marginTop: 4 }}>Estimated {money(r.estimated_contribution)} · Actual {money(r.actual_contribution)}{r.variance_flag !== "none_reconciled" && r.variance_percentage != null ? `  (${r.variance_percentage > 0 ? "+" : ""}${r.variance_percentage.toFixed(1)}%)` : ""}</T>
                    {r.automated_explanation_tokens?.caregiver ? <T variant="small" style={{ marginTop: 4 }}>{r.automated_explanation_tokens.caregiver}</T> : null}
                  </View>
                ))}
              </View>
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
