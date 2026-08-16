import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  ChevronRight,
  FileSearch,
  ReceiptText,
  Wallet,
  BarChart3,
  ListChecks,
  FileEdit,
  Receipt,
  ClipboardCheck,
  MessageCircle,
  LucideIcon,
} from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Tool = { slug: string; name: string; blurb: string; icon: LucideIcon; route?: string };

// Mirrors the web AI Tools registry (config/toolRegistry.js), same order + icons.
const TOOLS: Tool[] = [
  { slug: "statement-decoder", name: "Statement Decoder", blurb: "Turn a Support at Home statement into plain English, line by line.", icon: FileSearch, route: "/(tabs)/statements" },
  { slug: "invoice-checker", name: "Invoice Checker", blurb: "Check a care invoice for overcharges before you pay.", icon: ReceiptText, route: "/invoices" },
  { slug: "budget-calculator", name: "Budget & Lifetime Cap Calculator", blurb: "See where the budget is heading and track the lifetime cap.", icon: Wallet },
  { slug: "provider-price-checker", name: "Provider Price Checker", blurb: "Compare provider prices against the market.", icon: BarChart3 },
  { slug: "classification-self-check", name: "Classification Self-Check", blurb: "Sense-check the assessed classification level.", icon: ListChecks },
  { slug: "letters-and-follow-ups", name: "Letters & Follow-ups", blurb: "Draft clear letters and follow-ups to providers.", icon: FileEdit },
  { slug: "contribution-estimator", name: "Contribution Estimator", blurb: "Estimate the participant contribution and any hardship options.", icon: Receipt },
  { slug: "care-plan-reviewer", name: "Support Plan Reviewer", blurb: "Review a support plan for gaps and questions to ask.", icon: ClipboardCheck },
  { slug: "family-coordinator", name: "Aged Care Q&A", blurb: "Ask anything about aged care and get a friendly, expert answer.", icon: MessageCircle, route: "/(tabs)/ask" },
];

export default function AiToolsHub() {
  const { colors, shadow } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <T style={{ fontFamily: fonts.heading, fontSize: 30 }}>AI Tools</T>
        <T variant="bodyMuted" style={{ marginTop: 4, marginBottom: spacing.lg }}>
          Expert help for every part of Support at Home.
        </T>
        <View style={{ gap: spacing.md }}>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const disabled = !tool.route;
            return (
              <Pressable
                key={tool.slug}
                testID={`tool-${tool.slug}`}
                disabled={disabled}
                onPress={() => tool.route && router.push(tool.route as any)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  shadow.card,
                  pressed && !disabled && { opacity: 0.9 },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                  <Icon size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flexShrink: 1 }}>{tool.name}</T>
                    {disabled ? (
                      <View style={[styles.soon, { backgroundColor: colors.surface2 }]}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted }}>SOON</T>
                      </View>
                    ) : null}
                  </View>
                  <T variant="small" style={{ marginTop: 2 }}>
                    {tool.blurb}
                  </T>
                </View>
                {!disabled ? <ChevronRight size={20} color={colors.muted} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  soon: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
});
