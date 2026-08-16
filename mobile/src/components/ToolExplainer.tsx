import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, AlertTriangle } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { TOOL_CONTENT } from "@/src/data/toolContent";

// Mobile port of the web <ToolExplainer>. Renders the marketing/explainer
// surface below each tool's interactive UI: What This Tool Does, How It Works,
// AI disclaimer, What You'll Need / What You'll Get, Common Questions, and CTA.
export default function ToolExplainer({ toolKey }: { toolKey: string }) {
  const c = TOOL_CONTENT[toolKey];
  const { colors } = useTheme();
  if (!c) return null;

  const disclaimer = `Information only, not advice. ${c.name} uses AI to help you understand your own aged care information in plain English. It does not give financial, legal, or medical advice, and it is not a decision from My Aged Care or Services Australia. AI can make mistakes, so please check anything important against your official statements, your provider, or My Aged Care on 1800 200 422 before you act on it. Figures shown are indicative and subject to the current Schedule of Subsidies and Supplements.`;

  return (
    <View style={{ gap: spacing.lg, marginTop: spacing.md }} testID={`tool-explainer-${toolKey}`}>
      {/* What This Tool Does */}
      <View testID={`tool-what-${toolKey}`}>
        <T variant="h2" style={{ color: colors.primary }}>What This Tool Does</T>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {c.whatItDoes.map((p, i) => (
            <T key={i} variant="body" style={{ color: colors.muted, lineHeight: 24 }}>{p}</T>
          ))}
        </View>
      </View>

      {/* How It Works */}
      <View testID={`tool-how-${toolKey}`}>
        <T variant="h2" style={{ color: colors.primary }}>How It Works</T>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {c.howItWorks.map((step, i) => (
            <Card key={i} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
                <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                  <T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 14 }}>{i + 1}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primary }}>{step.title}</T>
                  <T variant="small" style={{ marginTop: 2 }}>{step.body}</T>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* AI accuracy disclaimer */}
      <View testID={`tool-disclaimer-${toolKey}`} style={[styles.disclaimer, { backgroundColor: colors.goldSoft }]}>
        <AlertTriangle size={18} color={colors.gold} style={{ marginTop: 2 }} />
        <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>{disclaimer}</T>
      </View>

      {/* What You'll Need */}
      <Card testID={`tool-need-${toolKey}`}>
        <T variant="h3" style={{ color: colors.primary }}>What You'll Need</T>
        <View style={{ gap: 8, marginTop: spacing.sm }}>
          {c.whatYouNeed.map((item, i) => (
            <View key={i} style={styles.bullet}>
              <ChevronRight size={15} color={colors.primary} style={{ marginTop: 3 }} />
              <T variant="small" style={{ flex: 1 }}>{item}</T>
            </View>
          ))}
        </View>
      </Card>

      {/* What You'll Get */}
      <Card testID={`tool-get-${toolKey}`}>
        <T variant="h3" style={{ color: colors.primary }}>What You'll Get</T>
        <View style={{ gap: 8, marginTop: spacing.sm }}>
          {c.whatYouGet.map((item, i) => (
            <View key={i} style={styles.bullet}>
              <ChevronRight size={15} color={colors.primary} style={{ marginTop: 3 }} />
              <T variant="small" style={{ flex: 1 }}>{item}</T>
            </View>
          ))}
        </View>
      </Card>

      {/* Common Questions */}
      <View testID={`tool-faq-${toolKey}`}>
        <T variant="h2" style={{ color: colors.primary }}>Common Questions</T>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {c.faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} testID={`tool-faq-${toolKey}-${i}`} />)}
        </View>
      </View>

      {/* Closing CTA */}
      <View testID={`tool-cta-${toolKey}`} style={[styles.cta, { backgroundColor: colors.primary }]}>
        <T variant="h3" style={{ color: "#fff" }}>{c.ctaHeading}</T>
        <T variant="small" style={{ color: "rgba(255,255,255,0.9)", marginTop: 4 }}>{c.ctaBody}</T>
      </View>
    </View>
  );
}

function FaqItem({ q, a, testID }: { q: string; a: string; testID: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable testID={testID} onPress={() => setOpen((o) => !o)}>
      <Card style={{ padding: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primary, flex: 1 }}>{q}</T>
          <ChevronRight size={18} color={colors.muted} style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }} />
        </View>
        {open ? <T variant="small" style={{ marginTop: spacing.sm, lineHeight: 20 }}>{a}</T> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepNum: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  disclaimer: { flexDirection: "row", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  bullet: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  cta: { borderRadius: radius.lg, padding: spacing.lg },
});
