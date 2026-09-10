import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Upload, ArrowRight, AlertTriangle, FileText, ReceiptText } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import ToolEntriesButton from "@/src/components/ToolEntriesButton";
import InvoiceResultView from "@/src/components/invoices/InvoiceResultView";
import UploadGuardNotice from "@/src/components/UploadGuardNotice";
import ResultActions from "@/src/components/tools/ResultActions";
import { useScrollToResult } from "@/src/hooks/useScrollToResult";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";

export default function InvoiceChecker() {
  const { colors } = useTheme();
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [guard, setGuard] = useState<any>(null);
  const [dupe, setDupe] = useState<any>(null);
  const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "text/*", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType });
      setResult(null); setError(""); setGuard(null); setDupe(null);
    }
  };

  const upload = async (override = false) => {
    if (!file) return;
    setBusy(true); setError(""); setResult(null); setGuard(null); setDupe(null);
    try {
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);
      if (override) form.append("override_guard", "true");
      const data: any = await apiFetch("/invoices/upload", { method: "POST", body: form, isForm: true });
      if (data?.upload_guard && data.upload_guard.decision !== "accept") { setGuard(data.upload_guard); return; }
      setResult(data);
      scrollToResult();
    } catch (e) {
      const detail = e instanceof ApiError ? e.data?.detail : null;
      if (e instanceof ApiError && e.status === 409 && detail?.error === "DUPLICATE_EXACT") {
        setDupe(detail);
        return;
      }
      setError(e instanceof ApiError ? e.message : "We could not read this file. Please try a clearer copy.");
    } finally { setBusy(false); }
  };

  const reset = () => { setFile(null); setResult(null); setError(""); setGuard(null); setDupe(null); };

  const isStatement = result?.document_shape === "statement";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoice Checker" onBack={() => router.back()} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <T variant="bodyMuted" style={{ lineHeight: 22 }}>
          {"Upload the invoice your provider sent. We verify every line against Support at Home rules, flag anything worth raising, and show what you actually pay."}
        </T>
        <ToolEntriesButton toolKey="invoice-checker" />

        <Card testID="inv1-upload-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <ReceiptText size={22} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>Upload your invoice</T>
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 19 }}>PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP. Combined statement + invoice documents work too.</T>

          <View style={[styles.drop, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            {!file ? (
              <Pressable testID="inv1-pick-file" onPress={pick} style={{ alignItems: "center", paddingVertical: spacing.md }}>
                <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Upload size={26} color={colors.primary} />
                </View>
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text, marginTop: 10 }}>Tap to choose your invoice</T>
                <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>PDF, Word, image or CSV</T>
              </Pressable>
            ) : (
              <View style={{ gap: spacing.sm, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <FileText size={16} color={colors.primary} />
                  <T variant="small" testID="inv1-file-name" numberOfLines={1} style={{ maxWidth: 220 }}>{file.name}</T>
                </View>
                <Button label={busy ? "Reading your invoice…" : "Check my invoice"} testID="inv1-upload-submit" icon={ArrowRight} onPress={() => upload()} loading={busy} />
                <Pressable testID="inv1-reset" onPress={reset}><T variant="small" style={{ color: colors.muted, textDecorationLine: "underline" }}>Choose a different file</T></Pressable>
              </View>
            )}
          </View>
        </Card>

        {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }} testID="inv1-error">{error}</T></View> : null}

        {dupe ? (
          <Card testID="inv1-duplicate" style={{ borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.goldSoft }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
              <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ alignSelf: "flex-start", backgroundColor: colors.gold + "55", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.text }}>ALREADY CHECKED</T>
                </View>
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text, marginTop: 6 }}>You have already checked this invoice</T>
                <T variant="small" style={{ color: colors.text, marginTop: 4, lineHeight: 20 }}>
                  {`This exact file was uploaded before${dupe.existing_created_at ? ` on ${shortDate(dupe.existing_created_at)}` : ""}${dupe.existing_provider_name ? ` for ${dupe.existing_provider_name}` : ""}. Open the existing check instead of creating a duplicate.`}
                </T>
              </View>
            </View>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {dupe.existing_invoice_id ? (
                <Button label="Open the existing check" testID="inv1-duplicate-open" icon={ArrowRight} onPress={() => router.push(`/invoice/${dupe.existing_invoice_id}`)} />
              ) : null}
              <Button label="Check a different invoice" variant="outline" testID="inv1-duplicate-reset" onPress={reset} />
            </View>
          </Card>
        ) : null}

        {guard ? (
          <UploadGuardNotice
            verdict={guard}
            busy={busy}
            onContinue={guard.decision === "confirm" ? () => upload(true) : undefined}
            onChooseAnother={reset}
          />
        ) : null}

        {result && isStatement ? (
          <Card testID="inv1-statement-redirect">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>This looks like your statement, not your invoice.</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>Your statement is a summary, not a bill. Upload the invoice and we will check what you actually pay.</T>
            <Button label="Open Statement Decoder" testID="inv1-open-statement-decoder" icon={ArrowRight} onPress={() => router.replace("/tool/statement-decoder")} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        {result && !isStatement && result.document_shape ? (
          <View onLayout={onResultLayout} style={{ gap: spacing.md }}>
            <InvoiceResultView
              result={result}
              onDraftLetter={async (findingIndex: number) => {
                try {
                  const data = await apiFetch<any>(`/invoices/${result.invoice_id}/findings/${findingIndex}/letter`, { method: "POST" });
                  if (data?.entry_id) router.push(`/letters/${data.entry_id}`);
                } catch {
                  Alert.alert("Could not draft letter", "Please try again in a moment.");
                }
              }}
              onDraftAll={async () => {
                try {
                  const data = await apiFetch<any>(`/invoices/${result.invoice_id}/letter`, { method: "POST" });
                  if (data?.entry_id) router.push(`/letters/${data.entry_id}`);
                } catch {
                  Alert.alert("Could not draft letter", "Please try again in a moment.");
                }
              }}
            />
            <ResultActions mode="payload" tool="invoice" payload={result} personName={result.provider_name || undefined} fileBaseName="wayly-invoice-check" testIDPrefix="inv1-export" />
            <Button label="Check another invoice" variant="outline" testID="inv1-check-another" onPress={reset} />
          </View>
        ) : null}

        <ToolExplainer toolKey="invoice-checker" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { borderWidth: 2, borderStyle: "dashed", borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, alignItems: "center" },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
