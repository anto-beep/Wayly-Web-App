import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Mail, X, Copy, Check } from "lucide-react-native";

import { Button, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export default function OverchargeLetterModal({ visible, facts, onClose, colors }: any) {
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLetter(""); setCopied(false); setLoading(true);
    (async () => {
      try {
        const d = await apiFetch<any>("/chsp1/overcharge-letter", { method: "POST", body: facts || {} });
        setLetter(d?.letter || "");
      } catch { setLetter("Sorry, we couldn't draft the letter right now. Please try again."); }
      finally { setLoading(false); }
    })();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try { await Clipboard.setStringAsync(letter); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "88%" }} testID="chsp-letter-modal">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#A5512B", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Mail size={18} color="#fff" />
              <T style={{ fontFamily: fonts.bodySemi, color: "#fff", fontSize: 15 }}>Query Letter To Your Provider</T>
            </View>
            <Pressable onPress={onClose} testID="chsp-letter-close" hitSlop={10}><X size={20} color="#fff" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <T variant="small" style={{ color: colors.muted, textAlign: "center", paddingVertical: spacing.xl }} testID="chsp-letter-loading">Drafting your letter…</T>
            ) : (
              <>
                <T variant="small" style={{ color: colors.muted }}>Review and edit, then copy it into an email or print it. Wayly never sends it for you.</T>
                <TextInput
                  testID="chsp-letter-text"
                  value={letter}
                  onChangeText={setLetter}
                  multiline
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 260, color: colors.text, fontFamily: fonts.body, backgroundColor: colors.surface2, textAlignVertical: "top", lineHeight: 21 }}
                />
                <Button label={copied ? "Copied" : "Copy Letter"} icon={copied ? Check : Copy} testID="chsp-letter-copy" onPress={copy} />
                <Button label="Close" variant="outline" onPress={onClose} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
