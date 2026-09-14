import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Activity, FileText, ReceiptText, MessageCircle, HeartPulse, ClipboardList,
  Mail, Bell, Calendar as CalendarIcon, LucideIcon,
} from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Event = {
  id: string;
  event_type: string;
  event_source?: string;
  event_timestamp: string;
  actor_type?: string;
  summary?: string;
  linked_artefact_type?: string | null;
  linked_artefact_id?: string | null;
};

const ICONS: Record<string, LucideIcon> = {
  statement_decoded: FileText, statement_uploaded: FileText,
  invoice_checked: ReceiptText, invoice_uploaded: ReceiptText,
  chat: MessageCircle, question_asked: MessageCircle,
  hospital_admission: HeartPulse, hospital_discharge: HeartPulse,
  care_plan_reviewed: ClipboardList, care_plan_uploaded: ClipboardList,
  letter_sent: Mail, correspondence: Mail,
  alert: Bell, budget_alert: Bell,
  calendar_entry: CalendarIcon, visit: CalendarIcon,
};

// Brand tint per event category — colours the dot + card accent.
const TINT: Record<string, string> = {
  statement_decoded: "#0E4D52", statement_uploaded: "#0E4D52",
  invoice_checked: "#A5512B", invoice_uploaded: "#A5512B",
  chat: "#425F47", question_asked: "#425F47",
  hospital_admission: "#C0392B", hospital_discharge: "#C0392B",
  care_plan_reviewed: "#425F47", care_plan_uploaded: "#425F47",
  letter_sent: "#425F47", correspondence: "#425F47",
  alert: "#C0392B", budget_alert: "#B7791F",
  calendar_entry: "#0E4D52", visit: "#0E4D52",
};

function fmt(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
}

// Keep summaries plain-English. Some backend events append a raw result
// dump (e.g. "... Result: Level {'primary': 5, ...}") which is confusing;
// trim anything from a "{" or a "Result:" onward.
function cleanSummary(s?: string, fallback?: string): string {
  let t = (s || fallback || "").trim();
  const m = t.search(/\s*Result:|\s*\{/);
  if (m > 0) t = t.slice(0, m).replace(/[\s:.,\-]+$/, "").trim() + ".";
  return t || "Activity recorded";
}

const ARTEFACT_ROUTE: Record<string, (id: string) => string> = {
  statement: (id) => `/statement/${id}`,
  invoice: (id) => `/invoice/${id}`,
};

export default function TimelineScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ events: Event[] }>(`/core/participants/${activeId}/timeline?limit=100`);
      setEvents(data?.events || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (e: Event) => {
    const t = e.linked_artefact_type || "";
    const builder = ARTEFACT_ROUTE[t];
    if (builder && e.linked_artefact_id) router.push(builder(e.linked_artefact_id) as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Timeline" subtitle={active?.name ? `${active.name}'s care history` : "Care history"} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading timeline…" />
      ) : error ? (
        <StatePanel testID="timeline-error" icon={Activity} title="Couldn't load the timeline" actionLabel="Retry" onAction={load} />
      ) : events.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="timeline-empty" icon={Activity} title="Nothing here yet" message="As you decode statements, check invoices, and log care events, they will appear here as a running history." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          testID="timeline-list"
        >
          {events.map((e, i) => {
            const Icon = ICONS[e.event_type] || Activity;
            const tint = TINT[e.event_type] || "#0E4D52";
            const tappable = !!(e.linked_artefact_id && ARTEFACT_ROUTE[e.linked_artefact_type || ""]);
            return (
              <View key={e.id || i} style={styles.row} testID={`timeline-event-${i}`}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: tint + "1F", borderColor: tint }]}>
                    <Icon size={16} color={tint} />
                  </View>
                  {i < events.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
                </View>
                <Card style={{ flex: 1, marginBottom: spacing.md, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: tint, backgroundColor: tint + "0D" }}>
                  <T variant="small" style={{ color: colors.muted }}>{fmt(e.event_timestamp)}</T>
                  <T
                    onPress={tappable ? () => open(e) : undefined}
                    style={{ fontFamily: fonts.body, fontSize: 15, marginTop: 4, color: tappable ? colors.primary : colors.text }}
                  >
                    {e.summary ? cleanSummary(e.summary) : e.event_type.replace(/_/g, " ")}
                  </T>
                </Card>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  rail: { alignItems: "center", width: 34 },
  dot: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginVertical: 2 },
});
