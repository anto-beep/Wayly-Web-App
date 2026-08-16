import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/format";

type Msg = { id: string; author_type?: string; body?: string; created_at?: string; visibility?: string };
type Ticket = { id: string; reference?: string; category?: string; status?: string; user_note?: string; created_at?: string };

export default function SupportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ ticket: Ticket; thread: Msg[] }>(`/support/tickets/${id}`);
      setTicket(res.ticket); setThread(res.thread || []);
    } catch { setTicket(null); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    setErr("");
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/support/tickets/${id}/messages`, { method: "POST", body: { body: reply.trim() } });
      setReply("");
      await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not send your message."); }
    finally { setBusy(false); }
  };

  const setStatus = async (action: "close" | "reopen") => {
    setErr("");
    setBusy(true);
    try { await apiFetch(`/support/tickets/${id}/${action}`, { method: "POST", body: {} }); await load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : `Could not ${action} this request.`); }
    finally { setBusy(false); }
  };

  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";
  const msgs = thread;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={ticket?.reference || "Request"} subtitle={(ticket?.category || "").replace(/_/g, " ")} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading request…" />
      ) : !ticket ? (
        <View style={{ padding: spacing.lg }}><T>Request not found.</T></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Badge label={(ticket.status || "").replace(/_/g, " ").toUpperCase()} tone={isClosed ? "neutral" : "brand"} testID="support-detail-status" />
              <Button label={isClosed ? "Reopen" : "Close request"} testID={isClosed ? "support-reopen" : "support-close"} variant="ghost" onPress={() => setStatus(isClosed ? "reopen" : "close")} loading={busy} />
            </View>

            {err ? <T variant="small" testID="support-detail-error" style={{ color: colors.terracotta }}>{err}</T> : null}

            {ticket.user_note ? (
              <Card>
                <T variant="label">YOUR REQUEST</T>
                <T style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 4 }}>{ticket.user_note}</T>
                <T variant="small" style={{ marginTop: 6, color: colors.muted }}>{formatDateTime(ticket.created_at)}</T>
              </Card>
            ) : null}

            {msgs.map((m, i) => {
              const mine = m.author_type === "user";
              return (
                <View key={m.id || i} testID={`support-msg-${i}`} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                  <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: mine ? colors.primary : colors.surface2 }}>
                    <T style={{ fontFamily: fonts.body, fontSize: 14, color: mine ? "#fff" : colors.text }}>{m.body}</T>
                  </View>
                  <T variant="small" style={{ marginTop: 2, color: colors.muted, alignSelf: mine ? "flex-end" : "flex-start" }}>
                    {mine ? "You" : "Wayly"} · {formatDateTime(m.created_at)}
                  </T>
                </View>
              );
            })}

            {!isClosed ? (
              <Card>
                <Field label="Add a reply" testID="support-reply-input" value={reply} onChangeText={setReply} multiline placeholder="Type your message…" />
                <Button label="Send" testID="support-send" icon={Send} onPress={send} loading={busy} disabled={!reply.trim()} style={{ marginTop: spacing.sm }} />
              </Card>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
