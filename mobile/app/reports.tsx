import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FileBarChart } from "lucide-react-native";

import { AppHeader, Badge, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";

type Report = { id: string; report_name?: string; report_type?: string; status?: string; created_at?: string; generated_at?: string };

export default function ReportsScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await apiFetch<{ items: Report[] }>("/reports");
      const list = (d?.items || []).filter((r) => r.status !== "DELETED");
      setItems(list);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Reports" subtitle="Generated summaries and exports" onBack={() => router.back()} />
      {loading ? <Loading /> : error ? (
        <StatePanel testID="reports-error" icon={FileBarChart} title="Couldn't load reports" actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <StatePanel testID="reports-empty" icon={FileBarChart} title="No reports yet" message="Generate reports on the web app to see them here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <View testID={`report-${item.id}`} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
              <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
                <FileBarChart size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={2}>{item.report_name || item.report_type}</T>
                <T variant="small">{shortDate(item.generated_at || item.created_at)}</T>
              </View>
              <Badge label={(item.status || "").toLowerCase()} tone={item.status === "READY" || item.status === "COMPLETED" ? "success" : "neutral"} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
