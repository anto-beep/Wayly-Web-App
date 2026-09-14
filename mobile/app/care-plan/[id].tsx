import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ClipboardList, Sparkles, Mail, Download, X, Copy, Check } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Finding = { id?: string; title?: string; detail?: string; severity?: string; citation?: string | null };
type Detail = {
  plan?: { id: string; title?: string; filename?: string; status?: string; classification_at_review?: number | null; uploaded_at?: string; summary?: string | null; notes?: string | null };
  extraction?: { services?: any[]; line_items?: any[] } | null;
  findings?: Finding[];
  safety_notice?: string | null;
};

const SEV: Record<string, { tone: "error" | "alert" | "brand" | "neutral"; label: string }> = {
  compliance: { tone: "error", label: "Compliance" },
  choice: { tone: "alert", label: "Choice" },
  efficiency: { tone: "brand", label: "Efficiency" },
  info: { tone: "neutral", label: "Info" },
};

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CarePlanDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      const d = await apiFetch<Detail>(`/care-plans/${id}`);
      setData(d);
      setNotes(d?.plan?.notes || "");
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await apiFetch(`/care-plans/${id}/notes`, { method: "PATCH", body: { notes } }); }
    catch { /* ignore */ } finally { setSavingNotes(false); }
  };

  const reAnalyse = async () => {
    setAnalysing(true);
    try { await apiFetch(`/care-plans/${id}/analyse`, { method: "POST", body: {} }); await load(); }
    catch { /* ignore */ } finally { setAnalysing(false); }
  };

  const draftEmail = async () => {
    setEmailBusy(true);
    try {
      const e = await apiFetch<{ subject: string; body: string }>(`/care-plans/${id}/follow-up-email`);
      setEmail(e);
    } catch { /* ignore */ } finally { setEmailBusy(false); }
  };

  const copyEmail = async () => {
    if (!email) return;
    await Clipboard.setStringAsync(`Subject: ${email.subject}\n\n${email.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try { await downloadAndShare(`/care-plans/${id}/artefact.pdf`, `Wayly-Care-Plan-Review.pdf`); }
    catch { /* ignore */ } finally { setDownloading(false); }
  };

  const plan = data?.plan;
  const findings = (data?.findings || []).slice().sort((a, b) => {
    const order: Record<string, number> = { compliance: 0, choice: 1, efficiency: 2, info: 3 };
    return (order[a.severity || "info"] ?? 99) - (order[b.severity || "info"] ?? 99);
  });
  const services = data?.extraction?.services || data?.extraction?.line_items || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Care plan review" subtitle={plan?.title || plan?.filename || undefined} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading care plan…" />
      ) : error || !plan ? (
        <StatePanel testID="care-plan-detail-error" icon={ClipboardList} title="Couldn't load this care plan" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} testID="care-plan-detail" keyboardShouldPersistTaps="handled">
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>{plan.title || plan.filename || "Care plan"}</T>
              {plan.status ? <Badge label={plan.status.toUpperCase()} tone="brand" /> : null}
            </View>
            <T variant="small" style={{ marginTop: 6 }}>
              {fmt(plan.uploaded_at)}{plan.classification_at_review ? ` · Class ${plan.classification_at_review}` : ""}
            </T>
            {plan.summary ? <T variant="small" style={{ marginTop: 8, lineHeight: 20 }}>{plan.summary}</T> : null}
          </Card>

          {data?.safety_notice ? (
            <Card testID="cp-safety-notice" style={{ backgroundColor: colors.alertSoft, borderColor: colors.alertSoft }}>
              <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{data.safety_notice}</T>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button label="Re-run review" testID="cp-run-analysis" icon={Sparkles} variant="outline" onPress={reAnalyse} loading={analysing} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Follow-up email" testID="cp-draft-email" icon={Mail} variant="outline" onPress={draftEmail} loading={emailBusy} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Download PDF" testID="cp-download-pdf" icon={Download} variant="outline" onPress={downloadPdf} loading={downloading} style={{ minHeight: 44, paddingHorizontal: 14 }} />
          </View>

          {/* Findings */}
          <T variant="h3" style={{ marginTop: spacing.sm }}>Findings{findings.length ? ` (${findings.length})` : ""}</T>
          {findings.length === 0 ? (
            <StatePanel testID="cp-no-findings" icon={Check} title="No findings" message="The latest review did not flag anything to raise." />
          ) : (
            findings.map((f, i) => {
              const sev = SEV[f.severity || "info"] || SEV.info;
              return (
                <Card key={f.id || i} testID={`cp-finding-${i}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{f.title || "Finding"}</T>
                    <Badge label={sev.label.toUpperCase()} tone={sev.tone} />
                  </View>
                  {f.detail ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>{f.detail}</T> : null}
                  {f.citation ? <T variant="small" style={{ marginTop: 6, color: colors.muted }}>Source: {f.citation}</T> : null}
                </Card>
              );
            })
          )}

          {/* Services */}
          {services.length > 0 ? (
            <>
              <T variant="h3" style={{ marginTop: spacing.sm }}>Services in this plan</T>
              <Card testID="cp-services">
                {services.map((s: any, i: number) => (
                  <View key={i} style={{ paddingVertical: 8, borderBottomWidth: i < services.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{s.service_name || s.name || s.description || "Service"}</T>
                    {s.category || s.service_category ? <T variant="small" style={{ color: colors.muted }}>{s.category || s.service_category}</T> : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Notes */}
          <T variant="h3" style={{ marginTop: spacing.sm }}>Your notes</T>
          <Field testID="cp-notes" value={notes} onChangeText={setNotes} placeholder="Add notes for your next review meeting" multiline style={{ minHeight: 96 } as any} />
          <Button label="Save notes" testID="cp-save-notes" onPress={saveNotes} loading={savingNotes} />
        </ScrollView>
      )}

      {/* Email draft modal */}
      <Modal visible={!!email} transparent animationType="slide" onRequestClose={() => setEmail(null)}>
        <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={() => setEmail(null)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: "85%" }} onPress={(e) => e.stopPropagation()} testID="cp-email-modal">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <T variant="h3">Follow-up email draft</T>
              <Pressable onPress={() => setEmail(null)} testID="cp-email-close" hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <T variant="label" style={{ color: colors.muted }}>SUBJECT</T>
              <T testID="cp-email-subject" style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 4 }}>{email?.subject}</T>
              <T variant="label" style={{ color: colors.muted, marginTop: spacing.md }}>BODY</T>
              <T testID="cp-email-body" style={{ fontSize: 14, lineHeight: 21, marginTop: 4 }}>{email?.body}</T>
            </ScrollView>
            <Button label={copied ? "Copied" : "Copy to clipboard"} testID="cp-email-copy" icon={copied ? Check : Copy} onPress={copyEmail} style={{ marginTop: spacing.md }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
