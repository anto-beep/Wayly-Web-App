import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Upload, FileText, Sparkles, ArrowRight, Save, Trash2, Search, AlertTriangle, CheckCircle2, ReceiptText, Eye, ListChecks, Landmark, Wallet, Mail, TrendingUp, Download, ChevronDown, ChevronUp } from "lucide-react-native";

import { Button, Card, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { serviceTypeLabel } from "@/src/utils/labels";
import { shortDate } from "@/src/utils/format";
import { sharePostPdf } from "@/src/lib/download";
import OverchargeLetterModal from "@/src/components/tools/OverchargeLetterModal";
import UploadGuardNotice from "@/src/components/UploadGuardNotice";

const CAT_COLOR: Record<string, string> = {
  clinical: "#0E4D52", personal: "#3E6A4C", everyday: "#A5512B", social: "#B7791F", other: "#6B7280",
};
const aud = (v: any) =>
  v == null || v === "" || isNaN(Number(v)) ? "—" : `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VAR_LABEL: Record<string, string> = { within: "OK", minor: "Slightly High", material: "Overcharged" };
const MONTH_LABEL = (ym: string) => {
  const [y, m] = String(ym).split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m ? `${names[Number(m) - 1] || m} '${y.slice(2)}` : ym;
};

function VarBadge({ status, colors }: any) {
  if (!status) return null;
  const tone = status === "within" ? colors.sage : status === "minor" ? colors.alert : colors.terracotta;
  const bg = status === "within" ? colors.sageSoft : status === "minor" ? colors.alertSoft : colors.errorSoft;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      {status === "within" ? <CheckCircle2 size={11} color={tone} /> : <AlertTriangle size={11} color={tone} />}
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, color: tone }}>{VAR_LABEL[status] || status}</T>
    </View>
  );
}

function Chip({ on, label, onPress, colors, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={{ flexShrink: 0, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 12, height: 32, justifyContent: "center" }}>
      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{label}</T>
    </Pressable>
  );
}

function TrendsChart({ trends, colors }: any) {
  if (!trends?.length) return null;
  const max = Math.max(...trends.map((t: any) => Number(t.contribution || 0)), 1);
  return (
    <Card testID="chsp-analyzer-trends">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <TrendingUp size={16} color={colors.primary} />
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Your Monthly Contribution</T>
      </View>
      <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Across your saved invoices — watch for costs creeping up.</T>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 130, marginTop: spacing.md }}>
        {trends.map((t: any) => {
          const h = Math.max(6, Math.round((Number(t.contribution || 0) / max) * 100));
          return (
            <View key={t.month} style={{ flex: 1, alignItems: "center", gap: 4 }} testID={`chsp-analyzer-trend-${t.month}`}>
              <T style={{ fontSize: 9, color: colors.text }}>{aud(t.contribution)}</T>
              <View style={{ width: "100%", height: "100%", justifyContent: "flex-end" }}>
                <View style={{ width: "100%", height: `${h}%`, backgroundColor: "#A5512B", borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
              </View>
              <T style={{ fontSize: 9, color: colors.muted }}>{MONTH_LABEL(t.month)}</T>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function AnalysisView({ analysis, colors, onSave, saving, savedMode, onDraftLetter, onDownloadPdf, downloadingPdf, onDraftFindings }: any) {
  const h = analysis.header || {};
  const t = analysis.totals || {};
  const lines = analysis.line_items || [];
  const [linesOpen, setLinesOpen] = useState(false);
  const govt = Number(t.government_subsidy || 0);
  const you = Number(t.client_contribution || 0);
  const total = govt + you;
  const govtPct = total > 0 ? Math.round((govt / total) * 100) : 0;
  const youPct = 100 - govtPct;
  const cats = analysis.by_category || [];
  const maxCat = Math.max(...cats.map((c: any) => Number(c.amount || 0)), 1);

  return (
    <View style={{ gap: spacing.md }} testID="chsp-analyzer-result">
      <Card testID="chsp-analyzer-summary">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text }}>{h.provider_name || "CHSP Provider"}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
              {h.invoice_reference ? `Invoice ${h.invoice_reference}` : "Invoice"}{h.period_start ? ` · ${h.period_start}${h.period_end ? ` – ${h.period_end}` : ""}` : ""}
            </T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T variant="small" style={{ color: colors.muted, fontSize: 10, letterSpacing: 0.5 }}>TOTAL</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>{aud(t.grand_total)}</T>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm }}>
          <Sparkles size={16} color={colors.primary} />
          <T variant="small" style={{ flex: 1, lineHeight: 19, color: colors.text }}>{analysis.plain_summary}</T>
        </View>
        {analysis.next_steps?.length ? (
          <View style={{ gap: 4, marginTop: spacing.sm }} testID="chsp-analyzer-next-steps">
            {analysis.next_steps.map((s: string, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                <ArrowRight size={13} color={colors.primary} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1, color: colors.text }}>{s}</T>
              </View>
            ))}
          </View>
        ) : null}
        {analysis.flags_count > 0 ? (
          <View testID="chsp-analyzer-flags" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.alertSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginTop: spacing.sm, alignSelf: "flex-start" }}>
            <AlertTriangle size={13} color={colors.alert} />
            <T variant="small" style={{ color: colors.alert, fontSize: 12 }}>{analysis.flags_count} line(s) above your saved rate</T>
          </View>
        ) : null}
      </Card>

      {total > 0 ? (
        <Card testID="chsp-analyzer-split">
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>WHO PAYS FOR THIS INVOICE</T>
          <View style={{ flexDirection: "row", height: 40, borderRadius: radius.sm, overflow: "hidden", marginTop: spacing.sm }}>
            <View style={{ width: `${govtPct}%`, backgroundColor: "#0E4D52", alignItems: "center", justifyContent: "center" }}>
              {govtPct >= 12 ? <T style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bodySemi }}>Govt {govtPct}%</T> : null}
            </View>
            <View style={{ width: `${youPct}%`, backgroundColor: "#A5512B", alignItems: "center", justifyContent: "center" }}>
              {youPct >= 10 ? <T style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bodySemi }}>You {youPct}%</T> : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Landmark size={13} color={colors.primary} /><T variant="small" style={{ color: colors.primary, fontSize: 11 }}>Government</T></View>
              <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.text, marginTop: 2 }}>{aud(govt)}</T>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Wallet size={13} color={colors.gold} /><T variant="small" style={{ color: colors.gold, fontSize: 11 }}>Your share</T></View>
              <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.text, marginTop: 2 }}>{aud(you)}</T>
            </View>
          </View>
        </Card>
      ) : null}

      {cats.length ? (
        <Card testID="chsp-analyzer-graphics">
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>WHERE THE MONEY WENT</T>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {cats.map((c: any) => {
              const amt = Number(c.amount || 0);
              const w = Math.max(4, Math.round((amt / maxCat) * 100));
              const pctTot = t.grand_total ? Math.round((amt / Number(t.grand_total)) * 100) : null;
              return (
                <View key={c.key} testID={`chsp-analyzer-category-${c.key}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <T variant="small" style={{ color: colors.text }}>{c.label}</T>
                    <T variant="small" style={{ color: colors.muted }}>{aud(amt)}{pctTot != null ? ` · ${pctTot}%` : ""}</T>
                  </View>
                  <View style={{ height: 9, borderRadius: 5, backgroundColor: colors.surface2, overflow: "hidden", marginTop: 3 }}>
                    <View style={{ height: 9, width: `${w}%`, backgroundColor: CAT_COLOR[c.key] || CAT_COLOR.other }} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card testID="chsp-analyzer-lines">
        <Pressable testID="chsp-analyzer-lines-toggle" onPress={() => setLinesOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ListChecks size={16} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Line By Line ({lines.length})</T>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>{linesOpen ? "Hide" : "Show"}</T>
            {linesOpen ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}
          </View>
        </Pressable>
        {linesOpen ? (<>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {lines.map((li: any, i: number) => {
            const flagged = li.variance_status === "minor" || li.variance_status === "material";
            return (
              <View key={i} testID={`chsp-analyzer-line-${i}`} style={{ flexDirection: "row", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CAT_COLOR[li.category] || CAT_COLOR.other, marginTop: 5 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={2}>{li.description || serviceTypeLabel(li.service_type)}</T>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{aud(li.amount)}</T>
                  </View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>
                    {li.units != null ? `${li.units}${li.unit_label ? ` ${li.unit_label}` : ""} × ${aud(li.unit_rate)}` : li.category_label}
                    {li.dates ? ` · ${li.dates}` : ""}
                  </T>
                  {li.variance_status ? (
                    <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <VarBadge status={li.variance_status} colors={colors} />
                      {flagged ? (
                        <Pressable testID={`chsp-analyzer-line-letter-${i}`} onPress={() => onDraftLetter(li)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Mail size={12} color="#A5512B" /><T style={{ fontSize: 11, color: "#A5512B", fontFamily: fonts.bodyMedium }}>Query</T>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Total</T>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{aud(t.grand_total)}</T>
        </View>
        </>) : null}
      </Card>

      {!savedMode ? (
        <Button label={saving ? "Saving…" : "Save Invoice To History"} icon={Save} loading={saving} onPress={onSave} testID="chsp-analyzer-save" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.sageSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" }}>
          <CheckCircle2 size={14} color={colors.sage} />
          <T variant="small" style={{ color: colors.sage }}>Saved To Your Invoice History</T>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button label={downloadingPdf ? "Preparing…" : "Download Results (PDF)"} icon={Download} variant="outline" loading={downloadingPdf} onPress={onDownloadPdf} testID="chsp-analyzer-download-pdf" style={{ flexGrow: 1 }} />
        {analysis.flags_count > 0 ? (
          <Button label="Draft Findings Letter" icon={Mail} onPress={onDraftFindings} testID="chsp-analyzer-findings-letter" style={{ flexGrow: 1 }} />
        ) : null}
      </View>
    </View>
  );
}

export default function ChspInvoiceAnalyzer({ colors }: any) {
  const theme = useTheme();
  const c = colors || theme.colors;
  const { active } = useParticipants();
  const participantId = active?.id || null;
  const [analysis, setAnalysis] = useState<any>(null);
  const [savedMode, setSavedMode] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dupExisting, setDupExisting] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [providerFilter, setProviderFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [letterFacts, setLetterFacts] = useState<any>(null);
  const [findingsFacts, setFindingsFacts] = useState<any>(null);
  const [guard, setGuard] = useState<any>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadHistory = async () => {
    try { const d = await apiFetch<any>(`/chsp1/invoices${participantId ? `?participant_id=${participantId}` : ""}`); setHistory(d?.invoices || []); } catch { /* ignore */ }
  };
  const loadTrends = async () => {
    try { const d = await apiFetch<any>(`/chsp1/invoice-trends${participantId ? `?participant_id=${participantId}` : ""}`); setTrends(d?.trends || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadHistory(); loadTrends(); }, [participantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setParsing(true); setError(""); setAnalysis(null); setSavedMode(false); setDupExisting(null); setGuard(null);
      const fd = new FormData();
      fd.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
      const data = await apiFetch<any>("/chsp1/invoice/analyse", { method: "POST", body: fd, isForm: true });
      if (data?.upload_guard) setGuard(data.upload_guard);
      else if (!data?.analysis?.extracted) setError("We couldn't read any service lines from that file. Try a clearer PDF or photo.");
      else setAnalysis(data.analysis);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not read that invoice."); }
    finally { setParsing(false); }
  };

  const downloadPdf = async () => {
    if (!analysis) return;
    setDownloadingPdf(true);
    try {
      await sharePostPdf("/chsp1/invoice/pdf", {
        header: analysis.header, line_items: analysis.line_items, totals: analysis.totals,
        by_category: analysis.by_category, plain_summary: analysis.plain_summary,
        next_steps: analysis.next_steps, flags_count: analysis.flags_count || 0,
      }, `Wayly-CHSP-Invoice-${(analysis.header?.provider_name || "review").replace(/[^\w.-]+/g, "-")}.pdf`);
    } catch { setError("Could not build the PDF."); }
    finally { setDownloadingPdf(false); }
  };

  const draftFindings = () => {
    const hh = analysis?.header || {};
    const flagged = (analysis?.line_items || []).filter((li: any) => li.variance_status === "minor" || li.variance_status === "material");
    if (!flagged.length) return;
    setFindingsFacts({
      provider_name: hh.provider_name || null,
      client_name: hh.client_name || active?.display_name || null,
      invoice_reference: hh.invoice_reference || null,
      period: hh.period_start ? `${hh.period_start}${hh.period_end ? ` – ${hh.period_end}` : ""}` : null,
      lines: flagged.map((li: any) => ({
        service_description: li.description || serviceTypeLabel(li.service_type),
        units: li.units ?? null,
        unit_label: li.unit_label || "units",
        billed_unit_rate: li.unit_rate ?? null,
        agreed_rate: li.agreed_rate ?? null,
        billed_amount: li.amount ?? null,
        expected_amount: li.agreed_rate != null && li.units != null ? Number((li.agreed_rate * li.units).toFixed(2)) : null,
      })),
    });
  };

  const doSave = async (force: boolean) => {
    if (!analysis) return;
    setSaving(true);
    try {
      const data = await apiFetch<any>("/chsp1/invoice/save", { method: "POST", body: {
        participant_id: participantId, force,
        header: analysis.header, line_items: analysis.line_items, totals: analysis.totals,
        by_category: analysis.by_category, plain_summary: analysis.plain_summary,
        next_steps: analysis.next_steps, flags_count: analysis.flags_count || 0,
      } });
      if (data?.duplicate) { setDupExisting(data.existing || {}); setSaving(false); return; }
      setSavedMode(true); setDupExisting(null);
      loadHistory(); loadTrends();
    } catch { setError("Could not save this invoice."); }
    finally { setSaving(false); }
  };

  const viewSaved = async (id: string) => {
    try { const d = await apiFetch<any>(`/chsp1/invoices/${id}`); setAnalysis(d.invoice); setSavedMode(true); } catch { setError("Could not open that invoice."); }
  };
  const deleteSaved = async (id: string) => {
    try { await apiFetch(`/chsp1/invoices/${id}`, { method: "DELETE" }); setHistory((l) => l.filter((r) => r.id !== id)); loadTrends(); } catch { /* ignore */ }
  };

  const draftLetterForLine = (li: any) => {
    const h = analysis?.header || {};
    setLetterFacts({
      provider_name: h.provider_name || null,
      client_name: h.client_name || active?.display_name || null,
      invoice_reference: h.invoice_reference || null,
      service_description: li.description || serviceTypeLabel(li.service_type),
      period: h.period_start ? `${h.period_start}${h.period_end ? ` – ${h.period_end}` : ""}` : null,
      units: li.units ?? null,
      unit_label: li.unit_label || "units",
      billed_unit_rate: li.unit_rate ?? null,
      agreed_rate: li.agreed_rate ?? null,
      billed_amount: li.amount ?? null,
      expected_amount: li.agreed_rate != null && li.units != null ? Number((li.agreed_rate * li.units).toFixed(2)) : null,
    });
  };

  const providers = useMemo(() => Array.from(new Set(history.map((r) => r.provider_name).filter(Boolean))) as string[], [history]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = history.filter((r) => {
      if (flaggedOnly && !(r.flags_count > 0)) return false;
      if (providerFilter !== "all" && r.provider_name !== providerFilter) return false;
      if (!q) return true;
      return `${r.provider_name || ""} ${r.invoice_reference || ""}`.toLowerCase().includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "highest") return Number(b.grand_total || 0) - Number(a.grand_total || 0);
      const da = new Date(a.created_at || 0).getTime(), db = new Date(b.created_at || 0).getTime();
      return sort === "oldest" ? da - db : db - da;
    });
    return rows;
  }, [history, query, flaggedOnly, providerFilter, sort]);

  return (
    <Card testID="chsp-analyzer-root" style={{ backgroundColor: c.primarySoft }}>
      <T variant="label" style={{ color: c.primary }}>STEP 1 · READ THE INVOICE</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: c.text, marginTop: 2 }}>Read A Whole CHSP Invoice</T>
      <T variant="small" style={{ color: c.muted, marginTop: 2, lineHeight: 19 }}>Upload a PDF or photo. Wayly reads every line, summarises it, shows where the money goes, and saves it to a history you can filter.</T>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
          <FileText size={18} color={c.primary} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.text }}>Have The Invoice Handy?</T>
            <T variant="small" style={{ color: c.muted, fontSize: 11 }}>PDF or photo — analysed line by line.</T>
          </View>
        </View>
        <Button label={parsing ? "Reading…" : "Upload"} icon={Upload} loading={parsing} onPress={upload} testID="chsp-analyzer-upload" style={{ paddingHorizontal: 16 }} />
      </View>

      {error ? <T variant="small" style={{ color: c.terracotta, marginTop: spacing.sm }} testID="chsp-analyzer-error">{error}</T> : null}

      {guard ? <View style={{ marginTop: spacing.sm }}><UploadGuardNotice verdict={guard} onChooseAnother={() => setGuard(null)} /></View> : null}

      {dupExisting ? (
        <View testID="chsp-analyzer-dup" style={{ marginTop: spacing.sm, backgroundColor: c.alertSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
          <T variant="small" style={{ color: c.text }}>You already saved this invoice ({dupExisting.invoice_reference || dupExisting.provider_name || "same invoice"}). Save it again anyway?</T>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Save Anyway" testID="chsp-analyzer-dup-confirm" onPress={() => doSave(true)} style={{ paddingHorizontal: 16 }} />
            <Button label="Cancel" variant="outline" testID="chsp-analyzer-dup-cancel" onPress={() => setDupExisting(null)} style={{ paddingHorizontal: 16 }} />
          </View>
        </View>
      ) : null}

      {analysis ? <View style={{ marginTop: spacing.md }}><AnalysisView analysis={analysis} colors={c} onSave={() => doSave(false)} saving={saving} savedMode={savedMode} onDraftLetter={draftLetterForLine} onDownloadPdf={downloadPdf} downloadingPdf={downloadingPdf} onDraftFindings={draftFindings} /></View> : null}

      {trends.length > 1 ? <View style={{ marginTop: spacing.md }}><TrendsChart trends={trends} colors={c} /></View> : null}

      {/* History */}
      <View style={{ marginTop: spacing.md, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: "hidden" }} testID="chsp-analyzer-history">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <ReceiptText size={16} color={c.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: c.text }}>Invoice History ({history.length})</T>
        </View>
        {history.length > 0 ? (
          <View style={{ padding: spacing.sm, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 10 }}>
              <Search size={14} color={c.muted} />
              <TextInput testID="chsp-analyzer-history-search" value={query} onChangeText={setQuery} placeholder="Search provider or reference" placeholderTextColor={c.muted}
                style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 13, paddingVertical: 8 }} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}>
              <Chip on={!flaggedOnly && providerFilter === "all"} label="All" onPress={() => { setFlaggedOnly(false); setProviderFilter("all"); }} colors={c} testID="chsp-analyzer-history-filter-all" />
              <Chip on={flaggedOnly} label="Flagged" onPress={() => setFlaggedOnly((v) => !v)} colors={c} testID="chsp-analyzer-history-filter-flagged" />
              {providers.map((p) => (
                <Chip key={p} on={providerFilter === p} label={p.length > 18 ? p.slice(0, 18) + "…" : p} onPress={() => setProviderFilter((cur) => cur === p ? "all" : p)} colors={c} testID={`chsp-analyzer-history-provider-${p}`} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}>
              {[["newest", "Newest"], ["oldest", "Oldest"], ["highest", "Highest total"]].map(([v, l]) => (
                <Chip key={v} on={sort === v} label={l} onPress={() => setSort(v)} colors={c} testID={`chsp-analyzer-history-sort-${v}`} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {history.length === 0 ? (
          <T variant="small" style={{ color: c.muted, textAlign: "center", padding: spacing.lg }} testID="chsp-analyzer-history-empty">No saved invoices yet{active?.display_name ? ` for ${active.display_name}` : ""}. Upload one above and tap “Save Invoice To History”.</T>
        ) : filtered.length === 0 ? (
          <T variant="small" style={{ color: c.muted, textAlign: "center", padding: spacing.lg }}>No invoices match your filter.</T>
        ) : (
          <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
            {filtered.map((r) => (
              <Pressable key={r.id} testID={`chsp-analyzer-history-row-${r.id}`} onPress={() => viewSaved(r.id)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.text }} numberOfLines={1}>{r.provider_name || "Provider"}</T>
                  <T variant="small" style={{ color: c.muted, fontSize: 11 }} numberOfLines={1}>
                    {r.invoice_reference || "—"} · {aud(r.grand_total)}{r.flags_count > 0 ? ` · ${r.flags_count} flag(s)` : ""} · {shortDate(r.created_at) || ""}
                  </T>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Eye size={15} color={c.primary} /><T variant="small" style={{ color: c.primary, fontSize: 12 }} testID={`chsp-analyzer-history-view-${r.id}`}>View</T></View>
                <Pressable testID={`chsp-analyzer-history-delete-${r.id}`} onPress={() => deleteSaved(r.id)} hitSlop={8}><Trash2 size={16} color={c.terracotta} /></Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <OverchargeLetterModal visible={Boolean(letterFacts)} facts={letterFacts || {}} onClose={() => setLetterFacts(null)} colors={c} />
      <OverchargeLetterModal visible={Boolean(findingsFacts)} facts={findingsFacts || {}} endpoint="/chsp1/findings-letter" title="Findings Letter To Your Provider" onClose={() => setFindingsFacts(null)} colors={c} />
    </Card>
  );
}
