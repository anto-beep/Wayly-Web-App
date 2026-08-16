import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { HeartPulse, ReceiptText, ArrowRight, CheckCircle2 } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const STATUSES = [
  { key: "on_chsp", label: "On CHSP", blurb: "Staying on the Commonwealth Home Support Programme for now." },
  { key: "considering", label: "Considering transition", blurb: "Weighing up a move to Support at Home." },
  { key: "transitioning", label: "Transitioning to SAH", blurb: "Moving from CHSP across to Support at Home." },
];
const TRANSITION_STEPS = [
  "Check whether Support at Home would give you more, or less, than CHSP for your needs",
  "Request a reassessment through My Aged Care if your needs have changed",
  "Compare the fees: CHSP fees differ from Support at Home contributions",
  "Confirm the no-worse-off guarantee applies before you commit",
];

export default function ChspToolsScreen() {
  const { colors } = useTheme();
  const [status, setStatus] = useState("on_chsp");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="CHSP Tools" subtitle="Commonwealth Home Support Programme" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}>
        <PageIntro
          eyebrow="Commonwealth Home Support Programme"
          title="Verify CHSP Billing. Consider a Move to Support at Home."
          description="Two decisions matter on CHSP: was I actually billed correctly, and should I transition to Support at Home? This tool walks you through both without pressure."
          whatItDoes="Runs a variance check on any CHSP invoice against what you expected to pay, and gives you a 3-step walkthrough for thinking through whether transitioning to SAH is right for you."
        />

        <View>
          <T variant="h3" style={{ color: colors.primary, marginBottom: spacing.sm }}>Where are you with CHSP?</T>
          <View style={{ gap: spacing.sm }}>
            {STATUSES.map((s) => {
              const active = status === s.key;
              return (
                <Pressable key={s.key} testID={`chsp-status-${s.key}`} onPress={() => setStatus(s.key)}
                  style={[styles.statusCard, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : colors.surface }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {active ? <CheckCircle2 size={18} color={colors.primary} /> : <View style={[styles.dot, { borderColor: colors.border }]} />}
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flex: 1 }}>{s.label}</T>
                  </View>
                  <T variant="small" style={{ marginTop: 4, marginLeft: 26 }}>{s.blurb}</T>
                </Pressable>
              );
            })}
          </View>
        </View>

        {status !== "on_chsp" ? (
          <Card testID="chsp-transition">
            <T variant="h3" style={{ color: colors.primary }}>Transition walkthrough</T>
            <View style={{ gap: 10, marginTop: spacing.sm }}>
              {TRANSITION_STEPS.map((t, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <View style={[styles.num, { backgroundColor: colors.primary }]}><T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 12 }}>{i + 1}</T></View>
                  <T variant="body" style={{ flex: 1, color: colors.text, lineHeight: 22 }}>{t}</T>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card testID="chsp-fee-check">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ReceiptText size={18} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>Was this CHSP invoice correct?</T>
          </View>
          <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>Upload a CHSP invoice and Wayly checks the fees against what you should be charged.</T>
          <Button label="Check an invoice" testID="chsp-invoice-cta" variant="outline" icon={ArrowRight} onPress={() => router.push("/tool/invoice-checker")} style={{ marginTop: spacing.md }} />
        </Card>

        <Card style={{ backgroundColor: colors.goldSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <HeartPulse size={18} color={colors.gold} />
            <T style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1 }}>Need to talk it through?</T>
          </View>
          <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>Call My Aged Care on 1800 200 422 to discuss CHSP, a reassessment, or moving to Support at Home.</T>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  num: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
