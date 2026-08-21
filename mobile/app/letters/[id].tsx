import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Sparkles, AlertTriangle, FileText, Copy, Link as LinkIcon, ThumbsUp, ThumbsDown,
  ShieldCheck, Users, Paperclip, X, ClipboardCheck, Send, Info, Trash2, MailCheck,
  CheckCircle2, PenLine, Download, MessageSquare,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";

import { AppHeader, Badge, Button, Card, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { sharePostPdf } from "@/src/lib/download";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

// ---------------------------------------------------------------------------
// Option constants (mirror web LetterGeneration.jsx)
// ---------------------------------------------------------------------------
const CHANGE_TYPE_OPTIONS = [
  { value: "condition_change", label: "Condition has changed" },
  { value: "post_hospital", label: "Post-hospital reassessment" },
  { value: "care_plan_amendment", label: "Care plan amendment" },
  { value: "representative_update", label: "Update recorded representative" },
  { value: "other", label: "Other" },
];
const DISPUTE_TYPE_OPTIONS = [
  { value: "charge_disputed", label: "Charge on statement" },
  { value: "assessment_outcome", label: "Assessment outcome" },
  { value: "classification", label: "Classification decision" },
  { value: "other", label: "Other" },
];
const COMPLAINT_CATEGORY_OPTIONS = [
  { value: "care_quality", label: "Care quality" },
  { value: "service_delivery", label: "Service delivery" },
  { value: "communication", label: "Communication" },
  { value: "financial", label: "Financial / billing" },
  { value: "worker_conduct", label: "Worker conduct" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];
const NOTIFICATION_TYPE_OPTIONS = [
  { value: "hardship", label: "Financial hardship" },
  { value: "provider_transfer", label: "Provider or care manager change" },
  { value: "representative_change", label: "Recorded representative update" },
  { value: "contact_details", label: "Contact details update" },
  { value: "other", label: "Other" },
];
const SAFEGUARDING_CATEGORY_OPTIONS = [
  { value: "financial_abuse", label: "Financial abuse" },
  { value: "physical_neglect", label: "Physical neglect" },
  { value: "medication_concern", label: "Medication concern" },
  { value: "isolation_or_coercion", label: "Isolation or coercion" },
  { value: "worker_conduct", label: "Worker conduct" },
  { value: "other", label: "Other" },
];
const RESPONSE_STANCE_OPTIONS = [
  { value: "accept", label: "Accept their position" },
  { value: "refute", label: "Refute their position" },
  { value: "ask_for_info", label: "Ask for more information" },
  { value: "escalate", label: "Escalate the matter" },
];
const COMPLAINT_MODE_OPTIONS = [
  { value: "open", label: "Open", detail: "Full identity in the letter and signature." },
  { value: "confidential", label: "Confidential", detail: "Identity retained; asks the recipient to treat as confidential." },
  { value: "anonymous", label: "Anonymous", detail: "Complainant identity stripped. ACQSC can investigate but cannot contact you for more information." },
];
const INBOUND_SOURCE_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "portal", label: "MAC / provider portal" },
  { value: "post", label: "Letter / post" },
  { value: "phone_note", label: "Phone call (my note)" },
];
const RECIPIENT_LABEL: Record<string, string> = {
  provider_cm: "Provider (Care Manager)", provider: "Provider", provider_senior: "Provider (Senior)",
  mac: "My Aged Care", acqsc: "ACQSC", ombudsman: "Ombudsman", services_australia: "Services Australia",
};

function humanise(f: string) {
  return f.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------
function LField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing.sm }}>
      <T variant="small" style={{ marginBottom: 5, color: colors.text, fontFamily: fonts.bodySemi }}>{label}</T>
      {children}
      {hint ? <T variant="small" style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>{hint}</T> : null}
    </View>
  );
}

function LInput({ value, onChangeText, placeholder, testID, textarea }: { value?: string; onChangeText: (v: string) => void; placeholder?: string; testID?: string; textarea?: boolean }) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value || ""}
      onChangeText={onChangeText}
      multiline={textarea}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={[styles.input, textarea && { minHeight: 100, textAlignVertical: "top", paddingTop: 10 }, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
    />
  );
}

// ---------------------------------------------------------------------------
// Evidence upload (metadata only, mirrors web EvidenceUpload)
// ---------------------------------------------------------------------------
function EvidenceUpload({ intake, set }: { intake: any; set: (patch: any) => void }) {
  const { colors } = useTheme();
  const items: any[] = intake?.evidence_items || [];
  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: false });
      if (res.canceled) return;
      const next = [...items];
      for (const f of res.assets || []) {
        next.push({ id: `${f.name}-${f.size || 0}-${Date.now()}`, filename: f.name, size_bytes: f.size || 0, content_type: f.mimeType || "", note: "" });
      }
      set({ evidence_items: next });
    } catch { /* cancelled */ }
  };
  const remove = (id: string) => set({ evidence_items: items.filter((it) => it.id !== id) });
  const noteFor = (id: string, note: string) => set({ evidence_items: items.map((it) => it.id === id ? { ...it, note } : it) });
  return (
    <View style={{ marginTop: spacing.sm }} testID="lf1-evidence-upload">
      <T variant="small" style={{ marginBottom: 5, color: colors.text, fontFamily: fonts.bodySemi }}>Evidence (optional)</T>
      <Pressable testID="lf1-evidence-attach" onPress={pick} style={[styles.dashed, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
        <Paperclip size={16} color={colors.muted} />
        <T variant="small" style={{ color: colors.muted, flex: 1 }}>Attach photos, letters, or notes. Wayly references them by name.</T>
      </Pressable>
      {items.map((it) => (
        <View key={it.id} style={[styles.evItem, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="small" style={{ flex: 1, color: colors.text }} numberOfLines={1}>{it.filename}</T>
            <Pressable testID={`lf1-evidence-remove-${it.id}`} onPress={() => remove(it.id)} hitSlop={8}><X size={16} color={colors.muted} /></Pressable>
          </View>
          <TextInput
            testID={`lf1-evidence-note-${it.id}`}
            value={it.note || ""}
            onChangeText={(v) => noteFor(it.id, v)}
            placeholder="Short note about this file"
            placeholderTextColor={colors.muted}
            style={[styles.input, { marginTop: 6, minHeight: 40, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          />
        </View>
      ))}
    </View>
  );
}

function NotesField({ intake, set }: { intake: any; set: (patch: any) => void }) {
  return (
    <LField label="Notes for Wayly (optional)" hint="Anything else Wayly should know about tone, deadlines, or context. Not included verbatim.">
      <LInput value={intake?.notes} onChangeText={(v) => set({ notes: v })} placeholder="e.g. Prefer a firm-but-polite tone." testID="lf1-intake-notes" textarea />
    </LField>
  );
}

// ---------------------------------------------------------------------------
// Archetype-specific intake form
// ---------------------------------------------------------------------------
function ArchetypeIntake({ archetype, intake, set }: { archetype: string; intake: any; set: (patch: any) => void; missing: string[] }) {
  const { colors } = useTheme();
  if (archetype === "request") {
    return (
      <View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} placeholder="e.g. Louisa Davids" testID="lf1-intake-participant-input" /></LField>
        <LField label="Type of request"><Select value={intake?.change_type} onChange={(v) => set({ change_type: v })} options={CHANGE_TYPE_OPTIONS} placeholder="Choose one" testID="lf1-intake-change-type-select" /></LField>
        <LField label="What has changed and what are you asking for?"><LInput value={intake?.change_summary} onChangeText={(v) => set({ change_summary: v })} placeholder="e.g. Since her hospital stay in January Mum needs help with showering." testID="lf1-intake-change-summary-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "dispute") {
    return (
      <View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} testID="lf1-intake-participant-input" /></LField>
        <LField label="What are you disputing?"><Select value={intake?.dispute_type} onChange={(v) => set({ dispute_type: v })} options={DISPUTE_TYPE_OPTIONS} placeholder="Choose one" testID="lf1-intake-dispute-type-select" /></LField>
        <LField label="Reference or statement number (if any)"><LInput value={intake?.reference_number} onChangeText={(v) => set({ reference_number: v })} placeholder="e.g. Statement STM-04-0201-D0" testID="lf1-intake-ref-input" /></LField>
        <LField label="Summary of the disputed item"><LInput value={intake?.disputed_charge_summary} onChangeText={(v) => set({ disputed_charge_summary: v })} placeholder="e.g. The 4 Feb visit was billed at a weekend rate but was on a Thursday." testID="lf1-intake-dispute-summary-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "complaint") {
    return (
      <View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} testID="lf1-intake-participant-input" /></LField>
        <LField label="Complaint category"><Select value={intake?.category} onChange={(v) => set({ category: v })} options={COMPLAINT_CATEGORY_OPTIONS} placeholder="Choose one" testID="lf1-intake-complaint-category-select" /></LField>
        <LField label="What happened, when, and how it affected you?"><LInput value={intake?.complaint_summary} onChangeText={(v) => set({ complaint_summary: v })} placeholder="e.g. On 22 January the domestic worker did not attend the scheduled 10am visit." testID="lf1-intake-complaint-summary-input" textarea /></LField>
        <LField label="Have you already raised this? What was the response?"><LInput value={intake?.prior_response} onChangeText={(v) => set({ prior_response: v })} placeholder="e.g. Verbal call on 23 Jan. No written response." testID="lf1-intake-prior-response-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "escalation") {
    const priors: any[] = intake?.prior_attempts || [];
    const addPrior = () => set({ prior_attempts: [...priors, { date: "", recipient: "", summary: "" }] });
    const editPrior = (i: number, patch: any) => set({ prior_attempts: priors.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
    const removePrior = (i: number) => set({ prior_attempts: priors.filter((_, idx) => idx !== i) });
    return (
      <View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} testID="lf1-intake-participant-input" /></LField>
        <LField label="Why are you escalating now? Summary."><LInput value={intake?.escalation_summary} onChangeText={(v) => set({ escalation_summary: v })} placeholder="e.g. Two written complaints have gone unanswered for six weeks." testID="lf1-intake-escalation-summary-input" textarea /></LField>
        <View style={{ marginTop: spacing.sm }} testID="lf1-intake-prior-attempts">
          <T variant="small" style={{ color: colors.text, fontFamily: fonts.bodySemi }}>Prior attempts to resolve</T>
          <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.xs, fontSize: 12 }}>List each previous contact; Wayly weaves them into the chronology.</T>
          {priors.map((p, i) => (
            <View key={i} style={[styles.priorCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <LInput value={p.date} onChangeText={(v) => editPrior(i, { date: v })} placeholder="Date (e.g. 12 Jan 2026)" testID={`lf1-prior-date-${i}`} />
              <View style={{ height: 6 }} />
              <LInput value={p.recipient} onChangeText={(v) => editPrior(i, { recipient: v })} placeholder="Recipient (e.g. Sam, care manager)" testID={`lf1-prior-recipient-${i}`} />
              <View style={{ height: 6 }} />
              <LInput value={p.summary} onChangeText={(v) => editPrior(i, { summary: v })} placeholder="What was said or asked" testID={`lf1-prior-summary-${i}`} textarea />
              <Pressable testID={`lf1-prior-remove-${i}`} onPress={() => removePrior(i)} style={{ alignSelf: "flex-end", marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <X size={13} color={colors.muted} /><T variant="small" style={{ color: colors.muted, fontSize: 12 }}>Remove</T>
              </Pressable>
            </View>
          ))}
          <Button label="+ Add a prior contact" variant="outline" testID="lf1-prior-add" onPress={addPrior} style={{ minHeight: 42, marginTop: spacing.sm }} />
        </View>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "notification") {
    return (
      <View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} testID="lf1-intake-participant-input" /></LField>
        <LField label="Notification type"><Select value={intake?.notification_type} onChange={(v) => set({ notification_type: v })} options={NOTIFICATION_TYPE_OPTIONS} placeholder="Choose one" testID="lf1-intake-notification-type-select" /></LField>
        <LField label="Effective date (optional)"><LInput value={intake?.effective_date} onChangeText={(v) => set({ effective_date: v })} placeholder="e.g. 1 March 2026" testID="lf1-intake-effective-date-input" /></LField>
        <LField label="What are you notifying them of?"><LInput value={intake?.notification_summary} onChangeText={(v) => set({ notification_summary: v })} placeholder="e.g. Mum can no longer afford the current contribution." testID="lf1-intake-notification-summary-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "response_draft") {
    return (
      <View>
        <LField label="Who is this reply going to?"><LInput value={intake?.inbound_from} onChangeText={(v) => set({ inbound_from: v })} placeholder="e.g. Sam, care manager at BlueBerry Care" testID="lf1-intake-inbound-from-input" /></LField>
        <LField label="Your stance on their message"><Select value={intake?.stance} onChange={(v) => set({ stance: v })} options={RESPONSE_STANCE_OPTIONS} placeholder="Choose one" testID="lf1-intake-stance-select" /></LField>
        <LField label="Paste or summarise what they sent you"><LInput value={intake?.inbound_summary} onChangeText={(v) => set({ inbound_summary: v })} placeholder="Paste the email, letter, or SMS here, or summarise in a few lines." testID="lf1-intake-inbound-summary-input" textarea /></LField>
        <LField label="Points you want to make in your reply"><LInput value={intake?.response_points} onChangeText={(v) => set({ response_points: v })} placeholder="Bullet points work." testID="lf1-intake-response-points-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  if (archetype === "guided_pathway") {
    return (
      <View>
        <View style={[styles.softNote, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
          <ShieldCheck size={16} color={colors.gold} style={{ marginTop: 2 }} />
          <T variant="small" style={{ flex: 1, lineHeight: 20 }}>This is a structured safeguarding record, a factual account you can keep or attach to a formal complaint later. It is not a persuasion letter.</T>
        </View>
        <LField label="Participant name"><LInput value={intake?.participant_name} onChangeText={(v) => set({ participant_name: v })} testID="lf1-intake-participant-input" /></LField>
        <LField label="Category of concern"><Select value={intake?.category} onChange={(v) => set({ category: v })} options={SAFEGUARDING_CATEGORY_OPTIONS} placeholder="Choose one" testID="lf1-intake-safeguarding-category-select" /></LField>
        <LField label="What did you observe? When?"><LInput value={intake?.observation} onChangeText={(v) => set({ observation: v })} placeholder="Set out what you saw, when, who was involved. Stick to facts." testID="lf1-intake-safeguarding-observation-input" textarea /></LField>
        <LField label="Which phone lines have you already called?"><LInput value={intake?.phone_calls_made} onChangeText={(v) => set({ phone_calls_made: v })} placeholder="e.g. Called 1800ELDERHelp on 12 Feb." testID="lf1-intake-safeguarding-calls-input" textarea /></LField>
        <EvidenceUpload intake={intake} set={set} />
        <NotesField intake={intake} set={set} />
      </View>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cross-tool import panel (mirrors web CrossToolImportPanel)
// ---------------------------------------------------------------------------
function CrossToolPanel({ entryId, onImport }: { entryId: string; onImport: (data: any) => void }) {
  const { colors } = useTheme();
  const [signals, setSignals] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ signals: any }>("/lf1/cross-tool-signals")
      .then((r) => { if (!cancelled) setSignals(r?.signals || {}); })
      .catch(() => { if (!cancelled) setSignals({}); });
    return () => { cancelled = true; };
  }, []);

  const attach = async (tool: string, record_id: string, fields: any, note: string) => {
    setBusy(tool); setError(null);
    try {
      const data = await apiFetch(`/lf1/correspondence/${entryId}/attach-source`, { method: "POST", body: { tool, record_id, fields, note } });
      onImport(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not import from that tool.");
    } finally { setBusy(null); }
  };

  if (signals === null) return <T variant="small" style={{ color: colors.muted }} testID="lf1-cross-tool-loading">Checking your other tools…</T>;

  const chips: { key: string; label: string; detail: string; onPress: () => void }[] = [];
  if (signals.statement_decoder) {
    const s = signals.statement_decoder;
    chips.push({ key: "statement_decoder", label: `Statement · ${s.period_label || "recent"}`, detail: `${s.line_item_count} line items, ${(s.top_anomalies || []).length} anomalies`, onPress: () => attach("statement_decoder", s.statement_id || "recent", { statement_period: s.period_label, statement_line_item_count: s.line_item_count, statement_anomaly_count: (s.top_anomalies || []).length }, "Imported from Statement Decoder") });
  }
  if (signals.care_plan_reviewer) {
    const s = signals.care_plan_reviewer;
    chips.push({ key: "care_plan_reviewer", label: `Care plan · ${s.provider_name || "recent"}`, detail: `${s.findings_count || 0} findings`, onPress: () => attach("care_plan_reviewer", s.care_plan_id || "recent", { care_plan_provider: s.provider_name, care_plan_findings_count: s.findings_count }, "Imported from Support Plan Reviewer") });
  }
  if (signals.provider_price_checker) {
    const recent = signals.provider_price_checker.recent_checks?.[0];
    if (recent) chips.push({ key: "provider_price_checker", label: `Price check · ${recent.service}`, detail: `${recent.provider} at $${recent.rate}`, onPress: () => attach("provider_price_checker", recent.id || "recent", { ppc_service: recent.service, ppc_provider: recent.provider, ppc_rate: recent.rate, ppc_position: recent.position }, "Imported from Provider Price Checker") });
  }
  if (signals.classification_self_check) {
    const s = signals.classification_self_check;
    chips.push({ key: "classification_self_check", label: "Classification check", detail: `Current ${s.current_class || "?"} · suggested ${s.suggested_class || "?"}`, onPress: () => attach("classification_self_check", "recent", { current_classification: s.current_class, suggested_classification: s.suggested_class }, "Imported from Classification Self-Check") });
  }
  if (signals.contribution_estimator) {
    const s = signals.contribution_estimator;
    chips.push({ key: "contribution_estimator", label: "Contribution estimate", detail: `${s.pension_status || "?"} · Class ${s.classification || "?"}`, onPress: () => attach("contribution_estimator", "recent", { pension_status: s.pension_status, is_grandfathered: s.is_grandfathered, ce_classification: s.classification }, "Imported from Contribution Estimator") });
  }

  if (!chips.length) return <T variant="small" style={{ color: colors.muted, fontStyle: "italic" }} testID="lf1-cross-tool-empty">No pre-fill data from your other tools yet. As you use Statement Decoder, Support Plan Reviewer, or Price Checker, quick-import chips appear here.</T>;

  return (
    <View testID="lf1-cross-tool-panel">
      <T variant="label" style={{ color: colors.muted, marginBottom: spacing.sm }}>PRE-FILL FROM YOUR OTHER TOOLS</T>
      {error ? <T variant="small" style={{ color: colors.terracotta, marginBottom: spacing.sm }} testID="lf1-cross-tool-error">{error}</T> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {chips.map((c) => (
          <Pressable key={c.key} testID={`lf1-import-${c.key}`} disabled={busy === c.key} onPress={c.onPress}
            style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.surface2 }, busy === c.key && { opacity: 0.5 }]}>
            <LinkIcon size={13} color={colors.primary} />
            <T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>{c.label}</T>
            <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>· {c.detail}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function CorrespondenceDetail() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [intake, setIntake] = useState<Record<string, any>>({});
  const [senderAuthority, setSenderAuthority] = useState("");
  const [complaintMode, setComplaintMode] = useState("open");
  const [atsi, setAtsi] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedHint, setSavedHint] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);
  const [emailedSelf, setEmailedSelf] = useState(false);
  const [outMode, setOutMode] = useState<"email" | "mac_portal">("email");

  // follow-up + reply modal
  const [replyOpen, setReplyOpen] = useState(false);
  const firstLoad = useRef(true);

  const load = async () => {
    setLoadError(false); setLoading(true);
    try {
      const data = await apiFetch<any>(`/lf1/correspondence/${id}`);
      const e = data?.entry || data;
      setEntry(e);
      const existing = { ...(e?.intake || {}) };
      if (!existing.participant_name && active?.display_name) existing.participant_name = active.display_name;
      setIntake(existing);
      setSenderAuthority(e?.sender_authority_basis || "");
      setComplaintMode(e?.complaint_mode || "open");
      setAtsi(Boolean(e?.atsi_preference));
      setTermsAck(Boolean(e?.terms_ack));
      if (e?.content_draft) {
        setDraft({ subject: (e.intake && e.intake.subject) || "", body: e.content_draft, mac_portal_short_form: (e.content_draft || "").slice(0, 1200), cover_note: null });
      }
    } catch { setLoadError(true); }
    finally { setLoading(false); firstLoad.current = false; }
  };
  useEffect(() => { if (id) load(); }, [id]);

  const archetype = entry?.archetype || "request";
  const isGuided = archetype === "guided_pathway";
  const isResponseDraft = archetype === "response_draft" || entry?.situation_id === 12;
  const supportsComplaintMode = ["complaint", "escalation", "guided_pathway"].includes(archetype);
  const isReassessment = archetype === "request" && [1, 2].includes(entry?.situation_id);

  const set = useCallback((patch: any) => { setIntake((s) => ({ ...s, ...patch })); setDirty(true); }, []);

  // Debounced autosave (mirrors web WS8 T31)
  useEffect(() => {
    if (!entry || !dirty) return;
    const t = setTimeout(() => {
      apiFetch(`/lf1/correspondence/${id}/autosave`, { method: "PATCH", body: { intake, sender_authority_basis: senderAuthority, complaint_mode: complaintMode, atsi_preference: atsi } })
        .then(() => { setSavedHint("Saved"); setTimeout(() => setSavedHint(""), 1800); })
        .catch(() => {});
      setDirty(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [intake, senderAuthority, complaintMode, atsi, dirty, entry, id]);

  const onImported = (data: any) => {
    setIntake((prev) => ({ ...(prev || {}), ...(data?.intake || {}) }));
    setSavedHint("Imported"); setTimeout(() => setSavedHint(""), 1800);
  };

  const acknowledgeTerms = async (checked: boolean) => {
    setTermsAck(checked);
    try { await apiFetch(`/lf1/correspondence/${id}`, { method: "PATCH", body: { terms_ack: checked } }); } catch { /* noop */ }
  };

  const generate = async () => {
    setBusy(true); setError(""); setMissing([]);
    try {
      let payload: any;
      if (isGuided) payload = await apiFetch(`/lf1/correspondence/${id}/safeguarding-record`, { method: "POST", body: { intake, persist: true } });
      else if (isResponseDraft) payload = await apiFetch(`/lf1/correspondence/${id}/response-draft`, { method: "POST", body: { inbound_content: intake?.inbound_summary || "", inbound_from_label: intake?.inbound_from || null, stance: intake?.stance || null } });
      else payload = await apiFetch(`/lf1/correspondence/${id}/generate`, { method: "POST", body: { intake, persist: true } });
      setDraft(payload);
      setOutMode("email");
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && (e.data?.detail?.missing_fields || e.data?.missing_fields)) {
        setMissing(e.data?.detail?.missing_fields || e.data?.missing_fields);
        setError("Please fill in the highlighted fields before generating.");
      } else {
        setError(e instanceof ApiError ? e.message : "Draft generation is temporarily unavailable.");
      }
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!draft?.body) return;
    const text = outMode === "email" ? `${draft.subject ? `Subject: ${draft.subject}\n\n` : ""}${draft.body}` : (draft.mac_portal_short_form || draft.body);
    await Clipboard.setStringAsync(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const downloadPdf = async () => {
    setBusyPdf(true); setError("");
    try { await sharePostPdf(`/lf1/correspondence/${id}/pdf`, {}, `wayly-letter-${archetype}.pdf`); }
    catch { setError("Could not export the PDF."); }
    finally { setBusyPdf(false); }
  };

  const emailSelf = async () => {
    setBusyEmail(true); setError("");
    try { await apiFetch(`/lf1/correspondence/${id}/email`, { method: "POST", body: {} }); setEmailedSelf(true); }
    catch (e) { setError(e instanceof ApiError && e.status !== 502 ? e.message : "We couldn't email it just now. Try PDF instead."); }
    finally { setBusyEmail(false); }
  };

  const markSent = async () => {
    try { const r = await apiFetch<any>(`/lf1/correspondence/${id}`, { method: "PATCH", body: { status: "sent" } }); setEntry(r?.entry || r); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not mark as sent."); }
  };

  const doDelete = async () => {
    try { await apiFetch(`/lf1/correspondence/${id}`, { method: "DELETE" }); router.replace("/letters"); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed."); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Letter" onBack={() => router.back()} /><Loading label="Loading…" /></View>;
  if (loadError || !entry) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Letter" onBack={() => router.back()} /><StatePanel testID="lf-detail-error" icon={FileText} title="Couldn't load this letter" actionLabel="Retry" onAction={load} /></View>;

  const displayBody = outMode === "email" ? draft?.body : (draft?.mac_portal_short_form || draft?.body);
  const canDelete = entry.status !== "sent";
  const canMarkSent = draft && ["draft", "awaiting_response"].includes(entry.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={isGuided ? "Safeguarding record" : "Draft your letter"} onBack={() => router.back()} right={
        <Pressable testID="lf-log-link" onPress={() => router.push("/letters")} hitSlop={8}><FileText size={20} color={colors.primary} /></Pressable>
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">

          {/* Summary */}
          <Card testID="lf-detail-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{entry.situation_label}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 4 }}>
              To {RECIPIENT_LABEL[entry.recipient_type] || entry.recipient_type || "recipient"}
              {entry.expected_response_by ? ` · reply expected by ${new Date(entry.expected_response_by).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </T>
            {entry.status ? <View style={{ marginTop: spacing.sm, flexDirection: "row" }}><Badge label={String(entry.status).replace(/_/g, " ").toUpperCase()} tone={entry.status === "sent" ? "success" : entry.status === "responded" ? "brand" : "neutral"} /></View> : null}
          </Card>

          {/* Cross-tool import (skip for guided pathway, mirrors web) */}
          {!isGuided ? (
            <Card testID="lf1-cross-tool-card"><CrossToolPanel entryId={String(id)} onImport={onImported} /></Card>
          ) : null}

          {/* Sender authority */}
          <Card testID="lf1-sender-authority">
            <T variant="label" style={{ color: colors.muted }}>SENDER AUTHORITY</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm, lineHeight: 19 }}>If you are writing on behalf of someone else, tell us the relationship or authority basis (e.g. adult daughter and recorded representative, or Enduring Power of Attorney dated 3 March 2024).</T>
            <LInput value={senderAuthority} onChangeText={(v) => { setSenderAuthority(v); setDirty(true); }} placeholder="e.g. Adult daughter, POA dated 3 March 2024" testID="lf1-detail-sender-authority" textarea />
          </Card>

          {/* Complaint mode */}
          {supportsComplaintMode ? (
            <Card testID="lf1-detail-complaint-mode">
              <T variant="label" style={{ color: colors.muted }}>COMPLAINT MODE</T>
              <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>How much of your identity would you like included in the letter?</T>
              <View style={{ gap: spacing.sm }}>
                {COMPLAINT_MODE_OPTIONS.map((opt) => {
                  const activeOpt = complaintMode === opt.value;
                  return (
                    <Pressable key={opt.value} testID={`lf1-complaint-mode-${opt.value}`} onPress={() => { setComplaintMode(opt.value); setDirty(true); }}
                      style={[styles.modeCard, { borderColor: activeOpt ? colors.primary : colors.border, backgroundColor: activeOpt ? colors.primary : colors.surface }]}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: activeOpt ? "#fff" : colors.text }}>{opt.label}</T>
                      <T variant="small" style={{ marginTop: 2, color: activeOpt ? "rgba(255,255,255,0.85)" : colors.muted, fontSize: 12, lineHeight: 17 }}>{opt.detail}</T>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* ATSI toggle */}
          {isReassessment ? (
            <Card testID="lf1-detail-atsi">
              <Pressable testID="lf1-detail-atsi-checkbox" onPress={() => { setAtsi((v) => !v); setDirty(true); }} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
                <Checkbox checked={atsi} colors={colors} />
                <T variant="small" style={{ flex: 1, lineHeight: 20 }}>Would you like this reassessment to be conducted by an Aboriginal and Torres Strait Islander assessment organisation where available?</T>
              </Pressable>
            </Card>
          ) : null}

          {/* Intake form */}
          <Card testID="lf1-intake-form">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="label" style={{ color: colors.muted }}>TELL US THE DETAILS</T>
              {savedHint ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} color={colors.sage} /><T variant="small" style={{ color: colors.muted, fontSize: 12 }} testID="lf1-detail-autosave-hint">{savedHint}</T></View> : null}
            </View>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.xs }}>Wayly only uses the facts you enter here. Nothing is invented.</T>
            <ArchetypeIntake archetype={archetype} intake={intake} set={set} missing={missing} />
          </Card>

          {/* Terms ack */}
          <Card testID="lf1-detail-terms">
            <Pressable testID="lf1-detail-terms-checkbox" onPress={() => acknowledgeTerms(!termsAck)} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <Checkbox checked={termsAck} colors={colors} />
              <T variant="small" style={{ flex: 1, lineHeight: 20 }}>I understand Wayly's Letters &amp; Follow-ups is a drafting assistant, not legal advice. I'm responsible for reviewing this letter before sending it.</T>
            </Pressable>
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }} testID="lf1-error">{error}</T></View> : null}
          {missing.length ? (
            <View style={[styles.softNote, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]} testID="lf1-missing-fields">
              <Info size={16} color={colors.gold} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <T variant="small" style={{ fontFamily: fonts.bodySemi }}>Need a little more info first:</T>
                {missing.map((f) => <T key={f} variant="small" style={{ color: colors.muted, fontSize: 12 }}>• {humanise(f)}</T>)}
              </View>
            </View>
          ) : null}

          <Button label={draft ? "Regenerate draft" : (isGuided ? "Build safeguarding record" : isResponseDraft ? "Draft my reply" : "Generate draft")} testID="lf1-generate-button" icon={isGuided ? ShieldCheck : Sparkles} onPress={generate} loading={busy} />

          {/* Generated output */}
          {draft ? (
            <>
              {/* Cover note */}
              {draft.cover_note ? (
                <Card testID="lf1-cover-note">
                  <T variant="label" style={{ color: colors.muted }}>COVER NOTE</T>
                  <T variant="small" style={{ marginTop: 6 }}><T variant="small" style={{ color: colors.muted }}>To: </T>{draft.cover_note.entity_name || "Recipient"}</T>
                  {draft.cover_note.email ? <T variant="small" style={{ marginTop: 2 }}><T variant="small" style={{ color: colors.muted }}>Email: </T>{draft.cover_note.email}</T> : null}
                  {draft.cover_note.response_window_label ? <T variant="small" style={{ marginTop: 6, fontStyle: "italic", color: colors.muted }}>Expected: {draft.cover_note.response_window_label}</T> : null}
                </Card>
              ) : null}

              <Card testID="lf1-draft">
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
                  <T variant="label" style={{ color: colors.muted }}>YOUR DRAFT</T>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Button label={copied ? "Copied" : "Copy"} variant="outline" icon={Copy} testID="lf1-copy" onPress={copy} style={{ minHeight: 38, paddingHorizontal: spacing.md }} />
                    <Button label="PDF" variant="outline" icon={Download} testID="lf1-format-pdf" onPress={downloadPdf} loading={busyPdf} style={{ minHeight: 38, paddingHorizontal: spacing.md }} />
                    <Button label={emailedSelf ? "Emailed" : "Email me"} variant="outline" icon={MailCheck} testID="lf1-email-self" onPress={emailSelf} loading={busyEmail} disabled={emailedSelf} style={{ minHeight: 38, paddingHorizontal: spacing.md }} />
                  </View>
                </View>
                {/* Format switcher */}
                {draft.mac_portal_short_form ? (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                    <FormatBtn label="Email body" activeMode={outMode === "email"} onPress={() => setOutMode("email")} testID="lf1-format-email" colors={colors} />
                    <FormatBtn label="MAC portal" activeMode={outMode === "mac_portal"} onPress={() => setOutMode("mac_portal")} testID="lf1-format-mac-portal" colors={colors} />
                  </View>
                ) : null}
                {outMode === "email" && draft.subject ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: spacing.md }} testID="lf1-generated-subject">Subject: {draft.subject}</T> : null}
                <T selectable style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text, marginTop: spacing.sm }} testID={outMode === "email" ? "lf1-generated-body" : "lf1-generated-portal"}>{sanitizeAI(displayBody || "")}</T>
                {outMode === "mac_portal" ? <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, fontStyle: "italic", fontSize: 12 }}>MAC portal caps free-text at ~1200 characters. This condenses the full letter to fit.</T> : null}
                <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, fontStyle: "italic" }}>Review every line before sending. Wayly does not send letters for you.</T>
              </Card>

              {/* Feedback */}
              <FeedbackChip entryId={String(id)} existing={entry?.feedback} />

              {/* Tone check */}
              {["complaint", "escalation", "guided_pathway"].includes(archetype) ? (
                <ToneCheckPanel entryId={String(id)} body={draft.body} />
              ) : null}

              {/* ADM disclosure */}
              <View style={[styles.admNote, { borderColor: colors.border, backgroundColor: colors.surface2 }]} testID="lf1-automated-decision">
                <Info size={15} color={colors.muted} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1, lineHeight: 19, color: colors.muted, fontSize: 12 }}>This letter was drafted automatically from your intake and the linked tool state above. Read it in full before sending. Wayly Letters and Follow-ups is a drafting assistant, not legal advice.</T>
              </View>
            </>
          ) : null}

          {/* Follow-up actions */}
          <Card testID="lf1-followups">
            <T variant="label" style={{ color: colors.muted }}>FOLLOW-UPS</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>Track where this correspondence is up to.</T>
            <View style={{ gap: spacing.sm }}>
              {canMarkSent ? <Button label="Mark as sent" variant="outline" icon={MailCheck} testID="lf1-mark-sent" onPress={markSent} /> : null}
              <Button label="Log a reply you received" variant="outline" icon={MessageSquare} testID="lf1-log-reply" onPress={() => setReplyOpen(true)} />
            </View>
          </Card>

          {/* Share + sign-off */}
          {!isGuided ? <ShareAndSignOffPanel entry={entry} entryId={String(id)} onUpdated={load} /> : null}

          {/* Delete */}
          {canDelete ? (
            <Pressable testID="lf1-detail-delete" onPress={doDelete} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingVertical: spacing.sm }}>
              <Trash2 size={14} color={colors.muted} /><T variant="small" style={{ color: colors.muted }}>Delete this draft</T>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log inbound reply modal */}
      <LogReplyModal open={replyOpen} onClose={() => setReplyOpen(false)} entryId={String(id)} onLogged={() => { setReplyOpen(false); load(); }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Checkbox({ checked, colors }: { checked: boolean; colors: any }) {
  return (
    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
      {checked ? <CheckCircle2 size={14} color="#fff" /> : null}
    </View>
  );
}

function FormatBtn({ label, activeMode, onPress, testID, colors }: { label: string; activeMode: boolean; onPress: () => void; testID: string; colors: any }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.formatBtn, { borderColor: activeMode ? colors.primary : colors.border, backgroundColor: activeMode ? colors.primary : "transparent" }]}>
      <T variant="small" style={{ color: activeMode ? "#fff" : colors.text, fontSize: 12, fontFamily: fonts.bodySemi }}>{label}</T>
    </Pressable>
  );
}

function FeedbackChip({ entryId, existing }: { entryId: string; existing: any }) {
  const { colors } = useTheme();
  const [rating, setRating] = useState<string | null>(existing?.rating || null);
  const submit = async (r: string) => {
    setRating(r);
    try { await apiFetch(`/lf1/correspondence/${entryId}/feedback`, { method: "POST", body: { rating: r, reason: null } }); } catch { /* silent */ }
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }} testID="lf1-feedback">
      <T variant="small" style={{ color: colors.muted }}>How was this draft?</T>
      <Pressable testID="lf1-feedback-up" onPress={() => submit("up")} style={[styles.fbBtn, { borderColor: rating === "up" ? colors.sage : colors.border, backgroundColor: rating === "up" ? colors.sage : "transparent" }]}>
        <ThumbsUp size={15} color={rating === "up" ? "#fff" : colors.text} />
      </Pressable>
      <Pressable testID="lf1-feedback-down" onPress={() => submit("down")} style={[styles.fbBtn, { borderColor: rating === "down" ? colors.terracotta : colors.border, backgroundColor: rating === "down" ? colors.terracotta : "transparent" }]}>
        <ThumbsDown size={15} color={rating === "down" ? "#fff" : colors.text} />
      </Pressable>
      {rating === "up" ? <T variant="small" style={{ color: colors.muted, fontSize: 12 }} testID="lf1-feedback-saved">Thanks</T> : null}
    </View>
  );
}

function ToneCheckPanel({ entryId, body }: { entryId: string; body: string }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  if (!body) return null;
  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await apiFetch<any>(`/lf1/correspondence/${entryId}/tone-check`, { method: "POST", body: { body } });
      setResult(data?.enabled === false ? { disabled: true } : data);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not run the tone check."); }
    finally { setBusy(false); }
  };
  return (
    <Card testID="lf1-tone-check">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T variant="label" style={{ color: colors.muted }}>TONE CHECK</T>
        <Button label="Review this draft" variant="outline" icon={ClipboardCheck} testID="lf1-tone-check-run" onPress={run} loading={busy} style={{ minHeight: 38, paddingHorizontal: spacing.md }} />
      </View>
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="lf1-tone-check-error">{error}</T> : null}
      {result?.disabled ? <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, fontStyle: "italic" }} testID="lf1-tone-check-disabled">Tone check is temporarily disabled.</T> : null}
      {result && !result.disabled && !result.skipped ? (
        <View style={{ marginTop: spacing.sm, gap: 6 }} testID="lf1-tone-check-result">
          {result.tone && result.tone !== "unknown" ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><T variant="small" style={{ color: colors.muted }}>Tone:</T><Badge label={result.tone} tone="neutral" /></View> : null}
          {(result.concerns || []).map((c: string, i: number) => <T key={i} variant="small" style={{ color: colors.text }}>• {c}</T>)}
          {(result.suggested_edits || []).map((c: string, i: number) => <T key={`e${i}`} variant="small" style={{ color: colors.text }}>✎ {c}</T>)}
          {!(result.concerns || []).length && !(result.suggested_edits || []).length ? <T variant="small" style={{ color: colors.muted, fontStyle: "italic" }}>No specific concerns flagged.</T> : null}
        </View>
      ) : null}
    </Card>
  );
}

function ShareAndSignOffPanel({ entry, entryId, onUpdated }: { entry: any; entryId: string; onUpdated: () => void }) {
  const { colors } = useTheme();
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(entry?.shared_with || []);
  const [requireSignOff, setRequireSignOff] = useState(Boolean(entry?.sign_off_required));
  const [busy, setBusy] = useState(false);
  const [busySign, setBusySign] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<{ members: any[] }>("/household/members").then((r) => setMembers(r?.members || [])).catch(() => setMembers([])); }, []);

  const toggle = (uid: string) => setSelected((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);

  const share = async () => {
    setBusy(true); setError("");
    try { await apiFetch(`/lf1/correspondence/${entryId}/share`, { method: "POST", body: { share_with_user_ids: selected, require_sign_off: requireSignOff, sign_off_message: null } }); onUpdated(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not share this draft."); }
    finally { setBusy(false); }
  };
  const signOff = async () => {
    setBusySign(true); setError("");
    try { await apiFetch(`/lf1/correspondence/${entryId}/sign-off`, { method: "POST", body: { note: null } }); onUpdated(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not record sign-off."); }
    finally { setBusySign(false); }
  };

  return (
    <Card testID="lf1-share-panel">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Users size={16} color={colors.primary} /><T variant="label" style={{ color: colors.muted }}>SHARE WITH FAMILY</T></View>
      {members.length === 0 ? (
        <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, lineHeight: 20 }}>Once you add household members in the Family Coordinator, you can share drafts here for a second pair of eyes.</T>
      ) : (
        <>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {members.map((m) => (
              <Pressable key={m.user_id || m.email} testID={`lf1-share-member-${m.user_id}`} onPress={() => toggle(m.user_id)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Checkbox checked={selected.includes(m.user_id)} colors={colors} />
                <T variant="small" style={{ color: colors.text }}>{m.name || m.email}{m.role ? ` · ${m.role}` : ""}</T>
              </Pressable>
            ))}
          </View>
          <Pressable testID="lf1-share-require-signoff" onPress={() => setRequireSignOff((v) => !v)} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.sm }}>
            <Checkbox checked={requireSignOff} colors={colors} />
            <T variant="small" style={{ flex: 1, lineHeight: 19 }}>Require someone from the household to sign off before sending.</T>
          </Pressable>
          <Button label={(entry?.shared_with || []).length ? "Update share list" : "Share draft"} icon={Send} testID="lf1-share-submit" onPress={share} loading={busy} disabled={selected.length === 0} style={{ marginTop: spacing.sm }} />
          {entry?.sign_off_required && !entry?.sign_off_by ? <Button label="Sign off" variant="outline" icon={PenLine} testID="lf1-signoff-submit" onPress={signOff} loading={busySign} style={{ marginTop: spacing.sm }} /> : null}
          {entry?.sign_off_by ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }} testID="lf1-signoff-status"><PenLine size={13} color={colors.sage} /><T variant="small" style={{ color: colors.sage }}>Signed off{entry?.sign_off_at ? ` on ${new Date(entry.sign_off_at).toLocaleDateString("en-AU")}` : ""}</T></View> : null}
        </>
      )}
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="lf1-share-error">{error}</T> : null}
    </Card>
  );
}

function LogReplyModal({ open, onClose, entryId, onLogged }: { open: boolean; onClose: () => void; entryId: string; onLogged: () => void }) {
  const { colors } = useTheme();
  const [source, setSource] = useState("email");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!content.trim()) { setError("Please paste or summarise the reply you received."); return; }
    setBusy(true); setError("");
    try { await apiFetch(`/lf1/correspondence/${entryId}/inbound`, { method: "POST", body: { inbound_source: source, content } }); setContent(""); onLogged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not log the reply."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg }} onPress={(e) => e.stopPropagation()} testID="lf1-reply-modal">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20 }}>Log a reply you received</T>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Select label="How did it arrive?" value={source} onChange={setSource} options={INBOUND_SOURCE_OPTIONS} testID="lf1-reply-source" />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <T variant="small" style={{ marginBottom: 5, color: colors.text, fontFamily: fonts.bodySemi }}>Paste or summarise the reply</T>
            <TextInput testID="lf1-reply-content" value={content} onChangeText={setContent} multiline placeholder="What did they say?" placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 120, textAlignVertical: "top", paddingTop: 10, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
          </View>
          {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}
          <Button label="Save reply" testID="lf1-reply-submit" onPress={submit} loading={busy} style={{ marginTop: spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  dashed: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderRadius: radius.md, padding: spacing.md },
  evItem: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  priorCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  modeCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  softNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  admNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  fbBtn: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  formatBtn: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
});
