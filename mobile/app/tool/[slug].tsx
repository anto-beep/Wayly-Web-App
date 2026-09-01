import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Sparkles, AlertTriangle, FileText, Clock, Mail } from "lucide-react-native";

import { AppHeader, Button, Card, Field, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import ToolExplainer from "@/src/components/ToolExplainer";
import DecoderResultView from "@/src/components/DecoderResultView";
import BudgetCalculatorTool from "@/src/components/tools/BudgetCalculatorTool";
import ClassificationSelfCheck from "@/src/components/tools/ClassificationSelfCheck";
import ProviderPriceChecker from "@/src/components/tools/ProviderPriceChecker";
import ContributionEstimator from "@/src/components/tools/ContributionEstimator";
import LettersFollowUps from "@/src/components/tools/LettersFollowUps";
import AgedCareQA from "@/src/components/tools/AgedCareQA";
import CarePlanReviewer from "@/src/components/tools/CarePlanReviewer";
import InvoiceChecker from "@/src/components/tools/InvoiceChecker";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, moneyWhole, sanitizeAI } from "@/src/utils/format";
import { TOOL_CONTENT } from "@/src/data/toolContent";

type FieldType = "number" | "text" | "textarea" | "switch" | "select" | "scale12";
type FormField = { key: string; label: string; type: FieldType; placeholder?: string; options?: { label: string; value: any }[]; default?: any; help?: string };
type ToolCfg = { title: string; subtitle: string; endpoint: string; submitLabel: string; fields: FormField[] };

const CLASS_OPTS = Array.from({ length: 8 }, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));

const TOOLS: Record<string, ToolCfg> = {
  "budget-calculator": {
    title: "Budget & Lifetime Cap Calculator", subtitle: "See your annual budget, per-stream allocation, and lifetime cap projection", endpoint: "/public/budget-calc", submitLabel: "Calculate",
    fields: [
      { key: "classification", label: "Classification level", type: "select", options: CLASS_OPTS, default: 4 },
      { key: "expected_annual_burn", label: "Expected annual spend (AUD)", type: "number", placeholder: "e.g. 20000", default: "" },
      { key: "current_lifetime_balance", label: "Contributions so far (AUD)", type: "number", placeholder: "0", default: "" },
      { key: "is_grandfathered", label: "Grandfathered (pre-Sep 2024)", type: "switch", default: false },
    ],
  },
  "provider-price-checker": {
    title: "Provider Price Checker", subtitle: "Compare a charge against the market", endpoint: "/public/price-check", submitLabel: "Check price",
    fields: [
      { key: "service", label: "Service", type: "text", placeholder: "e.g. Personal care", default: "" },
      { key: "rate", label: "Rate charged (AUD)", type: "number", placeholder: "e.g. 75", default: "" },
      { key: "postcode", label: "Postcode (optional)", type: "text", placeholder: "e.g. 3000", default: "" },
    ],
  },
  "classification-self-check": {
    title: "Classification Self-Check", subtitle: "Sense-check the likely classification level", endpoint: "/public/classification-check", submitLabel: "See result",
    fields: [{ key: "answers", label: "Rate each area (0 = no help, 4 = full help)", type: "scale12", default: Array(12).fill(0) }],
  },
  "letters-and-follow-ups": {
    title: "Letters & Follow-ups", subtitle: "Draft a clear letter to My Aged Care", endpoint: "/public/reassessment-letter", submitLabel: "Draft letter",
    fields: [
      { key: "letter_type", label: "Letter type", type: "select", default: "classification_reassessment", options: [
        { label: "Classification reassessment", value: "classification_reassessment" },
        { label: "RCP assessment", value: "rcp_assessment" },
        { label: "Care plan amendment", value: "care_plan_amendment" },
      ] },
      { key: "participant_name", label: "Participant name", type: "text", placeholder: "e.g. Mum", default: "" },
      { key: "current_classification", label: "Current classification", type: "select", options: CLASS_OPTS, default: 4 },
      { key: "changes_summary", label: "What has changed", type: "textarea", placeholder: "Describe the changes in care needs...", default: "" },
      { key: "sender_name", label: "Your name", type: "text", placeholder: "e.g. Cathy", default: "" },
    ],
  },
  "contribution-estimator": {
    title: "Contribution Estimator", subtitle: "Estimate the participant contribution", endpoint: "/public/contribution-estimator", submitLabel: "Estimate",
    fields: [
      { key: "classification", label: "Classification level", type: "select", options: CLASS_OPTS, default: 4 },
      { key: "pension_status", label: "Pension status", type: "select", default: "full", options: [
        { label: "Full Age Pension", value: "full" }, { label: "Part Age Pension", value: "part" },
        { label: "Seniors Health Card", value: "cshc" }, { label: "Self-funded", value: "self" },
      ] },
      { key: "is_grandfathered", label: "Grandfathered (pre-Sep 2024)", type: "switch", default: false },
    ],
  },
  "care-plan-reviewer": {
    title: "Support Plan Reviewer", subtitle: "Find gaps and questions to raise", endpoint: "/public/care-plan-review", submitLabel: "Review plan",
    fields: [
      { key: "text", label: "Paste the support plan", type: "textarea", placeholder: "Paste the plan text here (at least a few lines)...", default: "" },
      { key: "classification", label: "Classification (optional)", type: "select", options: [{ label: "—", value: "" }, ...CLASS_OPTS], default: "" },
    ],
  },
};

// Launcher tools: their page shows the same web explainer content plus a button
// that opens the working feature (statements, invoices, chat). No form.
const LAUNCHERS: Record<string, { title: string; subtitle: string; launchLabel: string; launchRoute: string }> = {
  "invoice-checker": { title: "Invoice Checker", subtitle: "Check an invoice before you pay", launchLabel: "Open Invoice Checker", launchRoute: "/invoices" },
  "family-coordinator": { title: "Aged Care Q&A", subtitle: "Ask anything about aged care", launchLabel: "Open Aged Care Q&A", launchRoute: "/(tabs)/ask" },
};

export default function ToolScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = slug || "";
  if (s === "statement-decoder") return <StatementDecoderTool />;
  if (s === "budget-calculator") return <BudgetCalculatorTool />;
  if (s === "classification-self-check") return <ClassificationSelfCheck />;
  if (s === "provider-price-checker") return <ProviderPriceChecker />;
  if (s === "contribution-estimator") return <ContributionEstimator />;
  if (s === "letters-and-follow-ups") return <LettersFollowUps />;
  if (s === "care-plan-reviewer") return <CarePlanReviewer />;
  if (s === "invoice-checker") return <InvoiceChecker />;
  if (s === "family-coordinator") return <AgedCareQA />;
  return <FormTool slug={s} />;
}

function StatementDecoderTool() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [mode, setMode] = useState<"text" | "file" | "email">("text");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [usage, setUsage] = useState<{ allowed?: boolean; remaining?: number; days_until_next_use?: number } | null>(null);
  const [limitInfo, setLimitInfo] = useState<{ message?: string; days_until_next_use?: number } | null>(null);

  // Free-use counter (logged-out visitors get 1 decode / 120 days).
  useEffect(() => {
    if (user) return;
    let alive = true;
    apiFetch<{ allowed?: boolean; remaining?: number; days_until_next_use?: number }>("/free-tool/usage?tool=STATEMENT_DECODER")
      .then((d) => { if (alive) setUsage(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  const decode = async () => {
    if (!text.trim()) { setError("Paste your statement text first."); return; }
    setBusy(true); setError(""); setResult(null); setLimitInfo(null); setPhase("Reading your statement…");
    try {
      const start = await apiFetch<{ job_id?: string; abuse_flag?: boolean; abuse_response?: string }>("/public/decode-statement-text", { method: "POST", body: { text: text.trim() } });
      if (start.abuse_flag) { setResult(start); return; }
      if (!start.job_id) { setResult(start); return; }
      let final: any = null;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await apiFetch<{ status: string; phase?: string; result?: any; error?: string }>(`/public/decode-job/${start.job_id}`).catch(() => null);
        if (!job) continue;
        if (job.phase) setPhase(job.phase.replace(/_/g, " "));
        if (job.status === "done") { final = job.result; break; }
        if (job.status === "error") throw new ApiError(500, job.error || "Decode failed.");
      }
      if (!final) throw new ApiError(500, "Decode timed out. Please try a shorter statement.");
      setResult(final);
      if (!user) setUsage((u) => (u ? { ...u, allowed: false, remaining: 0 } : u));
    } catch (e) {
      const detail = (e as any)?.data?.detail;
      if (detail && typeof detail === "object" && ["cooldown_active", "monthly_limit", "daily_limit"].includes(detail.error)) {
        setLimitInfo(detail);
      } else {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      }
    } finally { setBusy(false); setPhase(""); }
  };

  const showUsage = !user && usage;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Statement Decoder" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>Upload, photograph, or paste any Support at Home monthly statement. Get a plain-English breakdown in under 2 minutes.</T>

          {showUsage ? (
            <View testID="usage-counter-banner" style={[styles.notice, { backgroundColor: (usage!.remaining || 0) > 0 ? colors.sageSoft : colors.goldSoft, borderColor: colors.border, borderWidth: 1 }]}>
              <T variant="small" style={{ color: colors.text }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{usage!.remaining ?? 0} of 1</T> free decode{(usage!.remaining ?? 0) === 1 ? "" : "s"} remaining in your 120-day window
                {usage!.days_until_next_use ? ` · next opens in ${usage!.days_until_next_use} day${usage!.days_until_next_use === 1 ? "" : "s"}` : ""}
              </T>
            </View>
          ) : null}

          {/* Mode toggle */}
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {([["text", "Paste text"], ["file", "Upload file or photo"], ["email", "Forward by email"]] as const).map(([v, label]) => {
              const on = mode === v;
              return (
                <Pressable key={v} testID={`decoder-mode-${v}`} onPress={() => { setMode(v); setResult(null); setError(""); }} style={[styles.chip, { alignItems: "center", borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: on ? "#fff" : colors.text }}>{label}</T>
                </Pressable>
              );
            })}
          </View>

          {mode === "text" ? (
            <>
              <Field label="" testID="decoder-text-input" value={text} onChangeText={setText} multiline placeholder="Paste your statement text here…" />
              {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
              <Button label={busy ? (phase || "Reading your statement…") : "Decode this statement"} testID="decoder-submit" icon={Sparkles} onPress={decode} loading={busy} disabled={!!limitInfo} />
            </>
          ) : mode === "file" ? (
            <Card testID="decoder-file-launcher">
              <T variant="body" style={{ lineHeight: 22 }}>To decode a PDF or photo, use the secure uploader. Wayly extracts the text, decodes every line, and saves it to your statements.</T>
              <Button label="Upload a Statement" testID="decoder-open-upload" icon={FileText} onPress={() => router.push("/upload")} style={{ marginTop: spacing.md }} />
            </Card>
          ) : (
            <Card testID="decoder-email-panel">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Mail size={18} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Forward statements by email</T>
              </View>
              <T variant="small" style={{ marginTop: 8, lineHeight: 21 }}>Each participant gets a private forwarding address. Forward the provider&apos;s monthly statement email there and Wayly decodes it automatically and saves it to your statements.</T>
              <Button label="See forwarding addresses" testID="decoder-email-participants" variant="secondary" onPress={() => router.push("/participants")} style={{ marginTop: spacing.md }} />
            </Card>
          )}

          {limitInfo ? (
            <View testID="sd-daily-limit" style={[styles.notice, { backgroundColor: colors.goldSoft, borderColor: colors.border, borderWidth: 1, gap: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Clock size={18} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>You have used your free decode.</T>
              </View>
              <T variant="small">{(limitInfo.days_until_next_use || 0) > 0 ? `The next free one is available in ${limitInfo.days_until_next_use} day${limitInfo.days_until_next_use === 1 ? "" : "s"}. Or start a 7-day free trial to run unlimited decodes.` : "Start a 7-day free trial to run unlimited decodes."}</T>
              <Button label="Start free trial" testID="sd-limit-trial" onPress={() => router.push("/plan-select")} style={{ marginTop: 4 }} />
            </View>
          ) : null}

          {result?.abuse_flag ? (
            <Card testID="decoder-guardrail" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text }}>{sanitizeAI(result.abuse_response || "We can only help decode Support at Home statements here.")}</T>
            </Card>
          ) : result ? (
            <View testID="decoder-result">
              <DecoderResultView result={result} />
            </View>
          ) : null}

          <ToolExplainer toolKey="statement-decoder" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FormTool({ slug }: { slug: string }) {
  const cfg = TOOLS[slug || ""];
  const { colors } = useTheme();

  const [values, setValues] = useState<Record<string, any>>(() => Object.fromEntries((cfg?.fields || []).map((f) => [f.key, f.default])));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const launcher = LAUNCHERS[slug || ""];
  if (launcher) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader title={launcher.title} subtitle={launcher.subtitle} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {TOOL_CONTENT[slug || ""]?.heroOneLiner ? (
            <Card testID="tool-intro" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <T variant="body" style={{ color: colors.text, lineHeight: 24 }}>{TOOL_CONTENT[slug || ""].heroOneLiner}</T>
            </Card>
          ) : null}
          <Button label={launcher.launchLabel} testID="tool-launch" icon={Sparkles} onPress={() => router.push(launcher.launchRoute as any)} />
          <ToolExplainer toolKey={slug || ""} />
        </ScrollView>
      </View>
    );
  }

  if (!cfg) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Tool" onBack={() => router.back()} /><T style={{ padding: spacing.lg }}>Unknown tool.</T></View>;
  }

  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    const body: Record<string, any> = {};
    for (const f of cfg.fields) {
      let v = values[f.key];
      if (f.type === "number") v = v === "" || v == null ? undefined : Number(v);
      if (f.key === "current_lifetime_balance" && v == null) v = 0;
      if (v !== undefined && v !== "") body[f.key] = v;
    }
    try {
      const data = await apiFetch(cfg.endpoint, { method: "POST", body });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={cfg.title} subtitle={cfg.subtitle} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          {TOOL_CONTENT[slug || ""]?.heroOneLiner ? (
            <Card testID="tool-intro" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <T variant="body" style={{ color: colors.text, lineHeight: 24 }}>{TOOL_CONTENT[slug || ""].heroOneLiner}</T>
            </Card>
          ) : null}

          <Card>
            <View style={{ gap: spacing.md }}>
              {cfg.fields.map((f) => <FormRow key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} colors={colors} />)}
            </View>
          </Card>

          {error ? (
            <View style={[styles.err, { backgroundColor: colors.errorSoft }]}>
              <AlertTriangle size={18} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
            </View>
          ) : null}

          <Button label={cfg.submitLabel} testID="tool-submit" icon={Sparkles} onPress={submit} loading={busy} />

          {result ? <ToolResult slug={slug!} data={result} colors={colors} /> : null}

          <ToolExplainer toolKey={slug || ""} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FormRow({ field, value, onChange, colors }: { field: FormField; value: any; onChange: (v: any) => void; colors: any }) {
  if (field.type === "switch") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }}>{field.label}</T>
        <Switch value={!!value} onValueChange={onChange} trackColor={{ true: colors.primary }} testID={`tool-field-${field.key}`} />
      </View>
    );
  }
  if (field.type === "select") {
    return (
      <View>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>{field.label}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {field.options!.map((o) => {
            const active = String(value) === String(o.value);
            return (
              <Pressable key={String(o.value)} testID={`tool-field-${field.key}-${o.value}`} onPress={() => onChange(o.value)} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{o.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  if (field.type === "scale12") {
    return (
      <View style={{ gap: spacing.sm }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{field.label}</T>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="small" style={{ width: 74 }}>Area {i + 1}</T>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[0, 1, 2, 3, 4].map((n) => {
                const active = (value?.[i] ?? 0) === n;
                return (
                  <Pressable key={n} testID={`tool-scale-${i}-${n}`} onPress={() => { const next = [...(value || Array(12).fill(0))]; next[i] = n; onChange(next); }} style={[styles.scaleDot, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: active ? "#fff" : colors.muted }}>{n}</T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Field
      label={field.label}
      value={value == null ? "" : String(value)}
      onChangeText={onChange}
      placeholder={field.placeholder}
      keyboardType={field.type === "number" ? "numeric" : "default"}
      multiline={field.type === "textarea"}
      style={field.type === "textarea" ? undefined : undefined}
      testID={`tool-field-${field.key}`}
    />
  );
}

const Row = ({ label, value, colors }: any) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <T variant="body" style={{ flex: 1 }}>{label}</T>
    <T style={{ fontFamily: fonts.monoMedium, fontSize: 14 }}>{value}</T>
  </View>
);
const Bullets = ({ items, colors }: any) => (
  <View style={{ gap: 6, marginTop: 6 }}>
    {(items || []).map((it: string, i: number) => (
      <View key={i} style={{ flexDirection: "row", gap: 8 }}>
        <T style={{ color: colors.sage }}>•</T>
        <T variant="small" style={{ flex: 1, color: colors.text }}>{sanitizeAI(it)}</T>
      </View>
    ))}
  </View>
);

function ToolResult({ slug, data, colors }: { slug: string; data: any; colors: any }) {
  const guardrail = !data?.letter && (data?.abuse_response || data?.abuse_flag);
  return (
    <Card testID="tool-result" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
        <Sparkles size={18} color={colors.sage} />
        <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>Result</T>
      </View>

      {guardrail ? (
        <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text }} testID="tool-guardrail">
          {sanitizeAI(data.abuse_response || "We can only help with practical, non clinical support here. Please speak with the care team about clinical care needs.")}
        </T>
      ) : slug === "budget-calculator" ? (
        <>
          <Row label="Plan" value={data.classification_label} colors={colors} />
          <Row label="Annual total" value={moneyWhole(data.annual_total)} colors={colors} />
          <Row label="Quarterly usable" value={money(data.quarterly_usable)} colors={colors} />
          <Row label="Lifetime cap" value={moneyWhole(data.lifetime_cap)} colors={colors} />
          <Row label="Lifetime remaining" value={moneyWhole(data.lifetime_remaining)} colors={colors} />
          {data.years_to_cap != null ? <Row label="Years to cap" value={String(data.years_to_cap)} colors={colors} /> : null}
          {data.streams_note ? <T variant="small" style={{ marginTop: spacing.sm }}>{sanitizeAI(data.streams_note)}</T> : null}
        </>
      ) : slug === "provider-price-checker" ? (
        <>
          <View style={[styles.verdict, { backgroundColor: data.verdict === "high" ? colors.errorSoft : data.verdict === "low" ? colors.successSoft : colors.alertSoft }]}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: data.verdict === "high" ? colors.terracotta : data.verdict === "low" ? colors.success : colors.alert }}>{data.verdict_label}</T>
          </View>
          <Row label="Charged" value={`${money(data.charged)} / ${data.unit}`} colors={colors} />
          <Row label="Indicative range" value={`${money(data.lower)} to ${money(data.upper)}`} colors={colors} />
          <Row label="Median" value={money(data.median)} colors={colors} />
          {data.assessment ? <T variant="small" style={{ marginTop: spacing.sm }}>{sanitizeAI(data.assessment)}</T> : null}
          {data.suggested_action ? <T variant="small" style={{ marginTop: 6, color: colors.text }}>{sanitizeAI(data.suggested_action)}</T> : null}
        </>
      ) : slug === "classification-self-check" ? (
        <>
          <Row label="Likely classification" value={data.likely_label} colors={colors} />
          <Row label="Indicative annual" value={`${moneyWhole(data.annual_range?.[0])} to ${moneyWhole(data.annual_range?.[1])}`} colors={colors} />
          <Row label="Suggest reassessment" value={data.suggest_reassessment ? "Yes" : "No"} colors={colors} />
          {data.caveat ? <T variant="small" style={{ marginTop: spacing.sm }}>{sanitizeAI(data.caveat)}</T> : null}
        </>
      ) : slug === "contribution-estimator" ? (
        <>
          <Row label="Annual contribution" value={money(data.annual_contribution)} colors={colors} />
          <Row label="Quarterly contribution" value={money(data.quarterly_contribution)} colors={colors} />
          {data.years_to_cap != null ? <Row label="Years to cap" value={String(data.years_to_cap)} colors={colors} /> : null}
          {data.caveat ? <T variant="small" style={{ marginTop: spacing.sm }}>{sanitizeAI(data.caveat)}</T> : null}
        </>
      ) : slug === "letters-and-follow-ups" ? (
        <>
          <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text }} selectable testID="tool-letter-text">{sanitizeAI(data.letter)}</T>
          {data.word_count ? <T variant="small" style={{ marginTop: spacing.sm }}>{data.word_count} words · tap and hold to copy</T> : null}
        </>
      ) : slug === "care-plan-reviewer" ? (
        <>
          {data.summary ? <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text }}>{sanitizeAI(data.summary)}</T> : null}
          {data.gaps?.length ? (<><T style={{ fontFamily: fonts.bodySemi, marginTop: spacing.md }}>Gaps</T><Bullets items={data.gaps} colors={colors} /></>) : null}
          {data.questions_to_raise?.length ? (<><T style={{ fontFamily: fonts.bodySemi, marginTop: spacing.md }}>Questions to raise</T><Bullets items={data.questions_to_raise} colors={colors} /></>) : null}
        </>
      ) : (
        <T variant="small">{JSON.stringify(data).slice(0, 400)}</T>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5 },
  notice: { borderRadius: radius.md, padding: spacing.md },
  scaleDot: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
  verdict: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, marginBottom: spacing.sm },
});
