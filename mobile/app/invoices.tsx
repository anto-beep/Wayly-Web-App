import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CloudOff, ReceiptText as ReceiptIcon, UploadCloud } from "lucide-react-native";

import { AppHeader, Badge, Button, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { shortDate, verdictTone } from "@/src/utils/format";

type Invoice = {
  id: string;
  filename: string;
  provider_name?: string | null;
  invoice_date?: string | null;
  created_at?: string;
  page_count?: number;
  reconciliation?: { overall_verdict?: string; findings?: any[] };
};

export default function InvoicesScreen() {
  const { activeId } = useParticipants();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ count: number; items: Invoice[] }>("/invoices");
      setItems(data?.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, activeId])
  );

  const renderItem = ({ item }: { item: Invoice }) => {
    const findings = item.reconciliation?.findings?.length || 0;
    const v = verdictTone(item.reconciliation?.overall_verdict);
    return (
      <Pressable
        testID={`invoice-row-${item.id}`}
        onPress={() => router.push(`/invoice/${item.id}`)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.docIcon}>
          <Ionicons name="receipt" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>
            {item.provider_name || item.filename}
          </T>
          <T variant="small">{shortDate(item.invoice_date || item.created_at)} · {item.page_count || 1} page{(item.page_count || 1) > 1 ? "s" : ""}</T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Badge label={v.label} tone={v.tone} />
            {findings > 0 ? <Badge label={`${findings} to check`} tone="brand" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Invoices"
        subtitle="Checked care invoices"
        onBack={() => router.back()}
        right={
          <Pressable testID="invoices-upload-button" onPress={() => router.push("/upload?type=invoice")} style={styles.addBtn}>
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        }
      />
      {loading ? (
        <Loading label="Loading invoices…" />
      ) : error ? (
        <StatePanel testID="invoices-error" icon={CloudOff} title="Couldn't load invoices" actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel
            testID="invoices-empty"
            icon={ReceiptIcon}
            title="No invoices yet"
            message="Upload a care invoice and Wayly will check it line-by-line for overcharges before you pay."
          />
          <Button label="Upload an invoice" testID="invoices-empty-upload" icon={UploadCloud} onPress={() => router.push("/upload?type=invoice")} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  docIcon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
});
