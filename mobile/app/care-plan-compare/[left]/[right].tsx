import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { GitCompare, ClipboardList } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Finding = { title?: string; detail?: string; severity?: string };
type Side = {
  plan?: { title?: string; filename?: string };
  header?: { provider?: string; effective_from?: string; classification?: number; quarterly_budget?: number; services_count?: number };
  findings?: Finding[];
};
type CompareData = {
  left?: Side;
  right?: Side;
  diff?: { only_left_findings?: Finding[]; only_right_findings?: Finding[]; resolved_or_persisting_pairs?: { left: Finding; right: Finding }[] };
};

const SEV_TONE: Record<string, "error" | "alert" | "brand" | "neutral"> = {
  compliance: "error", choice: "alert", efficiency: "brand", info: "neutral",
};

function fmt(s?: string): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

function HeaderCard({ side, label, colors }: { side?: Side; label: string; colors: any }) {
  const h = side?.header || {};
  return (
    <Card style={{ flex: 1 }} testID={`compare-header-${label}`}>
      <T variant="label" style={{ color: colors.muted }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 4 }} numberOfLines={2}>{side?.plan?.title || side?.plan?.filename || "Care plan"}</T>
      <T variant="small" style={{ marginTop: 6, color: colors.muted }}>{h.provider || "Provider —"}</T>
      <T variant="small" style={{ marginTop: 2 }}>From {fmt(h.effective_from)}</T>
      <T variant="small" style={{ marginTop: 2 }}>{h.classification ? `Class ${h.classification}` : "Class —"} · {h.services_count ?? 0} services</T>
      {h.quarterly_budget ? <T variant="small" style={{ marginTop: 2 }}>Budget ${Number(h.quarterly_budget).toLocaleString("en-AU")}</T> : null}
    </Card>
  );
}

export default function CarePlanCompareScreen() {
  const { colors } = useTheme();
  const { left, right } = useLocalSearchParams<{ left: string; right: string }>();
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!left || !right) return;
    setError(false);
    try { setData(await apiFetch<CompareData>(`/care-plans/compare/${left}/${right}`)); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [left, right]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onlyLeft = data?.diff?.only_left_findings || [];
  const onlyRight = data?.diff?.only_right_findings || [];
  const both = data?.diff?.resolved_or_persisting_pairs || [];

  const findingRow = (f: Finding, key: string) => (
    <View key={key} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 6 }}>
      <Badge label={(f.severity || "info").toUpperCase()} tone={SEV_TONE[f.severity || "info"] || "neutral"} />
      <T variant="small" style={{ flex: 1, lineHeight: 19 }}>{f.title}</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Compare plans" subtitle="Side by side" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Comparing plans…" />
      ) : error || !data ? (
        <StatePanel testID="compare-error" icon={ClipboardList} title="Couldn't compare these plans" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} testID="care-plan-compare">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <HeaderCard side={data.left} label="left" colors={colors} />
            <HeaderCard side={data.right} label="right" colors={colors} />
          </View>

          <Card testID="compare-only-left">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <GitCompare size={16} color={colors.primary} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Only in the earlier plan ({onlyLeft.length})</T>
            </View>
            {onlyLeft.length ? onlyLeft.map((f, i) => findingRow(f, `l${i}`)) : <T variant="small" style={{ marginTop: 6, color: colors.muted }}>Nothing unique.</T>}
          </Card>

          <Card testID="compare-only-right">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Only in the newer plan ({onlyRight.length})</T>
            {onlyRight.length ? onlyRight.map((f, i) => findingRow(f, `r${i}`)) : <T variant="small" style={{ marginTop: 6, color: colors.muted }}>Nothing unique.</T>}
          </Card>

          <Card testID="compare-both">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>In both plans ({both.length})</T>
            {both.length ? both.map((pair, i) => findingRow(pair.left || pair.right, `b${i}`)) : <T variant="small" style={{ marginTop: 6, color: colors.muted }}>No shared findings.</T>}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
