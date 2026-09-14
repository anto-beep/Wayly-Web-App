import React from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { ArrowRight, FileText, ReceiptText, Mail, ClipboardList } from "lucide-react-native";
import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius } from "@/src/theme/tokens";

// A clear, consistent button on each AI Tool screen that takes the user to
// where their saved entries for that tool live. Matches the web
// ToolEntriesButton (premium, less-rounded, solid) for cross-platform parity.
const TOOL_ENTRY: Record<string, { to: string; label: string; Icon: any }> = {
  "statement-decoder": { to: "/(tabs)/statements", label: "View My Statements", Icon: FileText },
  "invoice-checker": { to: "/invoices", label: "View My Invoices", Icon: ReceiptText },
  "letters-and-follow-ups": { to: "/letters", label: "Open My Mailbox", Icon: Mail },
  "care-plan-reviewer": { to: "/care-plans", label: "View My Care Plans", Icon: ClipboardList },
};

export default function ToolEntriesButton({ toolKey }: { toolKey: string }) {
  const { colors } = useTheme();
  const e = TOOL_ENTRY[toolKey];
  if (!e) return null;
  const Icon = e.Icon;
  return (
    <Pressable
      testID={`tool-entries-${toolKey}`}
      onPress={() => router.push(e.to as any)}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 16 }}
    >
      <Icon size={16} color="#fff" />
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff" }}>{e.label}</T>
      <ArrowRight size={16} color="#fff" />
    </Pressable>
  );
}
