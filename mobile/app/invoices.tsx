import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AlertCircle, ChevronRight, Receipt, Search, Upload, X } from "lucide-react-native";

import { AppHeader, Badge, Button, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
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
function statusKey(i: Invoice): "all_clear" | "issues" {
  return findingCount(i) === 0 ? "all_clear" : "issues";
}

const STATUS_CHIPS: { value: "all" | "issues" | "all_clear"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Issues" },
  { value: "all_clear", label: "All clear" },
];

export default function InvoicesScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issues" | "all_clear">("all");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ items: Invoice[] }>("/invoices");
      setItems(data?.items || []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load, activeId]));

  const providers = useMemo(
    () => Array.from(new Set(items.map((i) => i.provider_name).filter(Boolean))).sort() as string[],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q) {
        const hay = [i.provider_name || "", i.filename || ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (providerFilter && i.provider_name !== providerFilter) return false;
      if (statusFilter !== "all" && statusKey(i) !== statusFilter) return false;
      return true;
    });
  }, [items, search, providerFilter, statusFilter]);

  const hasFilter = search.trim() !== "" || statusFilter !== "all" || providerFilter != null;
  const clearAll = () => { setSearch(""); setStatusFilter("all"); setProviderFilter(null); };

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
        <View testID="invoices-filter-bar" style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md }}>
            <Search size={16} color={colors.muted} />
            <TextInput
              testID="invoices-search-input"
              value={search}
              onChangeText={setSearch}
              placeholder="Search provider or filename"
              placeholderTextColor={colors.muted}
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontFamily: fonts.body, fontSize: 14, color: colors.text }}
            />
            {search ? (
              <Pressable testID="invoices-search-clear" onPress={() => setSearch("")} hitSlop={8}><X size={16} color={colors.muted} /></Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
            {STATUS_CHIPS.map((c) => {
              const on = statusFilter === c.value;
              return (
                <Pressable
                  key={c.value}
                  testID={`invoices-status-${c.value}`}
                  onPress={() => setStatusFilter(c.value)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }}
                >
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: on ? "#fff" : colors.text }}>{c.label}</T>
                </Pressable>
              );
            })}
            {providers.map((p) => {
              const on = providerFilter === p;
              return (
                <Pressable
                  key={p}
                  testID={`invoices-provider-${p}`}
                  onPress={() => setProviderFilter(on ? null : p)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }}
                >
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: on ? "#fff" : colors.text }} numberOfLines={1}>{p}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="small" style={{ color: colors.muted }}>{filtered.length === items.length ? `${items.length} shown` : `${filtered.length} of ${items.length} shown`}</T>
            {hasFilter ? (
              <Pressable testID="invoices-clear-filters" onPress={clearAll}><T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary, textDecorationLine: "underline" }}>Clear filters</T></Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {items.length > 0 ? (
        <SmartAISummary
          pageKey="invoices-list"
          context={{
            total_invoices: items.length,
            providers: Array.from(new Set(items.map((i) => i.provider_name).filter(Boolean))).slice(0, 6),
            latest_provider: items[0]?.provider_name || null,
            latest_amount_aud: items[0] ? invoiceTotal(items[0]) : null,
            open_issue_count_total: totals.openIssues,
            potential_refund_aud_total: Math.round(totals.refund * 100) / 100,
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
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
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View testID="invoices-list-no-results" style={{ padding: spacing.xl, alignItems: "center" }}>
              <T variant="small" style={{ color: colors.muted }}>No invoices match these filters.</T>
              <Pressable testID="invoices-no-results-clear" onPress={clearAll} style={{ marginTop: spacing.sm }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary, textDecorationLine: "underline" }}>Clear filters</T>
              </Pressable>
            </View>
          }
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
