// Mobile marketing/worked-example for the Invoice Checker — parity with the
// web InvoiceSampleResult.jsx. Two tabs let the user flip between a "Genuine
// overcharge" sample (DEFAULT) and a "Clean invoice" sample, each rendered
// through the REAL InvoiceResultView so the preview matches a live check
// exactly. Every figure, line and finding is copied from the actual engine
// output for the Sam Burke · Blueberry Care · October 2026 fixture
// ($1,019.06 billed, $466.66 potential refund, ten issues + one note).
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Info, ShieldAlert, CheckCircle2 } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import InvoiceResultView from "@/src/components/invoices/InvoiceResultView";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const CLEAN_SUMMARY = `This invoice from Blueberry Care Pty Ltd is for $495.41 including GST and covers your care services for the period around early to mid October 2026. The biggest charge is everyday living contributions for cleaning and gardening at $193.40. You have also been billed $89.06 for personal care, $60.00 for meal preparation, $33.78 for transport and social support, and a nursing visit on 14 October for $7.75. You will also see a cleaning charge of $28.70 for a visit on 30 October that was cancelled with notice, and a social support charge of $19.50.

This invoice looks fine to pay. All the charges match your care plan and the services listed are ones you have actually received or were scheduled for. As a heads up, you do have a lifetime limit on what you will pay towards your Support at Home care, though the government has not yet set the final figure, so we cannot show you how close you are to it at the moment.`;

const OVERCHARGE_SUMMARY = `This invoice from Blueberry Care Pty Ltd is for $1,019.06 and covers Sam Burke's Support at Home services through October 2026. Most of the care lines up with the care plan. But after reading every line and cross-checking it against the service agreement and care diary, we found ten things worth raising before you pay, adding up to about $466.66 you may be owed back.

The biggest one: personal care has been fully government-funded since 1 October 2026, yet a contribution is still showing on eleven personal-care lines ($186.05). There is also a separate travel charge of $60.76 and a $22.00 admin fee — neither is allowed. A respite visit on 17 October was cancelled with notice ($42.75), and a social-support visit on 20 October was billed while Sam was in hospital ($19.50). Meal preparation and one domestic-assistance line were charged above the agreed rates, a gardening line has a maths error, one domestic-assistance line looks duplicated, and the invoice total is $20.00 higher than the lines add up to.

None of this means the provider did anything deliberate — these are exactly the kinds of things worth a friendly question. Wayly can draft the email for you.`;

const oc = (sd: string | null, type: string, cat: string, hrs: number | null, price: number | null, gross: number, contrib: number, id: string) => ({
  line_id: id, service_date: sd, service_type: type, service_category: cat,
  units_or_hours: hrs, unit_price: price, gross_cost: gross, gst_amount: null, contribution_amount: contrib,
});

const CLEAN_RESULT: any = {
  provider_name: "Blueberry Care Pty Ltd",
  provider_abn: "12 345 678 901",
  invoice_date: "2026-11-05",
  document_shape: "invoice",
  invoice_total: 495.41,
  reconciliation: {
    invoice_total: 495.41,
    refund_total: 0,
    summary_md: CLEAN_SUMMARY,
    lines: [
      oc(null, "Everyday living — cleaning and gardening", "everyday_living", null, null, 193.4, 193.4, "L1"),
      oc(null, "Personal care", "personal_care", null, null, 89.06, 89.06, "L2"),
      oc(null, "Meal preparation", "everyday_living", null, null, 60.0, 60.0, "L3"),
      oc(null, "Transport and social support", "transport", null, null, 33.78, 33.78, "L4"),
      oc("2026-10-14", "Nursing visit", "nursing", null, null, 7.75, 7.75, "L5"),
      oc("2026-10-30", "Domestic assistance (cancelled with notice)", "everyday_living", null, null, 28.7, 28.7, "L6"),
      oc(null, "Social support", "transport", null, null, 19.5, 19.5, "L7"),
    ],
    findings: [
      {
        check_id: "C10", tier: 1, severity: "info",
        title: "About your lifetime contribution cap",
        description: "You have a lifetime limit on what you will pay towards your Support at Home care. The government has not yet set the final figure, so we cannot show you how close you are to it. There is nothing to do right now — it is just good to know.",
        financial_impact: { amount: 0 },
        line_ids: [],
      },
    ],
  },
};

const OVERCHARGE_RESULT: any = {
  provider_name: "Blueberry Care Pty Ltd",
  provider_abn: "12 345 678 901",
  invoice_date: "2026-11-04",
  due_date: "2026-11-18",
  document_shape: "invoice",
  invoice_total: 1019.06,
  reconciliation: {
    invoice_total: 1019.06,
    refund_total: 466.66,
    summary_md: OVERCHARGE_SUMMARY,
    supporting_records: { filename: "Service agreement + care diary", has_rates: true, cancellations: 1, absences: 1 },
    lines: [
      oc("2026-10-01", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L1"),
      oc("2026-10-02", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L2"),
      oc("2026-10-02", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L3"),
      oc("2026-10-05", "Personal care", "personal_care", 1.5, 172.0, 258.0, 32.25, "L4"),
      oc("2026-10-06", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L5"),
      oc("2026-10-07", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L6"),
      oc("2026-10-07", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L7"),
      oc("2026-10-08", "Gardening", "everyday_living", 2.0, 80.0, 180.0, 76.5, "L8"),
      oc("2026-10-09", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L9"),
      oc("2026-10-09", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L10"),
      oc("2026-10-12", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L11"),
      oc("2026-10-14", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L12"),
      oc("2026-10-14", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L13"),
      oc("2026-10-15", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L14"),
      oc("2026-10-15", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L15"),
      oc("2026-10-16", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L16"),
      oc("2026-10-16", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L17"),
      oc("2026-10-17", "Flexible respite - individual", "independence", 3.0, 114.0, 342.0, 42.75, "L18"),
      oc("2026-10-17", "Nursing care - registered nurse", "clinical", 0.75, 200.0, 150.0, 0.0, "L19"),
      oc("2026-10-19", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L20"),
      oc("2026-10-20", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L21"),
      oc("2026-10-26", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L22"),
      oc("2026-10-27", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L23"),
      oc("2026-10-28", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L24"),
      oc("2026-10-28", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L25"),
      oc("2026-10-29", "Domestic assistance", "everyday_living", 2.0, 106.0, 212.0, 90.1, "L26"),
      oc("2026-10-30", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L27"),
      oc("2026-10-30", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L28"),
      oc("2026-10-31", "Care management", "care_management", null, 411.38, 411.38, 0.0, "L29"),
      oc("2026-10-31", "Monthly account administration fee", "admin_fee", null, 22.0, 22.0, 22.0, "L30"),
      oc("2026-10-31", "Travel - carer vehicle", "unknown", 62.0, 0.98, 60.76, 60.76, "L31"),
    ],
    findings: [
      {
        check_id: "C2", tier: 4, severity: "high",
        title: "Personal care contribution charged after it became free",
        description: "From 1 October 2026 personal care under Support at Home is fully government-funded, yet eleven personal-care lines still show a contribution totalling $186.05.",
        suggested_question: "From 1 October 2026, personal care under Support at Home is fully government-funded. Can you check why a contribution is showing on these personal-care lines?",
        financial_impact: { amount: 186.05 },
        line_ids: ["L3", "L4", "L7", "L10", "L11", "L13", "L17", "L20", "L22", "L25", "L28"],
      },
      {
        check_id: "C4", tier: 4, severity: "high",
        title: "A separate travel charge that may not be allowed",
        description: "A separate travel/mileage line of $60.76 appears on this invoice. Support at Home unit prices are meant to be all-inclusive of travel.",
        suggested_question: "Support at Home unit prices are meant to be all-inclusive of travel. Can you check this separate travel charge of $60.76 and remove it if it applies?",
        financial_impact: { amount: 60.76 },
        line_ids: ["L31"],
      },
      {
        check_id: "C4", tier: 4, severity: "high",
        title: "Care management or fees that shouldn't be charged",
        description: "A prohibited administration fee of $22.00 appears on this invoice. Support at Home does not permit separate administration fees on top of care management.",
        suggested_question: "Support at Home does not permit separate administration fees on top of care management. Can you check this line and remove it if it applies?",
        financial_impact: { amount: 22.0 },
        line_ids: ["L30"],
      },
      {
        check_id: "C5", tier: 4, severity: "high",
        title: "Charged for a service you cancelled with notice",
        description: "Flexible respite - individual on 17/10/2026 was cancelled with notice but still billed $42.75.",
        suggested_question: "Your records show the Flexible respite - individual on 17/10/2026 was cancelled with at least 24 hours notice, so under your agreement no charge applies. Can you remove it?",
        financial_impact: { amount: 42.75 },
        line_ids: ["L18"],
      },
      {
        check_id: "C5", tier: 4, severity: "high",
        title: "Charged for a service during a hospital stay",
        description: "Social support - individual on 20/10/2026 was billed $19.50 while the participant was in hospital / on leave.",
        suggested_question: "Your records show you were in hospital / on leave on 20/10/2026 and no service was delivered, so under your agreement this Social support - individual charge should not apply. Can you remove it?",
        financial_impact: { amount: 19.5 },
        line_ids: ["L21"],
      },
      {
        check_id: "C12", tier: 3, severity: "medium",
        title: "Domestic Assistance charged above your agreed rate",
        description: "Domestic Assistance billed at $106.00/hr against the agreed weekday rate of $76.00/hr; your contribution overcharge is $25.50.",
        suggested_question: "Your service agreement lists domestic assistance at $76.00 an hour for a weekday, but this invoice charges $106.00. Can you check the rate and refund the difference?",
        financial_impact: { amount: 25.5 },
        line_ids: ["L26"],
      },
      {
        check_id: "C12", tier: 3, severity: "medium",
        title: "Meal Preparation charged above your agreed rate",
        description: "Meal Preparation billed at $79.00/hr against the agreed weekday rate of $74.00/hr; your contribution overcharge is $17.00.",
        suggested_question: "Your service agreement lists meal preparation at $74.00 an hour for a weekday, but this invoice charges $79.00. Can you check the rate and refund the difference?",
        financial_impact: { amount: 17.0 },
        line_ids: ["L2", "L9", "L16", "L27"],
      },
      {
        check_id: "C11", tier: 3, severity: "medium",
        title: "Duplicate line",
        description: "Two domestic-assistance lines on 15 October look identical — same amount, same service, same date.",
        suggested_question: "Two lines on this invoice look identical (same amount, same service, same date). Can you check whether one is a duplicate?",
        financial_impact: { amount: 64.6 },
        line_ids: ["L14", "L15"],
      },
      {
        check_id: "C6", tier: 3, severity: "medium",
        title: "The maths on a line doesn't add up (quantity × rate)",
        description: "The gardening line charges $180.00, but 2.0 × $80.00 works out to $160.00, a $20.00 difference.",
        suggested_question: "This line charges $180.00, but 2.0 × $80.00 works out to $160.00. Can you check the arithmetic and correct the total?",
        financial_impact: { amount: 8.5 },
        line_ids: ["L8"],
      },
      {
        check_id: "C13", tier: 3, severity: "medium",
        title: "The invoice total is higher than the lines add up to",
        description: "The amount payable is $1,019.06, but the individual contribution amounts on the invoice add up to $999.06 — a $20.00 difference.",
        suggested_question: "The amount payable is $1,019.06, but the individual contribution amounts on the invoice add up to $999.06. Can you check the $20.00 difference?",
        financial_impact: { amount: 20.0 },
        line_ids: [],
      },
      {
        check_id: "C10", tier: 1, severity: "info",
        title: "About your lifetime contribution cap",
        description: "There is a lifetime limit on the total you will ever pay towards your Support at Home care. The government has not published the final cap figure yet, so we cannot show how close you are to it. This note is here for your information only.",
        financial_impact: { amount: 0 },
        line_ids: [],
      },
    ],
  },
};

const TABS = [
  {
    key: "overcharge" as const,
    label: "Genuine overcharge",
    sub: "$466.66 to claim back",
    Icon: ShieldAlert,
    result: OVERCHARGE_RESULT,
    blurb: "A real October invoice run through Wayly with the service agreement and care diary cross-referenced. The tool read all 31 lines and caught ten things worth raising, adding up to $466.66 you may be owed back.",
  },
  {
    key: "clean" as const,
    label: "Clean invoice",
    sub: "Fine to pay",
    Icon: CheckCircle2,
    result: CLEAN_RESULT,
    blurb: "An invoice that checks out. Every line matches the care plan, so there is nothing to dispute — just a plain-English read of what you are paying for.",
  },
];

export default function InvoiceSampleResult() {
  const { colors } = useTheme();
  const [active, setActive] = useState<"overcharge" | "clean">("overcharge");
  const tab = TABS.find((t) => t.key === active) || TABS[0];

  return (
    <Card testID="invoice-sample-output" style={{ gap: spacing.md }}>
      <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }} testID="invoice-sample-badge">
        <Info size={13} color={colors.heading} />
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.heading }}>Sample check · not a real person&apos;s data</T>
      </View>
      <T style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.heading }}>See exactly what the Invoice Checker hands you</T>
      <T variant="small" style={{ color: colors.muted, lineHeight: 20 }}>
        Flip between a real invoice with genuine overcharges and one that is fine to pay. Either way you get the same
        output a live check gives you — the money at a glance, every line read in plain English, and a clear verdict.
      </T>

      <View style={[styles.tabs, { backgroundColor: colors.surface2, borderColor: colors.border }]} testID="invoice-sample-tabs">
        {TABS.map((t) => {
          const isActive = active === t.key;
          const activeBg = t.key === "overcharge" ? "#A5512B" : colors.primary;
          return (
            <Pressable
              key={t.key}
              testID={`invoice-sample-tab-${t.key}`}
              onPress={() => setActive(t.key)}
              style={[styles.tab, { backgroundColor: isActive ? activeBg : "transparent" }]}
            >
              <t.Icon size={15} color={isActive ? "#fff" : colors.heading} />
              <View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: isActive ? "#fff" : colors.heading }}>{t.label}</T>
                <T style={{ fontFamily: fonts.body, fontSize: 10.5, color: isActive ? "rgba(255,255,255,0.8)" : colors.muted }}>{t.sub}</T>
              </View>
            </Pressable>
          );
        })}
      </View>

      <T variant="small" style={{ color: colors.text, lineHeight: 20 }} testID="invoice-sample-blurb">{tab.blurb}</T>

      <View key={tab.key} testID={`invoice-sample-body-${tab.key}`}>
        <InvoiceResultView result={tab.result} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 6, borderWidth: 1, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 8 },
});
