import React, { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LifeBuoy, Plus, Search } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate, timeAgo } from "@/src/utils/format";

type Ticket = { id: string; reference?: string; category?: string; status?: string; user_note?: string; tool_name?: string; created_at?: string; updated_at?: string; last_activity_at?: string; message_count?: number };

const CATEGORIES = [
  { v: "figure_incorrect", label: "A figure looks wrong" },
  { v: "rule_misapplied", label: "A rule seems misapplied" },
  { v: "situation_not_captured", label: "My situation isn't captured" },
  { v: "other", label: "Something else" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.label]));
const STATUS_TONE: Record<string, "brand" | "alert" | "success" | "neutral"> = {
  received: "brand", under_review: "alert", awaiting_user: "alert", resolved: "success", closed: "neutral",
};

export default function SupportScreen() {
  const { colors, shadow } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<any>("/support/tickets");
      setTickets(Array.isArray(res) ? res : res?.tickets || []);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = useMemo(() => {
    let open = 0, awaiting = 0, resolved = 0;
    for (const t of tickets) {
      const s = t.status || "";
      if (s === "awaiting_user") awaiting++;
      if (s === "resolved") resolved++;
      if (s !== "resolved" && s !== "closed") open++;
    }
    return { open, awaiting, resolved, total: tickets.length };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter === "open" && (t.status === "resolved" || t.status === "closed")) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && t.status !== statusFilter) return false;
      if (q) {
        const hay = [t.reference, t.tool_name, t.user_note, CATEGORY_LABEL[t.category || ""]].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, search, statusFilter]);

  const submit = async () => {
    setErr("");
    if (!note.trim()) { setErr("Please describe what you need help with."); return; }
    setSaving(true);
    try {
      await apiFetch("/support/tickets", { method: "POST", body: { channel: "manual", category, user_note: note.trim(), tool_name: "Support page" } });
      setNote(""); setCategory("other"); setShowForm(false);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not raise your request. Please try again.");
    } finally { setSaving(false); }
  };

  const STATUS_FILTERS: { v: string; label: string }[] = [
    { v: "all", label: "All statuses" }, { v: "open", label: "Open" },
    { v: "awaiting_user", label: "Awaiting you" }, { v: "resolved", label: "Resolved" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="My Support" subtitle="Track tickets you have raised" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your requests…" />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View>
              <T style={{ fontFamily: fonts.heading, fontSize: 28 }}>My Support</T>
              <T variant="small" style={{ marginTop: 2, lineHeight: 20 }}>Track tickets you have raised and read what the Wayly team has come back with.</T>
            </View>

            {/* Stat cards */}
            <View style={styles.statGrid}>
              <StatCard label="Open" value={stats.open} tone={colors.primary} colors={colors} shadow={shadow} testID="my-support-stat-open" />
              <StatCard label="Awaiting You" value={stats.awaiting} tone={stats.awaiting > 0 ? colors.alert : colors.muted} colors={colors} shadow={shadow} testID="my-support-stat-awaiting" />
              <StatCard label="Resolved" value={stats.resolved} tone={colors.sage} colors={colors} shadow={shadow} testID="my-support-stat-resolved" />
              <StatCard label="Total" value={stats.total} tone={colors.muted} colors={colors} shadow={shadow} testID="my-support-stat-total" />
            </View>

            {!showForm ? (
              <Button label="Raise a New Ticket" testID="support-new-btn" icon={Plus} onPress={() => setShowForm(true)} />
            ) : (
              <Card testID="support-form">
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>What do you need help with?</T>
                <View style={{ gap: spacing.sm }}>
                  {CATEGORIES.map((c) => {
                    const active = category === c.v;
                    return (
                      <Pressable key={c.v} testID={`support-cat-${c.v}`} onPress={() => setCategory(c.v)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center" }}>
                          {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                        </View>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{c.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
                <Field label="Tell us more" testID="support-note-input" value={note} onChangeText={setNote} multiline placeholder="Describe the issue in your own words…" style={{ marginTop: spacing.md }} />
                {err ? <T variant="small" testID="support-error" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{err}</T> : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button label="Cancel" testID="support-cancel" variant="ghost" onPress={() => { setShowForm(false); setErr(""); }} style={{ flex: 1 }} />
                  <Button label="Send request" testID="support-submit" onPress={submit} loading={saving} style={{ flex: 2 }} />
                </View>
              </Card>
            )}

            {/* Search + status filter */}
            {tickets.length > 0 ? (
              <>
                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Search size={18} color={colors.muted} />
                  <TextInput testID="my-support-search" value={search} onChangeText={setSearch} placeholder="Search reference, tool, keyword…" placeholderTextColor={colors.muted} style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text }} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                  {STATUS_FILTERS.map((s) => {
                    const on = statusFilter === s.v;
                    return (
                      <Pressable key={s.v} testID={`my-support-filter-${s.v}`} onPress={() => setStatusFilter(s.v)} style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: on ? colors.primaryFg : colors.muted }}>{s.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {tickets.length === 0 ? (
              <StatePanel icon={LifeBuoy} title="No requests yet" message="Raise a request and we will get back to you. You can track replies right here." />
            ) : (
              filtered.map((t, i) => (
                <Pressable key={t.id} testID={`ticket-row-${t.reference || i}`} onPress={() => router.push(`/support/${t.id}`)}>
                  <Card>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
                      <T style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.muted }}>{t.reference || "Request"}</T>
                      <Badge label={(t.status || "").replace(/_/g, " ").toUpperCase()} tone={STATUS_TONE[t.status || ""] || "neutral"} />
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 4 }}>{CATEGORY_LABEL[t.category || ""] || "Ticket"}</T>
                    {t.user_note ? <T variant="small" style={{ marginTop: 2 }} numberOfLines={2}>{t.user_note}</T> : null}
                    <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 6 }}>Raised {formatDate(t.created_at)} · Updated {timeAgo(t.last_activity_at || t.updated_at)}</T>
                  </Card>
                </Pressable>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function StatCard({ label, value, tone, colors, shadow, testID }: any) {
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
      <T style={{ fontFamily: fonts.heading, fontSize: 24, color: tone }}>{value}</T>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.4, color: colors.muted, marginTop: 2 }}>{label.toUpperCase()}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { flexBasis: "47%", flexGrow: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, minHeight: 46 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
});
