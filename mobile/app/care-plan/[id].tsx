import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ClipboardList, Sparkles, Mail, Download, X, Copy, Check, Archive, Trash2, ShieldCheck, ShieldAlert, AlertOctagon } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Finding = { id?: string; title?: string; detail?: string; severity?: string; citation?: string | null; citation_source?: string | null; suggested_question?: string | null };
type Detail = {
  plan?: { id: string; title?: string; filename?: string; status?: string; classification_at_review?: number | null; uploaded_at?: string; summary?: string | null; notes?: string | null };
  extraction?: { services?: any[]; line_items?: any[]; provider_name?: string; classification?: number; quarterly_budget?: number } | null;
  findings?: Finding[];
  latest_run?: any;
  safety_notice?: string | null;
  plan_summary?: string | null;
  verification_panel?: { checks?: any[] } | null;
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

const chip = { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 } as const;
const chipTxt = { color: "#fff", fontSize: 12, fontFamily: fonts.bodyMedium } as const;

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
  const [actionBusy, setActionBusy] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

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

  const archivePlan = async () => {
    setActionBusy("archive");
    try { await apiFetch(`/care-plans/${id}/archive`, { method: "POST", body: {} }); router.replace("/care-plans"); }
    catch { /* ignore */ } finally { setActionBusy(""); }
  };

  const deletePlan = async () => {
    setActionBusy("delete");
    try { await apiFetch(`/care-plans/${id}`, { method: "DELETE" }); setConfirmDel(false); router.replace("/care-plans"); }
    catch { /* ignore */ } finally { setActionBusy(""); }
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
          </Card>

          {(data?.plan_summary || plan.summary) ? (
            <Card testID="cp-plan-summary" style={{ backgroundColor: colors.primary }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} color="#fff" />
                <T variant="small" style={{ color: "rgba(255,255,255,0.85)", letterSpacing: 0.5, fontFamily: fonts.bodySemi }}>WAYLY SUMMARY</T>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {data?.extraction?.provider_name ? <View style={chip}><T style={chipTxt}>{data.extraction.provider_name}</T></View> : null}
                {data?.extraction?.classification ? <View style={chip}><T style={chipTxt}>Level {data.extraction.classification}</T></View> : null}
                {data?.extraction?.quarterly_budget ? <View style={chip}><T style={chipTxt}>${Number(data.extraction.quarterly_budget).toLocaleString()} / quarter</T></View> : null}
                {(data?.extraction?.services || []).length ? <View style={chip}><T style={chipTxt}>{(data?.extraction?.services || []).length} service{(data?.extraction?.services || []).length === 1 ? "" : "s"}</T></View> : null}
              </View>
              <T variant="small" style={{ marginTop: 10, lineHeight: 20, color: "#fff" }}>{data?.plan_summary || plan.summary}</T>
            </Card>
          ) : null}

          {data?.safety_notice ? (
            <Card testID="cp-safety-notice" style={{ backgroundColor: colors.alertSoft, borderColor: colors.alertSoft }}>
              <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{data.safety_notice}</T>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button label="Re-run review" testID="cp-run-analysis" icon={Sparkles} variant="outline" onPress={reAnalyse} loading={analysing} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Follow-up email" testID="cp-draft-email" icon={Mail} variant="outline" onPress={draftEmail} loading={emailBusy} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Download PDF" testID="cp-download-pdf" icon={Download} variant="outline" onPress={downloadPdf} loading={downloading} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Archive" testID="cp-archive" icon={Archive} variant="outline" onPress={archivePlan} loading={actionBusy === "archive"} style={{ minHeight: 44, paddingHorizontal: 14 }} />
            <Button label="Delete" testID="cp-delete" icon={Trash2} variant="outline" onPress={() => setConfirmDel(true)} style={{ minHeight: 44, paddingHorizontal: 14 }} />
          </View>

          {/* Findings */}
          <T variant="h3" style={{ marginTop: spacing.sm }}>Findings{findings.length ? ` (${findings.length})` : ""}</T>
          {findings.length === 0 ? (
            <StatePanel testID="cp-no-findings" icon={Check} title={data?.latest_run ? "No findings" : "No review yet"} message={data?.latest_run ? "The latest review did not flag anything to raise." : "Tap Re-run review to check this plan against the Support at Home rules."} />
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
                  {f.suggested_question ? (
                    <View style={{ marginTop: 8, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm }}>
                      <T style={{ fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>WHAT TO ASK YOUR PROVIDER</T>
                      <T variant="small" style={{ color: colors.text, marginTop: 2 }}>{f.suggested_question}</T>
                    </View>
                  ) : null}
                  {(f.citation_source || f.citation) ? <T variant="small" style={{ marginTop: 6, color: colors.muted }}>From the plan: {f.citation_source || f.citation}</T> : null}
                </Card>
              );
            })
          )}

          {/* Safety checks */}
          {(data?.verification_panel?.checks || []).length > 0 ? (
            <Card testID="cp-verification-panel">
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>SAFETY CHECKS WE RAN</T>
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {(data?.verification_panel?.checks || []).map((c: any) => {
                  const isPass = c.status === "pass"; const isFlag = c.status === "flag";
                  const Icon = isPass ? ShieldCheck : isFlag ? AlertOctagon : ShieldAlert;
                  const col = isPass ? colors.sage : isFlag ? colors.terracotta : colors.gold;
                  const label = isPass ? "All good" : isFlag ? "Worth a look" : "Need more info";
                  return (
                    <View key={c.check} testID={`cp-check-${c.check}`} style={{ flexDirection: "row", gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
                      <Icon size={16} color={col} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{c.label}</T>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: col }}>{label.toUpperCase()}</T>
                        </View>
                        <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>{c.detail}</T>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

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

      {/* Confirm delete modal */}
      <Modal visible={confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(false)}>
        <Pressable style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.overlay, padding: spacing.lg }} onPress={() => setConfirmDel(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, width: "100%", maxWidth: 360 }} onPress={(e) => e.stopPropagation()} testID="cp-delete-modal">
            <T variant="h3">Delete this care plan?</T>
            <T variant="small" style={{ marginTop: 6, lineHeight: 20, color: colors.muted }}>You can restore it within 30 days from the archived list.</T>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button label="Cancel" variant="outline" onPress={() => setConfirmDel(false)} style={{ flex: 1 }} testID="cp-delete-cancel" />
              <Button label="Delete" onPress={deletePlan} loading={actionBusy === "delete"} style={{ flex: 1 }} testID="cp-delete-confirm" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
