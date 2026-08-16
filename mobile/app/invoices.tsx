import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AlertCircle, ChevronRight, Receipt, Upload } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type Invoice = {
  id: string;
  filename: string;
  provider_name?: string | null;
  invoice_date?: string | null;
  created_at?: string;
  reconciliation?: { overall_verdict?: string; findings?: any[]; invoice_total_aud?: number; refund_owed_aud?: number };
  amount_billed_aud?: number;
};

function invoiceTotal(i: Invoice): number | null {
  const v = i.reconciliation?.invoice_total_aud ?? i.amount_billed_aud;
  return typeof v === "number" ? v : null;
}
function findingCount(i: Invoice): number { return i.reconciliation?.findings?.length || 0; }
function refundOwed(i: Invoice): number { return i.reconciliation?.refund_owed_aud || 0; }

export default function InvoicesScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ items: Invoice[] }>("/invoices");
      setItems(data?.items || []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load, activeId]));

  const totals = useMemo(() => {
    let openIssues = 0, refund = 0;
    for (const i of items) { openIssues += findingCount(i); refund += refundOwed(i); }
    return { openIssues, refund };
  }, [items]);

  const renderItem = ({ item }: { item: Invoice }) => {
    const findings = findingCount(item);
    const total = invoiceTotal(item);
    const clear = findings === 0;
    return (
      <Pressable testID={`invoice-row-${item.id}`} onPress={() => router.push(`/invoice/${item.id}`)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>{item.provider_name || item.filename}</T>
          <T variant="small" style={{ marginTop: 2 }}>Invoice date {shortDate(item.invoice_date || item.created_at)} · Uploaded {shortDate(item.created_at)}</T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.mono, fontSize: 14 }}>{total != null ? money(total) : "—"}</T>
            {findings > 0 ? <Badge label={`${findings} finding${findings === 1 ? "" : "s"}`} tone="alert" /> : null}
            <Badge label={clear ? "All clear" : "Issues"} tone={clear ? "success" : "brand"} testID={`invoice-verdict-${item.id}`} />
          </View>
        </View>
        <ChevronRight size={20} color={colors.muted} />
      </Pressable>
    );
  };

  const Header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <PageIntro
        eyebrow="ALL INVOICES"
        title="Your Support at Home Invoices"
        description="Every invoice you have checked, with the issue count, refund owed and provider at a glance. Tap any row to open the full checker output for that invoice."
        whatItDoes="Groups your uploaded invoices so you can see refunds owed, issues per provider, and history in one place."
        howToUse={[
          "Upload a new invoice using the button above.",
          "Tap a row to open the full Issue Register and refund breakdown for that invoice.",
        ]}
        whatYouGet={[
          "A running total of potential refund across all invoices.",
          "Per-provider issue history you can share with the family.",
          "A permanent, private audit trail of everything checked.",
        ]}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Check a new invoice" testID="invoices-list-upload-btn" icon={Upload} onPress={() => router.push("/tool/invoice-checker")} style={{ flex: 1 }} />
      </View>
      {items.length > 0 ? (
        <Card testID="invoices-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
          <T variant="label" style={{ color: colors.sage }}>YOUR WAYLY INSIGHT</T>
          <T style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 4, color: colors.text }}>
            {items.length} invoice{items.length === 1 ? "" : "s"} checked. {totals.openIssues > 0 ? `${totals.openIssues} open issue${totals.openIssues === 1 ? "" : "s"} and ${money(totals.refund)} potential refund found.` : "No open issues, everything looks correct."}
          </T>
        </Card>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Invoices" subtitle="Checked care invoices" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading invoices…" />
      ) : error ? (
        <StatePanel testID="invoices-list-error" icon={AlertCircle} title="Could not load invoices" message="Please refresh." actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null as any}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: spacing.lg }}>
              <View testID="invoices-list-empty" style={{ borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" }}>
                <Receipt size={40} color={colors.primary} />
                <T style={{ fontFamily: fonts.heading, fontSize: 20, marginTop: spacing.sm }}>No invoices yet</T>
                <T variant="small" style={{ marginTop: 6, textAlign: "center" }}>Upload the first invoice you were charged by your provider. We will read it, spot any errors, and tell you exactly what to do next.</T>
                <Button label="Check your first invoice" testID="invoices-empty-upload" icon={Upload} onPress={() => router.push("/tool/invoice-checker")} style={{ marginTop: spacing.md }} />
              </View>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
});
