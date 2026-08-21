import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Download, FileBarChart, FileText, DollarSign, AlertTriangle, Award, Folder, Clock, Layers, Loader2,
} from "lucide-react-native";

import { AppHeader, Badge, Button, Loading, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type Report = { id: string; report_name?: string; report_type?: string; status?: string; created_at?: string; generated_at?: string };

// Catalog mirrors the web Reports screen so caregivers can see every report
// they can create (name + what it is + who it is for) BEFORE tapping Generate.
const REPORT_CATALOG: { type: string; icon: any; name: string; desc: string; bestFor: string; tone: "navy" | "gold" | "red" | "teal" }[] = [
  { type: "HOUSEHOLD_SUMMARY", icon: FileText, name: "Household Summary", desc: "Current care snapshot at a glance.", bestFor: "GP visits, family meetings", tone: "navy" },
  { type: "QUARTERLY_BUDGET", icon: FileBarChart, name: "Quarterly Budget", desc: "Stream-by-stream spending for the quarter.", bestFor: "Understanding your spending this quarter", tone: "gold" },
  { type: "ANNUAL_FINANCIAL", icon: DollarSign, name: "Annual Financial Summary", desc: "Whole financial year. Built for accountants.", bestFor: "Tax time, accountant, financial adviser", tone: "navy" },
  { type: "ANOMALY_SAVINGS", icon: AlertTriangle, name: "Anomaly & Savings", desc: "Every billing error caught, and what it returned.", bestFor: "Understanding what Wayly has caught", tone: "gold" },
  { type: "PROVIDER_PERFORMANCE", icon: Award, name: "Provider Performance", desc: "Private scorecard of your provider.", bestFor: "Deciding whether to stay or switch", tone: "navy" },
  { type: "COMPLAINT_DOSSIER", icon: Folder, name: "Complaint Dossier", desc: "Formal evidence pack for OPAN or ACQSC.", bestFor: "Formal complaint to OPAN or ACQSC", tone: "red" },
  { type: "CARE_TIMELINE", icon: Clock, name: "Care Timeline", desc: "Chronological history at a glance.", bestFor: "GP appointments, new care managers", tone: "teal" },
  { type: "STATEMENT_DIGEST", icon: Layers, name: "Statement Digest", desc: "Every statement compiled. For records or switching.", bestFor: "Full records, switching provider, data export", tone: "navy" },
];

export default function ReportsScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await apiFetch<{ items: Report[] }>("/reports");
      setItems((d?.items || []).filter((r) => r.status !== "DELETED"));
    } catch { setError(true); } finally { setLoading(false); }
  }, [activeId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = async (report_type: string) => {
    setGenerating(report_type);
    try {
      await apiFetch("/reports/generate", { method: "POST", body: { report_type, participant_id: activeId } });
      setTimeout(load, 1800);
    } catch { /* ignore */ }
    finally { setTimeout(() => setGenerating(null), 1800); }
  };

  const openReport = async (r: Report) => {
    if (r.status !== "READY" && r.status !== "COMPLETED") return;
    setDownloading(r.id);
    try {
      const res = await apiFetch<{ url?: string }>(`/reports/${r.id}/download`);
      if (res?.url) {
        const url = res.url.startsWith("http") ? res.url : `${SITE_BASE}${res.url}`;
        await WebBrowser.openBrowserAsync(url);
      }
    } catch { /* ignore */ }
    finally { setDownloading(null); }
  };

  const toneBg = (tone: string) =>
    tone === "gold" ? colors.goldSoft : tone === "red" ? colors.errorSoft : tone === "teal" ? colors.sageSoft : colors.sageSoft;
  const toneFg = (tone: string) =>
    tone === "gold" ? colors.gold : tone === "red" ? colors.terracotta : colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <PageIntro
            eyebrow="Reports"
            title="Reports"
            description="Eight reports built for caregivers. Each one becomes a polished PDF you can email, print, or hand to a GP, family member, or accountant."
            whatItDoes="Turns the data already in Wayly, statements, care plans, cases, into professionally formatted PDFs that speak the language of clinicians, accountants, and providers."
            howToUse={[
              "Pick the report type that matches who you're sending it to.",
              "Tap Generate and we build the PDF.",
              "Download the PDF or share the link.",
              "Return anytime, previously generated reports stay available for download.",
            ]}
            whatYouGet={[
              "Print-ready PDFs formatted for busy professionals.",
              "A saved history of everything you've generated.",
              "Confidence that you're not leaving anything out.",
            ]}
          />

          {/* Catalog — visible upfront so users see what they can create */}
          <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: spacing.sm }}>Generate a Report</T>
          <View testID="reports-catalog" style={{ gap: spacing.md }}>
            {REPORT_CATALOG.map((rt) => (
              <View key={rt.type} testID={`report-card-${rt.type}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={[styles.icon, { backgroundColor: toneBg(rt.tone) }]}>
                    <rt.icon size={20} color={toneFg(rt.tone)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{rt.name}</T>
                    <T variant="small" style={{ marginTop: 2 }}>{rt.desc}</T>
                    <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 6 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted }}>Best for: </T>{rt.bestFor}
                    </T>
                    <Button
                      label="Generate"
                      testID={`generate-${rt.type}`}
                      variant="outline"
                      loading={generating === rt.type}
                      onPress={() => generate(rt.type)}
                      style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* History */}
          <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: spacing.md }}>Your reports</T>
          {error ? (
            <View testID="reports-error" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center" }}>
              <FileBarChart size={28} color={colors.muted} />
              <T variant="small" style={{ marginTop: spacing.sm, textAlign: "center" }}>Couldn&apos;t load your saved reports.</T>
              <Button label="Retry" testID="reports-retry" variant="outline" onPress={load} style={{ marginTop: spacing.sm }} />
            </View>
          ) : items.length === 0 ? (
            <View testID="reports-empty" style={{ borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center" }}>
              <FileBarChart size={28} color={colors.muted} />
              <T variant="small" style={{ marginTop: spacing.sm, textAlign: "center" }}>No reports yet. Generate one above, it takes less than 30 seconds.</T>
            </View>
          ) : (
            items.map((item) => {
              const ready = item.status === "READY" || item.status === "COMPLETED";
              return (
                <View key={item.id} testID={`report-${item.id}`} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                  <View style={[styles.iconSm, { backgroundColor: colors.sageSoft }]}>
                    <FileBarChart size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }} numberOfLines={2}>{item.report_name || item.report_type}</T>
                    <T variant="small">{shortDate(item.generated_at || item.created_at)}</T>
                  </View>
                  {ready ? (
                    downloading === item.id ? (
                      <Loader2 size={18} color={colors.primary} />
                    ) : (
                      <Button label="Open" testID={`report-download-${item.id}`} variant="outline" onPress={() => openReport(item)} icon={Download} />
                    )
                  ) : (
                    <Badge label={(item.status || "generating").toLowerCase()} tone="neutral" />
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  iconSm: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
