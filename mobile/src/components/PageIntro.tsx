import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

// Mirrors the web PageIntro: eyebrow + title + description, with an
// expandable "How this works" block (What it does / How to use it / What you get).
export function PageIntro({
  eyebrow, title, description, whatItDoes, howToUse, whatYouGet,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  whatItDoes?: string;
  howToUse?: string[];
  whatYouGet?: string[];
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(true);
  const hasDetail = !!(whatItDoes || howToUse?.length || whatYouGet?.length);

  return (
    <View>
      <T variant="label" testID="page-eyebrow">{eyebrow}</T>
      <T style={{ fontFamily: fonts.heading, fontSize: 26, marginTop: 4 }}>{title}</T>
      {description ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>{description}</T> : null}

      {hasDetail ? (
        <>
          <Pressable
            testID="page-intro-toggle"
            onPress={() => setOpen((o) => !o)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}
          >
            <HelpCircle size={15} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>How this works</T>
            {open ? <ChevronUp size={15} color={colors.primary} /> : <ChevronDown size={15} color={colors.primary} />}
          </Pressable>

          {open ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {whatItDoes ? (
                <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                  <T variant="label">WHAT THIS DOES</T>
                  <T variant="small" style={{ marginTop: 4 }}>{whatItDoes}</T>
                </Card>
              ) : null}
              {howToUse?.length ? (
                <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                  <T variant="label">HOW TO USE IT</T>
                  <View style={{ marginTop: 6, gap: 6 }}>
                    {howToUse.map((h, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                          <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 11 }}>{i + 1}</T>
                        </View>
                        <T variant="small" style={{ flex: 1 }}>{h}</T>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}
              {whatYouGet?.length ? (
                <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
                  <T variant="label">WHAT YOU GET</T>
                  <View style={{ marginTop: 6, gap: 6 }}>
                    {whatYouGet.map((w, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.sage, marginTop: 7 }} />
                        <T variant="small" style={{ flex: 1 }}>{w}</T>
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
