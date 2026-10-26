import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Send, MessageCircle, AlertCircle, RotateCcw } from "lucide-react-native";

import { AppHeader, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import ToolHero from "@/src/components/ToolHero";
import MarkdownText from "@/src/components/MarkdownText";
import ReportSheet from "@/src/components/ReportSheet";
import { apiFetch } from "@/src/lib/api";
import { usePersona } from "@/src/hooks/usePersona";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing, Palette } from "@/src/theme/tokens";

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Exchange = { id: string; q: string; a: string | null; aId: string | null };

const SUGGESTIONS = [
  "What is Support at Home and how is it different from Home Care Packages?",
  "What's the lifetime contribution cap and who does it apply to?",
  "How do the three service streams work?",
  "Can I switch providers under Support at Home?",
];

export default function AgedCareQA() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const persona = usePersona();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Input is at the TOP and the newest exchange renders first, so keep the
  // viewport pinned to the top whenever a new answer arrives — the user never
  // has to scroll to find the latest answer.
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [msgs, busy]);

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

  const clear = () => { setMsgs([]); setSessionId(null); setInput(""); };

  // Group the flat message list into Q→A exchanges, newest first.
  const exchanges = useMemo<Exchange[]>(() => {
    const out: Exchange[] = [];
    for (const m of msgs) {
      if (m.role === "user") out.push({ id: m.id, q: m.content, a: null, aId: null });
      else if (out.length) { const last = out[out.length - 1]; last.a = m.content; last.aId = m.id; }
    }
    return out.reverse();
  }, [msgs]);

  const hasConversation = exchanges.length > 0;
  const canSend = !!input.trim() && !busy;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Aged Care Q&A" onBack={() => router.back()} right={
        hasConversation ? (
          <Pressable testID="fc-clear" onPress={clear} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <RotateCcw size={16} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>New</T>
          </Pressable>
        ) : undefined
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        {/* Ask bar — pinned to the TOP so it is always visible. */}
        <View style={styles.askPanel}>
          <View style={styles.inputBar}>
            <TextInput
              testID="fc-input"
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything about aged care…"
              placeholderTextColor={colors.muted}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            />
            <Pressable testID="fc-send" disabled={!canSend} onPress={() => send()} style={[styles.sendBtn, { backgroundColor: colors.cta, opacity: canSend ? 1 : 0.5 }]}>
              <Send size={18} color="#fff" />
            </Pressable>
          </View>
          <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>{"General Q&A — it can't see your account or statements."}</T>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="aged-care-qa">
          {!hasConversation && !busy ? (
            <View>
              <ToolHero toolKey="family-coordinator" />
              <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
                <MessageCircle size={28} color={colors.sage} />
                <T variant="body" style={{ textAlign: "center", color: colors.muted, marginTop: spacing.sm, lineHeight: 22 }}>
                  {persona === "participant"
                    ? "Ask anything about Support at Home, your classification, contributions, or the new Aged Care Act 2024."
                    : "Ask anything about Support at Home, classifications, contributions, or the new Aged Care Act 2024."}
                </T>
              </View>
              <T variant="small" style={{ color: colors.muted, marginBottom: spacing.sm }}>Common questions</T>
              <View style={{ gap: spacing.sm }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} testID={`fc-suggest-${s.slice(0, 12)}`} onPress={() => send(s)} style={[styles.suggest, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{s}</T>
                  </Pressable>
                ))}
              </View>
              <View style={{ marginTop: spacing.lg }}><ToolExplainer toolKey="family-coordinator" /></View>
            </View>
          ) : (
            exchanges.map((ex, idx) => {
              const thinking = busy && idx === 0 && ex.a == null;
              return (
                <View key={ex.id} style={styles.exchange} testID={`fc-exchange-${idx}`}>
                  <View testID="fc-msg-user" style={{ alignItems: "flex-end" }}>
                    <View style={[styles.bubble, { backgroundColor: colors.primary, borderBottomRightRadius: 4 }]}>
                      <T style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: "#fff" }}>{ex.q}</T>
                    </View>
                  </View>
                  {thinking ? (
                    <View testID="fc-thinking" style={[styles.bubble, styles.thinkingBubble]}>
                      <ActivityIndicator size="small" color={colors.heading} />
                      <T variant="small" style={{ color: colors.muted }}>Wayly is thinking…</T>
                    </View>
                  ) : ex.a != null ? (
                    <View testID="fc-msg-assistant" style={{ alignItems: "flex-start" }}>
                      <View style={[styles.bubble, { backgroundColor: colors.surface2, borderBottomLeftRadius: 4 }]}>
                        <MarkdownText content={ex.a} color={colors.text} size={14} lineHeight={21} chipBg={colors.goldSoft} chipColor={colors.text} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Report an issue — only once an answer exists. */}
        {exchanges.some((ex) => ex.a != null) ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.md, paddingBottom: Platform.OS === "ios" ? spacing.sm : spacing.xs, backgroundColor: colors.bg }} testID="aw2-report-issue">
            <Pressable testID="aw2-report-issue-btn" onPress={() => setShowReport(true)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 }]}>
              <AlertCircle size={15} color={colors.gold} />
              <T variant="small" style={{ color: colors.gold, fontFamily: fonts.bodySemi, fontSize: 12 }}>Report an issue with an answer</T>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <ReportSheet open={showReport} onClose={() => setShowReport(false)} lastQuestion={input} conversationId={sessionId} toolName="Aged Care Q&A" />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    askPanel: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg },
    inputBar: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    textInput: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: fonts.body, fontSize: 15 },
    sendBtn: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    suggest: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
    exchange: { gap: spacing.sm },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
    thinkingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface2, borderBottomLeftRadius: 4, alignSelf: "flex-start" },
  });
