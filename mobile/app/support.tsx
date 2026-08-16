import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LifeBuoy, Plus } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

type Ticket = { id: string; reference?: string; category?: string; status?: string; user_note?: string; created_at?: string; message_count?: number };

const CATEGORIES = [
  { v: "figure_incorrect", label: "A figure looks wrong" },
  { v: "rule_misapplied", label: "A rule seems misapplied" },
  { v: "situation_not_captured", label: "My situation isn't captured" },
  { v: "other", label: "Something else" },
];
const STATUS_TONE: Record<string, "brand" | "alert" | "success" | "neutral"> = {
  received: "brand", under_review: "alert", awaiting_user: "alert", resolved: "success", closed: "neutral",
};

export default function SupportScreen() {
  const { colors } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<any>("/support/tickets");
      setTickets(Array.isArray(res) ? res : res?.tickets || []);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Support" subtitle="Raise and track help requests" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your requests…" />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {!showForm ? (
              <Button label="Raise a request" testID="support-new-btn" icon={Plus} onPress={() => setShowForm(true)} />
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

            {tickets.length === 0 ? (
              <StatePanel icon={LifeBuoy} title="No requests yet" message="Raise a request and we will get back to you. You can track replies right here." />
            ) : (
              tickets.map((t, i) => (
                <Pressable key={t.id} testID={`support-ticket-${i}`} onPress={() => router.push(`/support/${t.id}`)}>
                  <Card>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }} numberOfLines={1}>{t.reference || "Request"} · {(t.category || "").replace(/_/g, " ")}</T>
                      <Badge label={(t.status || "").replace(/_/g, " ").toUpperCase()} tone={STATUS_TONE[t.status || ""] || "neutral"} />
                    </View>
                    {t.user_note ? <T variant="small" style={{ marginTop: 4 }} numberOfLines={2}>{t.user_note}</T> : null}
                    <T variant="small" style={{ marginTop: 4, color: colors.muted }}>{formatDate(t.created_at)}{t.message_count ? ` · ${t.message_count} message(s)` : ""}</T>
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
