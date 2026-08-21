import React, { useCallback, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { CloudOff, MessageCircle } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { InvoiceResultBanner, InvoiceMetadataStrip, WaylySummaryCard, InvoiceIssueRegister, InvoiceChargesTable, InvoiceDownloadBar } from "@/src/components/invoices/InvoiceResultView";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";

type Finding = {
  check_id?: string;
  confidence?: string;
  narrative?: string;
  suggested_question?: string;
  tier?: number;
};
type Invoice = {
  id: string;
  filename: string;
  provider_name?: string | null;
  invoice_date?: string | null;
  created_at?: string;
  reconciliation?: {
    overall_verdict?: string;
    findings?: Finding[];
    summary_md?: string;
    clean_reconciliation?: { check_id: string; label: string; ok: boolean }[];
  };
};

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Invoice>(`/invoices/${id}`);
      setInv(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rec = inv?.reconciliation;
  const findings = rec?.findings || [];

  const onDraftLetter = async (findingIndex: number) => {
    try {
      await apiFetch(`/invoices/${id}/findings/${findingIndex}/letter`, { method: "POST" });
      Alert.alert("Letter drafted", "We created a draft letter for this issue. Find it in Letters & Follow-ups.", [
        { text: "View letters", onPress: () => router.push("/correspondence") },
        { text: "OK" },
      ]);
    } catch {
      Alert.alert("Could not draft letter", "Please try again in a moment.");
    }
  };

  const onDraftAll = async () => {
    try {
      await apiFetch(`/invoices/${id}/letter`, { method: "POST" });
      Alert.alert("Letter drafted", "We created one draft letter covering all issues on this invoice. Find it in Letters & Follow-ups.", [
        { text: "View letters", onPress: () => router.push("/correspondence") },
        { text: "OK" },
      ]);
    } catch {
      Alert.alert("Could not draft letter", "Please try again in a moment.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoice" subtitle={inv?.provider_name || inv?.filename} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading invoice…" />
      ) : error || !inv ? (
        <StatePanel testID="invoice-error" icon={CloudOff} title="Couldn't load this invoice" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView testID="inv1-result" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Card testID="invoice-overview">
            <T variant="label">PROVIDER</T>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 2 }}>{inv.provider_name || "Care provider"}</T>
            <T variant="small" style={{ marginTop: 2 }}>Invoice {shortDate(inv.invoice_date || inv.created_at)}</T>
          </Card>

          <InvoiceResultBanner result={inv} />
          <InvoiceMetadataStrip result={inv} />
          <InvoiceDownloadBar invoiceId={id} />

          <WaylySummaryCard summary={rec?.summary_md} />
          <InvoiceIssueRegister findings={findings} onDraftLetter={onDraftLetter} onDraftAll={onDraftAll} />
          <InvoiceChargesTable result={inv} />


          <Button
            label="Ask Wayly about this invoice"
            testID="invoice-ask-button"
            icon={MessageCircle}
            variant="secondary"
            onPress={() => router.push("/(tabs)/ask")}
          />
        </ScrollView>
      )}
    </View>
  );
}
