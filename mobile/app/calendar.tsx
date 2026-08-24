import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Calendar as CalendarIcon, Clock, MapPin, Plus, X, Pencil, Ban, Archive, RefreshCw, Trash2 } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Visit = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes?: number;
  location?: string | null;
  provider?: string | null;
  notes?: string | null;
  kind?: string;
  status?: string;
};

const KIND_OPTIONS = [
  { value: "appointment", label: "Appointment" },
  { value: "home_visit", label: "Home Visit" },
  { value: "telehealth", label: "Telehealth" },
  { value: "assessment", label: "Assessment" },
  { value: "other", label: "Other" },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.label]));

const emptyDraft = () => ({
  id: "" as string,
  title: "",
  date: new Date().toISOString().slice(0, 10),
  time: "09:00",
  duration_minutes: "60",
  kind: "appointment",
  provider: "",
  location: "",
  notes: "",
  status: "active",
});
type Draft = ReturnType<typeof emptyDraft>;

function dayKey(s: string): string {
  try { return new Date(s).toLocaleDateString("en-AU", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
  catch { return s; }
}
function timeLabel(s: string): string {
  try { return new Date(s).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Visit[]>(`/visits`);
      setVisits(Array.isArray(data) ? data : []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setDraft(emptyDraft());
  const startEdit = (v: Visit) => {
    const d = new Date(v.starts_at);
    setOpenId(null);
    setDraft({
      id: v.id,
      title: v.title || "",
      date: isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: isNaN(d.getTime()) ? "09:00" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      duration_minutes: String(v.duration_minutes || 60),
      kind: v.kind || "appointment",
      provider: v.provider || "",
      location: v.location || "",
      notes: v.notes || "",
      status: v.status || "active",
    });
  };

  const body = (d: Draft) => ({
    title: d.title.trim(),
    starts_at: `${d.date}T${/^\d{2}:\d{2}$/.test(d.time) ? d.time : "09:00"}:00`,
    duration_minutes: Math.max(5, Math.min(720, Number(d.duration_minutes) || 60)),
    location: d.location.trim() || null,
    provider: d.provider.trim() || null,
    notes: d.notes.trim() || null,
    kind: d.kind,
    status: d.status,
  });

  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    try {
      if (draft.id) await apiFetch(`/visits/${draft.id}`, { method: "PATCH", body: body(draft) });
      else await apiFetch(`/visits`, { method: "POST", body: body(draft) });
      setDraft(null);
      await load();
    } catch { /* keep form open */ } finally { setSaving(false); }
  };

  const setStatus = async (v: Visit, status: string) => {
    setBusyId(v.id);
    try {
      await apiFetch(`/visits/${v.id}`, { method: "PATCH", body: {
        title: v.title,
        starts_at: v.starts_at,
        duration_minutes: v.duration_minutes || 60,
        location: v.location || null,
        provider: v.provider || null,
        notes: v.notes || null,
        kind: v.kind || "appointment",
        status,
      } });
      await load();
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  const del = async (v: Visit) => {
    setBusyId(v.id);
    try { await apiFetch(`/visits/${v.id}`, { method: "DELETE" }); await load(); }
    catch { /* ignore */ } finally { setBusyId(null); setOpenId(null); }
  };

  const groups = useMemo(() => {
    const sorted = [...visits].sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
    const map = new Map<string, Visit[]>();
    for (const v of sorted) {
      const k = dayKey(v.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(v);
    }
    return Array.from(map.entries());
  }, [visits]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Calendar"
        subtitle="Visits & appointments"
        onBack={() => router.back()}
        right={<Button label={draft && !draft.id ? "Close" : "Add"} testID="visits-add-btn" variant={draft && !draft.id ? "outline" : "secondary"} icon={draft && !draft.id ? X : Plus} onPress={() => (draft && !draft.id ? setDraft(null) : openNew())} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading calendar…" />
      ) : error ? (
        <StatePanel testID="calendar-error" icon={CalendarIcon} title="Couldn't load the calendar" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          testID="calendar-list"
          keyboardShouldPersistTaps="handled"
        >
          {draft ? (
            <Card testID="visits-form">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <T variant="h3">{draft.id ? "Edit appointment" : "Add appointment"}</T>
                <Button label="" icon={X} variant="ghost" onPress={() => setDraft(null)} testID="visits-form-close" style={{ minHeight: 36, paddingHorizontal: 8 }} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Field label="Title" required testID="visits-form-title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="e.g. GP appointment" />
                <Select label="Kind" testID="visits-form-kind" value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KIND_OPTIONS} />
                <DateField label="Date" testID="visits-form-when" value={draft.date} onChange={(iso) => setDraft({ ...draft, date: iso })} maximumDate={new Date(2100, 0, 1)} />
                <Field label="Time (HH:MM, 24h)" testID="visits-form-time" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="09:00" keyboardType="numbers-and-punctuation" />
                <Field label="Duration (minutes)" testID="visits-form-duration" value={draft.duration_minutes} onChangeText={(v) => setDraft({ ...draft, duration_minutes: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
                <Field label="Provider" optional testID="visits-form-provider" value={draft.provider} onChangeText={(v) => setDraft({ ...draft, provider: v })} placeholder="e.g. Acacia Aged Care" />
                <Field label="Location" optional testID="visits-form-location" value={draft.location} onChangeText={(v) => setDraft({ ...draft, location: v })} placeholder="e.g. Clinic address" />
                <Field label="Notes" optional testID="visits-form-notes" value={draft.notes} onChangeText={(v) => setDraft({ ...draft, notes: v })} placeholder="Anything to remember" multiline style={{ minHeight: 72 } as any} />
                <Button label={draft.id ? "Save changes" : "Add to calendar"} testID="visits-form-submit" icon={Plus} onPress={save} loading={saving} disabled={!draft.title.trim()} />
              </View>
            </Card>
          ) : null}

          {visits.length === 0 && !draft ? (
            <StatePanel testID="calendar-empty" icon={CalendarIcon} title="Nothing on the calendar yet" message="Add care visits and appointments to keep track of what is coming up." actionLabel="Add appointment" onAction={openNew} />
          ) : (
            groups.map(([day, list]) => (
              <View key={day} style={{ gap: spacing.sm }}>
                <T variant="label" style={{ color: colors.muted }}>{day.toUpperCase()}</T>
                {list.map((v) => {
                  const dim = v.status === "cancelled" || v.status === "archived";
                  const open = openId === v.id;
                  return (
                    <Card key={v.id} testID={`calendar-entry-${v.id}`} style={{ padding: spacing.md, opacity: dim ? 0.6 : 1 }}>
                      <Pressable onPress={() => setOpenId(open ? null : v.id)} testID={`calendar-entry-toggle-${v.id}`}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{v.title}</T>
                          {v.status === "cancelled" ? <Badge label="CANCELLED" tone="error" /> : v.status === "archived" ? <Badge label="ARCHIVED" tone="neutral" /> : <Badge label={(KIND_LABEL[v.kind || "appointment"] || "Appointment").toUpperCase()} tone="brand" />}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <Clock size={14} color={colors.muted} />
                          <T variant="small">{timeLabel(v.starts_at)}{v.duration_minutes ? ` · ${v.duration_minutes} min` : ""}</T>
                        </View>
                        {v.provider || v.location ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                            <MapPin size={14} color={colors.muted} />
                            <T variant="small">{[v.provider, v.location].filter(Boolean).join(" · ")}</T>
                          </View>
                        ) : null}
                        {v.notes ? <T variant="small" style={{ marginTop: 4 }}>{v.notes}</T> : null}
                      </Pressable>
                      {open ? (
                        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                          <Button label="Edit" testID={`visits-detail-edit-${v.id}`} variant="outline" icon={Pencil} onPress={() => startEdit(v)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                          {v.status !== "cancelled" ? (
                            <Button label="Cancel" testID={`visits-detail-cancel-${v.id}`} variant="outline" icon={Ban} onPress={() => setStatus(v, "cancelled")} loading={busyId === v.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                          ) : (
                            <Button label="Restore" testID={`visits-detail-restore-${v.id}`} variant="outline" icon={RefreshCw} onPress={() => setStatus(v, "active")} loading={busyId === v.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                          )}
                          {v.status !== "archived" ? (
                            <Button label="Archive" testID={`visits-detail-archive-${v.id}`} variant="outline" icon={Archive} onPress={() => setStatus(v, "archived")} loading={busyId === v.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                          ) : null}
                          <Button label="Delete" testID={`visits-detail-delete-${v.id}`} variant="outline" icon={Trash2} onPress={() => del(v)} loading={busyId === v.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
