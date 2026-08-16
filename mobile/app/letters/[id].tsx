import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Sparkles, AlertTriangle, FileText, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

type IntakeField = { key: string; label: string; textarea?: boolean };

// Required intake fields per archetype (mirrors backend _REQUIRED_INTAKE_FIELDS).
const INTAKE_FIELDS: Record<string, IntakeField[]> = {
  request: [{ key: "participant_name", label: "Participant's name" }, { key: "change_summary", label: "What has changed and why more help is needed", textarea: true }],
  dispute: [{ key: "participant_name", label: "Participant's name" }, { key: "disputed_charge_summary", label: "What you are disputing (charge, dates, amount)", textarea: true }],
  complaint: [{ key: "participant_name", label: "Participant's name" }, { key: "complaint_summary", label: "What the complaint is about", textarea: true }],
  escalation: [{ key: "participant_name", label: "Participant's name" }, { key: "escalation_summary", label: "What you are escalating", textarea: true }, { key: "prior_attempts", label: "What you have already tried", textarea: true }],
  notification: [{ key: "participant_name", label: "Participant's name" }, { key: "notification_summary", label: "What you are notifying", textarea: true }],
  response_draft: [{ key: "inbound_summary", label: "Paste the message you received", textarea: true }],
  guided_pathway: [{ key: "participant_name", label: "Participant's name" }, { key: "incident_summary", label: "What you want on the record (optional)", textarea: true }],
};

const RECIPIENT_LABEL: Record<string, string> = {
  provider_cm: "Provider (Care Manager)", provider: "Provider", mac: "My Aged Care",
  acqsc: "ACQSC", ombudsman: "Ombudsman", services_australia: "Services Australia",
};

export default function CorrespondenceDetail() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoadError(false); setLoading(true);
    try {
      const data = await apiFetch<{ entry: any } | any>(`/lf1/correspondence/${id}`);
      const e = data?.entry || data;
      setEntry(e);
      const existing = { ...(e?.intake || {}) };
      if (!existing.participant_name && active?.display_name) existing.participant_name = active.display_name;
      setIntake(existing);
      if (e?.content_draft) setDraft({ body: e.content_draft, subject: e?.intake?.subject || "" });
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (id) load(); }, [id]);

  const fields = INTAKE_FIELDS[entry?.archetype || ""] || INTAKE_FIELDS.request;
  const set = (k: string, v: string) => setIntake((s) => ({ ...s, [k]: v }));

  const generate = async () => {
    setBusy(true); setError(""); setMissing([]);
    try {
      const payload = await apiFetch(`/lf1/correspondence/${id}/generate`, { method: "POST", body: { intake } });
      setDraft(payload);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.data?.detail?.missing_fields) {
        setMissing(e.data.detail.missing_fields);
        setError("Please fill in the highlighted fields before generating.");
      } else {
        setError(e instanceof ApiError ? e.message : "Draft generation is temporarily unavailable.");
      }
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!draft?.body) return;
    await Clipboard.setStringAsync(`${draft.subject ? `Subject: ${draft.subject}\n\n` : ""}${draft.body}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Letter" onBack={() => router.back()} /><Loading label="Loading…" /></View>;
  if (loadError || !entry) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Letter" onBack={() => router.back()} /><StatePanel testID="lf-detail-error" icon={FileText} title="Couldn't load this letter" actionLabel="Retry" onAction={load} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Draft your letter" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Card testID="lf-detail-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{entry.situation_label}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 4 }}>
              To {RECIPIENT_LABEL[entry.recipient_type] || entry.recipient_type || "recipient"}
              {entry.expected_response_by ? ` · reply expected by ${new Date(entry.expected_response_by).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </T>
          </Card>

          <Card testID="lf-intake-form">
            <T variant="label">Tell us the details</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>Wayly only uses the facts you enter here. Nothing is invented.</T>
            {fields.map((f) => {
              const isMissing = missing.includes(f.key);
              return (
                <View key={f.key} style={{ marginTop: spacing.sm }}>
                  <T variant="small" style={{ marginBottom: 4, color: isMissing ? colors.terracotta : colors.text, fontFamily: fonts.bodySemi }}>{f.label}</T>
                  <TextInput
                    testID={`lf-intake-${f.key}`}
                    value={intake[f.key] || ""}
                    onChangeText={(v) => set(f.key, v)}
                    multiline={f.textarea}
                    placeholder={f.textarea ? "Describe in a few sentences…" : ""}
                    placeholderTextColor={colors.muted}
                    style={[styles.input, f.textarea && { minHeight: 96, textAlignVertical: "top", paddingTop: 10 }, { borderColor: isMissing ? colors.terracotta : colors.border, color: colors.text, backgroundColor: colors.bg }]}
                  />
                </View>
              );
            })}
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }} testID="lf-error">{error}</T></View> : null}
          <Button label={draft ? "Regenerate draft" : "Generate draft"} testID="lf-generate" icon={Sparkles} onPress={generate} loading={busy} />

          {draft ? (
            <Card testID="lf-draft">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="label">Your draft</T>
                <Button label={copied ? "Copied" : "Copy"} variant="outline" icon={Copy} testID="lf-copy" onPress={copy} style={{ minHeight: 40, paddingHorizontal: spacing.md }} />
              </View>
              {draft.subject ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: spacing.sm }} testID="lf-draft-subject">Subject: {draft.subject}</T> : null}
              <T selectable style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text, marginTop: spacing.sm }} testID="lf-draft-body">{sanitizeAI(draft.body)}</T>
              {draft.mac_portal_short_form ? (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                  <T variant="label">My Aged Care portal short form</T>
                  <T selectable variant="small" style={{ lineHeight: 20, marginTop: 4 }}>{sanitizeAI(draft.mac_portal_short_form)}</T>
                </View>
              ) : null}
              <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, fontStyle: "italic" }}>Review every line before sending. Wayly does not send letters for you.</T>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
