import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import ReportSheet from "@/src/components/ReportSheet";
import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

// Shared "Report an issue with this result" affordance for every tool result
// page. Opens the standard ReportSheet bottom sheet (support ticket).
export default function ReportIssueButton({
  toolName,
  lastQuestion = "",
  conversationId = null,
}: {
  toolName: string;
  lastQuestion?: string;
  conversationId?: string | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", paddingVertical: spacing.sm }} testID="report-issue">
      <Pressable
        testID="report-issue-btn"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 }]}
      >
        <AlertCircle size={15} color={colors.gold} />
        <T style={{ color: colors.gold, fontFamily: fonts.bodySemi, fontSize: 12 }}>Report an issue with this result</T>
      </Pressable>
      <ReportSheet open={open} onClose={() => setOpen(false)} lastQuestion={lastQuestion} conversationId={conversationId} toolName={toolName} />
    </View>
  );
}
