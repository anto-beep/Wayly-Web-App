import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Upload, FileText, Sparkles, ArrowRight, Save, Trash2, Search, AlertTriangle, CheckCircle2, ReceiptText, Eye, ListChecks, Landmark, Wallet } from "lucide-react-native";

import { Button, Card, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { serviceTypeLabel } from "@/src/utils/labels";
import { shortDate } from "@/src/utils/format";

const CAT_COLOR: Record<string, string> = {
  clinical: "#0E4D52", personal: "#3E6A4C", everyday: "#A5512B", social: "#B7791F", other: "#6B7280",
};
const aud = (v: any) =>
  v == null || v === "" || isNaN(Number(v)) ? "—" : `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VAR_LABEL: Record<string, string> = { within: "OK", minor: "Minor", material: "Overcharge" };

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

function AnalysisView({ analysis, colors, onSave, saving, savedMode }: any) {
  const h = analysis.header || {};
  const t = analysis.totals || {};
  const lines = analysis.line_items || [];
  const govt = Number(t.government_subsidy || 0);
  const you = Number(t.client_contribution || 0);
  const total = govt + you;
  const govtPct = total > 0 ? Math.round((govt / total) * 100) : 0;
  const youPct = 100 - govtPct;
  const cats = analysis.by_category || [];
  const maxCat = Math.max(...cats.map((c: any) => Number(c.amount || 0)), 1);

  return (
    <View style={{ gap: spacing.md }} testID="chsp-analyzer-result">
      {/* Header + summary */}
      <Card testID="chsp-analyzer-summary">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text }}>{h.provider_name || "CHSP provider"}</T>
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

      {/* Who pays */}
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

      {/* Where the money went */}
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

      {/* Line by line */}
      <Card testID="chsp-analyzer-lines">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ListChecks size={16} color={colors.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Line by line ({lines.length})</T>
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {lines.map((li: any, i: number) => (
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
                {li.variance_status ? <View style={{ marginTop: 4, alignSelf: "flex-start" }}><VarBadge status={li.variance_status} colors={colors} /></View> : null}
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Total</T>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{aud(t.grand_total)}</T>
        </View>
      </Card>

      {!savedMode ? (
        <Button label={saving ? "Saving…" : "Save invoice to history"} icon={Save} loading={saving} onPress={onSave} testID="chsp-analyzer-save" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.sageSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" }}>
          <CheckCircle2 size={14} color={colors.sage} />
          <T variant="small" style={{ color: colors.sage }}>Saved to your invoice history</T>
        </View>
      )}
    </View>
  );
}

export default function ChspInvoiceAnalyzer({ colors }: any) {
  const theme = useTheme();
  const c = colors || theme.colors;
  const [analysis, setAnalysis] = useState<any>(null);
  const [savedMode, setSavedMode] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const loadHistory = async () => {
    try { const d = await apiFetch<any>("/chsp1/invoices"); setHistory(d?.invoices || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadHistory(); }, []);

  const upload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setParsing(true); setError(""); setAnalysis(null); setSavedMode(false);
      const fd = new FormData();
      fd.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
      const data = await apiFetch<any>("/chsp1/invoice/analyse", { method: "POST", body: fd, isForm: true });
      if (!data?.analysis?.extracted) setError("We couldn't read any service lines from that file. Try a clearer PDF or photo.");
      else setAnalysis(data.analysis);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not read that invoice."); }
    finally { setParsing(false); }
  };

  const save = async () => {
    if (!analysis) return;
    setSaving(true);
    try {
      await apiFetch("/chsp1/invoice/save", { method: "POST", body: {
        header: analysis.header, line_items: analysis.line_items, totals: analysis.totals,
        by_category: analysis.by_category, plain_summary: analysis.plain_summary,
        next_steps: analysis.next_steps, flags_count: analysis.flags_count || 0,
      } });
      setSavedMode(true);
      loadHistory();
    } catch { setError("Could not save this invoice."); }
    finally { setSaving(false); }
  };

  const viewSaved = async (id: string) => {
    try { const d = await apiFetch<any>(`/chsp1/invoices/${id}`); setAnalysis(d.invoice); setSavedMode(true); }
    catch { setError("Could not open that invoice."); }
  };
  const deleteSaved = async (id: string) => {
    try { await apiFetch(`/chsp1/invoices/${id}`, { method: "DELETE" }); setHistory((l) => l.filter((r) => r.id !== id)); } catch { /* ignore */ }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((r) => {
      if (flaggedOnly && !(r.flags_count > 0)) return false;
      if (!q) return true;
      return `${r.provider_name || ""} ${r.invoice_reference || ""}`.toLowerCase().includes(q);
    });
  }, [history, query, flaggedOnly]);

  return (
    <Card testID="chsp-analyzer-root" style={{ backgroundColor: c.primarySoft }}>
      <T variant="label" style={{ color: c.primary }}>INVOICE READER</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: c.text, marginTop: 2 }}>Read a whole CHSP invoice</T>
      <T variant="small" style={{ color: c.muted, marginTop: 2, lineHeight: 19 }}>Upload a PDF or photo. Wayly reads every line, summarises it, shows where the money goes, and saves it to a history you can filter.</T>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
          <FileText size={18} color={c.primary} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.text }}>Have the invoice handy?</T>
            <T variant="small" style={{ color: c.muted, fontSize: 11 }}>PDF or photo — analysed line by line.</T>
          </View>
        </View>
        <Button label={parsing ? "Reading…" : "Upload"} icon={Upload} loading={parsing} onPress={upload} testID="chsp-analyzer-upload" style={{ paddingHorizontal: 16 }} />
      </View>

      {error ? <T variant="small" style={{ color: c.terracotta, marginTop: spacing.sm }} testID="chsp-analyzer-error">{error}</T> : null}

      {analysis ? <View style={{ marginTop: spacing.md }}><AnalysisView analysis={analysis} colors={c} onSave={save} saving={saving} savedMode={savedMode} /></View> : null}

      {/* History */}
      <View style={{ marginTop: spacing.md, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: "hidden" }} testID="chsp-analyzer-history">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <ReceiptText size={16} color={c.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: c.text }}>Invoice history ({history.length})</T>
        </View>
        {history.length > 0 ? (
          <View style={{ padding: spacing.sm, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 10 }}>
              <Search size={14} color={c.muted} />
              <TextInput testID="chsp-analyzer-history-search" value={query} onChangeText={setQuery} placeholder="Search provider or reference" placeholderTextColor={c.muted}
                style={{ flex: 1, color: c.text, fontFamily: fonts.body, fontSize: 13, paddingVertical: 8 }} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[{ k: false, l: "All" }, { k: true, l: "Flagged only" }].map((o: any) => {
                const on = flaggedOnly === o.k;
                return (
                  <Pressable key={o.l} testID={`chsp-analyzer-history-filter-${o.k ? "flagged" : "all"}`} onPress={() => setFlaggedOnly(o.k)}
                    style={{ borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : c.text }}>{o.l}</T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {history.length === 0 ? (
          <T variant="small" style={{ color: c.muted, textAlign: "center", padding: spacing.lg }} testID="chsp-analyzer-history-empty">No saved invoices yet. Upload one above and tap “Save invoice to history”.</T>
        ) : filtered.length === 0 ? (
          <T variant="small" style={{ color: c.muted, textAlign: "center", padding: spacing.lg }}>No invoices match your filter.</T>
        ) : (
          <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
            {filtered.map((r) => (
              <View key={r.id} testID={`chsp-analyzer-history-row-${r.id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.text }} numberOfLines={1}>{r.provider_name || "Provider"}</T>
                  <T variant="small" style={{ color: c.muted, fontSize: 11 }} numberOfLines={1}>
                    {r.invoice_reference || "—"} · {aud(r.grand_total)}{r.flags_count > 0 ? ` · ${r.flags_count} flag(s)` : ""} · {shortDate(r.created_at) || ""}
                  </T>
                </View>
                <Pressable testID={`chsp-analyzer-history-view-${r.id}`} onPress={() => viewSaved(r.id)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Eye size={15} color={c.primary} /><T variant="small" style={{ color: c.primary, fontSize: 12 }}>View</T>
                </Pressable>
                <Pressable testID={`chsp-analyzer-history-delete-${r.id}`} onPress={() => deleteSaved(r.id)} hitSlop={8}><Trash2 size={16} color={c.terracotta} /></Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}
