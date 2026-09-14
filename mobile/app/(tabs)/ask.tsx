import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import MarkdownText from "@/src/components/MarkdownText";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, streamAw2 } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing, Palette } from "@/src/theme/tokens";

type Cite = { source_type: string; citation_reference?: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; cited_sources?: Cite[]; user_feedback?: string };
type Conv = { id: string; messages: Msg[] };

const SUGGESTIONS = [
  "What does my latest statement cover?",
  "Where is the money going this quarter?",
  "Explain Care Management charges",
];
const DATA_SOURCES = [
  { key: "participant_profile", label: "Participant Profile" },
  { key: "budget_projection", label: "Budget Projection" },
  { key: "care_plan_summary", label: "Care Plan Summary" },
  { key: "contribution_position", label: "Contribution Position" },
  { key: "lifetime_cap_position", label: "Lifetime Cap Position" },
  { key: "decoded_statement_summary", label: "Statement Summary" },
  { key: "open_cases", label: "Open Cases" },
  { key: "goal_ledger", label: "Goal Ledger" },
  { key: "provider_history", label: "Provider History" },
];
const RETENTION_OPTIONS = [
  { key: "session_only", label: "Session only" },
  { key: "14_days", label: "14 days" },
  { key: "30_days", label: "30 days" },
  { key: "90_days", label: "90 days" },
];

export default function AskWayly() {
  const { active } = useParticipants();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const participantId = active?.id || "default";

  const [conv, setConv] = useState<Conv | null>(null);
  const [ctx, setCtx] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadCtx = useCallback(async () => {
    try { const r = await apiFetch<any>("/aw2/context"); setCtx(r?.context || null); } catch { setCtx(null); }
  }, []);
  useEffect(() => { loadCtx(); }, [loadCtx]);
  // Drop the conversation when the active participant changes.
  useEffect(() => { setConv(null); }, [participantId]);

  const scrollDown = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

  const start = async (text: string) => {
    setSending(true);
    try {
      const r = await apiFetch<any>("/aw2/conversations", { method: "POST", body: { initial_message: text, participant_context_id: participantId } });
      setConv(r?.conversation || null);
      scrollDown();
    } catch { setConv({ id: "err", messages: [{ id: "e1", role: "assistant", content: "Sorry, something went wrong starting the conversation. Please try again." }] }); }
    finally { setSending(false); }
  };

  const sendMore = async (text: string) => {
    if (!conv) return;
    const asstId = `a-${Date.now()}`;
    setConv((c) => c ? ({ ...c, messages: [...c.messages, { id: `u-${Date.now()}`, role: "user", content: text }, { id: asstId, role: "assistant", content: "" }] }) : c);
    setSending(true);
    scrollDown();
    const updateAsst = (fn: (m: Msg) => Msg) => setConv((c) => c ? ({ ...c, messages: c.messages.map((m) => m.id === asstId ? fn(m) : m) }) : c);
    let streamed = "";
    try {
      await streamAw2(conv.id, text, {
        onDelta: (t) => { streamed += t; updateAsst((m) => ({ ...m, content: streamed })); listRef.current?.scrollToEnd({ animated: true }); },
        onDone: (full, _sid, extra) => {
          const am = extra?.assistant_message;
          updateAsst((m) => am ? { ...m, ...am } : { ...m, content: full || streamed || m.content });
          setSending(false); scrollDown();
        },
        onError: (msg) => { updateAsst((m) => ({ ...m, content: streamed || msg })); setSending(false); },
      });
    } catch { updateAsst((m) => ({ ...m, content: streamed || "Sorry, something went wrong." })); setSending(false); }
  };

  const handleSend = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setInput("");
    if (conv) sendMore(q); else start(q);
  };

  const feedback = async (msgId: string, rating: string) => {
    if (!conv) return;
    setConv((c) => c ? ({ ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, user_feedback: rating } : m) }) : c);
    try { await apiFetch(`/aw2/conversations/${conv.id}/feedback`, { method: "POST", body: { message_id: msgId, rating } }); } catch { /* noop */ }
  };

  const visibleMsgs = (conv?.messages || []).filter((m) => m.role === "user" || (m.content || "").length > 0 || sending);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Ask Wayly" right={
        <Pressable testID="aw2-toggle-settings" onPress={() => { setShowSettings(true); loadCtx(); }} hitSlop={8}>
          <Ionicons name="options-outline" size={22} color={colors.primary} />
        </Pressable>
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        {!conv ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
            <PageIntro
              eyebrow="Ask Wayly"
              title="Your Context-Aware Aged Care Assistant"
              description="Ask anything about Support at Home, budgets, statements, care plans, or the transition from CHSP. Ask Wayly answers using what you've explicitly consented to share, nothing more."
              whatItDoes="Grounds every answer in the Aged Care Act 2024 and, when you grant consent per data source, the participant's real budget, statements, and care plan."
            />
            <View style={{ alignItems: "center", marginTop: spacing.xl, gap: spacing.md }} testID="aw2-empty">
              <View style={styles.orb}><Ionicons name="sparkles" size={30} color={colors.primary} /></View>
              <T variant="h2" style={{ textAlign: "center" }}>How can I help today?</T>
              <T variant="bodyMuted" style={{ textAlign: "center", marginTop: -4 }}>Tap the settings icon to choose what Wayly can read. Your session is retained per your policy.</T>
              <View style={{ marginTop: spacing.md, gap: spacing.sm, alignSelf: "stretch" }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} testID={`ask-suggestion-${s.slice(0, 10)}`} onPress={() => handleSend(s)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.85 }]}>
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
            data={visibleMsgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => <Bubble msg={item} colors={colors} onFeedback={feedback} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={<StartFresh onPress={() => setConv(null)} colors={colors} />}
          />
        )}

        {sending && !(conv && conv.messages.length > 0 && conv.messages[conv.messages.length - 1].role === "assistant" && conv.messages[conv.messages.length - 1].content.length > 0) ? (
          <View style={styles.typing}><ActivityIndicator size="small" color={colors.primary} /><T variant="small">Wayly is thinking…</T></View>
        ) : null}

        <View style={styles.inputBar}>
          <TextInput testID="ask-input" value={input} onChangeText={setInput} placeholder="Ask a question…" placeholderTextColor={colors.muted} style={styles.input} multiline />
          <Pressable testID="ask-send-button" onPress={() => handleSend()} disabled={sending || !input.trim()} style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Report an issue — sits BELOW the chat bar (parity with web aw2-report-issue) */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.md, paddingBottom: Platform.OS === "ios" ? spacing.sm : spacing.xs }} testID="aw2-report-issue">
          <Pressable testID="aw2-report-issue-btn" onPress={() => setShowReport(true)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.gold} />
            <T variant="small" style={{ color: colors.gold, fontFamily: fonts.bodySemi, fontSize: 12 }}>Report an issue with an answer</T>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} ctx={ctx} onUpdated={loadCtx} participantId={participantId} colors={colors} />
      <ReportSheet open={showReport} onClose={() => setShowReport(false)} lastQuestion={input} conversationId={conv?.id || null} colors={colors} />
    </View>
  );
}

function Bubble({ msg, colors, onFeedback }: { msg: Msg; colors: Palette; onFeedback: (id: string, r: string) => void }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isUser = msg.role === "user";
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]} testID={`aw2-msg-${msg.role}-${msg.id}`}>
        <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: isUser ? "#fff" : colors.text }} testID={`aw2-msg-content-${msg.id}`}>{isUser ? msg.content : null}</T>
        {!isUser ? <MarkdownText content={msg.content} color={colors.text} size={15} lineHeight={22} /> : null}
        {!isUser && (msg.cited_sources || []).length > 0 ? (
          <View style={{ marginTop: 6, gap: 2 }} testID="aw2-citations">
            {(msg.cited_sources || []).map((c, i) => (
              <T key={i} variant="small" style={{ fontSize: 10, color: colors.muted }} testID={`aw2-citation-${i}`}>↳ {c.source_type.replace(/_/g, " ")}{c.citation_reference ? ` · ${c.citation_reference}` : ""}</T>
            ))}
          </View>
        ) : null}
        {!isUser && msg.content.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <Pressable testID={`aw2-feedback-helpful-${msg.id}`} onPress={() => onFeedback(msg.id, "helpful")} hitSlop={6}>
              <Ionicons name="thumbs-up" size={14} color={msg.user_feedback === "helpful" ? colors.sage : colors.muted} />
            </Pressable>
            <Pressable testID={`aw2-feedback-unhelpful-${msg.id}`} onPress={() => onFeedback(msg.id, "unhelpful")} hitSlop={6}>
              <Ionicons name="thumbs-down" size={14} color={msg.user_feedback === "unhelpful" ? colors.terracotta : colors.muted} />
            </Pressable>
            <Pressable testID={`aw2-feedback-incorrect-${msg.id}`} onPress={() => onFeedback(msg.id, "incorrect")} hitSlop={6}>
              <T variant="small" style={{ fontSize: 11, color: msg.user_feedback === "incorrect" ? colors.terracotta : colors.muted }}>Report incorrect</T>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StartFresh({ onPress, colors }: { onPress: () => void; colors: Palette }) {
  return (
    <Pressable testID="aw2-start-fresh" onPress={onPress} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
      <T variant="small" style={{ color: colors.muted }}>Start a new session</T>
    </Pressable>
  );
}

function SettingsSheet({ open, onClose, ctx, onUpdated, participantId, colors }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const consents: Record<string, string> = Object.fromEntries(
    (ctx?.context_consents || []).filter((c: any) => c.participant_context_id === participantId).map((c: any) => [c.data_source, c.consent_state])
  );
  const retention = ctx?.retention_policy || "session_only";

  const toggle = async (source: string, granted: boolean) => {
    setBusy(source);
    try { await apiFetch("/aw2/context/consent", { method: "POST", body: { data_source: source, participant_context_id: participantId, consent_state: granted ? "revoked" : "granted" } }); await onUpdated(); }
    catch { /* noop */ } finally { setBusy(null); }
  };
  const changeRetention = async (policy: string) => {
    try { await apiFetch("/aw2/context/retention-policy", { method: "PATCH", body: { retention_policy: policy } }); await onUpdated(); } catch { /* noop */ }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg, maxHeight: "86%" }} onPress={(e) => e.stopPropagation()} testID="aw2-settings-sheet">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>What can Wayly read?</T>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          <ScrollView style={{ marginTop: spacing.md }} keyboardShouldPersistTaps="handled">
            <T variant="small" style={{ color: colors.muted, marginBottom: spacing.sm }}>Ask Wayly reads a source only when you grant consent for it. Consent is per participant.</T>
            <View testID="aw2-consent-panel" style={{ gap: 4 }}>
              {DATA_SOURCES.map((src) => {
                const state = consents[src.key] || "not_asked";
                const granted = state === "granted";
                return (
                  <View key={src.key} testID={`aw2-consent-row-${src.key}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <T variant="small" style={{ color: colors.text }}>{src.label}</T>
                      <T variant="small" style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>{state.replace(/_/g, " ")}</T>
                    </View>
                    <Pressable testID={`aw2-consent-toggle-${src.key}`} disabled={busy === src.key} onPress={() => toggle(src.key, granted)}
                      style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderColor: granted ? colors.sage : colors.border, backgroundColor: granted ? colors.sageSoft : "transparent", opacity: busy === src.key ? 0.5 : 1 }}>
                      <T variant="small" style={{ fontSize: 12, color: granted ? colors.sage : colors.muted }}>{granted ? "Granted · revoke" : "Grant"}</T>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm }}>Memory retention</T>
            <View testID="aw2-retention-panel" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {RETENTION_OPTIONS.map((o) => {
                const activeR = retention === o.key;
                return (
                  <Pressable key={o.key} testID={`aw2-retention-${o.key}`} onPress={() => changeRetention(o.key)}
                    style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderColor: activeR ? colors.primary : colors.border, backgroundColor: activeR ? colors.primary : "transparent" }}>
                    <T variant="small" style={{ fontSize: 12, color: activeR ? "#fff" : colors.text }}>{o.label}</T>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: spacing.lg, flexDirection: "row", gap: 8, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: spacing.md }}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.gold} style={{ marginTop: 1 }} />
              <T variant="small" style={{ flex: 1, fontSize: 12, color: colors.text, lineHeight: 18 }}>Ask Wayly is not a clinician, financial adviser, or solicitor. For clinical, financial, or legal advice please consult a qualified professional.</T>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const REPORT_CATEGORIES = [
  { value: "figure_incorrect", label: "A figure or fact looks wrong" },
  { value: "rule_misapplied", label: "A rule was applied that doesn't fit" },
  { value: "situation_not_captured", label: "My situation wasn't captured" },
  { value: "tool_misunderstood_input", label: "Wayly misread my question" },
  { value: "other", label: "Something else" },
];

function ReportSheet({ open, onClose, lastQuestion, conversationId, colors }: { open: boolean; onClose: () => void; lastQuestion: string; conversationId: string | null; colors: Palette }) {
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const reset = () => { setCategory(""); setNote(""); setReference(null); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!category || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<any>("/support/tickets", {
        method: "POST",
        body: {
          tool_name: "Ask Wayly", tool_version: "v1", channel: "in_tool", category,
          user_note: note.trim() || null,
          tool_input: { last_question: lastQuestion || null },
          tool_output: { conversation_id: conversationId },
        },
      });
      setReference(res?.ticket?.reference || "received");
    } catch { /* keep sheet open so the user can retry */ } finally { setBusy(false); }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={close}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg, maxHeight: "86%" }} onPress={(e) => e.stopPropagation()} testID="aw2-report-sheet">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>{reference ? "Thanks — we're on it" : "Report an issue"}</T>
            <Pressable onPress={close} hitSlop={8}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          {reference ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }} testID="aw2-report-confirm">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.sage} />
                <T style={{ flex: 1, color: colors.text }}>Your reference is <T style={{ fontFamily: fonts.bodySemi }}>{reference}</T>.</T>
              </View>
              <T variant="small" style={{ color: colors.muted }}>We aim to come back to you within 14 days. You can track it under Support.</T>
              <Pressable testID="aw2-report-done" onPress={close} style={{ marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" }}>
                <T style={{ fontFamily: fonts.bodySemi, color: "#fff" }}>Done</T>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ marginTop: spacing.md }} keyboardShouldPersistTaps="handled">
              <T variant="small" style={{ color: colors.muted, marginBottom: spacing.sm }}>Tell us what went wrong with an answer and we'll look into it.</T>
              <View style={{ gap: 8 }}>
                {REPORT_CATEGORIES.map((opt) => {
                  const on = category === opt.value;
                  return (
                    <Pressable key={opt.value} testID={`aw2-report-cat-${opt.value}`} onPress={() => setCategory(opt.value)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : "transparent", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
                      <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? colors.primary : colors.muted} />
                      <T style={{ flex: 1, color: colors.text }}>{opt.label}</T>
                    </Pressable>
                  );
                })}
              </View>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, marginTop: spacing.lg, marginBottom: 6 }}>Anything else? (optional)</T>
              <TextInput testID="aw2-report-note" value={note} onChangeText={setNote} multiline placeholder="Add any detail that helps us look into it…" placeholderTextColor={colors.muted}
                style={{ minHeight: 90, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontFamily: fonts.body, fontSize: 15, color: colors.text, textAlignVertical: "top" }} />
              <Pressable testID="aw2-report-submit" onPress={submit} disabled={!category || busy}
                style={{ marginTop: spacing.lg, backgroundColor: colors.gold, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", opacity: !category || busy ? 0.55 : 1 }}>
                {busy ? <ActivityIndicator color="#fff" /> : <T style={{ fontFamily: fonts.bodySemi, color: "#fff" }}>Send report</T>}
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    orb: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" },
    suggestion: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
    bubbleRow: { flexDirection: "row" },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    aiBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 6 },
    inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    input: { flex: 1, maxHeight: 120, minHeight: 46, borderRadius: radius.lg, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: Platform.OS === "ios" ? 12 : 8, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    sendBtn: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  });
