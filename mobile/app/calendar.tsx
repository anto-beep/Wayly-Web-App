import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Calendar as CalendarIcon, Clock, MapPin, User } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Entry = {
  id: string;
  entry_type?: string;
  title: string;
  notes?: string | null;
  start_datetime: string;
  end_datetime?: string | null;
  is_all_day?: boolean;
  service_type?: string | null;
  provider_name?: string | null;
  expected_worker_name?: string | null;
  attendance_status?: string | null;
};

const STATUS_TONE: Record<string, "neutral" | "success" | "alert" | "error" | "brand"> = {
  attended: "success", confirmed: "success", expected: "brand", scheduled: "brand",
  disputed: "error", missed: "error", cancelled: "neutral",
};

function dayKey(s: string): string {
  try { return new Date(s).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return s; }
}
function timeLabel(e: Entry): string {
  if (e.is_all_day) return "All day";
  try {
    const t = new Date(e.start_datetime).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    return t;
  } catch { return ""; }
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ entries: Entry[] }>(`/fc2/participants/${activeId}/calendar`);
      setEntries(data?.entries || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groups = useMemo(() => {
    const sorted = [...entries].sort((a, b) => (a.start_datetime < b.start_datetime ? 1 : -1));
    const map = new Map<string, Entry[]>();
    for (const e of sorted) {
      const k = dayKey(e.start_datetime);
      (map.get(k) || map.set(k, []).get(k)!).push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Calendar" subtitle={active?.name ? `${active.name}'s visits & appointments` : "Visits & appointments"} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading calendar…" />
      ) : error ? (
        <StatePanel testID="calendar-error" icon={CalendarIcon} title="Couldn't load the calendar" actionLabel="Retry" onAction={load} />
      ) : entries.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="calendar-empty" icon={CalendarIcon} title="No visits scheduled" message="Care visits and appointments will show here once they're added or imported from a statement." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          testID="calendar-list"
        >
          {groups.map(([day, list]) => (
            <View key={day} style={{ gap: spacing.sm }}>
              <T variant="label" style={{ color: colors.muted }}>{day.toUpperCase()}</T>
              {list.map((e) => (
                <Card key={e.id} testID={`calendar-entry-${e.id}`} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{e.title}</T>
                    {e.attendance_status ? <Badge label={e.attendance_status.toUpperCase()} tone={STATUS_TONE[e.attendance_status] || "neutral"} /> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <Clock size={14} color={colors.muted} />
                    <T variant="small">{timeLabel(e)}{e.service_type ? ` · ${e.service_type.replace(/_/g, " ")}` : ""}</T>
                  </View>
                  {e.provider_name ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <MapPin size={14} color={colors.muted} />
                      <T variant="small">{e.provider_name}</T>
                    </View>
                  ) : null}
                  {e.expected_worker_name ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <User size={14} color={colors.muted} />
                      <T variant="small">{e.expected_worker_name}</T>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
