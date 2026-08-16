import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Download, FileBarChart, Plus, X } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type Report = { id: string; report_name?: string; report_type?: string; status?: string; created_at?: string; generated_at?: string };

const REPORT_TYPES: { v: string; label: string }[] = [
  { v: "HOUSEHOLD_SUMMARY", label: "Household Summary" },
  { v: "QUARTERLY_BUDGET", label: "Quarterly Budget Report" },
  { v: "ANNUAL_FINANCIAL", label: "Annual Financial Summary" },
  { v: "ANOMALY_SAVINGS", label: "Anomaly & Savings Report" },
  { v: "PROVIDER_PERFORMANCE", label: "Provider Performance Report" },
  { v: "COMPLAINT_DOSSIER", label: "Complaint & Correspondence Dossier" },
  { v: "CARE_TIMELINE", label: "Care Timeline" },
  { v: "STATEMENT_DIGEST", label: "Statement Digest" },
];

export default function ReportsScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
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
    setGenerating(report_type); setShowPicker(false);
    try {
      await apiFetch("/reports/generate", { method: "POST", body: { report_type, participant_id: activeId } });
      setTimeout(load, 1500);
    } catch { /* ignore */ }
    finally { setGenerating(null); }
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Reports" subtitle="Generated summaries and PDF exports" onBack={() => router.back()} />
      {loading ? <Loading /> : (
        <>
          {showPicker ? (
            <Card testID="reports-type-picker" style={{ margin: spacing.lg, marginBottom: 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Choose a report</T>
                <Pressable testID="reports-picker-close" hitSlop={8} onPress={() => setShowPicker(false)}><X size={20} color={colors.muted} /></Pressable>
              </View>
              <View style={{ gap: spacing.sm }}>
                {REPORT_TYPES.map((t) => (
                  <Button key={t.v} label={t.label} testID={`report-type-${t.v}`} variant="outline" loading={generating === t.v} onPress={() => generate(t.v)} />
                ))}
              </View>
            </Card>
          ) : null}

          {error ? (
            <StatePanel testID="reports-error" icon={FileBarChart} title="Couldn't load reports" actionLabel="Retry" onAction={load} />
          ) : items.length === 0 && !showPicker ? (
            <View style={{ flex: 1 }}>
              <StatePanel testID="reports-empty" icon={FileBarChart} title="No reports yet" message="Generate a PDF summary to keep or share with family, an adviser, or a GP." actionLabel="Generate a report" onAction={() => setShowPicker(true)} />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(r) => r.id}
              ListHeaderComponent={!showPicker ? (
                <>
                  <PageIntro
                    eyebrow="Reports"
                    title="Reports"
                    description="Eight reports built for caregivers. Each one becomes a polished PDF you can email, print, or hand to a GP, family member, or accountant."
                  />
                  <Button label="Generate a report" testID="reports-generate-btn" icon={Plus} onPress={() => setShowPicker(true)} style={{ marginTop: spacing.md, marginBottom: spacing.md }} />
                </>
              ) : null}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
              renderItem={({ item }) => {
                const ready = item.status === "READY" || item.status === "COMPLETED";
                return (
                  <Pressable testID={`report-${item.id}`} onPress={() => openReport(item)} disabled={!ready}>
                    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                      <View style={[styles.icon, { backgroundColor: colors.sageSoft }]}>
                        <FileBarChart size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={2}>{item.report_name || item.report_type}</T>
                        <T variant="small">{shortDate(item.generated_at || item.created_at)}</T>
                      </View>
                      {ready ? (
                        downloading === item.id
                          ? <T variant="small" style={{ color: colors.primary }}>Opening…</T>
                          : <Download size={20} color={colors.primary} testID={`report-download-${item.id}`} />
                      ) : (
                        <Badge label={(item.status || "").toLowerCase()} tone="neutral" />
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
