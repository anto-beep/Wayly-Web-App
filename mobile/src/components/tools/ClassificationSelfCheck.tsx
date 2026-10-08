import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, RefreshCcw, ArrowRight, ArrowLeft, Phone, Download, Mail, ChevronDown, ChevronUp, CheckCircle2, FolderOpen, BookmarkPlus, Trash2, Info, Check, Droplet, Home, HeartPulse } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolHero from "@/src/components/ToolHero";
import ToolExplainer from "@/src/components/ToolExplainer";
import { useScrollToResult } from "@/src/hooks/useScrollToResult";
import { apiFetch, ApiError } from "@/src/lib/api";
import { sharePostPdf } from "@/src/lib/download";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { usePersona } from "@/src/hooks/usePersona";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole } from "@/src/utils/format";
import { CSC_QUESTIONS, CscQuestion } from "@/src/data/cscQuestions";

const DRAFT_KEY = "csc.run.draft.v1";

type Band = { classification: number; annual_budget: number; quarterly_budget: number; headline: string; plain: string };

const CLASS_OPTS = [
  { v: "", label: "Not sure" },
  ...Array.from({ length: 8 }, (_, i) => ({ v: String(i + 1), label: `Class ${i + 1}` })),
];

// 3-step wizard model (mirrors web ClassificationCheck CSC_STEPS). Accent keys
// resolve against the active theme so the steps read in light and dark.
const CSC_STEP_META: { id: string; title: string; desc: string; Icon: any; accentKey: "primary" | "sage" | "gold"; from: number; to: number }[] = [
  { id: "care", title: "Personal Care", desc: "Getting through the day: washing, dressing, moving around and the bathroom.", Icon: Droplet, accentKey: "primary", from: 0, to: 4 },
  { id: "home", title: "Everyday Tasks", desc: "Running the home: meals, cleaning, medications, shopping and getting out and about.", Icon: Home, accentKey: "sage", from: 4, to: 9 },
  { id: "health", title: "Health, Mind & Safety", desc: "Memory and mood, recent falls or hospital visits, the home itself, and the support already around.", Icon: HeartPulse, accentKey: "gold", from: 9, to: 16 },
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

// Wizard stepper — tappable step icons with a connecting progress rail.
function Stepper({ step, setStep, colors }: { step: number; setStep: (i: number) => void; colors: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} testID="csc-stepper">
      {CSC_STEP_META.map((s, i) => {
        const done = i < step;
        const active = i === step;
        const on = done || active;
        const accent = colors[s.accentKey];
        const Icon = s.Icon;
        return (
          <React.Fragment key={s.id}>
            <Pressable testID={`csc-step-${s.id}`} onPress={() => setStep(i)} accessibilityRole="button">
              <View style={{
                width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center",
                backgroundColor: on ? accent : colors.surface, borderWidth: on ? 0 : 1, borderColor: colors.border,
                transform: [{ scale: active ? 1.08 : 1 }],
              }}>
                {done ? <Check size={18} color="#fff" /> : <Icon size={18} color={on ? "#fff" : colors.muted} />}
              </View>
            </Pressable>
            {i < CSC_STEP_META.length - 1 ? (
              <View style={{ flex: 1, height: 3, borderRadius: 2, marginHorizontal: 8, backgroundColor: colors.border, overflow: "hidden" }}>
                <View style={{ height: "100%", width: done ? "100%" : "0%", backgroundColor: accent }} />
              </View>
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// One question with its option grid + a fixed-height plain-English anchor slot
// that reveals the example for the selected option (mobile equivalent of the
// web hover hint).
function QuestionCard({ index, question, persona, value, onChange, colors }: { index: number; question: CscQuestion; persona: "caregiver" | "participant"; value: string | null; onChange: (v: string) => void; colors: any }) {
  const stem = question.stem[persona] || question.stem.caregiver;
  const anchor = value ? question.anchors?.[value] : "";
  return (
    <View testID={`csc-q-${question.id}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.text }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.muted }}>{index + 1}. </T>{stem}
      </T>
      <View style={styles.optGrid}>
        {question.scale.map((opt) => {
          const on = value === opt.value;
          const isNotSure = opt.value === "not_sure";
          return (
            <Pressable
              key={opt.value}
              testID={`csc-q-${question.id}-${opt.value}`}
              onPress={() => onChange(opt.value)}
              style={[styles.opt, {
                borderColor: on ? colors.primary : colors.border,
                borderStyle: isNotSure && !on ? "dashed" : "solid",
                backgroundColor: on ? colors.sageSoft : isNotSure ? colors.surface2 : colors.surface,
              }]}
            >
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? colors.primary : isNotSure ? colors.muted : colors.text }}>{opt.label}</T>
            </Pressable>
          );
        })}
      </View>
      <View style={{ minHeight: 20, marginTop: 6 }} testID={`csc-q-${question.id}-anchor`}>
        {anchor ? <T variant="small" style={{ color: colors.muted, lineHeight: 18 }}>{anchor}</T> : null}
      </View>
    </View>
  );
}

// Interactive band scale (1 to 8). Tap a level, or drag a finger across the
// bars, to reveal that level's funding (per year / quarter / week). Rendered on
// the teal result header, so everything is white-on-teal.
function BandScale({ c, bands, colors }: { c: any; bands: Band[]; colors: any }) {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const rowWidth = useRef(0);
  const levels = [1, 2, 3, 4, 5, 6, 7, 8];

  const pickFromX = (x: number) => {
    const w = rowWidth.current;
    if (!w) return;
    const idx = Math.min(7, Math.max(0, Math.floor((x / w) * 8)));
    setSelectedLevel(idx + 1);
  };

  const sb = selectedLevel != null ? (bands || []).find((b) => b.classification === selectedLevel) : null;

  return (
    <View style={{ marginTop: spacing.lg }} testID="csc-band-scale">
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.55)" }}>LOWER NEEDS</T>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.55)" }}>HIGHER NEEDS</T>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}
        onLayout={(e) => { rowWidth.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pickFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => pickFromX(e.nativeEvent.locationX)}
      >
        {levels.map((n) => {
          const inRange = n >= c.range_low && n <= c.range_high;
          const isPrimary = n === c.primary;
          const isSelected = n === selectedLevel;
          const barColor = isPrimary ? colors.gold : inRange ? colors.sage400 : "rgba(255,255,255,0.18)";
          const barHeight = isPrimary ? 38 : inRange ? 26 : 14;
          return (
            <View key={n} testID={`csc-scale-${n}`} style={{ flex: 1, alignItems: "center", gap: 6, borderRadius: radius.sm, paddingTop: 4, paddingBottom: 2, backgroundColor: isSelected ? "rgba(255,255,255,0.12)" : "transparent" }}>
              <View style={{ width: "100%", height: barHeight, borderRadius: 999, backgroundColor: barColor, borderWidth: isPrimary ? 2 : 0, borderColor: "rgba(255,255,255,0.35)" }} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: isPrimary ? colors.gold : inRange ? "#fff" : "rgba(255,255,255,0.4)" }}>{n}</T>
            </View>
          );
        })}
      </View>
      <T style={{ fontFamily: fonts.body, fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6 }} testID="csc-scale-hint">Drag or tap any level to see its funding</T>
      {sb ? (
        <View style={{ marginTop: spacing.sm, backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderRadius: radius.md, padding: spacing.md }} testID="csc-scale-detail">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff", flex: 1 }}>{`Classification ${sb.classification}${sb.classification === c.primary ? " · your likely band" : ""}`}</T>
            <Pressable testID="csc-scale-detail-close" onPress={() => setSelectedLevel(null)} hitSlop={8}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Close</T>
            </Pressable>
          </View>
          {sb.headline ? <T style={{ fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{sb.headline}</T> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            {[
              { label: "PER YEAR", v: sb.annual_budget || 0 },
              { label: "PER QUARTER", v: Math.round((sb.annual_budget || 0) / 4) },
              { label: "PER WEEK", v: Math.round((sb.annual_budget || 0) / 52) },
            ].map((cell) => (
              <View key={cell.label} style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: "rgba(255,255,255,0.55)" }}>{cell.label}</T>
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: "#fff", marginTop: 2 }}>{moneyWhole(cell.v)}</T>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// §6.1 Actions row — Save as PDF + Email to self + Run again (uniquely coloured)
function ResultActions({ result, onRerun }: { result: any; onRerun: () => void }) {
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
      <T variant="small" style={{ color: colors.muted, letterSpacing: 1, marginBottom: spacing.sm }}>WHAT NEXT?</T>
      <View style={{ gap: spacing.sm }}>
        {/* Save as PDF — teal */}
        <Button label="Save as PDF" testID="csc-download-pdf" variant="primary" icon={Download} onPress={downloadPdf} loading={pdfBusy} />
        {/* Email to self — gold */}
        <Button label={emailSent ? "Emailed" : "Email to self"} testID="csc-email-self" variant="secondary" icon={Mail} onPress={emailToSelf} loading={emailBusy} disabled={emailSent} />
        {/* Run again — sage */}
        <Button label="Run again" testID="csc-rerun" icon={RefreshCcw} onPress={onRerun} style={{ backgroundColor: colors.sage }} />
      </View>
      {emailError ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="csc-email-error">{emailError}</T> : null}
      {emailSent ? <T variant="small" style={{ color: colors.sage, marginTop: spacing.sm }} testID="csc-email-sent">Check your inbox in a minute.</T> : null}
    </Card>
  );
}

// Save this completed check under a name (parity with web SaveCheckCard)
function SaveCheckCard({ runId, onSaved }: { runId?: string; onSaved: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!runId) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/public/csc/runs/${runId}`, { method: "PATCH", body: { name: name.trim() || null, saved: true } });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save this check.");
    } finally { setBusy(false); }
  };

  if (saved) {
    return (
      <Card testID="csc-save-done" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage, borderWidth: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={colors.sage} />
          <T variant="small" style={{ color: colors.text, flex: 1 }}>{`Saved${name.trim() ? ` as “${name.trim()}”` : ""}. Find it under Your saved checks next time.`}</T>
        </View>
      </Card>
    );
  }

  return (
    <Card testID="csc-save-card">
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Save this check</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 19 }}>Give it a name so you can compare it against a future run, e.g. after a fall or a hospital stay.</T>
      <TextInput
        testID="csc-save-name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Mum — June 2026"
        placeholderTextColor={colors.muted}
        maxLength={120}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, marginTop: spacing.sm }]}
      />
      <Button label="Save check" testID="csc-save-submit" icon={BookmarkPlus} onPress={save} loading={busy} style={{ marginTop: spacing.sm }} />
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="csc-save-error">{error}</T> : null}
    </Card>
  );
}

// Your saved checks — list with Edit / Re-run / Delete (parity with web)
function SavedChecksPanel({ checks, onReopen, onRerun, onDelete, busyId }: { checks: any[]; onReopen: (c: any) => void; onRerun: (c: any) => void; onDelete: (c: any) => void; busyId: string | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(true);
  if (!checks?.length) return null;
  const bandLabel = (c: any) => (c?.range_low === c?.range_high ? `Classification ${c?.primary}` : `Classification ${c?.range_low}–${c?.range_high}`);
  return (
    <Card testID="csc-saved-panel" style={{ padding: 0 }}>
      <Pressable testID="csc-saved-toggle" onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <FolderOpen size={16} color={colors.muted} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Your saved checks</T>
          <View style={{ backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted }}>{checks.length}</T>
          </View>
        </View>
        {open ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }}>
          {checks.map((c) => (
            <View key={c.csc_run_id} testID={`csc-saved-item-${c.csc_run_id}`} style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }} numberOfLines={1}>{c.name || "Untitled check"}</T>
              <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
                {`${bandLabel(c.classification)}${c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}`}
              </T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }}>
                <Pressable testID={`csc-saved-reopen-${c.csc_run_id}`} onPress={() => onReopen(c)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text }}>Edit</T>
                </Pressable>
                <Pressable testID={`csc-saved-rerun-${c.csc_run_id}`} onPress={() => onRerun(c)} style={{ backgroundColor: colors.sage, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: "#fff" }}>Re-run</T>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable testID={`csc-saved-delete-${c.csc_run_id}`} onPress={() => onDelete(c)} disabled={busyId === c.csc_run_id} hitSlop={8} style={{ opacity: busyId === c.csc_run_id ? 0.5 : 1, padding: 6 }}>
                  {busyId === c.csc_run_id ? <ActivityIndicator size="small" color={colors.terracotta} /> : <Trash2 size={18} color={colors.terracotta} />}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
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
  const { active } = useParticipants();
  const [current, setCurrent] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | null>>(() => Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [resumed, setResumed] = useState(false);
  const [bands, setBands] = useState<Band[]>([]);
  const [savedChecks, setSavedChecks] = useState<any[]>([]);
  const [savedBusyId, setSavedBusyId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();
  const hydratedRef = useRef(false);

  const answered = useMemo(() => Object.values(answers).filter((v) => v != null).length, [answers]);
  const total = CSC_QUESTIONS.length;
  const pct = Math.round((answered / total) * 100);
  const allDone = answered === total;

  // Resume a saved draft on mount (answers + step) — parity with web.
  useEffect(() => {
    (async () => {
      const d = await cacheGet<{ answers: Record<string, string | null>; current: string; step?: number }>(DRAFT_KEY);
      if (d?.data?.answers) {
        const n = Object.values(d.data.answers).filter((v) => v != null).length;
        if (n > 0) {
          setAnswers((a) => ({ ...a, ...d.data.answers }));
          setCurrent(d.data.current || "");
          if (Number.isInteger(d.data.step)) setStep(Math.min(Math.max(d.data.step as number, 0), CSC_STEP_META.length - 1));
          setResumed(true);
        }
      }
      hydratedRef.current = true;
    })();
  }, []);

  // Auto-save answers + step as the user goes.
  useEffect(() => {
    if (result || !hydratedRef.current) return;
    cacheSet(DRAFT_KEY, { answers, current, step });
  }, [answers, current, step, result]);

  // Scroll to the top of the flow whenever the wizard step changes.
  useEffect(() => {
    if (result) return;
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the authoritative 8-band table (for the comparison visual + scale).
  useEffect(() => {
    apiFetch<{ bands: Band[] }>("/public/csc/bands").then((d) => setBands(d?.bands || [])).catch(() => setBands([]));
  }, []);

  // Load the user's saved checks.
  const loadSavedChecks = () => {
    apiFetch<{ runs: any[] }>("/public/csc/runs").then((d) => setSavedChecks(d?.runs || [])).catch(() => {});
  };
  useEffect(() => { loadSavedChecks(); }, []);

  // Prefill "current classification" from the active participant's profile.
  useEffect(() => {
    const pc = active?.classification_level;
    if (pc && !current && !resumed) setCurrent(String(pc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.classification_level]);

  const setAnswer = (qid: string, value: string) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
    setResumed(false);
  };

  const submit = async (overrideAnswers?: Record<string, string | null>, overrideCurrent?: string) => {
    const useAnswers = overrideAnswers || answers;
    const useCurrent = overrideCurrent !== undefined ? overrideCurrent : current;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await apiFetch("/public/csc/run", { method: "POST", body: { persona, current_classification: useCurrent ? parseInt(useCurrent, 10) : null, answers: useAnswers } });
      setResult(data);
      scrollToResult();
      cacheSet(DRAFT_KEY, { answers: {}, current: "", step: 0 });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const resetAll = () => {
    setResult(null); setError(""); setCurrent(""); setResumed(false); setStep(0);
    setAnswers(Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
    cacheSet(DRAFT_KEY, { answers: {}, current: "", step: 0 });
  };

  // ---- Saved checks: re-open (edit), re-run, delete ----
  const reopenCheck = (check: any) => {
    const base = Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null]));
    setAnswers({ ...base, ...(check.answers || {}) });
    setCurrent(check.current_classification ? String(check.current_classification) : "");
    setResult(null); setResumed(false); setError(""); setStep(0);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const rerunCheck = (check: any) => {
    const base = Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null]));
    const merged = { ...base, ...(check.answers || {}) };
    const cur = check.current_classification ? String(check.current_classification) : "";
    setAnswers(merged); setCurrent(cur); setResumed(false);
    submit(merged, cur);
  };

  const deleteCheck = async (check: any) => {
    setSavedBusyId(check.csc_run_id);
    try {
      await apiFetch(`/public/csc/runs/${check.csc_run_id}`, { method: "DELETE" });
      setSavedChecks((prev) => prev.filter((c) => c.csc_run_id !== check.csc_run_id));
    } catch { /* noop */ } finally {
      setSavedBusyId(null);
    }
  };

  const c = result?.classification || {};
  const rangeLabel = c.range_low === c.range_high ? `Classification ${c.primary}` : `Classification ${c.range_low} to ${c.range_high}`;
  const drivers = result?.top_drivers || [];
  const primaryBand = bands.find((b) => b.classification === c.primary);
  const plainSummary = primaryBand?.plain || "This is the level of Support at Home funding your answers point to.";
  const maxAnnual = Math.max(1, ...bands.map((b) => b.annual_budget || 0));
  const weekly = (v: number) => moneyWhole(Math.round((v || 0) / 52));
  const summarySubject = persona === "participant" ? "you" : "they";

  const confidenceCfg = (conf: string) =>
    (({
      high: { label: "High confidence", bg: colors.sage, fg: "#fff" },
      medium: { label: "Medium confidence", bg: colors.sageSoft, fg: colors.primary },
      low: { label: "Low confidence", bg: colors.terracotta, fg: "#fff" },
    } as Record<string, { label: string; bg: string; fg: string }>)[conf] || { label: conf, bg: colors.surface2, fg: colors.text });

  // ---- Wizard step slicing ----
  const meta = CSC_STEP_META[step];
  const accent = colors[meta.accentKey];
  const StepIcon = meta.Icon;
  const stepQuestions = CSC_QUESTIONS.slice(meta.from, meta.to);
  const isLast = step === CSC_STEP_META.length - 1;
  const goNext = () => setStep((s) => Math.min(s + 1, CSC_STEP_META.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const ctaLabel = allDone ? "See my result" : answered > 0 ? `${answered} of ${total} done. Keep going.` : `Answer all ${total} questions to see your result.`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
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
          <ToolHero toolKey="classification-self-check" />
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>{persona === "participant" ? "Are you on the right classification?" : "Is the person you care for on the right classification?"}</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {persona === "participant"
              ? "Answer 16 quick questions about your daily life. We'll estimate your likely classification band, flag whether your needs have shifted, and show what to prepare for a reassessment."
              : "Answer 16 quick questions about the daily life of the person you care for. We'll estimate their likely classification band, flag whether their needs have shifted, and show what to prepare for a reassessment."}
          </T>
          <T style={{ fontFamily: fonts.body, fontSize: 12, fontStyle: "italic", color: colors.muted, lineHeight: 18 }}>
            This is informational only. Only the My Aged Care Integrated Assessment Tool (IAT) determines actual classification.
          </T>

          {!result ? (
            <>
              <SavedChecksPanel
                checks={savedChecks}
                onReopen={reopenCheck}
                onRerun={rerunCheck}
                onDelete={deleteCheck}
                busyId={savedBusyId}
              />

              {resumed ? (
                <View testID="csc-resumed" style={[styles.resume, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <CheckCircle2 size={16} color={colors.sage} />
                    <T variant="small" style={{ color: colors.text }}>We picked up where you left off.</T>
                  </View>
                  <Pressable testID="csc-restart" onPress={resetAll} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <RefreshCcw size={13} color={colors.terracotta} />
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.terracotta }}>Start over</T>
                  </Pressable>
                </View>
              ) : null}

              <Stepper step={step} setStep={setStep} colors={colors} />

              {/* Current step card */}
              <View testID={`csc-step-panel-${meta.id}`} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: accent + "55", padding: spacing.lg }}>
                {/* Step header */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID={`csc-step-head-${meta.id}`}>
                  <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
                    <StepIcon size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontSize: 11, letterSpacing: 1.4, fontFamily: fonts.bodySemi, color: accent }}>{`STEP ${step + 1} OF ${CSC_STEP_META.length}`}</T>
                    <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>{meta.title}</T>
                  </View>
                </View>
                <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, lineHeight: 20 }}>{meta.desc}</T>

                {/* Step 1 preamble: current classification + warm opener */}
                {step === 0 ? (
                  <View style={{ marginTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <T variant="small" style={{ marginBottom: 6, color: colors.text, fontFamily: fonts.bodyMedium }}>{persona === "participant" ? "What's your current classification, if you know it? (Optional)" : "What's their current classification, if you know it? (Optional)"}</T>
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
                    {active?.classification_level && String(active.classification_level) === current ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }} testID="csc-current-prefilled">
                        <CheckCircle2 size={14} color={colors.sage} />
                        <T variant="small" style={{ color: colors.sage }}>Prefilled from {active.display_name || "your profile"}. Change it if it&apos;s out of date.</T>
                      </View>
                    ) : null}
                    <T style={{ fontFamily: fonts.body, fontSize: 13, fontStyle: "italic", color: colors.muted, lineHeight: 18, marginTop: spacing.md }}>
                      {persona === "participant"
                        ? "Some of these questions can be hard to sit with. Take your time. There is no wrong answer."
                        : "These questions can be hard to sit with. Take your time. There is no wrong answer."}
                    </T>
                  </View>
                ) : null}

                {/* Questions for this step */}
                <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                  {stepQuestions.map((q, i) => (
                    <QuestionCard
                      key={q.id}
                      index={meta.from + i}
                      question={q}
                      persona={persona}
                      value={answers[q.id]}
                      onChange={(v) => setAnswer(q.id, v)}
                      colors={colors}
                    />
                  ))}
                </View>

                {error && isLast ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.md }} testID="csc-error">{error}</T> : null}

                {/* Wizard navigation */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.lg }}>
                  {step > 0 ? (
                    <Pressable testID="csc-wizard-back" onPress={goBack} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.surface }}>
                      <ArrowLeft size={16} color={colors.text} />
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Back</T>
                    </Pressable>
                  ) : <View />}
                  {!isLast ? (
                    <Pressable testID="csc-wizard-next" onPress={goNext} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 11, backgroundColor: accent }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff" }}>{`Next: ${CSC_STEP_META[step + 1].title}`}</T>
                      <ArrowRight size={16} color="#fff" />
                    </Pressable>
                  ) : (
                    <Pressable testID="csc-submit" onPress={() => submit()} disabled={!allDone || busy} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: colors.primary, opacity: !allDone || busy ? 0.5 : 1 }}>
                      {busy ? <ActivityIndicator color="#fff" size="small" /> : <Sparkles size={16} color="#fff" />}
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff" }}>{busy ? "Scoring…" : ctaLabel}</T>
                    </Pressable>
                  )}
                </View>

                {isLast && !allDone ? (
                  <View testID="csc-cta-help" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, marginTop: spacing.md }}>
                    <Info size={16} color={colors.gold} />
                    <T variant="small" style={{ color: colors.text, fontFamily: fonts.bodyMedium, textAlign: "center", flex: 1 }}>
                      {answered === 0 ? "Answer all 16 questions to see your result." : `Almost there — ${total - answered} question${total - answered === 1 ? "" : "s"} still to answer. Use Back to find any you missed.`}
                    </T>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View testID="csc-result" onLayout={onResultLayout} style={{ gap: spacing.md }}>
              {/* Profile header — teal, white text, big band + scale + clear budgets */}
              <View testID="csc-result-header" style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg }}>
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
                    <View testID="csc-gap-badge" style={{ backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: "#fff" }}>Higher than your current Classification {current || "?"}</T>
                    </View>
                  ) : null}
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>YOUR INDICATIVE BAND</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 38, color: "#fff", marginTop: 4 }}>{rangeLabel}</T>
                {primaryBand?.headline ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: "#fff", marginTop: 6 }}>{primaryBand.headline}</T> : null}
                <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: "rgba(255,255,255,0.85)", marginTop: 6 }}>{plainSummary}</T>

                {/* Interactive band scale (1 to 8) — tap or drag to see funding */}
                <BandScale c={c} bands={bands} colors={colors} />

                {/* Budget, big and clear — per year / quarter / week */}
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {[
                    { label: "PER YEAR", lo: c.annual_budget_low, hi: c.annual_budget_high, accent: colors.gold },
                    { label: "PER QUARTER", lo: c.quarterly_budget_low, hi: c.quarterly_budget_high, accent: colors.sage400 },
                    { label: "PER WEEK", lo: Math.round((c.annual_budget_low || 0) / 52), hi: Math.round((c.annual_budget_high || 0) / 52), accent: "#A3CBCC" },
                  ].map((cell) => (
                    <View key={cell.label} style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: cell.accent }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>{cell.label}</T>
                      <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, color: "#fff", marginTop: 2 }}>{`${moneyWhole(cell.lo)} to ${moneyWhole(cell.hi)}`}</T>
                    </View>
                  ))}
                </View>
                <T style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.7)", marginTop: spacing.md }}>
                  Higher classifications fund more care. The government pays most of this amount; your share depends on your income. These are indicative figures based on your answers.
                </T>
              </View>

              {/* Wayly Summary — plain English */}
              <Card testID="csc-wayly-summary" style={{ backgroundColor: colors.goldSoft, borderColor: colors.gold, borderWidth: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Sparkles size={16} color={colors.gold} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.gold }}>WAYLY SUMMARY</T>
                </View>
                <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }}>
                  {`Based on the answers, ${summarySubject} look like someone who needs ${primaryBand?.headline ? primaryBand.headline.toLowerCase() : "this level of support"}. ${plainSummary}`}
                </T>
                <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.muted, marginTop: spacing.sm }}>
                  {`That points to ${rangeLabel}. At this level, Support at Home would fund roughly ${weekly(c.annual_budget_low)} to ${weekly(c.annual_budget_high)} a week of care. The government pays most of this; ${summarySubject} pay a small share based on income.`}
                </T>
                {result.gap_detected && result.gap_direction === "up" ? (
                  <View style={{ marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.gold }}>
                    <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
                      {`The answers suggest more help than the current classification usually covers. That is common, and a normal reason to ask My Aged Care for a reassessment.`}
                    </T>
                  </View>
                ) : null}
              </Card>

              {/* Comparison of all 8 levels */}
              {bands.length ? (
                <Card testID="csc-comparison" style={{ backgroundColor: colors.sageSoft }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.sage }}>HOW THE LEVELS COMPARE</T>
                  <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text, marginTop: 2 }}>The 8 Support at Home levels</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>Each level funds a set amount of care per year. Higher levels mean more help. Your likely band is highlighted.</T>
                  <View style={{ gap: 8, marginTop: spacing.md }}>
                    {bands.map((b) => {
                      const isPrimary = b.classification === c.primary;
                      const inRange = b.classification >= c.range_low && b.classification <= c.range_high;
                      const w = Math.max(6, Math.round((b.annual_budget / maxAnnual) * 100));
                      return (
                        <View key={b.classification} testID={`csc-comparison-row-${b.classification}`} style={{ borderRadius: radius.md, padding: spacing.md, backgroundColor: isPrimary ? colors.primary : inRange ? colors.sageSoft : colors.surface }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: isPrimary ? "#fff" : colors.text }} numberOfLines={1}>Level {b.classification} · {b.headline}</T>
                              <T style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: isPrimary ? "rgba(255,255,255,0.7)" : colors.muted, marginTop: 2 }}>{b.plain}</T>
                            </View>
                            {isPrimary ? (
                              <View style={{ backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, color: "#fff", letterSpacing: 0.5 }}>YOU&apos;RE LIKELY HERE</T>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <View style={{ flex: 1, height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: isPrimary ? "rgba(255,255,255,0.25)" : colors.surface2 }}>
                              <View style={{ width: `${w}%`, height: "100%", borderRadius: 999, backgroundColor: isPrimary ? colors.gold : colors.primary }} />
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: isPrimary ? "#fff" : colors.text }}>{moneyWhole(b.annual_budget)}/yr</T>
                              <T style={{ fontFamily: fonts.body, fontSize: 10, color: isPrimary ? "rgba(255,255,255,0.7)" : colors.muted }}>{`≈ ${weekly(b.annual_budget)}/wk`}</T>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, fontSize: 11, lineHeight: 16 }}>These are the yearly funded amounts. The government pays most; your share depends on your income.</T>
                </Card>
              ) : null}

              {/* Top drivers */}
              {drivers.length ? (
                <Card testID="csc-drivers" style={{ backgroundColor: colors.goldSoft }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.gold }}>WHAT DROVE THIS RESULT</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>These answers had the biggest effect on your band.</T>
                  <View style={{ gap: spacing.sm }}>
                    {drivers.map((d: any) => (
                      <View key={d.question_id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, color: colors.gold }}>{DOMAIN_LABEL(d.domain).toUpperCase()}</T>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 3 }}>{d.answer}</T>
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

              {/* Actions: Save as PDF + Email to self + Run again (coloured) */}
              <ResultActions result={result} onRerun={resetAll} />

              {/* Save this check under a name */}
              <SaveCheckCard runId={result.csc_run_id} onSaved={loadSavedChecks} />

              {/* What the assessor will ask */}
              <AssessorBlock />

              {/* Repeat nudge */}
              <Card testID="csc-repeat-nudge" style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                <T variant="small" style={{ color: colors.muted, lineHeight: 20 }}>
                  This isn&apos;t a one-time answer. Run this again after a fall, a hospital stay, a new diagnosis, or a carer change.
                </T>
              </Card>

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
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontFamily: fonts.body, fontSize: 15 },
});
