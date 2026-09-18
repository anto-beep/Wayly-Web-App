import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Calendar as RNCalendar } from "react-native-calendars";
import { Calendar as CalendarIcon, Clock, MapPin, Plus, X, Pencil, Ban, Archive, RefreshCw, Trash2 } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Visit = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes?: number;
  all_day?: boolean;
  location?: string | null;
  provider?: string | null;
  notes?: string | null;
  kind?: string;
  status?: string;
};

const KIND_OPTIONS = [
  { value: "appointment", label: "Appointment", color: "#0E4D52" },
  { value: "gp", label: "GP Appointment", color: "#12707A" },
  { value: "specialist", label: "Specialist", color: "#2E6E83" },
  { value: "allied_health", label: "Allied Health (Physio / OT)", color: "#4E6E54" },
  { value: "nurse", label: "Nursing Visit", color: "#6B8F71" },
  { value: "home_visit", label: "Home Support Visit", color: "#7C9A7F" },
  { value: "telehealth", label: "Telehealth", color: "#3F7CAC" },
  { value: "assessment", label: "Assessment / Review", color: "#A5512B" },
  { value: "social_support", label: "Social Support", color: "#C2683D" },
  { value: "transport", label: "Transport", color: "#8A6D3B" },
  { value: "respite", label: "Respite", color: "#9A5B8C" },
  { value: "medication", label: "Medication", color: "#B4553F" },
  { value: "reminder", label: "Reminder", color: "#D08A3E" },
  { value: "personal", label: "Personal Entry", color: "#6E6459" },
  { value: "other", label: "Other", color: "#7A6450" },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.label]));
const KIND_COLOR: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.color]));

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
function durationLabel(m: number): string {
  if (m % 60 === 0) return `${m / 60} hr${m / 60 > 1 ? "s" : ""}`;
  if (m > 60) return `${Math.floor(m / 60)} hr ${m % 60} min`;
  return `${m} min`;
}
const DURATION_OPTIONS = [
  ...DURATION_PRESETS.map((m) => ({ value: String(m), label: durationLabel(m) })),
  { value: "custom", label: "Custom…" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const todayKey = () => localDay(new Date().toISOString());

const emptyDraft = (date?: string) => ({
  id: "" as string,
  title: "",
  date: date || todayKey(),
  time: "09:00",
  duration_minutes: "60",
  durationMode: "60",
  kind: "appointment",
  provider: "",
  location: "",
  notes: "",
  status: "active",
});
type Draft = ReturnType<typeof emptyDraft>;

function prettyDay(s: string): string {
  try { return new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
  catch { return s; }
}
function timeLabel(s: string): string {
  try { return new Date(s).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [dayMode, setDayMode] = useState(true); // true = show selected day, false = show all

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Visit[]>(`/visits`);
      setVisits(Array.isArray(data) ? data : []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = (date?: string) => setDraft(emptyDraft(date || selectedDate));
  const startEdit = (v: Visit) => {
    const d = new Date(v.starts_at);
    const dm = v.duration_minutes || 60;
    setOpenId(null);
    setDraft({
      id: v.id,
      title: v.title || "",
      date: isNaN(d.getTime()) ? todayKey() : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: isNaN(d.getTime()) ? "09:00" : `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      duration_minutes: String(dm),
      durationMode: DURATION_PRESETS.includes(dm) ? String(dm) : "custom",
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
        title: v.title, starts_at: v.starts_at, duration_minutes: v.duration_minutes || 60,
        location: v.location || null, provider: v.provider || null, notes: v.notes || null,
        kind: v.kind || "appointment", status,
      } });
      await load();
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  const del = async (v: Visit) => {
    setBusyId(v.id);
    try { await apiFetch(`/visits/${v.id}`, { method: "DELETE" }); await load(); }
    catch { /* ignore */ } finally { setBusyId(null); setOpenId(null); }
  };

  // Month-grid dot markers + selected-day highlight.
  const marked = useMemo(() => {
    const m: Record<string, any> = {};
    for (const v of visits) {
      const k = localDay(v.starts_at);
      if (!k) continue;
      if (!m[k]) m[k] = { marked: true, dotColor: v.status === "cancelled" ? colors.muted : (KIND_COLOR[v.kind || "appointment"] || colors.primary) };
    }
    m[selectedDate] = { ...(m[selectedDate] || {}), selected: true, selectedColor: colors.primary, selectedTextColor: "#FFFFFF" };
    return m;
  }, [visits, selectedDate, colors]);

  const groups = useMemo(() => {
    const list = dayMode ? visits.filter((v) => localDay(v.starts_at) === selectedDate) : visits;
    const sorted = [...list].sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
    const map = new Map<string, Visit[]>();
    for (const v of sorted) {
      const k = prettyDay(localDay(v.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(v);
    }
    return Array.from(map.entries());
  }, [visits, dayMode, selectedDate]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Calendar"
        subtitle="Appointments, visits & reminders"
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
          {/* Google-style month grid */}
          <Card style={{ padding: spacing.sm }} testID="calendar-month">
            <RNCalendar
              current={selectedDate}
              onDayPress={(d: { dateString: string }) => { setSelectedDate(d.dateString); setDayMode(true); }}
              markedDates={marked}
              enableSwipeMonths
              firstDay={1}
              theme={{
                calendarBackground: "transparent",
                monthTextColor: colors.text,
                textMonthFontFamily: fonts.heading,
                textMonthFontSize: 18,
                textSectionTitleColor: colors.muted,
                arrowColor: colors.primary,
                todayTextColor: colors.gold,
                dayTextColor: colors.text,
                textDisabledColor: isDark ? "#3A5150" : "#C4C9CE",
                selectedDayBackgroundColor: colors.primary,
                selectedDayTextColor: "#FFFFFF",
                dotColor: colors.primary,
                selectedDotColor: "#FFFFFF",
                textDayFontFamily: fonts.body,
                textDayHeaderFontFamily: fonts.bodySemi,
              }}
            />
          </Card>

          {/* Day / All toggle */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable testID="calendar-mode-day" onPress={() => setDayMode(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center", backgroundColor: dayMode ? colors.primary : colors.surface2 }}>
              <T variant="small" style={{ color: dayMode ? "#fff" : colors.muted, fontFamily: fonts.bodySemi }}>Selected day</T>
            </Pressable>
            <Pressable testID="calendar-mode-all" onPress={() => setDayMode(false)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center", backgroundColor: !dayMode ? colors.primary : colors.surface2 }}>
              <T variant="small" style={{ color: !dayMode ? "#fff" : colors.muted, fontFamily: fonts.bodySemi }}>All entries</T>
            </Pressable>
          </View>

          {dayMode ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="label" style={{ color: colors.muted, flex: 1 }}>{prettyDay(selectedDate).toUpperCase()}</T>
              <Button label="Add for this day" testID="calendar-add-for-day" variant="outline" icon={Plus} onPress={() => openNew(selectedDate)} style={{ minHeight: 38, paddingHorizontal: 12 }} />
            </View>
          ) : null}

          {/* Create / edit form — tinted (#4) */}
          {draft ? (
            <Card testID="visits-form" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage400 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <T variant="h3">{draft.id ? "Edit entry" : "Add entry"}</T>
                <Button label="" icon={X} variant="ghost" onPress={() => setDraft(null)} testID="visits-form-close" style={{ minHeight: 36, paddingHorizontal: 8 }} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Field label="What is it?" required testID="visits-form-title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="e.g. GP appointment, physio, reminder" />
                <Select label="Type" required testID="visits-form-kind" value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
                <DateField label="Date" required testID="visits-form-when" value={draft.date} onChange={(iso) => setDraft({ ...draft, date: iso })} maximumDate={new Date(2100, 0, 1)} />
                <Field label="Time (HH:MM, 24h)" required testID="visits-form-time" value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder="09:00" keyboardType="numbers-and-punctuation" />
                <Select
                  label="Duration"
                  required
                  testID="visits-form-duration"
                  value={draft.durationMode}
                  onChange={(v) => setDraft(v === "custom" ? { ...draft, durationMode: "custom" } : { ...draft, durationMode: v, duration_minutes: v })}
                  options={DURATION_OPTIONS}
                />
                {draft.durationMode === "custom" ? (
                  <Field label="Custom minutes" required testID="visits-form-duration-custom" value={draft.duration_minutes} onChangeText={(v) => setDraft({ ...draft, duration_minutes: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
                ) : null}
                <Field label="Provider" optional testID="visits-form-provider" value={draft.provider} onChangeText={(v) => setDraft({ ...draft, provider: v })} placeholder="e.g. Acacia Aged Care" />
                <Field label="Location" optional testID="visits-form-location" value={draft.location} onChangeText={(v) => setDraft({ ...draft, location: v })} placeholder="e.g. Clinic address" />
                <Field label="Notes" optional testID="visits-form-notes" value={draft.notes} onChangeText={(v) => setDraft({ ...draft, notes: v })} placeholder="Anything to remember" multiline style={{ minHeight: 72 } as any} />
                <Button label={draft.id ? "Save changes" : "Add to calendar"} testID="visits-form-submit" icon={Plus} onPress={save} loading={saving} disabled={!draft.title.trim()} />
              </View>
            </Card>
          ) : null}

          {groups.length === 0 && !draft ? (
            <StatePanel testID="calendar-empty" icon={CalendarIcon} title={dayMode ? "Nothing on this day" : "Nothing on the calendar yet"} message={dayMode ? "Tap another day, or add an entry for this one." : "Add care visits, appointments and reminders to keep track of what is coming up."} actionLabel="Add entry" onAction={() => openNew()} />
          ) : (
            groups.map(([day, list]) => (
              <View key={day} style={{ gap: spacing.sm }}>
                {!dayMode ? <T variant="label" style={{ color: colors.muted }}>{day.toUpperCase()}</T> : null}
                {list.map((v) => {
                  const dim = v.status === "cancelled" || v.status === "archived";
                  const open = openId === v.id;
                  return (
                    <Card key={v.id} testID={`calendar-entry-${v.id}`} style={{ padding: spacing.md, opacity: dim ? 0.6 : 1 }}>
                      <Pressable onPress={() => setOpenId(open ? null : v.id)} testID={`calendar-entry-toggle-${v.id}`}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                            <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: v.status === "cancelled" ? colors.muted : (KIND_COLOR[v.kind || "appointment"] || colors.primary) }} />
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{v.title}</T>
                          </View>
                          {v.status === "cancelled" ? <Badge label="CANCELLED" tone="error" /> : v.status === "archived" ? <Badge label="ARCHIVED" tone="neutral" /> : <Badge label={(KIND_LABEL[v.kind || "appointment"] || "Appointment").toUpperCase()} tone="brand" />}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <Clock size={14} color={colors.muted} />
                          <T variant="small">{timeLabel(v.starts_at)}{v.duration_minutes ? ` · ${durationLabel(v.duration_minutes)}` : ""}</T>
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
