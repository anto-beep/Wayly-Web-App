import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, RefreshCcw, ArrowRight, Phone, Download, Mail, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { useScrollToResult } from "@/src/hooks/useScrollToResult";
import { apiFetch, ApiError } from "@/src/lib/api";
import { sharePostPdf } from "@/src/lib/download";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { usePersona } from "@/src/hooks/usePersona";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole, sanitizeAI } from "@/src/utils/format";
import { CSC_QUESTIONS } from "@/src/data/cscQuestions";

const DRAFT_KEY = "csc.run.draft.v1";

const CLASS_OPTS = [
  { v: "", label: "Not sure" },
  ...Array.from({ length: 8 }, (_, i) => ({ v: String(i + 1), label: `Class ${i + 1}` })),
];

const DOMAIN_LABEL = (k: string): string =>
  (({
    self_care: "Self-care",
    iadl: "IADLs",
    cognition_behaviour: "Cognition and behaviour",
    safety_hospitalisation: "Safety",
    informal_support: "Informal support",
    home_environment: "Home environment",
    mood: "Mood",
  } as Record<string, string>)[k] || k);

// §6.1 Actions row — Save as PDF + Email to self (parity with web ResultActions)
function ResultActions({ result }: { result: any }) {
  const { colors } = useTheme();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await sharePostPdf("/public/csc/pdf", { payload: result }, "classification_self_check.pdf");
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Could not generate PDF.");
    } finally { setPdfBusy(false); }
  };

  const emailToSelf = async () => {
    setEmailBusy(true); setEmailError("");
    try {
      const me = await apiFetch<{ email?: string }>("/auth/me");
      const to = me?.email;
      if (!to) { setEmailError("Please sign in to email this result to yourself."); setEmailBusy(false); return; }
      await apiFetch("/public/csc/email", { method: "POST", body: { payload: result, to } });
      setEmailSent(true);
    } catch (e) {
      setEmailError(e instanceof ApiError ? e.message : "Could not send email.");
    } finally { setEmailBusy(false); }
  };

  return (
    <Card testID="csc-actions">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button label="Save as PDF" testID="csc-download-pdf" variant="outline" icon={Download} onPress={downloadPdf} loading={pdfBusy} style={{ flexGrow: 1 }} />
        <Button label={emailSent ? "Emailed" : "Email to self"} testID="csc-email-self" variant="outline" icon={Mail} onPress={emailToSelf} loading={emailBusy} disabled={emailSent} style={{ flexGrow: 1 }} />
      </View>
      {emailError ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="csc-email-error">{emailError}</T> : null}
      {emailSent ? <T variant="small" style={{ color: colors.sage, marginTop: spacing.sm }} testID="csc-email-sent">Check your inbox in a minute.</T> : null}
    </Card>
  );
}

// "What the assessor will ask" — IAT domains (parity with web AssessorBlock)
function AssessorBlock() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ domains: any[]; closing_copy: string } | null>(null);

  useEffect(() => {
    if (open && !data) {
      apiFetch<{ domains: any[]; closing_copy: string }>("/public/csc/iat-domains")
        .then(setData)
        .catch(() => setData({ domains: [], closing_copy: "" }));
    }
  }, [open, data]);

  const chip = (cov: any) => {
    const yes = cov === true || cov === "yes";
    const partly = cov === "partly";
    const label = yes ? "Covered" : partly ? "Partly" : "Not covered";
    const bg = yes ? colors.sageSoft : partly ? colors.surface2 : colors.surface2;
    const fg = yes ? colors.sage : partly ? colors.text : colors.muted;
    return { label, bg, fg };
  };

  return (
    <Card testID="csc-assessor-block" style={{ padding: 0 }}>
      <Pressable testID="csc-assessor-toggle" onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>What the assessor will ask</T>
        {open ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          {!data ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={colors.muted} /><T variant="small">Loading…</T>
            </View>
          ) : (
            <>
              {data.domains.map((d, i) => {
                const c = chip(d.covered_by_csc);
                return (
                  <View key={d.name || i} style={{ paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: c.fg }}>{c.label}</T>
                      </View>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, flex: 1 }}>{d.name}</T>
                    </View>
                    {d.notes ? <T variant="small" style={{ color: colors.muted, marginTop: 4 }}>{d.notes}</T> : null}
                  </View>
                );
              })}
              {data.closing_copy ? <T variant="small" style={{ color: colors.muted, fontStyle: "italic", marginTop: spacing.md }}>{data.closing_copy}</T> : null}
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

export default function ClassificationSelfCheck() {
  const { colors } = useTheme();
  const persona = usePersona();
  const [current, setCurrent] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | null>>(() => Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [resumed, setResumed] = useState(false);
  const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();

  const answered = useMemo(() => Object.values(answers).filter((v) => v != null).length, [answers]);
  const total = CSC_QUESTIONS.length;
  const pct = Math.round((answered / total) * 100);
  const allDone = answered === total;

  // Resume a saved draft on mount (parity with web localStorage draft).
  useEffect(() => {
    (async () => {
      const d = await cacheGet<{ answers: Record<string, string | null>; current: string }>(DRAFT_KEY);
      if (d?.data?.answers) {
        const n = Object.values(d.data.answers).filter((v) => v != null).length;
        if (n > 0) {
          setAnswers((a) => ({ ...a, ...d.data.answers }));
          setCurrent(d.data.current || "");
          setResumed(true);
        }
      }
    })();
  }, []);

  // Auto-save answers as the user goes.
  useEffect(() => {
    if (result) return;
    cacheSet(DRAFT_KEY, { answers, current });
  }, [answers, current, result]);

  const setAnswer = (qid: string, value: string) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
    setResumed(false);
  };

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await apiFetch("/public/csc/run", { method: "POST", body: { persona, current_classification: current ? parseInt(current, 10) : null, answers } });
      setResult(data);
      scrollToResult();
      cacheSet(DRAFT_KEY, { answers: {}, current: "" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const resetAll = () => {
    setResult(null); setError(""); setCurrent(""); setResumed(false);
    setAnswers(Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
    cacheSet(DRAFT_KEY, { answers: {}, current: "" });
  };

  const c = result?.classification || {};
  const rangeLabel = c.range_low === c.range_high ? `Classification ${c.primary}` : `Classification ${c.range_low} to ${c.range_high}`;
  const drivers = result?.top_drivers || [];

  const ctaLabel = allDone
    ? "See my result"
    : answered > 0
      ? `${answered} of ${total} done. Keep going.`
      : `Answer all ${total} questions to see your result.`;

  const confidenceCfg = (conf: string) =>
    (({
      high: { label: "High confidence", bg: colors.sage, fg: "#fff" },
      medium: { label: "Medium confidence", bg: colors.sageSoft, fg: colors.primary },
      low: { label: "Low confidence", bg: colors.terracotta, fg: "#fff" },
    } as Record<string, { label: string; bg: string; fg: string }>)[conf] || { label: conf, bg: colors.surface2, fg: colors.text });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Classification Self-Check" onBack={() => router.back()} />
      {!result ? (
        <View style={[styles.stickyProgress, { backgroundColor: colors.surface, borderBottomColor: colors.border }]} testID="csc-progress-sticky">
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <T variant="small" testID="csc-progress" style={{ color: colors.muted }}>{answered} of {total} answered</T>
            <T variant="small" style={{ color: colors.muted }}>{pct}%</T>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.surface2, marginTop: 0 }]}>
            <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.sage, borderRadius: 999 }} />
          </View>
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>{persona === "participant" ? "Are you on the right classification?" : "Is your parent on the right classification?"}</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {persona === "participant"
              ? "Answer 16 questions about your daily life. We will show you the classification band you are likely to fall in, whether your needs have shifted since your last assessment, and what to prepare for if a reassessment is needed."
              : "Answer 16 questions about your parent's daily life. We will show you the classification band they are likely to fall in, whether their needs have shifted since their last assessment, and what to prepare for if a reassessment is needed."}
          </T>
          <T style={{ fontFamily: fonts.body, fontSize: 12, fontStyle: "italic", color: colors.muted, lineHeight: 18 }}>
            This is informational only. Only the My Aged Care Integrated Assessment Tool (IAT) determines actual classification.
          </T>

          {!result ? (
            <>
              <Card>
                <T variant="small" style={{ marginBottom: 6 }}>{persona === "participant" ? "What's your current classification, if you know it? (Optional)" : "What's their current classification, if you know it? (Optional)"}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {CLASS_OPTS.map((o) => {
                    const on = current === o.v;
                    return (
                      <Pressable key={o.v || "none"} testID={`csc-current-${o.v || "none"}`} onPress={() => setCurrent(o.v)} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{o.label}</T>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Progress now lives in the sticky bar above the ScrollView */}
              </Card>

              {resumed ? (
                <View testID="csc-resumed" style={[styles.resume, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <CheckCircle2 size={16} color={colors.sage} />
                    <T variant="small" style={{ color: colors.text }}>We restored your previous answers.</T>
                  </View>
                  <Pressable testID="csc-restart" onPress={resetAll} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <RefreshCcw size={13} color={colors.terracotta} />
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.terracotta }}>Start over</T>
                  </Pressable>
                </View>
              ) : null}

              <T style={{ fontFamily: fonts.body, fontSize: 13, fontStyle: "italic", color: colors.muted, lineHeight: 18 }}>
                {persona === "participant"
                  ? "Some of these questions can be hard to sit with. Take your time. There is no wrong answer."
                  : "These questions can be hard to sit with. Take your time. There is no wrong answer."}
              </T>

              {CSC_QUESTIONS.map((q, i) => (
                <Card key={q.id} testID={`csc-q-${q.id}`}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21 }}>{i + 1}. {q.stem[persona]}</T>
                  <View style={styles.optGrid}>
                    {q.scale.map((opt) => {
                      const on = answers[q.id] === opt.value;
                      return (
                        <Pressable key={opt.value} testID={`csc-q-${q.id}-${opt.value}`} onPress={() => setAnswer(q.id, opt.value)} style={[styles.opt, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.sageSoft : colors.surface }]}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? colors.primary : colors.text }}>{opt.label}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              ))}

              {!allDone ? (
                <T variant="small" testID="csc-cta-help" style={{ textAlign: "center", color: colors.muted }}>
                  {answered === 0 ? "Answer all 16 questions to see your result." : `${total - answered} question${total - answered === 1 ? "" : "s"} to go.`}
                </T>
              ) : null}
              {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
              <Button label={ctaLabel} testID="csc-submit" icon={Sparkles} onPress={submit} loading={busy} disabled={!allDone} />
            </>
          ) : (
            <View testID="csc-result" onLayout={onResultLayout} style={{ gap: spacing.md }}>
              {/* Profile header */}
              <Card testID="csc-result-header">
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                  {(() => {
                    const cc = confidenceCfg(c.confidence);
                    return (
                      <View testID={`csc-confidence-${c.confidence}`} style={{ backgroundColor: cc.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: cc.fg }}>{cc.label}</T>
                      </View>
                    );
                  })()}
                  {result.gap_detected && result.gap_direction === "up" ? (
                    <T testID="csc-gap-badge" style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.terracotta }}>Gap detected: needs above current C{current || "?"}</T>
                  ) : null}
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.muted }}>INDICATIVE BAND</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 34, color: colors.primary, marginTop: 4 }}>{rangeLabel}</T>
                <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.muted, marginTop: 8 }}>
                  {`${moneyWhole(c.annual_budget_low)} to ${moneyWhole(c.annual_budget_high)} per year`}
                </T>
                <T style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {`(${moneyWhole(c.quarterly_budget_low)} to ${moneyWhole(c.quarterly_budget_high)} per quarter)`}
                </T>
                {result.profile_summary ? <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text, marginTop: spacing.md }}>{sanitizeAI(result.profile_summary)}</T> : null}
              </Card>

              {/* Top drivers */}
              {drivers.length ? (
                <Card testID="csc-drivers">
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.muted, marginBottom: spacing.sm }}>WHAT DROVE THIS RESULT</T>
                  <View style={{ gap: spacing.sm }}>
                    {drivers.map((d: any) => (
                      <View key={d.question_id} style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md }}>
                        <T variant="small" style={{ color: colors.muted }}>{DOMAIN_LABEL(d.domain)}</T>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, marginTop: 2 }}>{d.answer}</T>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}

              {/* Next step */}
              {result.branch === "A" ? (
                <Card testID="csc-next-step-a" style={{ borderColor: colors.terracotta }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>
                    Your daily-life answers suggest higher needs than Classification {current || "your current level"} typically covers.
                  </T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
                    This is a common reason to request a reassessment. Being under-classified is common and fixable.
                  </T>
                  <Button
                    label="Draft a reassessment letter"
                    testID="csc-cta-lf1"
                    icon={ArrowRight}
                    onPress={() => router.push({ pathname: "/tool/letters-and-follow-ups", params: { csc_run_id: result.csc_run_id || "", primary: String(result.classification?.primary ?? ""), current: current || "" } } as any)}
                    style={{ marginTop: spacing.md }}
                  />
                </Card>
              ) : result.branch === "B" ? (
                <Card testID="csc-next-step-b">
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Your answers line up with your current classification.</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>If the situation changes, run this again. This tool is designed to be re-used.</T>
                </Card>
              ) : (
                <Card testID="csc-next-step-c">
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>This is a starting point. The formal assessment is arranged through My Aged Care.</T>
                  <Button label="Call My Aged Care on 1800 200 422" testID="csc-cta-mac" icon={Phone} onPress={() => Linking.openURL("tel:1800200422")} style={{ marginTop: spacing.md }} />
                </Card>
              )}

              {/* Actions: Save as PDF + Email to self */}
              <ResultActions result={result} />

              {/* What the assessor will ask */}
              <AssessorBlock />

              {/* Repeat nudge */}
              <Card testID="csc-repeat-nudge" style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                <T variant="small" style={{ color: colors.muted, lineHeight: 20 }}>
                  This isn&apos;t a one-time answer. Run this again after a fall, a hospital stay, a new diagnosis, or a carer change.
                </T>
              </Card>

              <Button label="Run this again" variant="outline" testID="csc-rerun" icon={RefreshCcw} onPress={resetAll} />

              {result.schema_version ? (
                <T variant="small" style={{ textAlign: "center", color: colors.muted, fontSize: 11 }}>
                  Payload version {result.schema_version}.{result.classification?.budget_source_version ? ` Budgets sourced from ${result.classification.budget_source_version}.` : ""}
                </T>
              ) : null}
            </View>
          )}

          <ToolExplainer toolKey="classification-self-check" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyProgress: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
  resume: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  optGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  opt: { flexBasis: "47%", flexGrow: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
