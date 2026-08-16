import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Send, MessageCircle } from "lucide-react-native";

import { AppHeader, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch } from "@/src/lib/api";
import { usePersona } from "@/src/hooks/usePersona";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

type Msg = { id: string; role: "user" | "assistant"; content: string };
const SUGGESTIONS = [
  "What is Support at Home and how is it different from Home Care Packages?",
  "What's the lifetime contribution cap and who does it apply to?",
  "How do the three service streams work?",
  "Can I switch providers under Support at Home?",
];

export default function AgedCareQA() {
  const { colors } = useTheme();
  const persona = usePersona();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [msgs, busy]);

  const send = async (text?: string) => {
    const m = (text ?? input).trim();
    if (!m || busy) return;
    setInput(""); setBusy(true);
    setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: "user", content: m }]);
    try {
      const data = await apiFetch<{ reply: string; session_id: string }>("/public/aged-care-chat", { method: "POST", body: { message: m, session_id: sessionId } });
      setSessionId(data.session_id);
      setMsgs((x) => [...x, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch {
      setMsgs((x) => [...x, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, couldn't reach the assistant. Please try again." }]);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Aged Care Q&A" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="aged-care-qa">
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Aged Care Q&A</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.</T>
          <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>{"This is a general Q&A assistant, it can't see your account or statements."}</T>

          {msgs.length === 0 && !busy ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
              <MessageCircle size={30} color={colors.sage} />
              <T variant="body" style={{ textAlign: "center", color: colors.muted, marginTop: spacing.md, lineHeight: 22 }}>
                {persona === "participant"
                  ? "Ask anything about Support at Home, your classification, contributions, or the new Aged Care Act 2024."
                  : "Ask anything about Support at Home, classifications, contributions, or the new Aged Care Act 2024."}
              </T>
              <View style={{ gap: spacing.sm, marginTop: spacing.lg, alignSelf: "stretch" }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} testID={`fc-suggest-${s.slice(0, 12)}`} onPress={() => send(s)} style={[styles.suggest, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{s}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {msgs.map((m) => (
            <View key={m.id} testID={`fc-msg-${m.role}`} style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <View style={[styles.bubble, m.role === "user" ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 } : { backgroundColor: colors.surface2, borderBottomLeftRadius: 4 }]}>
                <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: m.role === "user" ? "#fff" : colors.text }}>{sanitizeAI(m.content)}</T>
              </View>
            </View>
          ))}
          {busy ? <T variant="small" style={{ color: colors.muted }}>Thinking…</T> : null}

          <ToolExplainer toolKey="family-coordinator" />
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <TextInput testID="fc-input" value={input} onChangeText={setInput} placeholder="Ask anything…" placeholderTextColor={colors.muted} onSubmitEditing={() => send()} style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]} />
          <Pressable testID="fc-send" disabled={busy || !input.trim()} onPress={() => send()} style={[styles.sendBtn, { backgroundColor: colors.cta, opacity: busy || !input.trim() ? 0.5 : 1 }]}>
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  suggest: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
  inputBar: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, alignItems: "center" },
  textInput: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
  sendBtn: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
