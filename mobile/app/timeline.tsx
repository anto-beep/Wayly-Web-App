import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Activity, FileText, ReceiptText, MessageCircle, HeartPulse, ClipboardList,
  Mail, Bell, Calendar as CalendarIcon, ChevronDown, LucideIcon,
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

// Filter chips — mirror the web timeline categories.
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "statements", label: "Statements" },
  { key: "care_plan", label: "Care Plan Changes" },
  { key: "reassessments", label: "Reassessments" },
  { key: "contributions", label: "Contribution Changes" },
  { key: "providers", label: "Provider Changes" },
];

function categoryMatches(e: Event, key: string): boolean {
  if (key === "all") return true;
  const sig = `${e.event_type || ""} ${e.summary || ""}`.toLowerCase();
  switch (key) {
    case "statements": return sig.includes("statement") || sig.includes("invoice");
    case "care_plan": return sig.includes("care_plan") || sig.includes("care plan");
    case "reassessments": return sig.includes("reassessment") || sig.includes("classification");
    case "contributions": return sig.includes("contribution") || sig.includes("means");
    case "providers": return sig.includes("provider");
    default: return true;
  }
}

function fmt(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
}

function titleFor(e: Event): string {
  const raw = (e.event_type || "update").replace(/_/g, " ");
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
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
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!categoryMatches(e, filter)) return false;
      if (!q) return true;
      return `${e.event_type || ""} ${e.summary || ""}`.toLowerCase().includes(q);
    });
  }, [events, filter, search]);

  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Timeline" subtitle={active?.display_name ? `${active.display_name}'s care history` : "Care history"} onBack={() => router.back()} />

      {/* Sticky search + filters */}
      {!loading && !error && events.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              testID="timeline-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search your timeline…"
              placeholderTextColor={colors.muted}
              style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14, paddingVertical: 8 }}
            />
            {search ? (
              <Pressable testID="timeline-search-clear" onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
            testID="timeline-filters"
          >
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  testID={`timeline-filter-${f.key}`}
                  onPress={() => setFilter(f.key)}
                  style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}
                >
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? "#fff" : colors.text }}>{f.label}</T>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <Loading label="Loading timeline…" />
      ) : error ? (
        <StatePanel testID="timeline-error" icon={Activity} title="Couldn't load the timeline" actionLabel="Retry" onAction={load} />
      ) : events.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="timeline-empty" icon={Activity} title="Nothing here yet" message="As you decode statements, check invoices, and log care events, they will appear here as a running history." />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel
            testID="timeline-empty-filtered"
            icon={Activity}
            title="Nothing in this view"
            message="Try another filter or a different search."
            actionLabel="Show all events"
            onAction={() => { setFilter("all"); setSearch(""); }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          testID="timeline-list"
        >
          {filtered.map((e, i) => {
            const Icon = ICONS[e.event_type] || Activity;
            const tint = TINT[e.event_type] || "#0E4D52";
            const tappable = !!(e.linked_artefact_id && ARTEFACT_ROUTE[e.linked_artefact_type || ""]);
            const isOpen = !!expanded[e.id || String(i)];
            return (
              <View key={e.id || i} style={styles.row} testID={`timeline-event-${i}`}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: tint + "1F", borderColor: tint }]}>
                    <Icon size={16} color={tint} />
                  </View>
                  {i < filtered.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
                </View>
                <Card style={{ flex: 1, marginBottom: spacing.md, padding: 0, borderLeftWidth: 3, borderLeftColor: tint, backgroundColor: tint + "0D", overflow: "hidden" }}>
                  {/* Collapsed header — tap to expand */}
                  <Pressable
                    testID={`timeline-event-toggle-${i}`}
                    onPress={() => toggle(e.id || String(i))}
                    style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm, padding: spacing.md }}
                  >
                    <View style={{ flex: 1 }}>
                      <T variant="small" style={{ color: colors.muted }}>{fmt(e.event_timestamp)}</T>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 2, color: colors.text }}>{titleFor(e)}</T>
                    </View>
                    <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }], marginTop: 2 }} />
                  </Pressable>
                  {/* Expanded body */}
                  {isOpen ? (
                    <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }} testID={`timeline-event-body-${i}`}>
                      <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text }}>
                        {e.summary ? cleanSummary(e.summary) : titleFor(e)}
                      </T>
                      {tappable ? (
                        <Pressable testID={`timeline-event-open-${i}`} onPress={() => open(e)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm }}>
                          <T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Open</T>
                          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
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
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md },
  chip: { flexShrink: 0, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center" },
});
