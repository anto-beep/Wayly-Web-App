import React, { useCallback, useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Plus, AlertOctagon, ShieldAlert, Send, Phone, X, ChevronDown, FileDown } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, Select, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const COMPLAINT_TYPES = [
  { value: "billing_dispute", label: "Billing dispute" },
  { value: "care_quality", label: "Care quality" },
  { value: "worker_behaviour", label: "Worker behaviour" },
  { value: "service_delivery_failure", label: "Service delivery failure" },
  { value: "care_plan_dispute", label: "Care plan dispute" },
  { value: "communication_breakdown", label: "Communication breakdown" },
  { value: "elder_abuse", label: "Elder abuse (safeguard resources shown)" },
  { value: "other", label: "Other" },
];
const SEVERITIES = [
  { value: "informational", label: "Informational" },
  { value: "minor", label: "Minor" },
  { value: "serious", label: "Serious" },
  { value: "critical_urgent", label: "Critical / urgent" },
];
const DESIRED_OUTCOMES = [
  { value: "correction_of_billing", label: "Correction of billing" },
  { value: "correction_of_care_quality", label: "Correction of care quality" },
  { value: "change_of_worker", label: "Change of worker" },
  { value: "change_of_care_plan", label: "Change of care plan" },
  { value: "formal_apology", label: "Formal apology" },
  { value: "financial_compensation", label: "Financial compensation" },
  { value: "referral_to_regulator", label: "Referral to regulator" },
  { value: "other", label: "Other" },
];
const STAGE_LABEL: Record<string, string> = {
  drafting: "Drafting",
  stage_1_internal_provider: "Stage 1 · Provider",
  stage_2_provider_senior: "Stage 2 · Provider senior",
  stage_3_acqsc_referral: "Stage 3 · ACQSC",
  stage_4_ombudsman_referral: "Stage 4 · Ombudsman",
  stage_5_appeals: "Stage 5 · Appeals",
  closed_resolved: "Closed · resolved",
  closed_abandoned: "Closed · abandoned",
};

function stageTone(stage: string, colors: any) {
  if (stage === "closed_resolved") return { bg: colors.sageSoft, fg: colors.sage };
  if (stage?.startsWith("stage_3") || stage?.startsWith("stage_4") || stage?.startsWith("stage_5")) return { bg: colors.errorSoft, fg: colors.terracotta };
  if (stage?.startsWith("stage_1") || stage?.startsWith("stage_2")) return { bg: colors.goldSoft, fg: colors.gold };
  return { bg: colors.surface2, fg: colors.muted };
}

function LInput({ label, value, onChangeText, placeholder, testID, colors, disabled }: any) {
  return (
    <View style={{ flex: 1 }}>
      <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</T>
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} editable={!disabled} placeholderTextColor={colors.muted}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg, opacity: disabled ? 0.5 : 1 }} />
    </View>
  );
}

function CheckRow({ label, checked, onToggle, testID, colors }: any) {
  return (
    <Pressable testID={testID} onPress={onToggle} style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 4 }}>
      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
        {checked ? <T style={{ color: "#fff", fontSize: 12 }}>✓</T> : null}
      </View>
      <T variant="small" style={{ flex: 1, color: colors.text }}>{label}</T>
    </Pressable>
  );
}

export default function ComplaintsScreen() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const pid = active?.id;
  const [rows, setRows] = useState<any[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pid) { setRows([]); return; }
    try {
      const data = await apiFetch<any>(`/cmp1/participants/${pid}/complaints`);
      setRows(data?.complaints || []);
    } catch { setRows([]); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading complaints…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Complaints" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="cmp1-list-page">
        <PageIntro
          eyebrow="Complaints"
          title="Open Complaints and Resolutions"
          description="Something went wrong? Track every complaint from the first phone call to your provider through to ACQSC referral and final resolution, with dates, evidence, and follow-up dates in one place."
          whatItDoes="Manages each complaint as a case with staged status: raised → with provider → escalated → ACQSC → resolved. Prompts you before deadlines slip."
        />

        {rows.length > 0 ? (
          <SmartAISummary
            pageKey="complaints-list"
            context={{
              total: rows.length,
              critical_or_serious: rows.filter((c) => c.severity === "critical_urgent" || c.severity === "serious").length,
              safeguard_flagged: rows.filter((c) => c.contains_elder_abuse_indicators).length,
              open_not_closed: rows.filter((c) => !String(c.current_stage).startsWith("closed_")).length,
            }}
          />
        ) : null}

        <Button label="New Complaint" icon={Plus} testID="cmp1-new-btn" onPress={() => setModalOpen(true)} disabled={!pid} />

        {rows.length === 0 ? (
          <Card testID="cmp1-empty" style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <AlertOctagon size={28} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, textAlign: "center" }}>No complaints yet. Opening one creates a LOOP-1 case and evidence bundle.</T>
          </Card>
        ) : (
          <View testID="cmp1-list" style={{ gap: spacing.sm }}>
            {rows.map((c) => <ComplaintRow key={c.id} complaint={c} colors={colors} onChanged={load} />)}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: spacing.sm }}>
          <Phone size={13} color={colors.muted} style={{ marginTop: 2 }} />
          <T variant="small" style={{ color: colors.muted, fontSize: 11, flex: 1, lineHeight: 17 }}>If you or the participant is in immediate danger, phone 000. For confidential guidance the Elder Abuse Helpline is 1800 353 374.</T>
        </View>
      </ScrollView>

      <NewComplaintModal visible={modalOpen} pid={pid} colors={colors} prefill={{ provider_name: active?.provider_name || "" }} onClose={() => setModalOpen(false)} onCreated={() => { setModalOpen(false); load(); }} />
    </View>
  );
}

function ComplaintRow({ complaint: c, colors, onChanged }: any) {
  const tone = stageTone(c.current_stage, colors);
  const [acqscOpen, setAcqscOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [trail, setTrail] = useState<any[] | null>(null);
  const [showTrail, setShowTrail] = useState(false);

  const canSubmitAcqsc = !String(c.current_stage).startsWith("closed_") && c.current_stage !== "stage_4_ombudsman_referral" && c.current_stage !== "stage_5_appeals";

  const submitAcqsc = async () => {
    setSubmitting(true); setMsg("");
    try {
      const data = await apiFetch<any>(`/cmp1/complaints/${c.id}/submit-to-acqsc`, { method: "POST", body: { additional_notes: notes || undefined, include_evidence_bundle_link: true } });
      setMsg(data.mocked ? "Recorded to the audit trail (email delivery is mocked)." : "Referral emailed to ACQSC and saved to the audit trail.");
      setNotes(""); setAcqscOpen(false);
      onChanged?.();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not submit to ACQSC."); }
    finally { setSubmitting(false); }
  };

  const loadTrail = async () => {
    try { const data = await apiFetch<any>(`/cmp1/complaints/${c.id}/acqsc-submissions`); setTrail(data?.submissions || []); }
    catch { setTrail([]); }
  };

  const openBundle = () => {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (base && c.evidence_bundle_id) Linking.openURL(`${base}/api/cmp1/evidence-bundles/${c.evidence_bundle_id}/export.pdf`);
  };

  return (
    <Card testID={`cmp1-row-${c.id}`} style={c.contains_elder_abuse_indicators ? { borderColor: colors.terracotta } : undefined}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }} numberOfLines={1}>{c.provider_name}</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 2 }} numberOfLines={2}>{c.subject_matter_summary}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" }}>
        <View style={{ backgroundColor: tone.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: tone.fg }}>{(STAGE_LABEL[c.current_stage] || c.current_stage).toUpperCase()}</T>
        </View>
        <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>{String(c.complaint_type || "").replace(/_/g, " ")}</T>
        <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>{c.severity}</T>
        {c.contains_elder_abuse_indicators ? (
          <View style={{ flexDirection: "row", gap: 3, alignItems: "center", backgroundColor: colors.errorSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <ShieldAlert size={11} color={colors.terracotta} /><T style={{ fontSize: 9, color: colors.terracotta, fontFamily: fonts.bodySemi }}>SAFEGUARD</T>
          </View>
        ) : null}
      </View>

      {c.evidence_bundle_id ? (
        <Pressable testID={`cmp1-bundle-pdf-${c.id}`} onPress={openBundle} style={{ flexDirection: "row", gap: 4, alignItems: "center", marginTop: spacing.sm }}>
          <FileDown size={13} color={colors.primary} /><T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>Download bundle PDF</T>
        </Pressable>
      ) : null}

      {canSubmitAcqsc ? (
        <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center", flexWrap: "wrap" }}>
            <Pressable testID={`cmp1-acqsc-open-${c.id}`} onPress={() => setAcqscOpen((v) => !v)} style={{ flexDirection: "row", gap: 4, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Send size={13} color={colors.primary} /><T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>{c.acqsc_last_submitted_at ? "Send another ACQSC referral" : "Send to ACQSC"}</T>
            </Pressable>
            <Pressable testID={`cmp1-acqsc-trail-${c.id}`} onPress={async () => { setShowTrail((v) => !v); if (trail === null) await loadTrail(); }} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
              <ChevronDown size={13} color={colors.muted} /><T variant="small" style={{ color: colors.primary }}>{showTrail ? "Hide" : "View"} submission history</T>
            </Pressable>
          </View>
          {acqscOpen ? (
            <View testID={`cmp1-acqsc-form-${c.id}`} style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm }}>
              <TextInput testID={`cmp1-acqsc-notes-${c.id}`} value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="Notes to include with the referral (optional)" placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, minHeight: 64, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg }} />
              <T variant="small" style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>A formal referral email goes to info@agedcarequality.gov.au with the complaint summary, stage history, and a link to the evidence bundle. An audit-trail row is written whether or not delivery succeeds.</T>
              <Button label="Submit referral" icon={Send} testID={`cmp1-acqsc-submit-${c.id}`} loading={submitting} onPress={submitAcqsc} />
            </View>
          ) : null}
          {msg ? <T variant="small" style={{ color: colors.muted }}>{msg}</T> : null}
          {showTrail && trail ? (
            <View testID={`cmp1-acqsc-trail-list-${c.id}`} style={{ gap: spacing.xs }}>
              {trail.length === 0 ? <T variant="small" style={{ color: colors.muted }}>No submissions on record yet.</T> : trail.map((s) => (
                <View key={s.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                    <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }} numberOfLines={1}>{s.subject}</T>
                    <T style={{ fontSize: 9, color: colors.muted, fontFamily: fonts.bodySemi }}>{s.sent_mocked ? "MOCKED" : s.sent_ok ? "DELIVERED" : "PENDING"}</T>
                  </View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>To {s.recipient_email} · {new Date(s.sent_at).toLocaleString("en-AU")}</T>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function NewComplaintModal({ visible, pid, colors, prefill, onClose, onCreated }: any) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({
    complaint_type: "billing_dispute", severity: "minor", provider_name: prefill?.provider_name || "", provider_email: "",
    subject_matter_summary: "", incident_start_date: "", incident_end_date: "", is_ongoing: false,
    desired_outcome: "correction_of_billing", desired_outcome_notes: "", is_anonymous_acqsc_submission: false, contains_immediate_safety_concerns: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const STEPS = ["What Happened", "Who and When", "Desired Outcome", "Review and Send"];

  const stepValid = step === 0 ? !!form.subject_matter_summary.trim() : step === 1 ? !!form.provider_name.trim() : true;

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      await apiFetch(`/cmp1/participants/${pid}/complaints`, { method: "POST", body: {
        complaint_type: form.complaint_type, severity: form.severity, provider_name: form.provider_name,
        provider_contact_details: form.provider_email ? { email: form.provider_email } : {},
        subject_matter_summary: form.subject_matter_summary,
        incident_start_date: form.incident_start_date || null, incident_end_date: form.incident_end_date || null,
        is_ongoing: form.is_ongoing, desired_outcome: form.desired_outcome, desired_outcome_notes: form.desired_outcome_notes || null,
        is_anonymous_acqsc_submission: form.is_anonymous_acqsc_submission, contains_immediate_safety_concerns: form.contains_immediate_safety_concerns,
      } });
      setStep(0);
      setForm({ complaint_type: "billing_dispute", severity: "minor", provider_name: prefill?.provider_name || "", provider_email: "", subject_matter_summary: "", incident_start_date: "", incident_end_date: "", is_ongoing: false, desired_outcome: "correction_of_billing", desired_outcome_notes: "", is_anonymous_acqsc_submission: false, contains_immediate_safety_concerns: false });
      onCreated();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to save complaint"); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.bg }]} testID="cmp1-new-modal">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 17, color: colors.text }}>New Complaint · Step {step + 1} of 4</T>
            <Pressable testID="cmp1-new-cancel" onPress={onClose} hitSlop={10}><X size={22} color={colors.muted} /></Pressable>
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>{STEPS[step]}. A LOOP-1 case is opened automatically when you finish.</T>
          <View style={{ flexDirection: "row", gap: 4, marginTop: spacing.sm }} testID="cmp1-wizard-steps">
            {STEPS.map((s, i) => <View key={s} testID={`cmp1-wizard-step-${i}`} style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.surface2 }} />)}
          </View>

          <ScrollView style={{ maxHeight: 420, marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            {error ? <T variant="small" style={{ color: colors.terracotta }} testID="cmp1-new-error">{error}</T> : null}

            {step === 0 ? (
              <View testID="cmp1-wizard-content-0" style={{ gap: spacing.sm }}>
                <Select label="Complaint type" value={form.complaint_type} onChange={(v: string) => set({ complaint_type: v })} options={COMPLAINT_TYPES} testID="cmp1-new-type" />
                {form.complaint_type === "elder_abuse" ? (
                  <View testID="cmp1-new-elder-safeguard" style={{ backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: spacing.sm }}>
                    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}><ShieldAlert size={13} color={colors.terracotta} /><T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.terracotta }}>Elder Abuse Safeguard</T></View>
                    <T variant="small" style={{ color: colors.text, marginTop: 4, lineHeight: 17 }}>If there is immediate safety concern, phone 000. For confidential guidance the Elder Abuse Helpline is 1800 353 374. Speaking to them doesn&apos;t commit you to anything.</T>
                  </View>
                ) : null}
                <View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>What happened (in your own words)</T>
                  <TextInput testID="cmp1-new-subject" value={form.subject_matter_summary} onChangeText={(v) => set({ subject_matter_summary: v })} multiline placeholder="A few sentences on what went wrong and roughly when." placeholderTextColor={colors.muted}
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 100, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg }} />
                </View>
                <Select label="Severity" value={form.severity} onChange={(v: string) => set({ severity: v })} options={SEVERITIES} testID="cmp1-new-severity" />
                <CheckRow label="This includes an immediate safety concern" checked={form.contains_immediate_safety_concerns} onToggle={() => set({ contains_immediate_safety_concerns: !form.contains_immediate_safety_concerns })} testID="cmp1-new-safety" colors={colors} />
              </View>
            ) : null}

            {step === 1 ? (
              <View testID="cmp1-wizard-content-1" style={{ gap: spacing.sm }}>
                <LInput label="Provider name" value={form.provider_name} onChangeText={(v: string) => set({ provider_name: v })} placeholder="e.g. BlueBerry Care" testID="cmp1-new-provider-name" colors={colors} />
                <LInput label="Provider email (optional)" value={form.provider_email} onChangeText={(v: string) => set({ provider_email: v })} placeholder="complaints@provider.com.au" testID="cmp1-new-provider-email" colors={colors} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <LInput label="Incident start (YYYY-MM-DD)" value={form.incident_start_date} onChangeText={(v: string) => set({ incident_start_date: v })} placeholder="2026-01-01" testID="cmp1-new-start-date" colors={colors} />
                  <LInput label="Incident end (YYYY-MM-DD)" value={form.incident_end_date} onChangeText={(v: string) => set({ incident_end_date: v })} placeholder="2026-01-31" testID="cmp1-new-end-date" colors={colors} disabled={form.is_ongoing} />
                </View>
                <CheckRow label="This is still happening" checked={form.is_ongoing} onToggle={() => set({ is_ongoing: !form.is_ongoing })} testID="cmp1-new-ongoing" colors={colors} />
              </View>
            ) : null}

            {step === 2 ? (
              <View testID="cmp1-wizard-content-2" style={{ gap: spacing.sm }}>
                <Select label="Desired outcome" value={form.desired_outcome} onChange={(v: string) => set({ desired_outcome: v })} options={DESIRED_OUTCOMES} testID="cmp1-new-outcome" />
                <View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Additional outcome notes (optional)</T>
                  <TextInput testID="cmp1-new-outcome-notes" value={form.desired_outcome_notes} onChangeText={(v) => set({ desired_outcome_notes: v })} multiline placeholder="Anything specific you want as a result?" placeholderTextColor={colors.muted}
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 70, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg }} />
                </View>
                <CheckRow label="If this escalates to ACQSC, submit anonymously" checked={form.is_anonymous_acqsc_submission} onToggle={() => set({ is_anonymous_acqsc_submission: !form.is_anonymous_acqsc_submission })} testID="cmp1-new-anonymous" colors={colors} />
              </View>
            ) : null}

            {step === 3 ? (
              <View testID="cmp1-wizard-content-3" style={{ gap: 6 }}>
                <T variant="small" style={{ color: colors.muted }}>Review, then open the complaint. You can keep editing after it opens.</T>
                {[["Type", COMPLAINT_TYPES.find((t) => t.value === form.complaint_type)?.label], ["Severity", SEVERITIES.find((s) => s.value === form.severity)?.label], ["Provider", form.provider_name], ["Timing", form.is_ongoing ? "Still happening" : `${form.incident_start_date || "?"} → ${form.incident_end_date || "?"}`], ["Outcome", DESIRED_OUTCOMES.find((o) => o.value === form.desired_outcome)?.label], ["Description", form.subject_matter_summary]].map(([k, v]) => (
                  <View key={k as string} style={{ flexDirection: "row", gap: spacing.sm }}>
                    <T variant="small" style={{ color: colors.muted, width: 90 }}>{k}</T>
                    <T variant="small" style={{ color: colors.text, flex: 1 }}>{(v as string) || "—"}</T>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            {step > 0 ? <Button label="Back" variant="outline" testID="cmp1-wizard-back" onPress={() => setStep((s) => Math.max(0, s - 1))} style={{ flexGrow: 1 }} /> : null}
            {step < 3 ? (
              <Button label="Next" testID="cmp1-wizard-next" disabled={!stepValid} onPress={() => setStep((s) => Math.min(3, s + 1))} style={{ flexGrow: 1 }} />
            ) : (
              <Button label="Open Complaint" testID="cmp1-new-submit" loading={submitting} onPress={submit} style={{ flexGrow: 1 }} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
});
