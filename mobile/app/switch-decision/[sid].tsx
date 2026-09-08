import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, ArrowLeft, CheckCircle2, FileText } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { REASONS } from "../provider-switch";

const ALTERNATIVES: [string, string][] = [
  ["formal_complaint_against_current", "File a formal complaint (CMP-1)"],
  ["dialogue_with_current_care_manager", "Talk to the care manager"],
  ["change_worker_within_current", "Change worker within current provider"],
  ["partial_service_change", "Partial service change (not full switch)"],
];
const CONSIDERATIONS: [string, string][] = [
  ["notice_period_understood", "I understand the notice period requirements"],
  ["care_disruption_risk_considered", "I've considered the risk of care disruption"],
  ["financial_implications_reviewed", "I've reviewed financial implications"],
  ["alternative_provider_researched", "I've researched an alternative provider"],
  ["unresolved_disputes_reviewed", "I've reviewed unresolved disputes"],
  ["participant_involvement_confirmed", "The participant is involved in this decision"],
];
const DECISIONS: [string, string][] = [
  ["proceed_with_switch", "Proceed with the switch"],
  ["defer_and_reassess_in_30_days", "Defer and reassess in 30 days"],
  ["abandon_switch_pursue_alternatives", "Abandon switch, pursue alternatives"],
  ["escalate_via_complaint_first", "Escalate via complaint first"],
];

function Checkbox({ checked, colors }: any) {
  return <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>{checked ? <CheckCircle2 size={13} color="#fff" /> : null}</View>;
}
function Radio({ checked, colors }: any) {
  return <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, alignItems: "center", justifyContent: "center" }}>{checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}</View>;
}

export default function SwitchDecisionScreen() {
  const { colors } = useTheme();
  const { sid } = useLocalSearchParams<{ sid: string }>();
  const [sw, setSw] = useState<any>(null);
  const [context, setContext] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonDetails, setReasonDetails] = useState("");
  const [alts, setAlts] = useState<Record<string, boolean>>({});
  const [considerations, setConsiderations] = useState<Record<string, boolean>>({});
  const [decision, setDecision] = useState("proceed_with_switch");
  const [decisionNotes, setDecisionNotes] = useState("");

  useEffect(() => {
    if (!sid) return;
    apiFetch<any>(`/psw1/switches/${sid}`).then((r) => setSw(r.switch)).catch(() => {});
    apiFetch<any>(`/psw1/switches/${sid}/context-snapshot`)
      .then((r) => setContext({ unresolved_complaints_at_current_count: r.unresolved_complaints_at_current_count, open_loop_cases_at_current_count: r.open_loop_cases_at_current_count, final_decision: null }))
      .catch(() => setContext({ unresolved_complaints_at_current_count: 0, open_loop_cases_at_current_count: 0, final_decision: null }));
  }, [sid]);

  const toggle = (setter: any, key: string) => setter((c: any) => Array.isArray(c) ? (c.includes(key) ? c.filter((x: string) => x !== key) : [...c, key]) : { ...c, [key]: !c[key] });

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch<any>(`/psw1/switches/${sid}/decision-walkthrough`, { method: "POST", body: {
        switching_reasons: reasons, switching_reason_details: reasonDetails || null,
        considerations_reviewed: considerations, alternative_actions_considered: alts,
        final_decision: decision, final_decision_notes: decisionNotes || null,
      } });
      setContext(data.walkthrough);
      setStep(6);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not submit walkthrough."); }
    finally { setBusy(false); }
  };

  if (!sw) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Decision Walkthrough" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="psw1-walkthrough-root">
        <View>
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>DECISION WALKTHROUGH</T>
          <T testID="psw1-walkthrough-title" style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text, marginTop: 2 }}>Confirm the Decision to Switch from {sw.current_provider_name}</T>
          <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>Wayly does not push either direction. This walkthrough helps you think through the decision.</T>
          {step < 6 ? (
            <View style={{ marginTop: spacing.md }}>
              <View testID="psw1-progress" style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden" }}>
                <View style={{ height: 6, width: `${(step / 5) * 100}%`, backgroundColor: colors.primary }} />
              </View>
              <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Step {step} of 5</T>
            </View>
          ) : null}
        </View>

        {context ? (
          <Card testID="psw1-cross-tool-context" style={{ backgroundColor: colors.surface2 }}>
            <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>CROSS-TOOL CONTEXT</T>
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>Unresolved complaints at current provider</T>
                <T testID="psw1-context-complaints" style={{ fontFamily: fonts.bodySemi, fontSize: 20, color: colors.text }}>{context.unresolved_complaints_at_current_count ?? 0}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>Open LOOP-1 cases</T>
                <T testID="psw1-context-cases" style={{ fontFamily: fonts.bodySemi, fontSize: 20, color: colors.text }}>{context.open_loop_cases_at_current_count ?? 0}</T>
              </View>
            </View>
          </Card>
        ) : null}

        <Card testID={`psw1-walkthrough-step-${step}`}>
          {step === 1 ? (
            <>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Your reasons for switching</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
                {REASONS.map((r) => {
                  const on = reasons.includes(r.key);
                  return (
                    <Pressable key={r.key} testID={`psw1-reason-${r.key}`} onPress={() => toggle(setReasons, r.key)} style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{r.label}</T>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput testID="psw1-reason-details" value={reasonDetails} onChangeText={setReasonDetails} multiline placeholder="Notes (optional)" placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 70, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, marginTop: spacing.sm }} />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Have you considered alternatives?</T>
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {ALTERNATIVES.map(([k, label]) => (
                  <Pressable key={k} testID={`psw1-alt-${k}`} onPress={() => toggle(setAlts, k)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Checkbox checked={!!alts[k]} colors={colors} />
                    <T variant="small" style={{ flex: 1, color: colors.text }}>{label}</T>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Considerations checklist</T>
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {CONSIDERATIONS.map(([k, label]) => (
                  <Pressable key={k} testID={`psw1-consideration-${k}`} onPress={() => toggle(setConsiderations, k)} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Checkbox checked={!!considerations[k]} colors={colors} />
                    <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 19 }}>{label}</T>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Final decision</T>
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {DECISIONS.map(([k, label]) => (
                  <Pressable key={k} testID={`psw1-final-${k}`} onPress={() => setDecision(k)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Radio checked={decision === k} colors={colors} />
                    <T variant="small" style={{ flex: 1, color: colors.text }}>{label}</T>
                  </Pressable>
                ))}
              </View>
              <TextInput testID="psw1-final-notes" value={decisionNotes} onChangeText={setDecisionNotes} multiline placeholder="Notes (optional)" placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 70, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, marginTop: spacing.sm }} />
            </>
          ) : null}
          {step === 5 ? (
            <View testID="psw1-review">
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Review</T>
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11, marginTop: spacing.sm }}>REASONS</T>
              <T variant="small" style={{ color: colors.text }}>{reasons.map((k) => REASONS.find((r) => r.key === k)?.label).join(", ") || "—"}</T>
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11, marginTop: spacing.sm }}>FINAL DECISION</T>
              <T variant="small" style={{ color: colors.text }}>{decision.replace(/_/g, " ")}</T>
            </View>
          ) : null}
          {step === 6 && context?.final_decision ? (
            <View testID="psw1-walkthrough-done" style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <CheckCircle2 size={20} color={colors.sage} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Walkthrough Saved</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>Final decision: {context.final_decision.replace(/_/g, " ")}.</T>
                </View>
              </View>
              {context.final_decision === "proceed_with_switch" ? (
                <Card testID="psw1-lf2-chain" style={{ backgroundColor: colors.surface2 }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <FileText size={16} color={colors.primary} />
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, flex: 1 }}>Draft the provider letters</T>
                  </View>
                  <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 19 }}>Wayly can pre-fill the formal notice to your current provider and a welcome letter to the incoming provider. Review and send both from Letters & Follow-ups.</T>
                  <Button label="Open Letters & Follow-ups" variant="outline" testID="psw1-lf2-open" onPress={() => router.push("/letters")} style={{ marginTop: spacing.sm }} />
                </Card>
              ) : null}
              <Button label="Back to Switches" icon={ArrowRight} testID="psw1-walkthrough-return" onPress={() => router.replace("/provider-switch")} />
            </View>
          ) : null}
          {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="psw1-walkthrough-error">{error}</T> : null}
        </Card>

        {step < 6 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Button label="Back" variant="outline" icon={ArrowLeft} testID="psw1-walkthrough-back" disabled={step === 1} onPress={() => setStep((s) => Math.max(1, s - 1))} />
            {step < 5 ? (
              <Button label="Next" icon={ArrowRight} testID="psw1-walkthrough-next" onPress={() => setStep((s) => s + 1)} />
            ) : (
              <Button label="Save walkthrough" testID="psw1-walkthrough-submit" loading={busy} onPress={submit} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
