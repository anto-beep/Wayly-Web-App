import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Bell } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Alert = { id: string; stream?: string; threshold_pct?: number; notify_email?: boolean; active?: boolean };

export default function BudgetAlertsScreen() {
  const { activeId } = useParticipants();
  const { colors } = useTheme();
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await apiFetch<any>(`/budget-alerts?participant_id=${activeId}`);
      setItems(Array.isArray(d) ? d : d?.items || []);
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Budget Alerts" subtitle="Get told before the budget runs hot" onBack={() => router.back()} />
      {loading ? <Loading /> : error ? (
        <StatePanel testID="alerts-error" icon={Bell} title="Couldn't load alerts" actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <StatePanel testID="alerts-empty" icon={Bell} title="No alerts set" message="Alerts let you know when spending crosses a threshold." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {items.map((a) => (
            <Card key={a.id} testID={`alert-${a.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, textTransform: "capitalize" }}>
                    {a.stream === "all" ? "All streams" : a.stream}
                  </T>
                  <T variant="small" style={{ marginTop: 2 }}>
                    Notify at {a.threshold_pct}% of budget{a.notify_email ? " · by email" : ""}
                  </T>
                </View>
                <Badge label={a.active ? "Active" : "Off"} tone={a.active ? "success" : "neutral"} />
              </View>
            </Card>
          ))}
          <T variant="small" style={{ textAlign: "center" }}>Manage alert rules on the web app.</T>
        </ScrollView>
      )}
    </View>
  );
}
