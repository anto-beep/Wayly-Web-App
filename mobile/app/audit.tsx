import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ScrollText } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/format";

type Event = { id: string; action: string; detail?: string; actor_name?: string; created_at?: string };

const ACTION_LABEL: Record<string, string> = {
  HOUSEHOLD_CREATED: "Household created",
  STATEMENT_UPLOADED: "Statement uploaded",
  FAMILY_MESSAGE_POSTED: "Posted in family thread",
  CONCERN_FLAGGED: "Concern flagged",
};

export default function AuditLogScreen() {
  const { colors } = useTheme();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setEvents(await apiFetch<Event[]>("/audit-log")); }
    catch { setEvents([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Audit Log" subtitle="Your automatic paper trail" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your paper trail…" />
      ) : events.length === 0 ? (
        <StatePanel icon={ScrollText} title="No events yet" message="Every upload, decision, and concern is recorded here automatically, ready if you ever need to make a complaint." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <T variant="small">Every meaningful action is recorded automatically, for your peace of mind and ready if you ever need it for a complaint.</T>
          <Card style={{ padding: 0 }}>
            {events.map((e, i) => (
              <View key={e.id} testID={`audit-row-${i}`} style={{ flexDirection: "row", gap: spacing.md, padding: spacing.md, borderBottomWidth: i < events.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <ScrollText size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{ACTION_LABEL[e.action] || e.action}</T>
                  {e.detail ? <T variant="small" style={{ marginTop: 2 }}>{e.detail}</T> : null}
                  <T variant="small" style={{ marginTop: 3, color: colors.muted }}>{e.actor_name || "You"} · {formatDateTime(e.created_at)}</T>
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
