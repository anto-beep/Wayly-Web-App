import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, FileWarning, ArrowRight } from "lucide-react-native";

import { Button, Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

export type GuardVerdict = {
  decision: "accept" | "confirm" | "block";
  reason: string;
  message: string;
  detected_type?: string;
  wrong_tool?: { slug: string; name: string; route_web: string; route_mobile: string } | null;
};

// Renders the UPLOAD-GUARD-1 block / wrong-tool / confirm states identically
// to web. `onContinue` powers the confirm tier (re-submit with override);
// `onChooseAnother` clears the current file so the user can pick a new one.
export default function UploadGuardNotice({
  verdict,
  onContinue,
  onChooseAnother,
  busy,
}: {
  verdict: GuardVerdict;
  onContinue?: () => void;
  onChooseAnother: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const isConfirm = verdict.decision === "confirm";
  const wrong = verdict.reason === "wrong_tool" && verdict.wrong_tool;
  const tone = isConfirm ? colors.gold : colors.terracotta;
  const bg = isConfirm ? colors.goldSoft : colors.errorSoft;
  const Icon = wrong ? FileWarning : AlertTriangle;

  return (
    <Card testID="upload-guard-notice" style={{ borderColor: tone, borderWidth: 1.5, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Icon size={22} color={tone} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>
            {wrong ? "Wrong document?" : isConfirm ? "Just checking" : "We couldn't use this file"}
          </T>
          <T variant="small" style={{ color: colors.text, marginTop: 4, lineHeight: 20 }} testID="upload-guard-message">
            {verdict.message}
          </T>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
            {wrong ? (
              <Button
                label={`Open the ${verdict.wrong_tool!.name}`}
                testID="upload-guard-open-right-tool"
                icon={ArrowRight}
                onPress={() => router.replace(verdict.wrong_tool!.route_mobile as any)}
                style={{ flexGrow: 1 }}
              />
            ) : null}
            {isConfirm && onContinue ? (
              <Button label="Continue anyway" testID="upload-guard-continue" onPress={onContinue} loading={busy} style={{ flexGrow: 1 }} />
            ) : null}
            <Button label="Choose a different file" testID="upload-guard-choose-another" variant="outline" onPress={onChooseAnother} style={{ flexGrow: 1 }} />
          </View>
        </View>
      </View>
    </Card>
  );
}
