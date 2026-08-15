import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
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
  summary?: string | null;
  line_items?: LineItem[];
  anomalies?: Anomaly[];
  anomaly_dollar_impact_total?: number;
};

export default function StatementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Statement>(`/statements/${id}`);
      setStmt(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const streams = groupByStream(stmt?.line_items || []);
  const grandTotal = (stmt?.line_items || []).reduce((s, li) => s + (li.total ?? li.amount ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Statement"
        subtitle={stmt?.period_label || stmt?.filename}
        onBack={() => router.back()}
      />
      {loading ? (
        <Loading label="Loading statement…" />
      ) : error || !stmt ? (
        <StatePanel
          testID="statement-error"
          icon="cloud-offline"
          title="Couldn't load this statement"
          actionLabel="Retry"
          onAction={load}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {/* Overview */}
          <Card testID="statement-overview">
            <T variant="label">STATEMENT PERIOD</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 24, marginTop: 4 }}>
              {stmt.period_label || "Statement"}
            </T>
            <T variant="small" style={{ marginTop: 2 }}>
              Uploaded {shortDate(stmt.uploaded_at)}
            </T>
            <View style={styles.overviewRow}>
              <View style={styles.metric}>
                <T variant="small">Total charges</T>
                <T style={styles.metricValue}>{money(grandTotal)}</T>
              </View>
              <View style={styles.metric}>
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
                <Ionicons name="sparkles" size={18} color={colors.sage} />
                <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>Wayly AI insight</T>
              </View>
              <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text }}>
                {stmt.summary}
              </T>
            </Card>
          ) : null}

          {/* Anomalies */}
          {stmt.anomalies && stmt.anomalies.length > 0 ? (
            <Card testID="statement-anomalies">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>
                Things to check
              </T>
              <View style={{ gap: spacing.sm }}>
                {stmt.anomalies.map((a, i) => {
                  const tone = a.severity === "alert" ? "error" : a.severity === "warning" ? "alert" : "neutral";
                  const body = a.detail || a.description || a.message;
                  return (
                    <View key={a.id || i} style={styles.anomaly}>
                      <Badge label={(a.severity || "info").toUpperCase()} tone={tone as any} />
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 6 }}>{a.title || "Flagged item"}</T>
                      {body ? (
                        <T variant="small" style={{ marginTop: 2 }}>
                          {body}
                        </T>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* Streams breakdown */}
          <Card testID="statement-streams">
            <T variant="h3" style={{ marginBottom: spacing.sm }}>
              Where the money goes
            </T>
            {streams.length === 0 ? (
              <T variant="bodyMuted">No line items were decoded for this statement.</T>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {streams.map((s) => (
                  <View key={s.name} style={styles.streamRow}>
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

          <Button
            label="Ask Wayly about this statement"
            testID="statement-ask-button"
            icon="chatbubbles"
            variant="secondary"
            onPress={() => router.push({ pathname: "/(tabs)/ask", params: { statement_id: stmt.id } })}
          />
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
  overviewRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  metric: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metricValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.text, marginTop: 2 },
  anomaly: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  streamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
