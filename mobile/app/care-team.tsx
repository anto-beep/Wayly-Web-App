import React, { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MessageCircle, Send } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing } from "@/src/theme/tokens";

type Msg = { id: string; author_name?: string; body?: string; created_at?: string };

function timeLabel(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }); }
  catch { return s; }
}

export default function CareTeamThreadScreen() {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Msg[]>("/family-thread");
      setMessages(Array.isArray(data) ? data : []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (!body.trim()) return;
    setSending(true); setSendErr("");
    try {
      await apiFetch("/family-thread", { method: "POST", body: { body: body.trim() } });
      setBody("");
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) { setSendErr(e instanceof ApiError ? e.message : "Could not post your message. Please try again."); }
    finally { setSending(false); }
  };

  const ordered = [...messages].sort((a, b) => (a.created_at || "") < (b.created_at || "") ? -1 : 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Care Team" subtitle="A quiet space for the family" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading the family thread…" />
      ) : error ? (
        <StatePanel testID="care-team-error" icon={MessageCircle} title="Couldn't load the thread" actionLabel="Retry" onAction={load} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90}>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }} testID="care-team-thread">
            <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
                Keep the family updated in one calm place. No group SMS chains, no missed messages, no doubling up on tasks. Only invited family members can see this.
              </T>
            </Card>
            {ordered.length === 0 ? (
              <StatePanel testID="care-team-empty" icon={MessageCircle} title="No messages yet" message="Start by sharing something with the family." />
            ) : (
              ordered.map((m) => (
                <Card key={m.id} testID={`family-msg-${m.id}`} style={{ padding: spacing.md }}>
                  <T variant="label" style={{ color: colors.muted }}>{(m.author_name || "Family").toUpperCase()} · {timeLabel(m.created_at)}</T>
                  <T style={{ fontSize: 15, lineHeight: 22, marginTop: 4 }}>{m.body}</T>
                </Card>
              ))
            )}
          </ScrollView>
          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            {sendErr ? <T variant="small" style={{ color: colors.error, marginBottom: 6 }}>{sendErr}</T> : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field testID="family-thread-input" value={body} onChangeText={setBody} placeholder="Share an update with the family…" multiline style={{ minHeight: 44, borderRadius: radius.lg } as any} />
              </View>
              <Button label="" icon={Send} testID="family-thread-send" onPress={send} loading={sending} disabled={!body.trim()} style={{ minHeight: 48, paddingHorizontal: 16 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
