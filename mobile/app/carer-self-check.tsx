import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router } from "expo-router";
import { Heart, Sparkles, AlertTriangle, Phone } from "lucide-react-native";

import { AppHeader, Button, Card, Field, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

const STRENGTHS = [
  { key: "patience", label: "Patience" }, { key: "organisation", label: "Organisation" },
  { key: "medical_knowledge", label: "Medical knowledge" }, { key: "physical_capacity", label: "Physical capacity" },
  { key: "emotional_resilience", label: "Emotional resilience" }, { key: "communication", label: "Communication" },
];
const CONSTRAINTS = [
  { key: "financial", label: "Financial" }, { key: "physical", label: "Physical" },
  { key: "emotional", label: "Emotional" }, { key: "time_pressure", label: "Time pressure" },
  { key: "social_isolation", label: "Social isolation" }, { key: "own_health", label: "My own health" },
  { key: "family_conflict", label: "Family conflict" }, { key: "geographic", label: "Geographic (remote / travel)" },
];
const SUPPORTS = [
  { key: "respite_informal", label: "Informal respite" }, { key: "respite_formal", label: "Formal respite" },
  { key: "counselling", label: "Counselling" }, { key: "support_group", label: "Support group" },
  { key: "online_community", label: "Online community" }, { key: "none", label: "None" },
];
const DESIRED = [
  { key: "more_respite", label: "More respite" }, { key: "financial_support", label: "Financial support" },
  { key: "counselling", label: "Counselling" }, { key: "peer_support", label: "Peer support" },
  { key: "education", label: "Education / training" }, { key: "practical_help", label: "Practical help" },
  { key: "understanding", label: "Understanding from others" },
];
const LEVELS = [
  { key: "none", label: "None" }, { key: "mild", label: "Mild" },
  { key: "moderate", label: "Moderate" }, { key: "high", label: "High" }, { key: "severe", label: "Severe" },
];
const SLEEP = [
  { key: "good", label: "Good" }, { key: "fair", label: "Fair" }, { key: "poor", label: "Poor" }, { key: "very_poor", label: "Very poor" },
];
const RESOURCE_LABEL: Record<string, string> = {
  carer_gateway: "Carer Gateway · 1800 422 737", opan: "OPAN · 1800 700 600",
  "1800respect": "1800RESPECT · 1800 737 732", lifeline: "Lifeline · 13 11 14",
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
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const toggle = (arr: string[], set: (v: string[]) => void, k: string) =>
    set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const body: any = {
        participant_context_id: activeId,
        self_reported_strengths: strengths,
        constraints_reported: constraints,
        support_used_currently: supports,
        desired_support: desired,
        constraints_notes: notes || null,
        opt_in_burnout: optBurnout,
      };
      if (optBurnout) body.burnout_self_report = burnout;
      const data = await apiFetch<{ assessment: any }>("/cs1/assessments", { method: "POST", body });
      setResult(data.assessment);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signal = result?.burnout_composite_signal;
  const resp = result?.burnout_response;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Carer Self-Check" subtitle="A private check-in on how you're coping" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Heart size={18} color={colors.sage} />
            <T style={{ fontFamily: fonts.bodySemi, color: colors.sage, flex: 1 }}>This is just for you</T>
          </View>
          <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>
            Caring is a big job. This quick check-in recognises your strengths and the pressures you carry, then points you to support if you want it. Nothing here is shared without your say so.
          </T>
        </Card>

        <ChipGroup title="What are your strengths as a carer?" options={STRENGTHS} selected={strengths} onToggle={(k: string) => toggle(strengths, setStrengths, k)} colors={colors} prefix="csc-strength" />
        <ChipGroup title="What's making it harder right now?" options={CONSTRAINTS} selected={constraints} onToggle={(k: string) => toggle(constraints, setConstraints, k)} colors={colors} prefix="csc-constraint" />
        <ChipGroup title="What support are you using now?" options={SUPPORTS} selected={supports} onToggle={(k: string) => toggle(supports, setSupports, k)} colors={colors} prefix="csc-support" />
        <ChipGroup title="What would help most?" options={DESIRED} selected={desired} onToggle={(k: string) => toggle(desired, setDesired, k)} colors={colors} prefix="csc-desired" />

        <Field label="Anything you want to add? (optional)" value={notes} onChangeText={setNotes} placeholder="A sentence or two, if you like." multiline testID="csc-notes" />

        <Card>
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

        <Button label="See my check-in" testID="csc-submit" icon={Sparkles} onPress={submit} loading={busy} />

        {result ? (
          <Card testID="csc-result" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
              <Sparkles size={18} color={colors.sage} />
              <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>Your check-in</T>
            </View>
            {signal ? (
              <View style={[styles.signal, { backgroundColor: (colors as any)[SIGNAL_TONE[signal]] || colors.sage }]}>
                <T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 13 }}>{signal.toUpperCase()} STRESS SIGNAL</T>
              </View>
            ) : null}
            {resp?.message ? <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: spacing.sm }}>{sanitizeAI(resp.message)}</T> : (
              <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }}>Thanks for checking in. You noted {strengths.length} strength(s) and {constraints.length} pressure(s).</T>
            )}
            {resp?.emergency_note ? (
              <View style={[styles.err, { backgroundColor: colors.errorSoft, marginTop: spacing.sm }]}>
                <AlertTriangle size={18} color={colors.terracotta} />
                <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{resp.emergency_note}</T>
              </View>
            ) : null}
            {(resp?.recommended_resources || []).length ? (
              <View style={{ marginTop: spacing.md, gap: 8 }}>
                <T variant="label">WHO CAN HELP</T>
                {resp.recommended_resources.map((r: string) => (
                  <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Phone size={15} color={colors.primary} />
                    <T variant="small" style={{ color: colors.text }}>{RESOURCE_LABEL[r] || r}</T>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  levelChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  err: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.md },
  signal: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
});
