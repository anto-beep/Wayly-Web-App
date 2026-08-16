import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CloudOff, Sparkles, MessageCircle, Download, FileDown, History, GitCompare } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type LineItem = {
  service_name?: string;
  description?: string;
  stream?: string;
  total?: number;
  amount?: number;
  contribution_paid?: number;
  participant_contribution?: number;
  government_paid?: number;
  date?: string;
};
type Anomaly = { id?: string; severity?: string; title?: string; detail?: string; description?: string; message?: string };
type Statement = {
  id: string;
  filename: string;
  period_label?: string | null;
  uploaded_at: string;
  updated_at?: string;
  summary?: string | null;
  line_items?: LineItem[];
  anomalies?: Anomaly[];
  anomaly_dollar_impact_total?: number;
  has_original_file?: boolean;
  file_mimetype?: string | null;
};

export default function StatementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [dl, setDl] = useState<null | "original" | "csv" | "pdf">(null);
  const [dlError, setDlError] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Statement>(`/statements/${id}`);
      setStmt(data);
      setOffline(false);
      cacheSet(`statement:${id}`, data);
    } catch {
      const cached = await cacheGet<Statement>(`statement:${id}`);
      if (cached?.data) {
        setStmt(cached.data);
        setOffline(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runDownload = async (kind: "original" | "csv" | "pdf") => {
    if (!stmt) return;
    setDl(kind);
    setDlError("");
    try {
      const period = (stmt.period_label || stmt.filename || "statement").replace(/[^\w.\-]+/g, "-");
      if (kind === "original") {
        await downloadAndShare(`/statements/${stmt.id}/download`, stmt.filename || "statement");
      } else {
        const v = stmt.updated_at || stmt.uploaded_at || "";
        const bust = v ? `?v=${encodeURIComponent(String(v).replace(/[^\w.-]/g, ""))}` : "";
        await downloadAndShare(`/statements/${stmt.id}/decoded.${kind}${bust}`, `${period}-decoded.${kind}`);
      }
    } catch {
      setDlError(`Couldn't download the ${kind === "original" ? "original file" : `decoded ${kind.toUpperCase()}`}. Please try again.`);
    } finally {
      setDl(null);
    }
  };

  const streams = groupByStream(stmt?.line_items || []);
  const grandTotal = (stmt?.line_items || []).reduce((s, li) => s + (li.total ?? li.amount ?? 0), 0);
  const isPdf = String(stmt?.file_mimetype || "").includes("pdf");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Statement" subtitle={stmt?.period_label || stmt?.filename} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading statement…" />
      ) : error || !stmt ? (
        <StatePanel testID="statement-error" icon={CloudOff} title="Couldn't load this statement" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {offline ? (
            <View testID="statement-offline-banner" style={[styles.offlineBanner, { backgroundColor: colors.alertSoft }]}>
              <Ionicons name="cloud-offline" size={16} color={colors.alert} />
              <T variant="small" style={{ color: colors.alert, flex: 1 }}>Showing an offline copy. Connect to refresh.</T>
            </View>
          ) : null}

          {/* Overview */}
          <Card testID="statement-overview">
            <T variant="label">STATEMENT PERIOD</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 24, marginTop: 4 }}>{stmt.period_label || "Statement"}</T>
            <T variant="small" style={{ marginTop: 2 }}>Uploaded {shortDate(stmt.uploaded_at)}</T>
            <View style={styles.overviewRow}>
              <View style={[styles.metric, { backgroundColor: colors.surface2 }]}>
                <T variant="small">Total charges</T>
                <T style={[styles.metricValue, { color: colors.text }]}>{money(grandTotal)}</T>
              </View>
              <View style={[styles.metric, { backgroundColor: colors.surface2 }]}>
                <T variant="small">Flags</T>
                <T style={[styles.metricValue, { color: (stmt.anomalies?.length || 0) > 0 ? colors.alert : colors.success }]}>
                  {stmt.anomalies?.length || 0}
                </T>
              </View>
            </View>
          </Card>

          {/* AI insights */}
          {stmt.summary ? (
            <Card testID="statement-ai-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Sparkles size={18} color={colors.sage} />
                <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>Wayly AI insight</T>
              </View>
              <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }}>{stmt.summary}</T>
            </Card>
          ) : null}

          {/* Anomalies */}
          {stmt.anomalies && stmt.anomalies.length > 0 ? (
            <Card testID="statement-anomalies">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Things to check</T>
              <View style={{ gap: spacing.sm }}>
                {stmt.anomalies.map((a, i) => {
                  const tone = a.severity === "alert" ? "error" : a.severity === "warning" ? "alert" : "neutral";
                  const body = a.detail || a.description || a.message;
                  return (
                    <View key={a.id || i} style={[styles.anomaly, { backgroundColor: colors.surface2 }]}>
                      <Badge label={(a.severity || "info").toUpperCase()} tone={tone as any} />
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 6 }}>{a.title || "Flagged item"}</T>
                      {body ? <T variant="small" style={{ marginTop: 2 }}>{body}</T> : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* Streams breakdown */}
          <Card testID="statement-streams">
            <T variant="h3" style={{ marginBottom: spacing.sm }}>Where the money goes</T>
            {streams.length === 0 ? (
              <T variant="bodyMuted">No line items were decoded for this statement.</T>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {streams.map((s) => (
                  <View key={s.name} style={[styles.streamRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{s.name}</T>
                      <T variant="small">{s.count} item{s.count > 1 ? "s" : ""}</T>
                    </View>
                    <T style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.text }}>{money(s.total)}</T>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Downloads & records */}
          <Card testID="statement-downloads">
            <T variant="h3" style={{ marginBottom: spacing.sm }}>Downloads & records</T>
            <View style={{ gap: spacing.sm }}>
              {stmt.has_original_file ? (
                <Button label="Download original file" testID="statement-download-original" variant="outline" icon={Download} onPress={() => runDownload("original")} loading={dl === "original"} />
              ) : null}
              <Button label="Decoded CSV" testID="statement-download-csv" variant="outline" icon={FileDown} onPress={() => runDownload("csv")} loading={dl === "csv"} />
              <Button label="Decoded PDF" testID="statement-download-pdf" variant="outline" icon={FileDown} onPress={() => runDownload("pdf")} loading={dl === "pdf"} />
              {stmt.has_original_file && isPdf ? (
                <Button label="Compare side-by-side" testID="statement-compare-btn" variant="outline" icon={GitCompare} onPress={() => router.push(`/statement-compare/${stmt.id}`)} />
              ) : null}
              <Button label="Audit log" testID="statement-audit-log-link" variant="outline" icon={History} onPress={() => router.push(`/statement-audit/${stmt.id}`)} />
              {dlError ? <T variant="small" style={{ color: colors.terracotta }}>{dlError}</T> : null}
            </View>
          </Card>

          <Button label="Decode with AI" testID="statement-decode-button" icon={Sparkles} onPress={() => router.push(`/decode/${stmt.id}`)} />
          <Button label="Ask Wayly about this statement" testID="statement-ask-button" icon={MessageCircle} variant="secondary" onPress={() => router.push({ pathname: "/(tabs)/ask", params: { statement_id: stmt.id } })} />
        </ScrollView>
      )}
    </View>
  );
}

function groupByStream(items: LineItem[]): { name: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const li of items) {
    const name = li.stream || "Other";
    const amt = li.total ?? li.amount ?? 0;
    const cur = map.get(name) || { total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    map.set(name, cur);
  }
  return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
}

const styles = StyleSheet.create({
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.sm },
  overviewRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  metric: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  metricValue: { fontFamily: fonts.heading, fontSize: 22, marginTop: 2 },
  anomaly: { borderRadius: radius.md, padding: spacing.md },
  streamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1 },
});
