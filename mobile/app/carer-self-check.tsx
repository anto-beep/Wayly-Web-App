import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, Phone, Save, CalendarCheck, Heart, CheckCircle2 } from "lucide-react-native";

import { AppHeader, Button, Card, Field, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

const STRENGTHS = [
  { key: "patience", label: "Patience" }, { key: "organisation", label: "Organisation" },
  { key: "medical_knowledge", label: "Medical Knowledge" }, { key: "physical_capacity", label: "Physical Capacity" },
  { key: "emotional_resilience", label: "Emotional Resilience" }, { key: "communication", label: "Communication" },
];
const CONSTRAINTS = [
  { key: "financial", label: "Financial" }, { key: "physical", label: "Physical" },
  { key: "emotional", label: "Emotional" }, { key: "time_pressure", label: "Time Pressure" },
  { key: "social_isolation", label: "Social Isolation" }, { key: "own_health", label: "My Own Health" },
  { key: "family_conflict", label: "Family Conflict" }, { key: "geographic", label: "Geographic (Remote / Travel)" },
];
const SUPPORTS = [
  { key: "respite_informal", label: "Informal Respite" }, { key: "respite_formal", label: "Formal Respite" },
  { key: "counselling", label: "Counselling" }, { key: "support_group", label: "Support Group" },
  { key: "online_community", label: "Online Community" }, { key: "none", label: "None" },
];
const DESIRED = [
  { key: "more_respite", label: "More Respite" }, { key: "financial_support", label: "Financial Support" },
  { key: "counselling", label: "Counselling" }, { key: "peer_support", label: "Peer Support" },
  { key: "education", label: "Education / Training" }, { key: "practical_help", label: "Practical Help" },
  { key: "understanding", label: "Understanding From Others" },
];
const LEVELS = [
  { key: "none", label: "None" }, { key: "mild", label: "Mild" },
  { key: "moderate", label: "Moderate" }, { key: "high", label: "High" }, { key: "severe", label: "Severe" },
];
const SLEEP = [
  { key: "good", label: "Good" }, { key: "fair", label: "Fair" }, { key: "poor", label: "Poor" }, { key: "very_poor", label: "Very Poor" },
];
const RESOURCE_LABEL: Record<string, string> = {
  carer_gateway: "Carer Gateway · 1800 422 737", opan: "OPAN · 1800 700 600",
  "1800respect": "1800RESPECT · 1800 737 732", lifeline: "Lifeline · 13 11 14",
  my_aged_care: "My Aged Care · 1800 200 422", elder_abuse_helpline: "Elder Abuse Helpline · 1800 353 374",
};

function ChipGroup({ title, options, selected, onToggle, colors, prefix }: any) {
  return (
    <View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginBottom: 8 }}>{title}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o: any) => {
          const active = selected.includes(o.key);
          return (
            <Pressable key={o.key} testID={`${prefix}-${o.key}`} onPress={() => onToggle(o.key)}
              style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{o.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LevelRow({ label, value, onChange, options, colors, prefix }: any) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="small">{label}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((o: any) => {
          const active = value === o.key;
          return (
            <Pressable key={o.key} testID={`${prefix}-${o.key}`} onPress={() => onChange(o.key)}
              style={[styles.levelChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: active ? "#fff" : colors.muted }}>{o.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const SIGNAL_TONE: Record<string, string> = { low: "sage", moderate: "gold", elevated: "gold", high: "terracotta" };

export default function CarerSelfCheckScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [strengths, setStrengths] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [supports, setSupports] = useState<string[]>([]);
  const [desired, setDesired] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [optBurnout, setOptBurnout] = useState(false);
  const [burnout, setBurnout] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [checkinSet, setCheckinSet] = useState("");
  const draftReady = useRef(false);

  const snapshot = useCallback(() => ({
    self_reported_strengths: strengths, constraints_reported: constraints,
    support_used_currently: supports, desired_support: desired,
    constraints_notes: notes, opt_in_burnout: optBurnout, burnout_self_report: burnout,
  }), [strengths, constraints, supports, desired, notes, optBurnout, burnout]);

  // Resume any saved draft.
  useEffect(() => {
    (async () => {
      try {
        const data: any = await apiFetch("/cs1/assessment-draft");
        const f = data?.draft?.form;
        if (f) {
          setStrengths(f.self_reported_strengths || []);
          setConstraints(f.constraints_reported || []);
          setSupports(f.support_used_currently || []);
          setDesired(f.desired_support || []);
          setNotes(f.constraints_notes || "");
          setOptBurnout(!!f.opt_in_burnout);
          setBurnout(f.burnout_self_report || {});
          setResumed(true);
        }
      } catch { /* no draft */ } finally { draftReady.current = true; }
    })();
  }, []);

  // Autosave (debounced) while filling in.
  useEffect(() => {
    if (!draftReady.current || result) return;
    const t = setTimeout(() => {
      apiFetch("/cs1/assessment-draft", { method: "PUT", body: { form: snapshot(), step: 1 } }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [snapshot, result]);

  const saveNow = async () => {
    try { await apiFetch("/cs1/assessment-draft", { method: "PUT", body: { form: snapshot(), step: 1 } }); setSavedNote(true); setTimeout(() => setSavedNote(false), 2500); } catch { /* noop */ }
  };

  const toggle = (arr: string[], set: (v: string[]) => void, k: string) =>
    set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const body: any = { participant_context_id: activeId, ...snapshot() };
      if (!optBurnout) delete body.burnout_self_report;
      const data = await apiFetch<{ assessment: any }>("/cs1/assessments", { method: "POST", body });
      setResult(data.assessment);
      apiFetch("/cs1/assessment-draft", { method: "DELETE" }).catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const quickCheckin = async (weeks: number) => {
    if (!result?.id) return;
    const d = new Date(); d.setDate(d.getDate() + weeks * 7);
    const iso = d.toISOString().slice(0, 10);
    try { await apiFetch(`/cs1/assessments/${result.id}/checkin`, { method: "POST", body: { next_checkin_date: iso } }); setCheckinSet(iso); } catch { /* noop */ }
  };

  const signal = result?.burnout_composite_signal;
  const resp = result?.burnout_response;
  const tailored: string[] = result?.resources_offered || resp?.recommended_resources || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <PageIntro
          eyebrow="Carer Self-Check"
          title="Your Space to Check In With Yourself"
          description="Caring for someone is demanding, and looking after yourself is not optional. This is a private self-check, nothing is shared, no diagnosis, and you can skip any question. You can save and come back whenever you like."
          whatItDoes="Walks you through your caring role, strengths, constraints and stress signals, then gives you a warm summary, tailored support contacts, and a gentle nudge to check in with yourself again."
        />

        {resumed ? (
          <View style={[styles.banner, { backgroundColor: colors.sageSoft }]} testID="csc-resume-banner">
            <T variant="small" style={{ color: colors.text }}>Welcome back. We picked up where you left off.</T>
          </View>
        ) : null}

        <ChipGroup title="What are your strengths as a carer?" options={STRENGTHS} selected={strengths} onToggle={(k: string) => toggle(strengths, setStrengths, k)} colors={colors} prefix="csc-strength" />
        <ChipGroup title="What's making it harder right now?" options={CONSTRAINTS} selected={constraints} onToggle={(k: string) => toggle(constraints, setConstraints, k)} colors={colors} prefix="csc-constraint" />
        <ChipGroup title="What support are you using now?" options={SUPPORTS} selected={supports} onToggle={(k: string) => toggle(supports, setSupports, k)} colors={colors} prefix="csc-support" />
        <ChipGroup title="What would help most?" options={DESIRED} selected={desired} onToggle={(k: string) => toggle(desired, setDesired, k)} colors={colors} prefix="csc-desired" />

        <Field label="Anything you want to add?" optional value={notes} onChangeText={setNotes} placeholder="A sentence or two, if you like." multiline testID="csc-notes" />

        <Card style={{ backgroundColor: colors.primarySoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>Check my stress signals</T>
            <Switch value={optBurnout} onValueChange={setOptBurnout} trackColor={{ true: colors.primary }} testID="csc-opt-burnout" />
          </View>
          {optBurnout ? (
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <LevelRow label="Fatigue" value={burnout.fatigue_level} onChange={(v: string) => setBurnout({ ...burnout, fatigue_level: v })} options={LEVELS} colors={colors} prefix="csc-fatigue" />
              <LevelRow label="Emotional exhaustion" value={burnout.emotional_exhaustion} onChange={(v: string) => setBurnout({ ...burnout, emotional_exhaustion: v })} options={LEVELS} colors={colors} prefix="csc-exhaustion" />
              <LevelRow label="Feeling isolated" value={burnout.isolation_feelings} onChange={(v: string) => setBurnout({ ...burnout, isolation_feelings: v })} options={LEVELS} colors={colors} prefix="csc-isolation" />
              <LevelRow label="Sleep quality" value={burnout.sleep_quality} onChange={(v: string) => setBurnout({ ...burnout, sleep_quality: v })} options={SLEEP} colors={colors} prefix="csc-sleep" />
              <LevelRow label="Time for self care" value={burnout.self_care_time} onChange={(v: string) => setBurnout({ ...burnout, self_care_time: v })} options={LEVELS} colors={colors} prefix="csc-selfcare" />
            </View>
          ) : null}
        </Card>

        {error ? (
          <View style={[styles.err, { backgroundColor: colors.errorSoft }]}>
            <AlertTriangle size={18} color={colors.terracotta} />
            <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
          </View>
        ) : null}

        {!result ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label={savedNote ? "Saved" : "Save & Finish Later"} testID="csc-save-later" variant="outline" icon={Save} onPress={saveNow} style={{ flex: 1 }} />
            <Button label="See My Summary" testID="csc-submit" icon={Sparkles} onPress={submit} loading={busy} style={{ flex: 1 }} />
          </View>
        ) : null}

        {result ? (
          <>
            <Card testID="csc-result" style={{ backgroundColor: colors.primarySoft }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                <CheckCircle2 size={18} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, color: colors.primary }}>Here is what you shared</T>
              </View>
              {result.personal_summary ? (
                <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }} testID="csc-personal-summary">{sanitizeAI(result.personal_summary)}</T>
              ) : null}
            </Card>

            {result.encouragement ? (
              <Card style={{ backgroundColor: colors.goldSoft }} testID="csc-encouragement">
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Heart size={18} color={colors.gold} style={{ marginTop: 2 }} />
                  <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, flex: 1 }}>{sanitizeAI(result.encouragement)}</T>
                </View>
              </Card>
            ) : null}

            {signal ? (
              <Card style={{ backgroundColor: colors.sageSoft }}>
                <View style={[styles.signal, { backgroundColor: (colors as any)[SIGNAL_TONE[signal]] || colors.sage }]}>
                  <T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 13 }}>{signal.toUpperCase()} STRESS SIGNAL</T>
                </View>
                {resp?.message ? <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: spacing.sm }}>{sanitizeAI(resp.message)}</T> : null}
                {resp?.emergency_note ? (
                  <View style={[styles.err, { backgroundColor: colors.errorSoft, marginTop: spacing.sm }]}>
                    <AlertTriangle size={18} color={colors.terracotta} />
                    <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{resp.emergency_note}</T>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {tailored.length ? (
              <Card testID="csc-tailored-resources">
                <T variant="label">SUPPORT THAT FITS WHAT YOU SHARED</T>
                <View style={{ marginTop: spacing.sm, gap: 8 }}>
                  {tailored.map((r) => (
                    <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Phone size={15} color={colors.primary} />
                      <T variant="small" style={{ color: colors.text }}>{RESOURCE_LABEL[r] || r}</T>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {(result.next_steps || []).length ? (
              <Card testID="csc-next-steps">
                <T variant="label">GENTLE NEXT STEPS</T>
                <View style={{ marginTop: spacing.sm, gap: 8 }}>
                  {result.next_steps.map((s: string, i: number) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                      <Sparkles size={15} color={colors.sage} style={{ marginTop: 2 }} />
                      <T variant="small" style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{s}</T>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            <Card testID="csc-checkin">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <CalendarCheck size={18} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>When would you like to check in again?</T>
              </View>
              {checkinSet ? (
                <T variant="small" style={{ color: colors.success, marginTop: spacing.sm }} testID="csc-checkin-confirm">
                  Lovely. We&#39;ll gently nudge you again around {new Date(checkinSet).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
                </T>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm }}>
                  <Pressable testID="csc-checkin-2w" onPress={() => quickCheckin(2)} style={[styles.chip, { borderColor: colors.border }]}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text }}>In 2 weeks</T></Pressable>
                  <Pressable testID="csc-checkin-1m" onPress={() => quickCheckin(4)} style={[styles.chip, { borderColor: colors.border }]}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text }}>In 1 month</T></Pressable>
                  <Pressable testID="csc-checkin-3m" onPress={() => quickCheckin(12)} style={[styles.chip, { borderColor: colors.border }]}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text }}>In 3 months</T></Pressable>
                </View>
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  levelChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  err: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.md },
  banner: { borderRadius: radius.md, padding: spacing.md },
  signal: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
});
