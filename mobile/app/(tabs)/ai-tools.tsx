import React, { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import {
  ArrowRight,
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
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Tool = { slug: string; name: string; body: string; icon: LucideIcon; planTone: "free" | "paid"; plan: string; planSub: string };

// Mirrors the web tool registry (config/toolRegistry.js): same order, icons,
// names and body copy verbatim.
const TOOLS: Tool[] = [
  { slug: "statement-decoder", name: "Statement Decoder", body: "Paste any Support at Home monthly statement and get a plain-English explanation in 60 seconds.", icon: FileSearch, planTone: "free", plan: "Free, 1 use/120 days", planSub: "No signup required" },
  { slug: "invoice-checker", name: "Invoice Checker", body: "Upload the invoice your provider sends for the contribution you pay. We check it line by line against your funding, your expected contribution, and the current program rules, and flag anything worth raising with your provider before you pay.", icon: ReceiptText, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "budget-calculator", name: "Budget & Lifetime Cap Calculator", body: "Enter your classification and contribution status. See annual budget, per-stream allocation, and lifetime cap projection.", icon: Wallet, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "provider-price-checker", name: "Provider Price Checker", body: "Tell us what you are being charged. We compare it against published medians and the Wayly Provider Quality Index, and flag brokered service premiums.", icon: BarChart3, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "classification-self-check", name: "Classification Self-Check", body: "Answer 12 questions about daily life. See which classification is likely, and whether to request a reassessment.", icon: ListChecks, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "letters-and-follow-ups", name: "Letters & Follow-ups", body: "Draft a polished letter to My Aged Care, your provider, ACQSC, or the Ombudsman. Track responses and know when to escalate.", icon: FileEdit, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "contribution-estimator", name: "Contribution Estimator", body: "How much will you actually pay each quarter under Support at Home? Enter the situation, see a clear breakdown.", icon: Receipt, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "care-plan-reviewer", name: "Support Plan Reviewer", body: "Paste a support plan. We will check it against the Statement of Rights and the National Quality Standards.", icon: ClipboardCheck, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
  { slug: "family-coordinator", name: "Aged Care Q&A", body: "Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.", icon: MessageCircle, planTone: "paid", plan: "Solo & Family", planSub: "7-day free trial" },
];

const INFO_CHIPS = [
  { lead: "Try free.", rest: " Statement Decoder is free; every other tool comes with a 7-day trial." },
  { lead: "Grounded in law.", rest: " Every answer cites the Aged Care Act 2024 rule that applies." },
  { lead: "Private by default.", rest: " Your data stays yours, no training on your files." },
];

export default function AiToolsHub() {
  const { colors, shadow } = useTheme();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const hasFullAccess = !!user?.plan && user.plan !== "free";
  // Any signed-in user with a plan (active paid OR on a free trial) should not
  // see the free-trial marketing chips. Only show for free / logged-out.
  const showInfoChips = !hasFullAccess;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <T style={{ fontFamily: fonts.heading, fontSize: 30, lineHeight: 38 }} testID="ai-tools-heading">Nine Tools. Built for Australian Families.</T>
        <T variant="bodyMuted" style={{ marginTop: 10, lineHeight: 23 }}>
          Drop in a statement, paste a care plan, or run the numbers. Every tool below turns 30 minutes of paperwork into a 2-minute plain-English answer.
        </T>

        {showInfoChips ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {INFO_CHIPS.map((c) => (
              <View key={c.lead} style={[styles.infoChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <T variant="small" style={{ lineHeight: 20 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>{c.lead}</T>
                  {c.rest}
                </T>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isFreeTool = tool.planTone === "free";
            const showChip = !hasFullAccess;
            const cta = hasFullAccess || !isFreeTool ? "Open tool" : "Try free";
            return (
              <Pressable
                key={tool.slug}
                testID={`ai-tool-card-${tool.slug}`}
                onPress={() => router.push(`/tool/${tool.slug}` as any)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  shadow.card,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
                    <Icon size={22} color={colors.primary} />
                  </View>
                  {showChip ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={[styles.planChip, { backgroundColor: isFreeTool ? colors.sageSoft : colors.primary }]}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.4, color: isFreeTool ? colors.sage : "#fff" }}>{tool.plan.toUpperCase()}</T>
                      </View>
                      <T style={{ fontFamily: fonts.body, fontSize: 10, color: colors.muted, marginTop: 3 }}>{tool.planSub}</T>
                    </View>
                  ) : null}
                </View>
                <T style={{ fontFamily: fonts.heading, fontSize: 19, marginTop: spacing.md }}>{tool.name}</T>
                <T variant="small" style={{ marginTop: 6, lineHeight: 21 }}>{tool.body}</T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.md }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }} testID={`ai-tool-link-${tool.slug}`}>{cta}</T>
                  <ArrowRight size={14} color={colors.primary} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  infoChip: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  iconWrap: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  planChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
