import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Download, FileText, GitCompare } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type LineItem = { id?: string; date?: string; service_name?: string; stream?: string; units?: number; unit_price?: number; total?: number; contribution_paid?: number };
type Statement = {
  id: string;
  filename: string;
  period_label?: string | null;
  file_mimetype?: string | null;
  has_original_file?: boolean;
  line_items?: LineItem[];
  summary?: string | null;
};

export default function StatementCompare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"original" | "decoded">("decoded");
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      setStmt(await apiFetch<Statement>(`/statements/${id}`));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openOriginal = async () => {
    if (!stmt) return;
    setBusy(true);
    setDlError("");
    try {
      const ext = (stmt.filename?.split(".").pop() || "pdf").toLowerCase();
      await downloadAndShare(`/statements/${stmt.id}/download`, stmt.filename || `statement.${ext}`);
    } catch {
      setDlError("Couldn't open the original file. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const lines = stmt?.line_items || [];
  const total = lines.reduce((s, li) => s + (li.total || 0), 0);
  const contribution = lines.reduce((s, li) => s + (li.contribution_paid || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Compare" subtitle={stmt?.period_label || stmt?.filename} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading…" />
      ) : error || !stmt ? (
        <StatePanel testID="compare-error" icon={GitCompare} title="Couldn't load this statement" actionLabel="Retry" onAction={load} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            {(["decoded", "original"] as const).map((t) => {
              const active = tab === t;
              return (
                <T
                  key={t}
                  testID={`compare-tab-${t}`}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tab,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent", color: active ? "#fff" : colors.text, fontFamily: fonts.bodySemi },
                  ]}
                >
                  {t === "decoded" ? "Decoded breakdown" : "Original file"}
                </T>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md }}>
            {tab === "decoded" ? (
              <>
                <Card testID="compare-decoded-totals">
                  <T variant="label">DECODED TOTALS</T>
                  <View style={styles.totalsRow}>
                    <View style={{ flex: 1 }}>
                      <T variant="small">Total charges</T>
                      <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>{money(total)}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T variant="small">You paid</T>
                      <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>{money(contribution)}</T>
                    </View>
                  </View>
                </Card>

                <Card testID="compare-figure-list">
                  <T variant="h3" style={{ marginBottom: spacing.sm }}>Decoded line items</T>
                  {lines.length === 0 ? (
                    <T variant="bodyMuted">No line items were decoded for this statement.</T>
                  ) : (
                    lines.map((li, i) => (
                      <View key={li.id || i} testID={`compare-figure-${li.id || i}`} style={[styles.figRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{li.service_name || "Service"}</T>
                          <T variant="small">{li.stream || "Other"}{li.date ? ` · ${shortDate(li.date)}` : ""}</T>
                        </View>
                        <T style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text }}>{money(li.total || 0)}</T>
                      </View>
                    ))
                  )}
                </Card>
              </>
            ) : (
              <Card testID="compare-original-pane">
                <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                  <FileText size={26} color={colors.primary} />
                </View>
                {stmt.has_original_file ? (
                  <>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginTop: spacing.sm }}>{stmt.filename}</T>
                    <T variant="small" style={{ marginTop: 4 }}>
                      Open the original file as received to check it against the decoded breakdown. This is the evidentiary copy for any dispute.
                    </T>
                    <Button label="Open original file" testID="compare-open-original" icon={Download} onPress={openOriginal} loading={busy} style={{ marginTop: spacing.md }} />
                    {dlError ? <T variant="small" style={{ marginTop: spacing.sm, color: colors.terracotta }}>{dlError}</T> : null}
                  </>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                    <AlertTriangle size={18} color={colors.terracotta} />
                    <T variant="small" style={{ flex: 1, color: colors.terracotta }}>
                      The original file isn't retained for this statement (for example a pasted or forwarded statement with no attachment).
                    </T>
                  </View>
                )}
              </Card>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1, textAlign: "center", paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, fontSize: 14, overflow: "hidden" },
  totalsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  figRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, gap: spacing.md },
  iconWrap: { width: 52, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
