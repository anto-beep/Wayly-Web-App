import React, { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const REPORT_CATEGORIES = [
  { value: "figure_incorrect", label: "A figure or fact looks wrong" },
  { value: "rule_misapplied", label: "A rule was applied that doesn't fit" },
  { value: "situation_not_captured", label: "My situation wasn't captured" },
  { value: "tool_misunderstood_input", label: "Wayly misread my question" },
  { value: "other", label: "Something else" },
];

/**
 * Shared "Report an issue" bottom sheet used by the member Ask tab and the
 * public Aged Care Q&A tool, so both surfaces flag answers the same way.
 */
export default function ReportSheet({
  open,
  onClose,
  lastQuestion,
  conversationId,
  toolName = "Ask Wayly",
}: {
  open: boolean;
  onClose: () => void;
  lastQuestion: string;
  conversationId: string | null;
  toolName?: string;
}) {
  const { colors } = useTheme();
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
          tool_name: toolName, tool_version: "v1", channel: "in_tool", category,
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
