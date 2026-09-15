import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { HeartPulse, ReceiptText, ArrowRight, CheckCircle2, ShieldAlert, Home, ClipboardCheck, Plus, Wrench, Clock, HelpCircle, LifeBuoy, Mail, AlertTriangle, Upload, FileText, Trash2, Sparkles, Save, ListChecks, Download } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, Select, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { apiFetch, ApiError } from "@/src/lib/api";
import { sharePostPdf } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";
import { serviceTypeLabel, chspStatusLabel, labelize } from "@/src/utils/labels";
import ChspInvoiceAnalyzer from "@/src/components/tools/ChspInvoiceAnalyzer";
import OverchargeLetterModal from "@/src/components/tools/OverchargeLetterModal";

const STATUS_OPTIONS = [
  { value: "on_chsp", label: "On CHSP" },
  { value: "considering_transition", label: "Considering transition" },
  { value: "transitioning_to_sah", label: "Transitioning to Support at Home" },
];
const SERVICE_TYPES = [
  "domestic_assistance", "personal_care", "meals", "transport", "social_support_individual",
  "social_support_group", "allied_health", "nursing", "home_maintenance", "home_modifications_minor",
  "goods_equipment_assistive_technology", "respite", "specialised_support_services", "other",
].map((v) => ({ value: v, label: serviceTypeLabel(v) }));
const REASONS = [
  "current_supports_insufficient", "needs_increased_after_hospital_or_health_change",
  "need_specific_services_chsp_can't_provide", "want_greater_service_choice",
  "cost_of_current_services_burdensome", "recommended_by_health_professional", "family_recommendation", "other",
];
const CONSIDERATIONS = [
  { key: "understand_iat_process", label: "Understand the IAT (Initial Assessment Tool) process" },
  { key: "understand_classification_meaning", label: "Understand what SAH classifications 1-8 mean" },
  { key: "understand_contribution_will_change", label: "Understand my contribution will change on SAH" },
  { key: "understand_quarterly_budget_model", label: "Understand SAH's quarterly budget model" },
  { key: "understand_lifetime_cap", label: "Understand the lifetime contribution cap" },
  { key: "understand_ras_reassessment_vs_iat_direct", label: "Understand RAS reassessment vs going directly to IAT" },
];
const DECISION_OPTIONS = [
  { value: "", label: "Not decided yet" },
  { value: "stay_on_chsp_no_change", label: "Stay on CHSP, no change" },
  { value: "stay_on_chsp_review_services", label: "Stay on CHSP, review services" },
  { value: "proceed_with_transition_seek_ras_reassessment", label: "Proceed, request RAS reassessment" },
  { value: "proceed_with_transition_seek_iat_directly", label: "Proceed, request IAT directly" },
  { value: "need_more_information", label: "Need more information" },
];

function LInput({ label, value, onChangeText, placeholder, keyboardType, testID, colors, required, optional, prefix }: any) {
  return (
    <View style={{ flex: 1, minWidth: "45%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{label}</T>
        {required ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.gold }}>Required</T> : optional ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>Optional</T> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.bg }}>
        {prefix ? <T style={{ color: colors.muted, fontFamily: fonts.body, marginRight: 2 }}>{prefix}</T> : null}
        <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType}
          style={{ flex: 1, minHeight: 44, color: colors.text, fontFamily: fonts.body }} />
      </View>
    </View>
  );
}

function Checkbox({ checked, colors }: any) {
  return <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>{checked ? <CheckCircle2 size={13} color="#fff" /> : null}</View>;
}

const aud = (v: any) => `$${Number(v ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// WS-3 · Access & Hardship letters (mobile parity).
function AccessHardship({ colors, providerName, emphasise }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const draft = async (kind: string) => {
    setBusy(kind);
    try {
      const data = await apiFetch<any>("/chsp1/letter", { method: "POST", body: { kind, provider_name: providerName || null } });
      if (data?.entry_id) router.push(`/letters/${data.entry_id}`);
    } catch { Alert.alert("Could not draft letter", "Please try again."); }
    finally { setBusy(null); }
  };
  return (
    <Card testID="chsp-access-hardship">
      <T variant="label">ACCESS AND HARDSHIP</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 2 }}>Keep Services Running, And Get Help With Fees</T>
      <T variant="small" style={{ marginTop: 4 }}>Draft a letter to keep your services going, or start a hardship / fee-waiver request.</T>
      <Button label="Service Continuity Letter" icon={Mail} testID="chsp-service-continuity-letter" loading={busy === "service_continuity"} onPress={() => draft("service_continuity")} style={{ marginTop: spacing.md }} />
      <Button label="Apply For Hardship / Fee Waiver" icon={LifeBuoy} testID="chsp-hardship-letter" loading={busy === "hardship"} variant={emphasise ? "secondary" : "primary"} onPress={() => draft("hardship")} style={{ marginTop: spacing.sm, ...(emphasise ? {} : { backgroundColor: "#A5512B" }) }} />
      {emphasise ? (
        <View testID="chsp-hardship-hint" style={{ marginTop: spacing.sm, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: spacing.md }}>
          <T variant="small" style={{ color: colors.text }}>A material overcharge can add up. If contributions are hard to meet, a hardship or fee-waiver request may help.</T>
        </View>
      ) : null}
    </Card>
  );
}

// WS-1 · Per-unit Fee Check (mobile parity).
function WS1FeeCheck({ services, colors }: any) {
  const [form, setForm] = useState<any>({
    invoice_reference: "", provider_name: "", service_type: "domestic_assistance",
    units_billed: "", units_received: "", agreed_rate: "",
    rate_effective_date: "", billed_period_start: "", billed_amount: "",
  });
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<any>(null);
  const [lineOptions, setLineOptions] = useState<any[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);

  const loadSaved = async () => {
    try { const d = await apiFetch<any>("/chsp1/fee-check/saved"); setSaved(d?.saved_checks || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadSaved(); }, []);

  const onServiceChange = (id: string) => {
    const svc = services.find((s: any) => s.id === id);
    if (svc) set({ service_type: svc.service_type, provider_name: svc.provider_name, agreed_rate: svc.hourly_rate_or_fee?.amount != null ? String(svc.hourly_rate_or_fee.amount) : form.agreed_rate, rate_effective_date: svc.start_date ? (shortDate(svc.start_date) || form.rate_effective_date) : form.rate_effective_date });
  };

  const uploadInvoice = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setParsing(true); setParseInfo(null); setError(""); setLineOptions([]);
      const fd = new FormData();
      fd.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
      const data = await apiFetch<any>("/chsp1/fee-check/parse-invoice", { method: "POST", body: fd, isForm: true });
      if (data?.upload_guard) { setError(data.upload_guard.message || "That file doesn't look like a CHSP invoice."); return; }
      applyPrefill(data?.fields || {});
      setLineOptions(Array.isArray(data?.line_options) ? data.line_options : []);
      setParseInfo({ plain_summary: data?.plain_summary, next_steps: data?.next_steps || [] });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not read that invoice."); }
    finally { setParsing(false); }
  };

  const applyPrefill = (fx: any) => {
    if (!fx) return;
    set({
      invoice_reference: fx.invoice_reference ?? form.invoice_reference,
      provider_name: fx.provider_name ?? form.provider_name,
      service_type: SERVICE_TYPES.some((o: any) => o.value === fx.service_type) ? fx.service_type : form.service_type,
      agreed_rate: fx.agreed_rate != null ? String(fx.agreed_rate) : form.agreed_rate,
      units_billed: fx.units_billed != null ? String(fx.units_billed) : form.units_billed,
      units_received: fx.units_received != null ? String(fx.units_received) : form.units_received,
      billed_amount: fx.billed_amount != null ? String(fx.billed_amount) : form.billed_amount,
    });
  };

  const downloadFeeCheckPdf = async () => {
    if (!result) return;
    setDownloadingPdf(true);
    try {
      await sharePostPdf("/chsp1/fee-check/pdf", {
        fields: {
          provider_name: form.provider_name || null,
          invoice_reference: form.invoice_reference || null,
          service_type: form.service_type,
          service_type_label: serviceTypeLabel(form.service_type),
          agreed_rate: form.agreed_rate === "" ? null : Number(form.agreed_rate),
          billed_amount: form.billed_amount === "" ? null : Number(form.billed_amount),
        },
        result,
      }, `Wayly-CHSP-Fee-Check-${(form.provider_name || "check").replace(/[^\w.-]+/g, "-")}.pdf`);
    } catch { setError("Could not build the PDF."); }
    finally { setDownloadingPdf(false); }
  };

  const submit = async () => {
    setError("");
    for (const k of ["agreed_rate", "units_billed", "units_received", "billed_amount"]) {
      if (!form[k]) { setError("Enter the agreed rate, units billed, units received and billed amount."); return; }
    }
    setBusy(true);
    try {
      const data = await apiFetch<any>("/chsp1/fee-check/preview", { method: "POST", body: {
        invoice_reference: form.invoice_reference || null,
        provider_name: form.provider_name || null,
        service_type: form.service_type,
        units_billed: Number(form.units_billed),
        units_received: Number(form.units_received),
        billed_amount: Number(form.billed_amount),
        agreed_rate: form.agreed_rate === "" ? null : Number(form.agreed_rate),
        rate_effective_date: form.rate_effective_date || null,
        billed_period_start: form.billed_period_start || null,
      } });
      setResult(data.result);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not check the fee."); }
    finally { setBusy(false); }
  };

  const saveCheck = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await apiFetch("/chsp1/fee-check/save", { method: "POST", body: {
        invoice_reference: form.invoice_reference || null, provider_name: form.provider_name || null,
        service_type: form.service_type, agreed_rate: form.agreed_rate === "" ? null : Number(form.agreed_rate),
        units_billed: form.units_billed === "" ? null : Number(form.units_billed),
        units_received: form.units_received === "" ? null : Number(form.units_received),
        billed_amount: form.billed_amount === "" ? null : Number(form.billed_amount),
        rate_effective_date: form.rate_effective_date || null, billed_period_start: form.billed_period_start || null,
        result,
      } });
      loadSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const deleteSaved = async (id: string) => {
    try { await apiFetch(`/chsp1/fee-check/saved/${id}`, { method: "DELETE" }); setSaved((l) => l.filter((s) => s.id !== id)); } catch { /* ignore */ }
  };

  const serviceOpts = [{ value: "", label: "Manual entry" }, ...services.map((s: any) => ({ value: s.id, label: `${serviceTypeLabel(s.service_type)} · ${s.provider_name}` }))];
  const verdictTone = result ? (result.overall_verdict === "within" ? "success" : result.overall_verdict === "no_verdict" ? "neutral" : "alert") : "neutral";
  const VIcon = result ? (result.overall_verdict === "within" ? CheckCircle2 : result.overall_verdict === "material" ? ShieldAlert : result.overall_verdict === "no_verdict" ? HelpCircle : AlertTriangle) : HelpCircle;

  return (
    <Card testID="chsp-ws1-fee-check" style={{ backgroundColor: colors.goldSoft }}>
      <T variant="label" style={{ color: colors.gold }}>STEP 2 · CHECK A CHARGE</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 2 }}>Was This CHSP Invoice Correct?</T>
      <T variant="small" style={{ marginTop: 4 }}>We compare what you were billed against your provider&apos;s agreed per-unit rate. Fields showing a Required label must be completed.</T>

      {/* Upload + auto-read */}
      <View style={{ marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }} testID="chsp-ws1-upload-card">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flex: 1, flexDirection: "row", gap: 8, alignItems: "center" }}>
            <FileText size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Have the invoice handy?</T>
              <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>Upload a PDF or photo and we&apos;ll fill in the fields.</T>
            </View>
          </View>
          <Button label={parsing ? "Reading…" : "Upload"} icon={Upload} testID="chsp-ws1-upload" loading={parsing} onPress={uploadInvoice} style={{ minHeight: 38, paddingHorizontal: 12 }} />
        </View>
        {parseInfo ? (
          <View style={{ backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.sm, gap: 6 }} testID="chsp-ws1-parse-summary">
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><Sparkles size={14} color={colors.sage} /><T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>What we read</T></View>
            <T variant="small" style={{ color: colors.muted }}>{parseInfo.plain_summary}</T>
            {(parseInfo.next_steps || []).map((s: string, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }} testID={`chsp-ws1-next-step-${i}`}><ArrowRight size={12} color={colors.primary} style={{ marginTop: 2 }} /><T variant="small" style={{ flex: 1, color: colors.text }}>{s}</T></View>
            ))}
          </View>
        ) : null}
      </View>

      {lineOptions.length > 1 ? (
        <View testID="chsp-ws1-line-picker" style={{ marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ListChecks size={16} color={colors.primary} />
            <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }}>This invoice has {lineOptions.length} service lines — pick one to check</T>
          </View>
          {lineOptions.map((o: any, i: number) => (
            <Pressable key={i} testID={`chsp-ws1-line-option-${i}`} onPress={() => applyPrefill(o)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <T variant="small" style={{ color: colors.text }} numberOfLines={1}>{o.label || serviceTypeLabel(o.service_type)}</T>
                {(o.variance_status === "minor" || o.variance_status === "material") ? <T style={{ fontSize: 10, color: colors.terracotta, fontFamily: fonts.bodySemi }}>FLAGGED</T> : null}
              </View>
              <T variant="small" style={{ color: colors.text }}>{aud(o.billed_amount)}</T>
            </Pressable>
          ))}
        </View>
      ) : null}

      {services.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Select label="Service Entry" optional value={""} onChange={onServiceChange} options={serviceOpts} testID="chsp-ws1-service-entry" />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md }}>
        <LInput label="Invoice Reference" optional value={form.invoice_reference} onChangeText={(v: string) => set({ invoice_reference: v })} testID="chsp-ws1-reference" colors={colors} />
        <LInput label="Provider" optional value={form.provider_name} onChangeText={(v: string) => set({ provider_name: v })} testID="chsp-ws1-provider" colors={colors} />
        <LInput label="Agreed Per-Unit Rate" required prefix="$" value={form.agreed_rate} onChangeText={(v: string) => set({ agreed_rate: v })} placeholder="6.00" keyboardType="decimal-pad" testID="chsp-ws1-agreed-rate" colors={colors} />
        <LInput label="Rate Effective (DD/MM/YYYY)" optional value={form.rate_effective_date} onChangeText={(v: string) => set({ rate_effective_date: v })} placeholder="01/01/2026" testID="chsp-ws1-rate-date" colors={colors} />
        <LInput label="Units Billed" required value={form.units_billed} onChangeText={(v: string) => set({ units_billed: v })} keyboardType="decimal-pad" testID="chsp-ws1-units-billed" colors={colors} />
        <LInput label="Units Received" required value={form.units_received} onChangeText={(v: string) => set({ units_received: v })} keyboardType="decimal-pad" testID="chsp-ws1-units-received" colors={colors} />
        <LInput label="Billed Period Start (DD/MM/YYYY)" optional value={form.billed_period_start} onChangeText={(v: string) => set({ billed_period_start: v })} placeholder="01/07/2026" testID="chsp-ws1-period-start" colors={colors} />
        <LInput label="Billed Amount" required prefix="$" value={form.billed_amount} onChangeText={(v: string) => set({ billed_amount: v })} keyboardType="decimal-pad" testID="chsp-ws1-billed" colors={colors} />
      </View>
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}
      <Button label="Check Fee" icon={ReceiptText} testID="chsp-ws1-submit" loading={busy} onPress={submit} style={{ marginTop: spacing.md }} />

      {result ? (
        <View testID="chsp-ws1-result" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {result.degraded ? (
            <View testID="chsp-ws1-degraded" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><HelpCircle size={16} color={colors.text} /><T style={{ fontFamily: fonts.bodySemi, color: colors.text }}>No Verdict Yet</T></View>
              <T variant="small" style={{ marginTop: 4 }}>We can&apos;t give a clear verdict without your provider&apos;s agreed per-unit rate. Add it above, then run the check again.</T>
            </View>
          ) : (
            <>
              {(() => {
                const vt = result.overall_verdict === "within" ? { bg: colors.sageSoft, fg: colors.sage } : result.overall_verdict === "material" ? { bg: colors.errorSoft, fg: colors.terracotta } : { bg: colors.alertSoft, fg: colors.alert };
                const tierTone = (tier: string) => tier === "within" ? { bg: colors.sageSoft, fg: colors.sage } : tier === "minor" ? { bg: colors.alertSoft, fg: colors.alert } : { bg: colors.errorSoft, fg: colors.terracotta };
                const billedAmt = Number(form.billed_amount || 0);
                const expectedAmt = Number(result.expected_amount || 0);
                const barMax = Math.max(billedAmt, expectedAmt, 1);
                const rt = tierTone(result.rate_tier);
                const utn = tierTone(result.units_tier);
                return (
                  <>
                    {/* Plain-English verdict */}
                    <View testID="chsp-ws1-verdict-card" style={{ borderWidth: 1, borderColor: vt.fg, backgroundColor: vt.bg, borderRadius: radius.md, padding: spacing.md }}>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                        <VIcon size={18} color={vt.fg} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <T testID="chsp-ws1-verdict" style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }}>{result.verdict_headline || result.verdict_label}</T>
                            <T style={{ fontFamily: fonts.heading, color: colors.text }}>{Number(result.amount_delta) !== 0 ? `${Number(result.amount_delta) > 0 ? "Overbilled " : "Under "}${aud(Math.abs(Number(result.amount_delta)))}` : "No difference"}</T>
                          </View>
                          <T variant="small" style={{ color: colors.text, marginTop: 4, lineHeight: 19 }}>{result.verdict_explanation}</T>
                        </View>
                      </View>
                    </View>

                    {/* Billed vs expected */}
                    <View testID="chsp-ws1-graphic" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
                      <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>WHAT YOU WERE BILLED VS WHAT WE EXPECTED</T>
                      {[["Billed", billedAmt, Number(result.amount_delta) > 0 ? "#C0392B" : "#0E4D52"], ["Expected", expectedAmt, "#3E6A4C"]].map(([lbl, amt, col]: any) => (
                        <View key={lbl}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T variant="small" style={{ color: colors.text }}>{lbl}</T><T variant="small" style={{ color: colors.text }}>{aud(amt)}</T></View>
                          <View style={{ height: 11, borderRadius: 6, backgroundColor: colors.surface2, overflow: "hidden", marginTop: 3 }}>
                            <View style={{ height: 11, width: `${Math.max(4, Math.round((Number(amt) / barMax) * 100))}%`, backgroundColor: col }} />
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Explained tiles */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                      <View testID="chsp-ws1-tile-billed" style={{ flex: 1, minWidth: "45%", backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm }}>
                        <T style={{ fontSize: 10, color: colors.primary, letterSpacing: 0.5 }}>BILLED PER UNIT</T>
                        <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.text, marginTop: 2 }}>{aud(result.billed_per_unit)}</T>
                        <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>What you were charged for each hour, visit or unit.</T>
                      </View>
                      <View testID="chsp-ws1-tile-expected" style={{ flex: 1, minWidth: "45%", backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm }}>
                        <T style={{ fontSize: 10, color: colors.primary, letterSpacing: 0.5 }}>EXPECTED AMOUNT</T>
                        <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.text, marginTop: 2 }}>{aud(result.expected_amount)}</T>
                        <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>Your agreed rate times the units you received.</T>
                      </View>
                      <View testID="chsp-ws1-tile-rate" style={{ flex: 1, minWidth: "45%", backgroundColor: rt.bg, borderRadius: radius.md, padding: spacing.sm }}>
                        <T style={{ fontSize: 10, color: rt.fg, letterSpacing: 0.5 }}>RATE CHECK</T>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, marginTop: 2 }}>{result.rate_tier_label}</T>
                        <T variant="small" style={{ color: colors.text, fontSize: 11, marginTop: 1 }}>{result.rate_explanation}</T>
                      </View>
                      <View testID="chsp-ws1-tile-units" style={{ flex: 1, minWidth: "45%", backgroundColor: utn.bg, borderRadius: radius.md, padding: spacing.sm }}>
                        <T style={{ fontSize: 10, color: utn.fg, letterSpacing: 0.5 }}>UNITS CHECK</T>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, marginTop: 2 }}>{result.units_tier_label}</T>
                        <T variant="small" style={{ color: colors.text, fontSize: 11, marginTop: 1 }}>{result.units_explanation}</T>
                      </View>
                    </View>

                    {result.provisional ? (
                      <View testID="chsp-ws1-staleness" style={{ borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: spacing.md }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Clock size={14} color={colors.gold} /><T style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Confirm This Rate Is Current</T></View>
                        <T variant="small" style={{ marginTop: 4 }}>{result.rate_age_days != null ? `This agreed rate is ${result.rate_age_days} days old.` : "This billed period may span a contribution change."} This verdict is provisional until you confirm the rate still applies.</T>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                      {result.action_label ? <Button label={result.action_label} icon={Mail} testID="chsp-ws1-draft-letter" onPress={() => setLetterOpen(true)} style={{ paddingHorizontal: 16 }} /> : null}
                      <Button label={saving ? "Saving…" : "Save This Check"} variant="outline" icon={Save} testID="chsp-ws1-save" loading={saving} onPress={saveCheck} style={{ paddingHorizontal: 16 }} />
                      <Button label={downloadingPdf ? "Preparing…" : "Download (PDF)"} variant="outline" icon={Download} testID="chsp-ws1-download-pdf" loading={downloadingPdf} onPress={downloadFeeCheckPdf} style={{ paddingHorizontal: 16 }} />
                    </View>
                  </>
                );
              })()}
            </>
          )}
        </View>
      ) : null}

      {saved.length > 0 ? (
        <View style={{ marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }} testID="chsp-ws1-past">
          <Pressable testID="chsp-ws1-past-toggle" onPress={() => setShowPast((s) => !s)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><ListChecks size={16} color={colors.primary} /><T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Past checks ({saved.length})</T></View>
            <T variant="small" style={{ color: colors.muted }}>{showPast ? "Hide" : "Show"}</T>
          </Pressable>
          {showPast ? saved.map((s) => (
            <View key={s.id} testID={`chsp-ws1-past-${s.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <T variant="small" style={{ color: colors.text }} numberOfLines={1}>{s.provider_name || "Provider"} · {serviceTypeLabel(s.service_type)}</T>
                <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{s.result?.verdict_label || "Checked"} · {s.created_at ? shortDate(s.created_at) : ""}</T>
              </View>
              <Pressable testID={`chsp-ws1-past-delete-${s.id}`} onPress={() => deleteSaved(s.id)}><Trash2 size={15} color={colors.terracotta} /></Pressable>
            </View>
          )) : null}
        </View>
      ) : null}

      <AccessHardship colors={colors} providerName={form.provider_name} emphasise={Boolean(result && !result.degraded && result.overall_verdict === "material")} />

      <OverchargeLetterModal
        visible={letterOpen}
        colors={colors}
        onClose={() => setLetterOpen(false)}
        facts={{
          provider_name: form.provider_name || null,
          invoice_reference: form.invoice_reference || null,
          service_description: serviceTypeLabel(form.service_type),
          period: form.billed_period_start || null,
          units: form.units_billed ? Number(form.units_billed) : null,
          unit_label: "units",
          billed_unit_rate: result ? Number(result.billed_per_unit) : null,
          agreed_rate: form.agreed_rate ? Number(form.agreed_rate) : null,
          billed_amount: form.billed_amount ? Number(form.billed_amount) : null,
          expected_amount: result ? Number(result.expected_amount) : null,
        }}
      />
    </Card>
  );
}

export default function ChspToolsScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [ws1, setWs1] = useState(false);
  const [needsChange, setNeedsChange] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const c = await apiFetch<any>("/chsp1/config"); setWs1(Boolean(c?.chsp_tools_v1)); } catch { setWs1(false); }
    try { const p = await apiFetch<any>("/chsp1/profile"); setProfile(p?.profile || null); } catch { setProfile(null); }
    try { const s = await apiFetch<any>("/chsp1/service-entries"); setServices(s?.service_entries || []); } catch { setServices([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="CHSP Tools" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled" testID="chsp-tools-root">
          <PageIntro
            eyebrow="Commonwealth Home Support Programme"
            title="Check Your CHSP Billing."
            description="See whether your CHSP invoice looks right. CHSP may be exactly the right program for you. If your needs have changed, you can also think through a move to Support at Home, without pressure."
            whatItDoes="Reads any CHSP invoice line by line, checks each service against your provider's agreed per-unit rate, and drafts letters to keep services running or apply for hardship. An optional walkthrough helps only if your needs have changed."
          />

          {loading ? <Loading label="Loading your CHSP profile…" /> : (
            <>
              <ChspProfileCard profile={profile} onCreate={load} colors={colors} />
              {profile ? (
                <>
                  {/* Is CHSP still the right fit? — surfaced up top, not buried at the bottom. */}
                  <View testID="chsp-fit-self-check" style={{ backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary + "33", borderRadius: radius.lg, padding: spacing.md }}>
                    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + "1A", alignItems: "center", justifyContent: "center" }}>
                        <Home size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T variant="label" style={{ color: colors.primary }}>IS CHSP STILL THE RIGHT FIT?</T>
                        <T variant="small" style={{ marginTop: 4, lineHeight: 20, color: colors.text }}>Most people on CHSP are on the right program. You only need the transition walkthrough if your care needs have genuinely changed.</T>
                      </View>
                    </View>
                    <Pressable testID="chsp-needs-change" onPress={() => setNeedsChange((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm }}>
                      <Checkbox checked={needsChange} colors={colors} />
                      <T variant="small" style={{ flex: 1, color: colors.text }}>My care needs have changed recently (for example after a hospital stay or a health change).</T>
                    </Pressable>
                  </View>

                  {needsChange ? <TransitionWalkthrough colors={colors} /> : null}

                  <ChspInvoiceAnalyzer colors={colors} />

                  <ChspServicesCard services={services} onAdded={load} colors={colors} />
                  {ws1 ? <WS1FeeCheck services={services} colors={colors} /> : <FeeCheckForm services={services} colors={colors} />}

                  <View testID="chsp-disclaimer" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Not financial or legal advice.</T>
                    <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>Wayly helps you understand and organise your aged-care information. It is not a substitute for professional financial, legal, or clinical advice. Verdicts and letters may contain errors, always check the detail against your own records before acting.</T>
                  </View>
                </>
              ) : null}

              <Card style={{ backgroundColor: colors.goldSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <HeartPulse size={18} color={colors.gold} />
                  <T style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }}>Need to talk it through?</T>
                </View>
                <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>Call My Aged Care on 1800 200 422 to discuss CHSP, a reassessment, or moving to Support at Home.</T>
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ChspProfileCard({ profile, onCreate, colors }: any) {
  const [status, setStatus] = useState(profile?.current_chsp_status || "on_chsp");
  const [start, setStart] = useState(profile?.chsp_start_date ? String(profile.chsp_start_date).slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try { await apiFetch("/chsp1/profile", { method: "POST", body: { current_chsp_status: status, chsp_start_date: start || null } }); setEditing(false); onCreate?.(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not save profile."); }
    finally { setBusy(false); }
  };

  if (profile && !editing) {
    return (
      <Card testID="chsp-profile-summary">
        <T variant="small" style={{ color: colors.muted, fontSize: 11, letterSpacing: 0.5 }}>CHSP PROFILE</T>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 4 }}>Status: {chspStatusLabel(profile.current_chsp_status)}{profile.chsp_start_date ? ` · started ${shortDate(profile.chsp_start_date)}` : ""}</T>
        <Button label="Edit" variant="outline" testID="chsp-profile-edit" onPress={() => { setStatus(profile.current_chsp_status || "on_chsp"); setStart(profile.chsp_start_date ? String(profile.chsp_start_date).slice(0, 10) : ""); setEditing(true); }} style={{ marginTop: spacing.md, alignSelf: "flex-start", paddingHorizontal: 20 }} />
      </Card>
    );
  }

  return (
    <Card testID="chsp-profile-form">
      <T variant="small" style={{ color: colors.muted, fontSize: 11, letterSpacing: 0.5 }}>{profile ? "UPDATE YOUR CHSP PROFILE" : "START A CHSP PROFILE"}</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>Set your current CHSP status so we can check fees and walk through transition to Support at Home.</T>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Select label="Status" required value={status} onChange={setStatus} options={STATUS_OPTIONS} testID="chsp-status" />
        <LInput label="CHSP start date (optional, YYYY-MM-DD)" value={start} onChangeText={setStart} placeholder="2024-03-01" testID="chsp-start-date" colors={colors} />
      </View>
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button label={profile ? "Save changes" : "Save profile"} icon={Home} testID="chsp-profile-save" loading={busy} onPress={submit} style={{ flexGrow: 1 }} />
        {profile ? <Button label="Cancel" variant="outline" testID="chsp-profile-cancel" onPress={() => setEditing(false)} style={{ flexGrow: 1 }} /> : null}
      </View>
    </Card>
  );
}

function ChspServicesCard({ services, onAdded, colors }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ service_type: "domestic_assistance", provider_name: "", hourly_rate_or_fee: "", weekly_frequency: "", client_contribution_per_unit: "", start_date: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editEff, setEditEff] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const startEdit = (s: any) => {
    setEditId(s.id);
    setEditRate(s.hourly_rate_or_fee?.amount != null ? String(s.hourly_rate_or_fee.amount) : "");
    setEditEff(s.start_date ? shortDate(s.start_date) : "");
  };
  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/chsp1/service-entries/${id}`, { method: "PATCH", body: { hourly_rate_or_fee: editRate === "" ? undefined : Number(editRate), start_date: editEff || undefined } });
      setEditId(null); onAdded?.();
    } catch { /* keep open */ } finally { setBusyId(null); }
  };
  const expire = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/chsp1/service-entries/${id}/expire`, { method: "POST" }); onAdded?.(); }
    catch { /* ignore */ } finally { setBusyId(null); }
  };

  const submit = async () => {
    if (!form.provider_name || !form.hourly_rate_or_fee || !form.start_date) { setError("Provider, rate and start date are required."); return; }
    setBusy(true); setError("");
    try {
      await apiFetch("/chsp1/service-entries", { method: "POST", body: {
        service_type: form.service_type,
        provider_name: form.provider_name,
        hourly_rate_or_fee: Number(form.hourly_rate_or_fee),
        weekly_frequency: form.weekly_frequency,
        client_contribution_per_unit: form.client_contribution_per_unit ? Number(form.client_contribution_per_unit) : 0,
        start_date: form.start_date,
      } });
      setForm({ service_type: "domestic_assistance", provider_name: "", hourly_rate_or_fee: "", weekly_frequency: "", client_contribution_per_unit: "", start_date: "" });
      setOpen(false);
      onAdded?.();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not add service."); }
    finally { setBusy(false); }
  };

  return (
    <Card testID="chsp-services-card" style={{ backgroundColor: colors.sageSoft }}>
      <T variant="label" style={{ color: colors.sage }}>SETUP · AGREED RATE SCHEDULE</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
        <Wrench size={18} color={colors.primary} />
        <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, flex: 1 }}>Your Saved Provider Rates</T>
        <T variant="small" style={{ color: colors.muted }} testID="chsp-services-count">{services.length}</T>
      </View>
      <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>Record each service so fee checks pre-fill the provider and rate for you.</T>

      {services.length > 0 ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }} testID="chsp-services-list">
          {services.map((s: any) => (
            <View key={s.id} testID={`chsp-service-${s.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{serviceTypeLabel(s.service_type)}</T>
              <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
                {s.provider_name}{s.hourly_rate_or_fee?.amount != null ? ` · $${s.hourly_rate_or_fee.amount} / unit` : ""}{s.start_date ? ` · effective ${shortDate(s.start_date)}` : ""}
              </T>
              {editId === s.id ? (
                <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    <LInput label="Rate" prefix="$" value={editRate} onChangeText={setEditRate} keyboardType="decimal-pad" testID={`chsp-rate-edit-amount-${s.id}`} colors={colors} />
                    <LInput label="Effective (DD/MM/YYYY)" value={editEff} onChangeText={setEditEff} placeholder="DD/MM/YYYY" testID={`chsp-rate-edit-date-${s.id}`} colors={colors} />
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Button label="Cancel" variant="outline" onPress={() => setEditId(null)} style={{ flexGrow: 1 }} />
                    <Button label="Save" testID={`chsp-rate-save-${s.id}`} loading={busyId === s.id} onPress={() => saveEdit(s.id)} style={{ flexGrow: 1 }} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Button label="Edit" variant="outline" testID={`chsp-rate-edit-${s.id}`} onPress={() => startEdit(s)} style={{ flexGrow: 1 }} />
                  <Button label="Expire" variant="ghost" testID={`chsp-rate-expire-${s.id}`} loading={busyId === s.id} onPress={() => expire(s.id)} style={{ flexGrow: 1 }} />
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <T variant="small" style={{ color: colors.muted, marginTop: spacing.md }} testID="chsp-services-empty">No services yet. Add the ones your parent receives.</T>
      )}

      {open ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }} testID="chsp-service-form">
          <Select label="Service type" required value={form.service_type} onChange={(v: string) => set({ service_type: v })} options={SERVICE_TYPES} testID="chsp-svc-type" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <LInput label="Provider" value={form.provider_name} onChangeText={(v: string) => set({ provider_name: v })} testID="chsp-svc-provider" colors={colors} />
            <LInput label="Hourly Rate / Fee" prefix="$" value={form.hourly_rate_or_fee} onChangeText={(v: string) => set({ hourly_rate_or_fee: v })} keyboardType="decimal-pad" testID="chsp-svc-rate" colors={colors} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <LInput label="Weekly frequency (optional)" value={form.weekly_frequency} onChangeText={(v: string) => set({ weekly_frequency: v })} placeholder="e.g. 2 hrs / week" testID="chsp-svc-frequency" colors={colors} />
            <LInput label="Your contribution / unit (optional)" value={form.client_contribution_per_unit} onChangeText={(v: string) => set({ client_contribution_per_unit: v })} keyboardType="decimal-pad" testID="chsp-svc-contribution" colors={colors} />
          </View>
          <LInput label="Start date (DD/MM/YYYY)" value={form.start_date} onChangeText={(v: string) => set({ start_date: v })} placeholder="01/07/2025" testID="chsp-svc-start" colors={colors} />
          {error ? <T variant="small" style={{ color: colors.terracotta }} testID="chsp-svc-error">{error}</T> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Cancel" variant="outline" onPress={() => { setOpen(false); setError(""); }} style={{ flexGrow: 1 }} />
            <Button label="Save service" icon={Plus} testID="chsp-svc-save" loading={busy} onPress={submit} style={{ flexGrow: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="Add a service" variant="outline" icon={Plus} testID="chsp-svc-add" onPress={() => setOpen(true)} style={{ marginTop: spacing.md }} />
      )}
    </Card>
  );
}

function VarianceBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    within_tolerance: { tone: "success", label: "Within tolerance" },
    minor_variance: { tone: "alert", label: "Minor variance" },
    material_variance: { tone: "error", label: "Material variance" },
  };
  const cfg = map[status] || map.within_tolerance;
  return <Badge label={cfg.label} tone={cfg.tone} testID={`variance-badge-${status}`} />;
}

function FeeCheckForm({ services, colors }: any) {
  const [form, setForm] = useState<any>({
    chsp_service_entry_id: "", invoice_or_statement_reference: "", service_type: "domestic_assistance",
    provider_name: "", billed_period_start: "", billed_period_end: "", billed_amount: "", units_billed: "", expected_amount: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [disputeMsg, setDisputeMsg] = useState("");
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const onServiceChange = (id: string) => {
    const svc = services.find((s: any) => s.id === id);
    if (svc) set({ chsp_service_entry_id: id, service_type: svc.service_type || form.service_type, provider_name: svc.provider_name || form.provider_name });
    else set({ chsp_service_entry_id: "" });
  };

  const submit = async () => {
    const required = ["invoice_or_statement_reference", "provider_name", "billed_period_start", "billed_period_end", "billed_amount", "expected_amount", "units_billed"];
    for (const k of required) { if (!form[k]) { setError(`Missing: ${k.replace(/_/g, " ")}`); return; } }
    setBusy(true); setError(""); setDisputeMsg("");
    try {
      const data = await apiFetch<any>("/chsp1/fee-checks", { method: "POST", body: {
        ...form, billed_amount: Number(form.billed_amount), expected_amount: Number(form.expected_amount),
        chsp_service_entry_id: form.chsp_service_entry_id || null,
      } });
      setResult(data);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not check fee."); }
    finally { setBusy(false); }
  };

  const openDispute = async () => {
    if (!result?.fee_check?.id) return;
    try {
      const data = await apiFetch<any>(`/chsp1/fee-checks/${result.fee_check.id}/dispute`, { method: "POST" });
      setDisputeMsg(data?.case_id ? "Dispute case opened." : "Recorded. Case creation isn't wired in this environment.");
    } catch { setDisputeMsg("Could not open dispute."); }
  };

  const serviceOpts = [{ value: "", label: "Manual entry" }, ...services.map((s: any) => ({ value: s.id, label: `${serviceTypeLabel(s.service_type)} · ${s.provider_name}` }))];

  return (
    <Card testID="chsp-fee-check-form">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ReceiptText size={18} color={colors.primary} />
        <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, flex: 1 }}>Was this CHSP invoice correct?</T>
      </View>
      <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>Enter what you were billed and what you expected. We&apos;ll flag anything outside a 2% or $5 tolerance.</T>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {services.length > 0 ? <Select label="Service entry (pre-fills provider / type)" optional value={form.chsp_service_entry_id} onChange={onServiceChange} options={serviceOpts} testID="chsp-fc-service-entry" /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <LInput label="Invoice / statement reference" value={form.invoice_or_statement_reference} onChangeText={(v: string) => set({ invoice_or_statement_reference: v })} testID="chsp-fc-reference" colors={colors} />
          <LInput label="Provider" value={form.provider_name} onChangeText={(v: string) => set({ provider_name: v })} testID="chsp-fc-provider" colors={colors} />
        </View>
        <Select label="Service type" required value={form.service_type} onChange={(v: string) => set({ service_type: v })} options={SERVICE_TYPES} testID="chsp-fc-service-type" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <LInput label="Units billed" value={form.units_billed} onChangeText={(v: string) => set({ units_billed: v })} placeholder="e.g. 4 hours" testID="chsp-fc-units" colors={colors} />
          <LInput label="Billed amount (AUD)" value={form.billed_amount} onChangeText={(v: string) => set({ billed_amount: v })} keyboardType="decimal-pad" testID="chsp-fc-billed" colors={colors} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <LInput label="Expected amount (AUD)" value={form.expected_amount} onChangeText={(v: string) => set({ expected_amount: v })} keyboardType="decimal-pad" testID="chsp-fc-expected" colors={colors} />
          <LInput label="Billed period start (YYYY-MM-DD)" value={form.billed_period_start} onChangeText={(v: string) => set({ billed_period_start: v })} placeholder="2026-01-01" testID="chsp-fc-period-start" colors={colors} />
        </View>
        <LInput label="Billed period end (YYYY-MM-DD)" value={form.billed_period_end} onChangeText={(v: string) => set({ billed_period_end: v })} placeholder="2026-01-31" testID="chsp-fc-period-end" colors={colors} />
      </View>

      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="chsp-fc-error">{error}</T> : null}
      <Button label="Check fee" icon={ReceiptText} testID="chsp-fc-submit" loading={busy} onPress={submit} style={{ marginTop: spacing.md }} />

      {result ? (
        <View testID="chsp-fc-result" style={{ marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <T style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Variance ${result.fee_check?.variance_amount?.amount} ({result.fee_check?.variance_percentage}%)</T>
            <VarianceBadge status={result.fee_check?.variance_status} />
          </View>
          {result.requires_explanation ? (
            <Button label="Open dispute case" variant="outline" icon={ShieldAlert} testID="chsp-fc-open-dispute" onPress={openDispute} style={{ alignSelf: "flex-start" }} />
          ) : (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><CheckCircle2 size={14} color={colors.sage} /><T variant="small" style={{ color: colors.muted }}>Within tolerance — nothing to action.</T></View>
          )}
          {disputeMsg ? <T variant="small" style={{ color: colors.muted }} testID="chsp-fc-dispute-msg">{disputeMsg}</T> : null}
        </View>
      ) : null}
    </Card>
  );
}

function TransitionWalkthrough({ colors }: any) {
  const [step, setStep] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonsNotes, setReasonsNotes] = useState("");
  const [considerations, setConsiderations] = useState<Record<string, boolean>>({});
  const [decision, setDecision] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<any>(null);
  const [error, setError] = useState("");

  const toggleReason = (r: string) => setReasons((l) => l.includes(r) ? l.filter((x) => x !== r) : [...l, r]);
  const toggleConsideration = (k: string) => setConsiderations((c) => ({ ...c, [k]: !c[k] }));

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch<any>("/chsp1/transition-considerations", { method: "POST", body: {
        reasons_for_considering_transition: reasons, reasons_notes: reasonsNotes || null,
        considerations_reviewed: considerations, decision: decision || null, decision_notes: decisionNotes || null,
      } });
      setSubmitted(data?.transition_consideration || {});
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save."); }
    finally { setBusy(false); }
  };

  const titles = ["Why the change?", "Understand differences", "Make a decision"];

  return (
    <Card testID="chsp-transition-walkthrough">
      <T variant="small" style={{ color: colors.muted, fontSize: 11, letterSpacing: 0.5 }}>CONSIDERING A MOVE TO SUPPORT AT HOME?</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 2 }}>Transition walkthrough</T>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        {titles.map((t, i) => (
          <Pressable key={i} testID={`tw-step-${i}`} onPress={() => setStep(i)}
            style={{ borderWidth: 1, borderColor: step === i ? colors.primary : colors.border, backgroundColor: step === i ? colors.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T variant="small" style={{ fontSize: 11, color: step === i ? "#fff" : colors.muted }}>{i + 1}. {t}</T>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {step === 0 ? (
          <>
            {REASONS.map((r) => (
              <Pressable key={r} testID={`tw-reason-${r}`} onPress={() => toggleReason(r)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Checkbox checked={reasons.includes(r)} colors={colors} />
                <T variant="small" style={{ flex: 1, color: colors.text }}>{labelize(r)}</T>
              </Pressable>
            ))}
            <TextInput testID="tw-reasons-notes" value={reasonsNotes} onChangeText={setReasonsNotes} multiline placeholder="Anything else?" placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 70, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body }} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <View testID="tw-two-sided" style={{ backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, padding: spacing.md }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Support at Home is not automatically better.</T>
              <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>Compared with CHSP, Support at Home can cost more, is means tested, and can involve waitlists. For many people, CHSP remains the right program.</T>
            </View>
            <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>Tick each concept you feel comfortable with. Nothing is submitted yet, this is just for your own confidence.</T>
            {CONSIDERATIONS.map((c) => (
              <Pressable key={c.key} testID={`tw-consideration-${c.key}`} onPress={() => toggleConsideration(c.key)} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Checkbox checked={!!considerations[c.key]} colors={colors} />
                <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 19 }}>{c.label}</T>
              </Pressable>
            ))}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <Select label="Decision" required value={decision} onChange={setDecision} options={DECISION_OPTIONS} testID="tw-decision" />
            <TextInput testID="tw-decision-notes" value={decisionNotes} onChangeText={setDecisionNotes} multiline placeholder="Notes about this decision" placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 70, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body }} />
          </>
        ) : null}
      </View>

      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        {step > 0 ? <Button label="Back" variant="outline" onPress={() => setStep(step - 1)} style={{ flexGrow: 1 }} /> : null}
        {step < 2 ? <Button label="Next" icon={ArrowRight} testID="tw-next" onPress={() => setStep(step + 1)} style={{ flexGrow: 1 }} /> : null}
        {step === 2 ? <Button label="Save decision" icon={ClipboardCheck} testID="tw-submit" loading={busy} onPress={submit} style={{ flexGrow: 1 }} /> : null}
      </View>

      {submitted ? (
        <View testID="tw-saved" style={{ marginTop: spacing.md, borderWidth: 1, borderColor: colors.sage, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", gap: 8 }}>
          <CheckCircle2 size={16} color={colors.sage} style={{ marginTop: 1 }} />
          <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 19 }}>Decision recorded. Reasons: {reasons.length}. Considerations reviewed: {Object.values(considerations).filter(Boolean).length} / {CONSIDERATIONS.length}.</T>
        </View>
      ) : null}
    </Card>
  );
}
