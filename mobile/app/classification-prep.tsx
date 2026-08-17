import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ClipboardList, Sparkles, CheckCircle2, Phone } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const PREP = [
  "A typical day, from waking to bedtime, and where help is needed",
  "Personal care tasks: showering, dressing, grooming, toileting",
  "Mobility and transfers, and any falls in the last year",
  "Clinical and health needs, medications, wounds, continence",
  "Memory, thinking, and any behaviours of concern",
  "Who currently helps, and how often",
];
const ON_THE_DAY = [
  "Answer honestly about the hardest days, not the best days",
  "Have a support person present if that helps",
  "Bring recent medical letters and your medication list",
  "Ask the assessor to explain anything you're unsure about",
];

export default function ClassificationPrepScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Classification Prep" subtitle="Get ready for your assessment" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}>
        <PageIntro
          eyebrow="Classification Self-Check"
          title="Prepare for Your SAH Assessment"
          description="Walk into your Initial Assessment Tool (IAT) knowing which Support at Home streams may fit, what documents to bring, and what to ask. No paperwork gets submitted here, this is your private prep space."
          whatItDoes="Suggests which SAH streams to discuss with your assessor based on a short self-check, and gives you a 6-step wizard to prepare your questions, evidence, and advocacy notes before the appointment."
          howToUse={[
            "Tick the fit signals that apply to see which streams may suit.",
            "Start the 6-step IAT prep wizard below.",
            "Work through documents, questions, evidence, and advocacy at your pace.",
            "After the assessment, record the classification received.",
          ]}
          whatYouGet={[
            "A ranked list of streams likely to be a fit (with rationale).",
            "A confidence-building checklist you can bring to the appointment.",
            "An early warning if the classification you receive is unexpected.",
          ]}
        />
        <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
          <T variant="body" style={{ color: colors.text, lineHeight: 24 }}>
            Your Support at Home classification is decided by a trained assessor through the Single Assessment System. You cannot set it yourself, but walking in prepared helps the assessor see the full picture. Here is how to get ready.
          </T>
        </Card>

        <View>
          <T variant="h2" style={{ color: colors.primary }}>What to prepare</T>
          <View style={{ gap: 10, marginTop: spacing.sm }}>
            {PREP.map((p, i) => (
              <View key={i} style={styles.row}>
                <CheckCircle2 size={18} color={colors.sage} style={{ marginTop: 1 }} />
                <T variant="body" style={{ flex: 1, color: colors.text }}>{p}</T>
              </View>
            ))}
          </View>
        </View>

        <View>
          <T variant="h2" style={{ color: colors.primary }}>On the day</T>
          <View style={{ gap: 10, marginTop: spacing.sm }}>
            {ON_THE_DAY.map((p, i) => (
              <View key={i} style={styles.row}>
                <CheckCircle2 size={18} color={colors.sage} style={{ marginTop: 1 }} />
                <T variant="body" style={{ flex: 1, color: colors.text }}>{p}</T>
              </View>
            ))}
          </View>
        </View>

        <Card style={{ backgroundColor: colors.goldSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Phone size={18} color={colors.gold} />
            <T style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }}>Book or ask about an assessment</T>
          </View>
          <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>Contact My Aged Care on 1800 200 422. You or your family can request an assessment or reassessment at any time.</T>
        </Card>

        <Button label="Try the Classification Self-Check" testID="clsprep-selfcheck" icon={Sparkles} onPress={() => router.push("/tool/classification-self-check")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
});
