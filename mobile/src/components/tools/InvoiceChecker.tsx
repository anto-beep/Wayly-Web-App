import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Upload, ArrowRight, CheckCircle2, AlertTriangle, Info, HelpCircle, FileText, ReceiptText } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI, shortDate } from "@/src/utils/format";

const VERDICT_META: Record<string, { heading: string; body: string; icon: any; tone: (c: any) => string }> = {
  all_clear: { heading: "Looks all clear", body: "We checked this invoice against the current Support at Home rules and could not find anything worth raising.", icon: CheckCircle2, tone: (c) => c.sage },
  items_to_note: { heading: "A few items to note", body: "Nothing needs urgent action, but there are one or two informational items worth reading.", icon: Info, tone: (c) => c.gold },
  questions_to_raise: { heading: "Some questions to raise", body: "We found lines worth asking your provider about before you pay.", icon: HelpCircle, tone: (c) => c.gold },
  check_before_paying: { heading: "Check before you pay", body: "We found something that may breach the Support at Home rules. Please raise these before paying.", icon: AlertTriangle, tone: (c) => c.terracotta },
};

export default function InvoiceChecker() {
  const { colors } = useTheme();
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "text/*", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType });
      setResult(null); setError("");
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);
      const data = await apiFetch("/invoices/upload", { method: "POST", body: form, isForm: true });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We could not read this file. Please try a clearer copy.");
    } finally { setBusy(false); }
  };

  const reset = () => { setFile(null); setResult(null); setError(""); };

  const recon = result?.reconciliation || {};
  const verdict = recon.overall_verdict || "all_clear";
  const vm = VERDICT_META[verdict] || VERDICT_META.all_clear;
  const VIcon = vm.icon; const vColor = vm.tone(colors);
  const findings = recon.findings || [];
  const isStatement = result?.document_shape === "statement";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoice Checker" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Invoice Checker</T>
        <T variant="bodyMuted" style={{ lineHeight: 22 }}>
          {"Upload the invoice your provider sent. We verify every line against Support at Home rules, flag anything worth raising, and show what you actually pay."}
        </T>

        <Card testID="inv1-upload-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <ReceiptText size={22} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>Upload your invoice</T>
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 19 }}>PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP. Combined statement + invoice documents work too.</T>

          <View style={[styles.drop, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            {!file ? (
              <Button label="Choose invoice" testID="inv1-pick-file" icon={Upload} onPress={pick} />
            ) : (
              <View style={{ gap: spacing.sm, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <FileText size={16} color={colors.primary} />
                  <T variant="small" testID="inv1-file-name" numberOfLines={1} style={{ maxWidth: 220 }}>{file.name}</T>
                </View>
                <Button label={busy ? "Reading your invoice…" : "Check my invoice"} testID="inv1-upload-submit" icon={ArrowRight} onPress={upload} loading={busy} />
                <Pressable testID="inv1-reset" onPress={reset}><T variant="small" style={{ color: colors.muted, textDecorationLine: "underline" }}>Choose a different file</T></Pressable>
              </View>
            )}
          </View>
        </Card>

        {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }} testID="inv1-error">{error}</T></View> : null}

        {result && isStatement ? (
          <Card testID="inv1-statement-redirect">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>This looks like your statement, not your invoice.</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>Your statement is a summary, not a bill. Upload the invoice and we will check what you actually pay.</T>
            <Button label="Open Statement Decoder" testID="inv1-open-statement-decoder" icon={ArrowRight} onPress={() => router.replace("/tool/statement-decoder")} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        {result && !isStatement && result.document_shape ? (
          <View testID="inv1-result" style={{ gap: spacing.md }}>
            {/* Verdict banner */}
            <Card testID={`inv1-verdict-${verdict}`} style={{ borderColor: vColor }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <VIcon size={26} color={vColor} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>{vm.heading}</T>
                  <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>{vm.body}</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 6 }}>{(recon.lines || []).length} line{(recon.lines || []).length === 1 ? "" : "s"} read</T>
                </View>
              </View>
            </Card>

            {/* Metadata */}
            <Card testID="inv1-meta-card">
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.sm }}>INVOICE DETAILS</T>
              {result.provider_name ? <Row label="Provider" value={result.provider_name} colors={colors} /> : null}
              {result.invoice_date ? <Row label="Invoice date" value={shortDate(result.invoice_date) || result.invoice_date} colors={colors} /> : null}
              {result.due_date ? <Row label="Due date" value={shortDate(result.due_date) || result.due_date} colors={colors} /> : null}
            </Card>

            {/* AI summary */}
            {recon.summary_md ? (
              <Card testID="inv1-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.primary }}>WAYLY SUMMARY</T>
                <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text, marginTop: 6 }}>{sanitizeAI(recon.summary_md)}</T>
              </Card>
            ) : null}

            {/* Findings */}
            {findings.length ? (
              <Card testID="inv1-issue-register">
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.sm }}>ISSUES TO REVIEW ({findings.length})</T>
                <View style={{ gap: spacing.md }}>
                  {findings.map((f: any, i: number) => (
                    <View key={i} testID={`inv1-finding-${i}`} style={{ borderLeftWidth: 3, borderLeftColor: f.tier >= 3 ? colors.terracotta : colors.gold, paddingLeft: spacing.sm }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: f.tier >= 3 ? colors.terracotta : colors.gold }}>TIER {f.tier}</T>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 2 }}>{sanitizeAI(f.title)}</T>
                      {f.detail ? <T variant="small" style={{ marginTop: 2, lineHeight: 19 }}>{sanitizeAI(f.detail)}</T> : null}
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            <Button label="Check another invoice" variant="outline" testID="inv1-check-another" onPress={reset} />
          </View>
        ) : null}

        <ToolExplainer toolKey="invoice-checker" />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, colors }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
      <T variant="small" style={{ color: colors.muted }}>{label}</T>
      <T variant="small" style={{ fontFamily: fonts.bodySemi, flex: 1, textAlign: "right" }} numberOfLines={1}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { borderWidth: 2, borderStyle: "dashed", borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, alignItems: "center" },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
