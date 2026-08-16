import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardEdit, Plus, X, ChevronDown } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type EventType = { event_type: string; label?: string; label_au?: string };
type Group = { key: string; label: string; events: EventType[] };
type LoggedEvent = { id?: string; event_type?: string; label?: string; effective_date?: string; occurred_at?: string; note?: string; proposed?: { transition_status?: string } };

const today = () => new Date().toISOString().slice(0, 10);
function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function ScenariosScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [form, setForm] = useState({ event_type: "", label: "", effective_date: today(), note: "" });

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ items: LoggedEvent[] }>(`/scenario/participants/${activeId}/events?limit=100`);
      setEvents(data?.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useEffect(() => {
    apiFetch<{ groups: Group[] }>("/scenario/event-types").then((d) => setGroups(d?.groups || [])).catch(() => setGroups([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.event_type || !activeId) return;
    setSaving(true); setSaveError("");
    try {
      await apiFetch(`/scenario/participants/${activeId}/events`, { method: "POST", body: {
        event_type: form.event_type, effective_date: form.effective_date || today(),
        note: form.note || null, apply_transitions: true,
      } });
      setForm({ event_type: "", label: "", effective_date: today(), note: "" });
      setShowForm(false);
      load();
    } catch { setSaveError("Couldn't log that event. Please try again."); }
    finally { setSaving(false); }
  };

  const labelFor = (et?: string) => {
    for (const g of groups) { const e = g.events.find((x) => x.event_type === et); if (e) return e.label_au || e.label || et; }
    return (et || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Log a Scenario"
        subtitle={active?.name ? `Record a change for ${active.name}` : "Record a life event"}
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "Log"} testID="scenario-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading events…" />
      ) : error ? (
        <StatePanel testID="scenario-error" icon={ClipboardEdit} title="Couldn't load events" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
              Life changes, a hospital stay, a new assessment, a move, can affect funding and services. Log an event and Wayly updates the picture and flags what to check.
            </T>
          </Card>

          {showForm ? (
            <Card testID="scenario-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Log an event</T>
              <View style={{ gap: spacing.sm }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>What happened?</T>
                {form.event_type ? (
                  <View style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.sageSoft }]}>
                    <T style={{ fontFamily: fonts.bodyMedium, color: colors.primary, flex: 1 }}>{labelFor(form.event_type)}</T>
                    <Pressable testID="scenario-clear" onPress={() => setForm({ ...form, event_type: "" })}><X size={16} color={colors.primary} /></Pressable>
                  </View>
                ) : (
                  groups.map((g) => (
                    <View key={g.key}>
                      <Pressable testID={`scenario-group-${g.key}`} onPress={() => setOpenGroup(openGroup === g.key ? null : g.key)}
                        style={[styles.groupRow, { borderColor: colors.border }]}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, flex: 1 }}>{g.label}</T>
                        <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: openGroup === g.key ? "180deg" : "0deg" }] }} />
                      </Pressable>
                      {openGroup === g.key ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: spacing.sm }}>
                          {g.events.map((e) => (
                            <Pressable key={e.event_type} testID={`scenario-event-${e.event_type}`} onPress={() => setForm({ ...form, event_type: e.event_type })}
                              style={[styles.chip, { borderColor: colors.border }]}>
                              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text }}>{e.label_au || e.label}</T>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
                <Field label="When (YYYY-MM-DD)" testID="scenario-date" value={form.effective_date} onChangeText={(v) => setForm({ ...form, effective_date: v })} placeholder={today()} />
                <Field label="Note (optional)" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} placeholder="Anything to remember" multiline />
                {saveError ? <T variant="small" style={{ color: colors.terracotta }}>{saveError}</T> : null}
                <Button label="Log event" testID="scenario-save" icon={Plus} onPress={save} loading={saving} disabled={!form.event_type} />
              </View>
            </Card>
          ) : null}

          {events.length === 0 && !showForm ? (
            <StatePanel testID="scenario-empty" icon={ClipboardEdit} title="No events logged" message="Record a hospital stay, a reassessment, a move, or any change that could affect care and funding." actionLabel="Log an event" onAction={() => setShowForm(true)} />
          ) : (
            events.map((e, i) => (
              <Card key={e.id || i} testID={`scenario-item-${i}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{e.label || labelFor(e.event_type)}</T>
                  {e.proposed?.transition_status === "blocked" ? <Badge label="NEEDS REVIEW" tone="alert" /> : null}
                </View>
                <T variant="small" style={{ marginTop: 4 }}>{fmt(e.effective_date || e.occurred_at)}</T>
                {e.note ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>{e.note}</T> : null}
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  selected: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
});
