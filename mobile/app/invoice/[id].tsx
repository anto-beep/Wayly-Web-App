import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { CloudOff, MessageCircle } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { InvoiceResultBanner, InvoiceMetadataStrip, WaylySummaryCard, InvoiceIssueRegister } from "@/src/components/invoices/InvoiceResultView";
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoice" subtitle={inv?.provider_name || inv?.filename} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading invoice…" />
      ) : error || !inv ? (
        <StatePanel testID="invoice-error" icon={CloudOff} title="Couldn't load this invoice" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Card testID="invoice-overview">
            <T variant="label">PROVIDER</T>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 2 }}>{inv.provider_name || "Care provider"}</T>
            <T variant="small" style={{ marginTop: 2 }}>Invoice {shortDate(inv.invoice_date || inv.created_at)}</T>
          </Card>

          <InvoiceResultBanner result={inv} />
          <InvoiceMetadataStrip result={inv} />

          <WaylySummaryCard summary={rec?.summary_md} />
          <InvoiceIssueRegister findings={findings} />

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
