import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/format";

type CaseEvent = { id: string; event_type?: string; note?: string; old_status?: string; new_status?: string; created_at?: string };
type CaseFull = { id: string; case_type?: string; title?: string; status?: string; severity?: string; summary?: string; detail?: string; resolution_notes?: string; created_at?: string; events?: CaseEvent[] };

const STATUS_FLOW = ["open", "in_progress", "waiting_on_provider", "resolved", "dismissed"];
const STATUS_TONE: Record<string, "brand" | "alert" | "success" | "neutral"> = {
  open: "brand", in_progress: "alert", waiting_on_provider: "alert", resolved: "success", dismissed: "neutral",
};

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [c, setC] = useState<CaseFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setC(await apiFetch<CaseFull>(`/loop/cases/${id}`)); }
    catch { setC(null); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeStatus = async (status: string) => {
    setBusy(true);
    try { await apiFetch(`/loop/cases/${id}`, { method: "PATCH", body: { status } }); await load(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/loop/cases/${id}/events`, { method: "POST", body: { event_type: "note_added", note: note.trim() } });
      setNote("");
      await load();
    } catch (e) { if (e instanceof ApiError) { /* surfaced below */ } }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={c?.title || "Case"} subtitle={(c?.case_type || "").replace(/_/g, " ")} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading case…" />
      ) : !c ? (
        <View style={{ padding: spacing.lg }}><T>Case not found.</T></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {c.summary || c.detail ? (
              <Card>
                <T style={{ fontFamily: fonts.body, fontSize: 15 }}>{c.detail || c.summary}</T>
              </Card>
            ) : null}

            <Card testID="case-status-card">
              <T variant="label">STATUS</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                {STATUS_FLOW.map((s) => {
                  const active = c.status === s;
                  return (
                    <Pressable key={s} testID={`case-status-${s}`} onPress={() => changeStatus(s)} disabled={busy}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: active ? "#fff" : colors.text }}>{s.replace(/_/g, " ")}</T>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <Card testID="case-timeline">
              <T variant="label">TIMELINE</T>
              {(c.events || []).length === 0 ? (
                <T variant="small" style={{ marginTop: spacing.sm }}>No activity yet.</T>
              ) : (
                <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                  {(c.events || []).map((e, i) => (
                    <View key={e.id || i} style={{ paddingVertical: spacing.sm, borderBottomWidth: i < (c.events!.length - 1) ? 1 : 0, borderBottomColor: colors.border }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Badge label={(e.event_type || "").replace(/_/g, " ").toUpperCase()} tone="neutral" />
                        <T variant="small" style={{ color: colors.muted }}>{formatDateTime(e.created_at)}</T>
                      </View>
                      {e.event_type === "status_changed" ? (
                        <T variant="small" style={{ marginTop: 4 }}>{(e.old_status || "").replace(/_/g, " ")} → {(e.new_status || "").replace(/_/g, " ")}</T>
                      ) : e.note ? (
                        <T variant="small" style={{ marginTop: 4 }}>{e.note}</T>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card>
              <Field label="Add a note" testID="case-note-input" value={note} onChangeText={setNote} multiline placeholder="Log a call, action taken, or update…" />
              <Button label="Add note" testID="case-add-note" icon={Plus} onPress={addNote} loading={busy} disabled={!note.trim()} style={{ marginTop: spacing.sm }} />
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
