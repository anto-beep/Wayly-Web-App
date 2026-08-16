import React, { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { FileText, ChevronRight, Plus, CloudOff, FileSearch } from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { Badge, Button, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type Statement = { id: string; filename: string; period_label?: string | null; uploaded_at: string; line_items?: any[]; anomalies?: any[]; anomaly_dollar_impact_total?: number };

export default function StatementsScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Statement[]>("/statements");
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setOffline(false);
      cacheSet(`statements:${activeId || "all"}`, list);
    } catch {
      const cached = await cacheGet<Statement[]>(`statements:${activeId || "all"}`);
      if (cached?.data?.length) { setItems(cached.data); setOffline(true); } else setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Statement }) => {
    const flags = item.anomalies?.length || 0;
    return (
      <Pressable testID={`statement-row-${item.id}`} onPress={() => router.push(`/statement/${item.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card, pressed && { opacity: 0.85 }]}>
        <View style={[styles.docIcon, { backgroundColor: colors.sageSoft }]}>
          <FileText size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>{item.period_label || item.filename}</T>
          <T variant="small">{shortDate(item.uploaded_at)} · {item.line_items?.length || 0} line items</T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {flags > 0 ? <Badge label={`${flags} flag${flags > 1 ? "s" : ""}`} tone="alert" /> : <Badge label="No issues" tone="success" />}
            {item.anomaly_dollar_impact_total ? <Badge label={`${money(item.anomaly_dollar_impact_total)} impact`} tone="brand" /> : null}
          </View>
        </View>
        <ChevronRight size={20} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <View>
          <T style={{ fontFamily: fonts.heading, fontSize: 28 }}>Statements</T>
          <T variant="bodyMuted">Support at Home statements</T>
        </View>
        <Pressable testID="statements-upload-button" onPress={() => router.push("/upload")} style={[styles.addBtn, { backgroundColor: colors.gold }]}>
          <Plus size={26} color="#fff" />
        </Pressable>
      </View>
      {loading ? (
        <Loading label="Loading statements…" />
      ) : error ? (
        <StatePanel testID="statements-error" icon={CloudOff} title="Couldn't load statements" message="Please check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="statements-empty" icon={FileSearch} title="No statements yet" message="Upload a Support at Home statement (PDF or photo) and Wayly will decode the charges for you." />
          <Button label="Upload a statement" testID="statements-empty-upload" onPress={() => router.push("/upload")} icon={Plus} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          ListHeaderComponent={offline ? (
            <View testID="statements-offline-banner" style={[styles.offline, { backgroundColor: colors.alertSoft }]}>
              <CloudOff size={16} color={colors.alert} />
              <T variant="small" style={{ color: colors.alert, flex: 1 }}>Showing offline copies. Pull to refresh when connected.</T>
            </View>
          ) : null}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  offline: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  docIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
