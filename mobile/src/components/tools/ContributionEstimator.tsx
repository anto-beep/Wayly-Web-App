import React, { useState, useEffect } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, ChevronDown, ChevronUp, ShieldCheck, Calendar, LifeBuoy, TrendingUp } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

const ENTRY_PATHS = [
  { v: "not_assessed", label: "I have not been assessed yet", desc: "Range shown across Class 3, 5 and 8." },
  { v: "hcp_pre_sep_2024", label: "I was on a Home Care Package on or before 12 September 2024", desc: "No-worse-off principle applies." },
  { v: "npq_pre_sep_2024", label: "I was on the National Priority Queue before 12 September 2024", desc: "No-worse-off principle applies." },
  { v: "hcp_post_sep_pre_nov_2025", label: "I started my Home Care Package between 13 Sep 2024 and 31 Oct 2025", desc: "Transitional Support at Home rates." },
  { v: "post_nov_2025", label: "I started (or will start) Support at Home from 1 November 2025", desc: "Standard arrangements apply." },
];
const ASSESSMENT_OPTIONS = [
  { v: "have_classification", label: "I have my Support at Home classification" },
  { v: "awaiting_classification", label: "I've been assessed but don't have my classification yet" },
  { v: "not_assessed", label: "I have not been assessed yet" },
];
const PENSION_STATUS = [
  { v: "full_pension", label: "Full Age Pension" },
  { v: "part_pension", label: "Part Age Pension" },
  { v: "cshc", label: "Self-funded with a Commonwealth Seniors Health Card" },
  { v: "self_funded", label: "Self-funded, no CSHC" },
];
const CLASSIFICATION_OPTIONS: [string, string][] = [
  ["class_1", "Class 1, lowest care needs"], ["class_2", "Class 2"], ["class_3", "Class 3"], ["class_4", "Class 4"],
  ["class_5", "Class 5"], ["class_6", "Class 6"], ["class_7", "Class 7"], ["class_8", "Class 8, highest care needs"],
  ["transitional_1", "Transitional HCP Level 1"], ["transitional_2", "Transitional HCP Level 2"],
  ["transitional_3", "Transitional HCP Level 3"], ["transitional_4", "Transitional HCP Level 4"],
  ["rcp", "Restorative Care Pathway"], ["eolp", "End of Life Pathway"],
];

export default function ContributionEstimator() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const [form, setForm] = useState<any>({
    person_name: active?.display_name || "", assessment_status: "have_classification", entry_path: "post_nov_2025",
    hcp_paid_fees: null, hcp_level_when_grandfathered: null, pension_status: "full_pension",
    relationship: "single", homeowner: true, income_excluding_pension: "", financial_assets: "",
    partner_income: "", partner_assets: "", classification: active?.classification_level ? `class_${active.classification_level}` : "class_5", mix_advanced: false,
    service_mix: { clinical: 30, independence: 45, everyday: 25 },
  });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!active) return;
    setForm((f: any) => ({
      ...f,
      person_name: f.person_name || active.display_name || "",
      classification: (!f.classification || f.classification === "class_5") && active.classification_level ? `class_${active.classification_level}` : f.classification,
    }));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFinancial = form.pension_status === "part_pension" || form.pension_status === "cshc";
  const showHcpFeeQuestion = form.entry_path === "hcp_pre_sep_2024";
  const showHcpLevel = form.entry_path === "hcp_pre_sep_2024" || form.entry_path === "hcp_post_sep_pre_nov_2025";
  const showClassificationPicker = form.assessment_status === "have_classification";

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    const num = (v: any) => (v === "" || v == null ? null : Number(v));
    const payload = {
      person_name: form.person_name || null, assessment_status: form.assessment_status, entry_path: form.entry_path,
      hcp_paid_fees: form.hcp_paid_fees, hcp_level_when_grandfathered: form.hcp_level_when_grandfathered,
      pension_status: form.pension_status, relationship: form.relationship, homeowner: !!form.homeowner,
      income_excluding_pension: num(form.income_excluding_pension), financial_assets: num(form.financial_assets),
      partner_income: form.relationship === "couple" ? num(form.partner_income) : null,
      partner_assets: form.relationship === "couple" ? num(form.partner_assets) : null,
      classification: form.assessment_status === "have_classification" ? form.classification : null,
      service_mix: form.service_mix, effective_date: new Date().toISOString().slice(0, 10),
    };
    try {
      const data = await apiFetch("/ce2/calculate", { method: "POST", body: payload });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not estimate contribution.");
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Contribution Estimator" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Contribution Estimator</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            A plain-English estimate of what your household will pay each week under Support at Home. Wayly walks through your situation and shows how the government share and your share are worked out.
          </T>

          {!result ? (
            <Card testID="ce-form">
              <Label colors={colors}>{"Person's name (optional)"}</Label>
              <TextInput testID="ce-person-name" value={form.person_name} onChangeText={(v) => set({ person_name: v })} placeholder="e.g. Louisa Davids" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />

              <Label colors={colors} top>Which best describes your situation?</Label>
              <View testID="ce-entry-path" style={{ gap: spacing.sm }}>
                {ENTRY_PATHS.map((p) => (
                  <RadioTile key={p.v} checked={form.entry_path === p.v} label={p.label} sub={p.desc} colors={colors} testID={`ce-entry-${p.v}`}
                    onPress={() => set({ entry_path: p.v, assessment_status: p.v === "not_assessed" ? "not_assessed" : form.assessment_status, hcp_paid_fees: p.v === "hcp_pre_sep_2024" ? form.hcp_paid_fees : null, hcp_level_when_grandfathered: (p.v === "hcp_pre_sep_2024" || p.v === "hcp_post_sep_pre_nov_2025") ? form.hcp_level_when_grandfathered : null })} />
                ))}
              </View>

              {showHcpFeeQuestion ? (
                <View testID="ce-hcp-fee-followup">
                  <Label colors={colors} top>Did you pay any fees under your Home Care Package?</Label>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    <Pill active={form.hcp_paid_fees === false} onPress={() => set({ hcp_paid_fees: false })} colors={colors} testID="ce-hcp-fees-no">No, I never paid fees</Pill>
                    <Pill active={form.hcp_paid_fees === true} onPress={() => set({ hcp_paid_fees: true })} colors={colors} testID="ce-hcp-fees-yes">Yes, I paid fees</Pill>
                  </View>
                  {form.hcp_paid_fees === false ? (
                    <View testID="ce-hcp-exempt-hint" style={[styles.hint, { backgroundColor: colors.sageSoft }]}>
                      <ShieldCheck size={16} color={colors.sage} />
                      <T variant="small" style={{ flex: 1, lineHeight: 19 }}>You will not pay any Support at Home contribution. The no-worse-off rule guarantees a permanent zero because you paid no HCP fees.</T>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {showHcpLevel ? (
                <View>
                  <Label colors={colors} top>Which Home Care Package level were you on?</Label>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {[1, 2, 3, 4].map((n) => (
                      <Pill key={n} active={form.hcp_level_when_grandfathered === n} onPress={() => set({ hcp_level_when_grandfathered: n })} colors={colors} testID={`ce-hcp-level-${n}`}>Level {n}</Pill>
                    ))}
                  </View>
                </View>
              ) : null}

              {form.entry_path !== "not_assessed" ? (
                <View testID="ce-assessment-status">
                  <Label colors={colors} top>Do you have a Support at Home classification?</Label>
                  <View style={{ gap: spacing.sm }}>
                    {ASSESSMENT_OPTIONS.map((a) => (
                      <RadioTile key={a.v} checked={form.assessment_status === a.v} label={a.label} colors={colors} testID={`ce-assessment-${a.v}`} onPress={() => set({ assessment_status: a.v })} />
                    ))}
                  </View>
                </View>
              ) : null}

              {showClassificationPicker ? (
                <View>
                  <Label colors={colors} top>Your classification</Label>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                    {CLASSIFICATION_OPTIONS.map(([v, l]) => (
                      <Pill key={v} active={form.classification === v} onPress={() => set({ classification: v })} colors={colors} testID={`ce-classification-${v}`} small>{l}</Pill>
                    ))}
                  </View>
                </View>
              ) : null}

              <Label colors={colors} top>Age Pension status</Label>
              <View testID="ce-pension-status" style={{ gap: spacing.sm }}>
                {PENSION_STATUS.map((p) => (
                  <RadioTile key={p.v} checked={form.pension_status === p.v} label={p.label} colors={colors} testID={`ce-pension-${p.v}`} onPress={() => set({ pension_status: p.v })} />
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }} testID="ce-household-block">
                <View style={{ flex: 1 }}>
                  <Label colors={colors}>Household</Label>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Pill active={form.relationship === "single"} onPress={() => set({ relationship: "single" })} colors={colors} testID="ce-relationship-single">Single</Pill>
                    <Pill active={form.relationship === "couple"} onPress={() => set({ relationship: "couple" })} colors={colors} testID="ce-relationship-couple">Couple</Pill>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Label colors={colors}>Homeowner?</Label>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Pill active={form.homeowner === true} onPress={() => set({ homeowner: true })} colors={colors} testID="ce-homeowner-yes">Yes</Pill>
                    <Pill active={form.homeowner === false} onPress={() => set({ homeowner: false })} colors={colors} testID="ce-homeowner-no">No</Pill>
                  </View>
                </View>
              </View>

              {showFinancial ? (
                <View testID="ce-financial-details" style={[styles.innerBox, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Financial details (optional)</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>{"The exact means-tested rate depends on your assessable income and assets. Leave blank to see a range for now."}</T>
                  <Label colors={colors} top>Your assessable income (excl. pension), $ per year</Label>
                  <TextInput testID="ce-income" value={String(form.income_excluding_pension)} onChangeText={(v) => set({ income_excluding_pension: v.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="e.g. 19029" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
                  <Label colors={colors} top>Assessable assets (not including the family home)</Label>
                  <TextInput testID="ce-assets" value={String(form.financial_assets)} onChangeText={(v) => set({ financial_assets: v.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="e.g. 10000" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
                  {form.relationship === "couple" ? (
                    <View testID="ce-partner-block">
                      <Label colors={colors} top>{"Your partner's assessable income"}</Label>
                      <TextInput testID="ce-partner-income" value={String(form.partner_income)} onChangeText={(v) => set({ partner_income: v.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
                      <Label colors={colors} top>{"Your partner's assessable assets"}</Label>
                      <TextInput testID="ce-partner-assets" value={String(form.partner_assets)} onChangeText={(v) => set({ partner_assets: v.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Pressable testID="ce-mix-toggle" onPress={() => set({ mix_advanced: !form.mix_advanced })} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md }}>
                <T variant="small" style={{ color: colors.muted }}>Service mix, defaults to 30 / 45 / 25 %</T>
                {form.mix_advanced ? <ChevronUp size={15} color={colors.muted} /> : <ChevronDown size={15} color={colors.muted} />}
              </Pressable>
              {form.mix_advanced ? (
                <View testID="ce-mix-inputs" style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  {["clinical", "independence", "everyday"].map((k) => (
                    <View key={k} style={{ flex: 1 }}>
                      <T variant="small" style={{ color: colors.muted, marginBottom: 4 }}>{k[0].toUpperCase() + k.slice(1)} %</T>
                      <TextInput testID={`ce-mix-${k}`} value={String(form.service_mix[k])} onChangeText={(v) => set({ service_mix: { ...form.service_mix, [k]: Number(v.replace(/[^0-9]/g, "")) || 0 } })} keyboardType="number-pad" style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
                    </View>
                  ))}
                </View>
              ) : null}

              {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="ce-error">{error}</T> : null}
              <Button label="See my estimate" testID="ce-submit" icon={Sparkles} onPress={submit} loading={busy} style={{ marginTop: spacing.md }} />
            </Card>
          ) : (
            <View testID="ce-result" style={{ gap: spacing.md }}>
              <ResultScreen result={result} form={form} colors={colors} onEdit={() => setResult(null)} />
            </View>
          )}

          <ToolExplainer toolKey="contribution-estimator" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ResultScreen({ result, form, colors, onEdit }: any) {
  const govtPct = Math.max(0, Math.min(100, result.government_share_percent || 0));
  const youPct = 100 - govtPct;
  const saving = (result.contribution_weekly || 0) - (result.contribution_post_october_2026_weekly || 0);
  return (
    <>
      {/* Headline */}
      {result.is_fee_exempt ? (
        <Card testID="ce-fee-exempt-headline" style={{ backgroundColor: colors.sage, borderColor: colors.sage }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={16} color="#fff" />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "#fff" }}>FEE EXEMPT</T>
          </View>
          <T style={{ fontFamily: fonts.heading, fontSize: 28, color: "#fff", marginTop: 6 }} testID="ce-fee-exempt-hero">No contribution will be payable.</T>
          <T style={{ fontFamily: fonts.body, fontSize: 14, color: "#fff", marginTop: 8, lineHeight: 21 }} testID="ce-fee-exempt-body">Because of a Home Care Package before 12 September 2024 with no HCP fees, the no-worse-off rule guarantees a permanent zero. No lifetime cap applies.</T>
          <EditLink onEdit={onEdit} light />
        </Card>
      ) : result.range_mode ? (
        <Card testID="ce-range-headline" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.7)" }} testID="ce-result-hero-label">ESTIMATED WEEKLY CONTRIBUTION</T>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 36, color: "#fff" }} testID="ce-range-min">{money(result.range_min_weekly)}</T>
            <T style={{ color: "rgba(255,255,255,0.7)", fontSize: 20 }}>to</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 36, color: "#fff" }} testID="ce-range-max">{money(result.range_max_weekly)}</T>
            <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 15 }}>/ week</T>
          </View>
          {result.range_anchors?.length ? (
            <View testID="ce-range-anchors" style={{ marginTop: spacing.md, gap: 6 }}>
              {result.range_anchors.map((a: any) => (
                <View key={a.classification} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)", paddingBottom: 6 }} testID={`ce-range-anchor-${a.classification}`}>
                  <T style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{a.label}</T>
                  <T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 14 }}>{money(a.weekly)} / wk</T>
                </View>
              ))}
            </View>
          ) : null}
          <EditLink onEdit={onEdit} light />
        </Card>
      ) : (
        <Card testID="ce-result-headline" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.7)" }} testID="ce-result-hero-label">ESTIMATED WEEKLY CONTRIBUTION</T>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 48, color: "#fff" }} testID="ce-result-weekly">{money(result.contribution_weekly)}</T>
            <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 16 }}>/ week</T>
          </View>
          <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 6 }} testID="ce-result-annual">{money(result.contribution_annual)} a year · {money(result.contribution_quarterly)} a quarter</T>
          <T style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: spacing.md, lineHeight: 20 }} testID="ce-result-govt-share">
            The Australian Government pays {money(result.government_share_annual)} a year, that is {result.government_share_percent?.toFixed(1)}% of the total.
          </T>
          <EditLink onEdit={onEdit} light />
        </Card>
      )}

      {/* Government share bar */}
      {!result.range_mode && !result.is_fee_exempt ? (
        <Card testID="ce-govt-share-bar">
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>WHO PAYS WHAT</T>
          <View style={{ flexDirection: "row", height: 44, borderRadius: radius.sm, overflow: "hidden", marginTop: spacing.sm }}>
            <View testID="ce-govt-share-govt" style={{ width: `${govtPct}%`, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}>
              {govtPct >= 14 ? <T style={{ color: "#fff", fontSize: 12, fontFamily: fonts.bodySemi }}>Govt {govtPct.toFixed(0)}%</T> : null}
            </View>
            <View testID="ce-govt-share-you" style={{ width: `${youPct}%`, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              {youPct >= 10 ? <T style={{ color: "#fff", fontSize: 12, fontFamily: fonts.bodySemi }}>You {youPct.toFixed(0)}%</T> : null}
            </View>
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm }}>Government pays {money(result.government_share_annual)} / year · You pay {money(result.contribution_annual)} / year</T>
        </Card>
      ) : null}

      {/* Rate breakdown */}
      {!result.is_fee_exempt ? (
        <Card testID="ce-rate-breakdown">
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.sm }}>YOUR RATES BY SERVICE TYPE</T>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <RateCard label="Clinical care" rate="0%" note="Always free" colors={colors} testID="ce-rate-clinical" />
            <RateCard label="Independence" rate={`${result.independence_rate?.toFixed(1)}%`} note="Personal care, meals" colors={colors} testID="ce-rate-independence" />
            <RateCard label="Everyday Living" rate={`${result.everyday_rate?.toFixed(1)}%`} note="Cleaning, transport" colors={colors} testID="ce-rate-everyday" />
          </View>
          <T variant="small" style={{ marginTop: spacing.sm, lineHeight: 20 }} testID="ce-rate-prose">
            {result.is_no_worse_off
              ? "You are on the no-worse-off track, which caps your rates at 25% for both Independence and Everyday Living. Clinical care is always free."
              : `Under standard arrangements, Independence services cost you ${result.independence_rate?.toFixed(1)}% and Everyday Living services cost you ${result.everyday_rate?.toFixed(1)}%. Clinical care is always fully funded.`}
          </T>
        </Card>
      ) : null}

      {/* Safety net */}
      {result.applicable_lifetime_cap ? (
        <Card testID="ce-safety-net">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ShieldCheck size={20} color={colors.sage} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Your lifetime cap: {money(result.applicable_lifetime_cap)}</T>
              <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>{"This is the total amount you'll ever pay for the Independence and Everyday Living components. Once you've contributed this much, you pay nothing further. Clinical care never counts towards this cap."}</T>
            </View>
          </View>
        </Card>
      ) : null}

      {/* October 2026 comparison */}
      {!result.range_mode && !result.is_fee_exempt && result.contribution_post_october_2026_weekly != null ? (
        <Card testID="ce-oct-2026">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Calendar size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>From 1 October 2026, personal care becomes fully government-funded</T>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
                  <T variant="small" style={{ color: colors.muted }}>Now</T>
                  <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }} testID="ce-oct-now">{money(result.contribution_weekly)} / wk</T>
                </View>
                <View style={{ flex: 1, borderWidth: 1, borderColor: colors.sage, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.sageSoft }}>
                  <T variant="small" style={{ color: colors.sage }}>From 1 Oct 2026</T>
                  <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }} testID="ce-oct-after">{money(result.contribution_post_october_2026_weekly)} / wk</T>
                </View>
              </View>
              {saving > 0.005 ? <T variant="small" style={{ marginTop: spacing.sm }} testID="ce-oct-saving">{`That's about ${money(saving)} a week less, or ${money(saving * 52)} a year.`}</T> : null}
            </View>
          </View>
        </Card>
      ) : null}

      {/* HCP comparison */}
      {result.hcp_comparison ? (
        <Card testID="ce-hcp-comparison">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TrendingUp size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>COMPARED TO YOUR HOME CARE PACKAGE</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 2 }}>Level {result.hcp_comparison.hcp_level} · September 2025 fees</T>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <RateCard label="HCP would-be" rate={money(result.hcp_comparison.hcp_weekly)} note={`${money(result.hcp_comparison.hcp_annual)}/yr`} colors={colors} testID="ce-hcp-would-be" />
                <RateCard label="Support at Home" rate={money(result.hcp_comparison.sah_weekly)} note={`${money(result.hcp_comparison.sah_annual)}/yr`} colors={colors} testID="ce-hcp-sah" />
                <RateCard label={result.hcp_comparison.is_sah_cheaper ? "Saving" : "More"} rate={money(Math.abs(result.hcp_comparison.delta_weekly || 0))} note={`${money(Math.abs(result.hcp_comparison.delta_annual || 0))}/yr`} colors={colors} testID="ce-hcp-delta" />
              </View>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Also worth knowing */}
      <Card testID="ce-also-worth-knowing">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <LifeBuoy size={20} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Also worth knowing</T>
            <T variant="small" style={{ marginTop: spacing.sm, lineHeight: 20 }}><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Financial hardship. </T>If paying your contribution would cause serious financial difficulty, you can apply to Services Australia for a hardship reduction.</T>
            <Pressable testID="ce-lf-link" onPress={() => router.push("/tool/letters-and-follow-ups")} style={{ marginTop: spacing.sm }}>
              <T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>{"Reassessment: Wayly's Letters & Follow-ups tool can draft the request →"}</T>
            </Pressable>
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, fontSize: 12, lineHeight: 18 }}>This is a plain-English estimate for your household planning. Your final rate is set by Services Australia based on your assessed income and assets.</T>
          </View>
        </View>
      </Card>
    </>
  );
}

function EditLink({ onEdit, light }: any) {
  return <Pressable testID="ce-edit-inputs" onPress={onEdit} style={{ marginTop: spacing.md }}><T style={{ fontSize: 12, color: light ? "rgba(255,255,255,0.85)" : undefined, textDecorationLine: "underline" }}>Edit my inputs</T></Pressable>;
}
function RateCard({ label, rate, note, colors, testID }: any) {
  return (
    <View testID={testID} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface2, padding: spacing.sm }}>
      <T style={{ fontSize: 10, letterSpacing: 0.3, color: colors.muted }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 2 }}>{rate}</T>
      <T style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{note}</T>
    </View>
  );
}
function Label({ children, colors, top }: any) {
  return <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, marginBottom: 6, marginTop: top ? spacing.md : 0 }}>{children}</T>;
}
function RadioTile({ checked, label, sub, onPress, colors, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={{ borderWidth: 1, borderRadius: radius.md, padding: spacing.md, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.sageSoft : colors.surface, flexDirection: "row", gap: 10 }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 2, borderColor: checked ? colors.primary : colors.muted, backgroundColor: checked ? colors.primary : "transparent" }} />
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{label}</T>
        {sub ? <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}
function Pill({ active, onPress, children, colors, testID, small }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: small ? 10 : 14, paddingVertical: small ? 6 : 9, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}>
      <T style={{ fontFamily: fonts.bodyMedium, fontSize: small ? 11 : 13, color: active ? "#fff" : colors.text }}>{children}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
  hint: { flexDirection: "row", gap: 8, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, alignItems: "flex-start" },
  innerBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
});
