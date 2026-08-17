import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { AppHeader, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing, Palette } from "@/src/theme/tokens";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What does my latest statement cover?",
  "Where is the money going this quarter?",
  "Explain Care Management charges",
];

export default function AskWayly() {
  const { active } = useParticipants();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { statement_id } = useLocalSearchParams<{ statement_id?: string }>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await apiFetch<{ reply: string; session_id?: string }>("/chat", {
        method: "POST",
        body: {
          message: q,
          ...(sessionId ? { session_id: sessionId } : {}),
          ...(statement_id ? { statement_id } : {}),
        },
      });
      if (res.session_id) setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", content: res.reply || "…" },
      ]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Sorry, something went wrong. Please try again.";
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: msg }]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Ask Wayly" subtitle={active ? `About ${active.display_name}` : "Your care assistant"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
            <PageIntro
              eyebrow="Ask Wayly"
              title="Your Context-Aware Aged Care Assistant"
              description="Ask anything about Support at Home, budgets, statements, care plans, or the transition from CHSP. Ask Wayly answers using what you've explicitly consented to share, nothing more."
              whatItDoes="Grounds every answer in the Aged Care Act 2024 and, when you grant consent per data source, the participant's real budget, statements, and care plan. Declines to give clinical, financial, or legal advice."
              howToUse={[
                "Open Settings and grant consent for the data sources you want Ask Wayly to read.",
                "Choose how long the conversation is kept (session only, 14, 30, or 90 days).",
                "Ask your question in plain English. Follow up naturally, Ask Wayly remembers the thread.",
                "Use the thumbs up / down to help us improve answer quality.",
              ]}
              whatYouGet={[
                "Answers grounded in real data (when consented), not generic advice.",
                "Citations for the sources used so you can double-check.",
                "A safe boundary, no medical, financial, or legal recommendations.",
              ]}
            />
            <View style={[styles.empty, { flex: 0, padding: 0, paddingTop: spacing.lg }]}>
              <View style={styles.orb}>
                <Ionicons name="sparkles" size={30} color={colors.primary} />
              </View>
              <T variant="h2" style={{ textAlign: "center", marginTop: spacing.md }}>
                How can I help today?
              </T>
              <T variant="bodyMuted" style={{ textAlign: "center", marginTop: 6 }}>
                Ask about statements, budgets, charges or your Support at Home plan.
              </T>
              <View style={{ marginTop: spacing.xl, gap: spacing.sm, alignSelf: "stretch" }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    testID={`ask-suggestion-${s.slice(0, 10)}`}
                    onPress={() => send(s)}
                    style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="arrow-forward-circle" size={20} color={colors.gold} />
                    <T style={{ flex: 1, fontFamily: fonts.bodyMedium, color: colors.text }}>{s}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => <Bubble msg={item} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {sending ? (
          <View style={styles.typing}>
            <ActivityIndicator size="small" color={colors.primary} />
            <T variant="small">Wayly is thinking…</T>
          </View>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput
            testID="ask-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            testID="ask-send-button"
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <T
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 22,
            color: isUser ? "#fff" : colors.text,
          }}
        >
          {msg.content}
        </T>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
    orb: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: colors.sageSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    bubbleRow: { flexDirection: "row" },
    bubble: { maxWidth: "84%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    aiBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 6 },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      minHeight: 46,
      borderRadius: radius.lg,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: Platform.OS === "ios" ? 12 : 8,
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.text,
    },
    sendBtn: {
      width: 46,
      height: 46,
      borderRadius: radius.pill,
      backgroundColor: colors.gold,
      alignItems: "center",
      justifyContent: "center",
    },
  });
