import React, { useState, useEffect } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertOctagon, ShieldAlert, Shield, ShieldCheck } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

const SEV_META: Record<string, { label: string; icon: any; color: (c: any) => string }> = {
  compliance: { label: "Compliance", icon: AlertOctagon, color: (c) => c.terracotta },
  choice: { label: "Choice", icon: ShieldAlert, color: (c) => c.gold },
  efficiency: { label: "Efficiency", icon: Shield, color: (c) => c.alert },
  info: { label: "Info", icon: ShieldCheck, color: (c) => c.sage },
};

export default function CarePlanReviewer() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const [text, setText] = useState("");
  const [classification, setClassification] = useState(active?.classification_level ? String(active.classification_level) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (active?.classification_level) setClassification((c) => c || String(active.classification_level));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const body: any = { text };
      if (classification) body.classification = parseInt(classification, 10);
      const data = await apiFetch("/public/care-plans/review", { method: "POST", body });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Review failed. Please try again.");
    } finally { setBusy(false); }
  };

  const findings = result?.findings || [];
  const ex = result?.extraction || {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Support Plan Reviewer" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Support Plan Reviewer</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            Paste the care plan text. We will check it against the Statement of Rights (Aged Care Act 2024) and the National Quality Standards, and flag the gaps.
          </T>

          <Card testID="care-plan-form">
            <T variant="small" style={{ color: colors.muted, marginBottom: 6 }}>Paste the support plan text</T>
            <TextInput
              testID="cp-text" value={text} onChangeText={setText} multiline
              placeholder="Paste the full text of the care plan here…" placeholderTextColor={colors.muted}
              style={[styles.textarea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            />
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, marginBottom: 6 }}>
              Classification level (optional, improves the review){active?.classification_level ? ` · prefilled from ${active.display_name}` : ""}
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {["", "1", "2", "3", "4", "5", "6", "7", "8"].map((c) => {
                const on = classification === c;
                return (
                  <Pressable key={c || "none"} testID={`cp-classification-${c || "none"}`} onPress={() => setClassification(c)} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{c ? `Class ${c}` : "Not set"}</T>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertOctagon size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
          <Button label="Review my care plan" testID="cp-submit" icon={Sparkles} onPress={submit} loading={busy} disabled={text.trim().length < 50} />

          {busy ? (
            <Card testID="cp-progress" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primary }}>Reviewing the care plan…</T>
                  <T variant="small" style={{ color: colors.text, marginTop: 2, lineHeight: 19 }}>This usually takes about a minute. We're checking it against the Statement of Rights and the National Quality Standards, hang tight.</T>
                </View>
              </View>
            </Card>
          ) : null}

          {result ? (
            <View testID="cp-result" style={{ gap: spacing.md }}>
              {/* Preview */}
              {(ex.provider_name || ex.classification || (ex.services || []).length) ? (
                <Card testID="cp-preview">
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>PREVIEW, WHAT WE READ</T>
                  {ex.provider_name ? <T variant="small" style={{ marginTop: 6 }}><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Provider: </T>{ex.provider_name}</T> : null}
                  {ex.classification ? <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Classification: </T>{ex.classification}</T> : null}
                  {(ex.services || []).length ? <T variant="small" style={{ marginTop: 4 }}><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Services identified: </T>{ex.services.length}</T> : null}
                </Card>
              ) : null}

              <Card testID="cp-file-findings">
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>FINDINGS ({findings.length})</T>
                {findings.length === 0 ? (
                  <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm }}>No issues surfaced in this review.</T>
                ) : (
                  <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                    {findings.map((f: any, i: number) => {
                      const meta = SEV_META[f.severity] || SEV_META.info;
                      const Icon = meta.icon;
                      const c = meta.color(colors);
                      return (
                        <View key={i} testID={`cp-finding-${i}`} style={{ borderLeftWidth: 3, borderLeftColor: c, paddingLeft: spacing.sm }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Icon size={14} color={c} />
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: c }}>{meta.label.toUpperCase()}</T>
                            {f.confidence ? <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>· {f.confidence} confidence</T> : null}
                          </View>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 4 }}>{sanitizeAI(f.title)}</T>
                          {f.detail ? <T variant="small" style={{ marginTop: 2, lineHeight: 19 }}>{sanitizeAI(f.detail)}</T> : null}
                          {f.citation_source ? <T variant="small" style={{ color: colors.muted, marginTop: 2, fontSize: 11 }}>Source: {f.citation_source}</T> : null}
                          {f.suggested_question ? <T variant="small" style={{ fontStyle: "italic", color: colors.primary, marginTop: 4 }}>→ {sanitizeAI(f.suggested_question)}</T> : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </View>
          ) : null}

          <ToolExplainer toolKey="care-plan-reviewer" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  textarea: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 10, minHeight: 160, textAlignVertical: "top", fontFamily: fonts.body, fontSize: 15 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
