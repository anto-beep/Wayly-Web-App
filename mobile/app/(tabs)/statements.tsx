import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Badge, Button, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { money, shortDate } from "@/src/utils/format";

type Statement = {
  id: string;
  filename: string;
  period_label?: string | null;
  uploaded_at: string;
  line_items?: any[];
  anomalies?: any[];
  anomaly_dollar_impact_total?: number;
  summary?: string | null;
};

export default function StatementsScreen() {
  const { activeId } = useParticipants();
  const [items, setItems] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Statement[]>("/statements");
      setItems(Array.isArray(data) ? data : []);
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

  const renderItem = ({ item }: { item: Statement }) => {
    const flags = item.anomalies?.length || 0;
    return (
      <Pressable
        testID={`statement-row-${item.id}`}
        onPress={() => router.push(`/statement/${item.id}`)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.docIcon}>
          <Ionicons name="document-text" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>
            {item.period_label || item.filename}
          </T>
          <T variant="small">
            {shortDate(item.uploaded_at)} · {item.line_items?.length || 0} line items
          </T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {flags > 0 ? (
              <Badge label={`${flags} flag${flags > 1 ? "s" : ""}`} tone="alert" />
            ) : (
              <Badge label="No issues" tone="success" />
            )}
            {item.anomaly_dollar_impact_total ? (
              <Badge label={`${money(item.anomaly_dollar_impact_total)} impact`} tone="brand" />
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Statements"
        subtitle="Support at Home statements"
        right={
          <Pressable testID="statements-upload-button" onPress={() => router.push("/upload")} style={styles.addBtn}>
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        }
      />
      {loading ? (
        <Loading label="Loading statements…" />
      ) : error ? (
        <StatePanel
          testID="statements-error"
          icon="cloud-offline"
          title="Couldn't load statements"
          message="Please check your connection and try again."
          actionLabel="Retry"
          onAction={load}
        />
      ) : items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel
            testID="statements-empty"
            icon="document-text-outline"
            title="No statements yet"
            message="Upload a Support at Home statement (PDF or photo) and Wayly will decode the charges for you."
          />
          <Button label="Upload a statement" testID="statements-empty-upload" onPress={() => router.push("/upload")} icon="cloud-upload" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
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
  docIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.sageSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
});
