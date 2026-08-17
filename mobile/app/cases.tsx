import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ListChecks, RefreshCw } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

type Case = { id: string; case_type?: string; title?: string; status?: string; severity?: string; summary?: string; created_at?: string };

const STATUS_TONE: Record<string, "brand" | "alert" | "success" | "neutral"> = {
  open: "brand", in_progress: "alert", waiting_on_provider: "alert", resolved: "success", dismissed: "neutral",
};
const SEV_TONE: Record<string, "error" | "alert" | "neutral"> = { high: "error", medium: "alert", low: "neutral" };

export default function CasesScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    if (!activeId) { setLoading(false); return; }
    try {
      const res = await apiFetch<any>(`/loop/cases?participant_id=${activeId}&status=open_any`);
      setCases(Array.isArray(res) ? res : res?.cases || []);
    } catch { setCases([]); }
    finally { setLoading(false); }
  }, [activeId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const scan = async () => {
    setScanning(true);
    try { await apiFetch(`/loop/cases/scan?participant_id=${activeId}`, { method: "POST", body: {} }); await load(); }
    catch { /* ignore */ }
    finally { setScanning(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Cases" subtitle="Flagged issues to follow up" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading cases…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <PageIntro
            eyebrow="Complaints"
            title="Open Complaints and Resolutions"
            description="Something went wrong? Track every complaint from the first phone call to your provider through to ACQSC referral and final resolution, with dates, evidence, and follow-up dates in one place."
            whatItDoes="Manages each complaint as a case with staged status: raised, with provider, escalated, ACQSC, resolved. Prompts you before deadlines slip."
            howToUse={[
              "Start a new complaint and describe what happened.",
              "Log every response and phone call as the case progresses.",
              "Escalate to ACQSC directly from the case when appropriate.",
              "Close the case once resolved, with a written summary.",
            ]}
            whatYouGet={[
              "A clear evidence trail if you need to escalate.",
              "Deadline reminders so nothing gets forgotten.",
              "Peace of mind that you're following the right process.",
            ]}
          />
          <Button label="Scan for new issues" testID="cases-scan-btn" icon={RefreshCw} variant="outline" onPress={scan} loading={scanning} />
          {cases.length > 0 ? (
            <SmartAISummary
              pageKey="complaints-list"
              context={{
                total: cases.length,
                by_status: cases.reduce((acc: Record<string, number>, c) => {
                  const k = c.status || "unknown";
                  acc[k] = (acc[k] || 0) + 1;
                  return acc;
                }, {}),
                high_severity: cases.filter((c) => c.severity === "high").length,
                open_not_closed: cases.filter((c) => !["resolved", "dismissed"].includes(c.status || "")).length,
              }}
            />
          ) : null}
          {cases.length === 0 ? (
            <StatePanel icon={ListChecks} title="No open cases" message="When Wayly spots something worth following up, a case appears here so nothing slips through the cracks." />
          ) : (
            cases.map((c, i) => (
              <Pressable key={c.id} testID={`case-row-${i}`} onPress={() => router.push(`/case/${c.id}`)}>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{c.title || (c.case_type || "").replace(/_/g, " ")}</T>
                    {c.severity ? <Badge label={c.severity.toUpperCase()} tone={SEV_TONE[c.severity] || "neutral"} /> : null}
                  </View>
                  {c.summary ? <T variant="small" style={{ marginTop: 4 }} numberOfLines={2}>{c.summary}</T> : null}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm }}>
                    <Badge label={(c.status || "").replace(/_/g, " ").toUpperCase()} tone={STATUS_TONE[c.status || ""] || "neutral"} />
                    <T variant="small" style={{ color: colors.muted }}>{formatDate(c.created_at)}</T>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
