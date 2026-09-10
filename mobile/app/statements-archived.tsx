import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Archive, CloudOff } from "lucide-react-native";

import { AppHeader, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";
import { Stmt, periodCompact, providerName, grossTotal, uploadedLabel } from "@/src/lib/statementFields";

export default function ArchivedStatements() {
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Stmt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await apiFetch<any>("/statements/archived");
      setItems(Array.isArray(d) ? d : d?.items || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Archived statements" subtitle="Reviewed and put away" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading archived statements…" />
      ) : error ? (
        <StatePanel testID="archived-error" icon={CloudOff} title="Couldn't load archived statements" actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="archived-empty" icon={Archive} title="No archived statements" message="Statements you archive from the register appear here." />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable testID={`archived-row-${item.id}`} onPress={() => router.push(`/statement/${item.id}`)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>{periodCompact(item)}</T>
                <T variant="small" numberOfLines={1} style={{ marginTop: 2 }}>{providerName(item)}</T>
                <T variant="small" style={{ marginTop: 6 }}>Uploaded {uploadedLabel(item.uploaded_at || item.created_at)}</T>
              </View>
              <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{money(grossTotal(item))}</T>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
});
