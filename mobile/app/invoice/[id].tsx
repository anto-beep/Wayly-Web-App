import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { shortDate, verdictTone } from "@/src/utils/format";

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
  const checks = rec?.clean_reconciliation || [];
  const v = verdictTone(rec?.overall_verdict);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoice" subtitle={inv?.provider_name || inv?.filename} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading invoice…" />
      ) : error || !inv ? (
        <StatePanel testID="invoice-error" icon="cloud-offline" title="Couldn't load this invoice" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Card testID="invoice-overview">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <T variant="label">PROVIDER</T>
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 2 }}>
                  {inv.provider_name || "Care provider"}
                </T>
                <T variant="small" style={{ marginTop: 2 }}>
                  Invoice {shortDate(inv.invoice_date || inv.created_at)}
                </T>
              </View>
              <Badge label={v.label} tone={v.tone} testID="invoice-verdict" />
            </View>
          </Card>

          {rec?.summary_md ? (
            <Card testID="invoice-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ionicons name="sparkles" size={18} color={colors.sage} />
                <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>What to check before paying</T>
              </View>
              <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }}>{rec.summary_md}</T>
            </Card>
          ) : null}

          {findings.length > 0 ? (
            <Card testID="invoice-findings">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>
                {findings.length} thing{findings.length > 1 ? "s" : ""} to check
              </T>
              <View style={{ gap: spacing.sm }}>
                {findings.map((f, i) => (
                  <View key={i} style={styles.finding}>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                      {f.check_id ? <Badge label={f.check_id} tone="brand" /> : null}
                      {f.confidence ? <Badge label={f.confidence} tone="neutral" /> : null}
                    </View>
                    <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text }}>
                      {f.suggested_question || f.narrative}
                    </T>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {checks.length > 0 ? (
            <Card testID="invoice-checks">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>
                Checks run
              </T>
              <View style={{ gap: 2 }}>
                {checks.map((c) => (
                  <View key={c.check_id} style={styles.checkRow}>
                    <Ionicons
                      name={c.ok ? "checkmark-circle" : "alert-circle"}
                      size={20}
                      color={c.ok ? colors.success : colors.alert}
                    />
                    <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text }}>{c.label}</T>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Button
            label="Ask Wayly about this invoice"
            testID="invoice-ask-button"
            icon="chatbubbles"
            variant="secondary"
            onPress={() => router.push("/(tabs)/ask")}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  finding: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
});
