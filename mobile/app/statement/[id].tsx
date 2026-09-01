import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CloudOff, Sparkles, MessageCircle, Download, FileDown, History, GitCompare, AlertTriangle, Archive, ArchiveRestore } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import DecoderResultView from "@/src/components/DecoderResultView";
import { apiFetch } from "@/src/lib/api";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

function _ddmm(v: any): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || "");
}

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
type Anomaly = { id?: string; rule?: string; severity?: string; title?: string; detail?: string; description?: string; message?: string; dollar_impact?: number; suggested_action?: string };
type Statement = {
  id: string;
  filename: string;
  period_label?: string | null;
  provider_name?: string | null;
  uploaded_at: string;
  updated_at?: string;
  summary?: string | null;
  line_items?: LineItem[];
  anomalies?: Anomaly[];
  anomaly_dollar_impact_total?: number;
  has_original_file?: boolean;
  file_mimetype?: string | null;
  extracted_json?: any;
  audit_json?: any;
  input_method?: string | null;
  parsing_warnings?: string[] | null;
  state?: string | null;
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
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

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

  const runArchive = async () => {
    if (!stmt) return;
    setArchiving(true);
    setDlError("");
    try {
      await apiFetch(`/statements/${stmt.id}/archive`, {
        method: "DELETE",
        headers: { "Idempotency-Key": `arch-${stmt.id}-${Date.now()}` },
      });
      router.replace("/(tabs)/statements");
    } catch {
      setDlError("Couldn't archive this statement. Please try again.");
      setArchiving(false);
      setConfirmArchive(false);
    }
  };

  const runRestore = async () => {
    if (!stmt) return;
    setArchiving(true);
    setDlError("");
    try {
      await apiFetch(`/statements/${stmt.id}/restore`, {
        method: "POST",
        headers: { "Idempotency-Key": `rest-${stmt.id}-${Date.now()}` },
      });
      await load();
    } catch {
      setDlError("Couldn't restore this statement. Please try again.");
    } finally {
      setArchiving(false);
    }
  };

  const lineItems = stmt?.line_items || [];
  const isArchived = (stmt?.state || "").toLowerCase() === "archived";
  const _sx = stmt?.extracted_json || {};
  const periodLabel = (_sx.period_start && _sx.period_end)
    ? `${_ddmm(_sx.period_start)} to ${_ddmm(_sx.period_end)}`
    : (stmt?.period_label || "Statement");
  const total = lineItems.reduce((s, li) => s + (li.total ?? li.amount ?? 0), 0);
  const totalContribution = lineItems.reduce((s, li) => s + (li.contribution_paid ?? li.participant_contribution ?? 0), 0);
  const providerName = stmt?.provider_name || stmt?.extracted_json?.provider_name || null;
  const flags = stmt?.anomalies?.length || 0;
  const isPdf = String(stmt?.file_mimetype || "").includes("pdf");
  // DEC-1 Phase 1: rich decoder payload → render the SAME view as the AI Tools
  // pathway, identical to web StatementDetail. Legacy statements fall through.
  const rich = !!(stmt?.audit_json && stmt?.extracted_json);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Statement" subtitle={periodLabel !== "Statement" ? periodLabel : stmt?.filename} onBack={() => router.back()} />
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

          {/* Header — mirrors web: period · provider, then "N line items · $total total · $contribution contribution" */}
          <View testID="statement-overview">
            <T variant="label">STATEMENT</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 26, marginTop: 4, color: colors.text }}>
              {periodLabel}
              {providerName ? <T style={{ fontFamily: fonts.heading, fontSize: 26, color: colors.muted }}>{`  ·  ${providerName}`}</T> : null}
            </T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginTop: 6 }}>
              <T variant="small">
                {lineItems.length} line item{lineItems.length === 1 ? "" : "s"} · {money(total)} total · {money(totalContribution)} contribution
              </T>
              <Badge label={flags > 0 ? `Flagged · ${flags}` : "All clear"} tone={flags > 0 ? "alert" : "success" as any} />
            </View>
            <T variant="small" style={{ marginTop: 2 }}>Uploaded {shortDate(stmt.uploaded_at)}</T>
          </View>

          {/* Decoded result — identical component to the Statement Decoder tool + web StatementDetail */}
          {rich ? (
            <View testID="statement-decoder-view">
              <DecoderResultView result={{
                extracted: stmt.extracted_json,
                audit: stmt.audit_json,
                input_method: stmt.input_method,
                parsing_warnings: stmt.parsing_warnings,
                summary: stmt.summary,
              }} />
            </View>
          ) : (
            <LegacyStatementView stmt={stmt} colors={colors} />
          )}

          {/* Downloads & records */}
          <Card testID="statement-downloads">
            <T variant="h3" style={{ marginBottom: spacing.sm }}>Downloads &amp; records</T>
            <View style={{ gap: spacing.sm }}>
              {stmt.has_original_file ? (
                <Button label="Download original file" testID="statement-download-original" variant="outline" icon={Download} onPress={() => runDownload("original")} loading={dl === "original"} />
              ) : null}
              {/* Rich statements expose decoded CSV/PDF via the DecoderResultView download bar (client-generated,
                  identical to web). Only legacy statements need the server-rendered decoded exports here. */}
              {!rich ? (
                <>
                  <Button label="Decoded CSV" testID="statement-download-csv" variant="outline" icon={FileDown} onPress={() => runDownload("csv")} loading={dl === "csv"} />
                  <Button label="Decoded PDF" testID="statement-download-pdf" variant="outline" icon={FileDown} onPress={() => runDownload("pdf")} loading={dl === "pdf"} />
                </>
              ) : null}
              {stmt.has_original_file && isPdf ? (
                <Button label="Compare side-by-side" testID="statement-compare-btn" variant="outline" icon={GitCompare} onPress={() => router.push(`/statement-compare/${stmt.id}`)} />
              ) : null}
              <Button label="Audit log" testID="statement-audit-log-link" variant="outline" icon={History} onPress={() => router.push(`/statement-audit/${stmt.id}`)} />
              {dlError ? <T variant="small" style={{ color: colors.terracotta }}>{dlError}</T> : null}
            </View>
          </Card>

          {/* DOC-PARITY-1 / parity: archive & restore, matching web StatementDetail. */}
          <Card testID="statement-manage">
            <T variant="h3" style={{ marginBottom: spacing.sm }}>Manage</T>
            {isArchived ? (
              <View style={{ gap: spacing.sm }}>
                <T variant="small">This statement is archived. It won't appear in your register until you restore it.</T>
                <Button label="Restore statement" testID="statement-restore-btn" variant="outline" icon={ArchiveRestore} onPress={runRestore} loading={archiving} />
              </View>
            ) : confirmArchive ? (
              <View style={{ gap: spacing.sm }}>
                <T variant="small">Archive this statement? It moves to your archived list and stops showing in the register. You can restore it within 30 days.</T>
                <Button label="Confirm archive" testID="statement-archive-confirm" icon={Archive} onPress={runArchive} loading={archiving} />
                <Button label="Cancel" testID="statement-archive-cancel" variant="secondary" onPress={() => setConfirmArchive(false)} />
              </View>
            ) : (
              <Button label="Archive statement" testID="statement-archive-btn" variant="outline" icon={Archive} onPress={() => setConfirmArchive(true)} />
            )}
          </Card>

          <Button label="Decode with AI" testID="statement-decode-button" icon={Sparkles} onPress={() => router.push(`/decode/${stmt.id}`)} />
          <Button label="Ask Wayly about this statement" testID="statement-ask-button" icon={MessageCircle} variant="secondary" onPress={() => router.push({ pathname: "/(tabs)/ask", params: { statement_id: stmt.id } })} />
        </ScrollView>
      )}
    </View>
  );
}

// Legacy fallback (statements decoded before the rich audit_json/extracted_json
// payload existed). Mirrors web StatementDetail's legacy branch: In plain English
// summary, "Things to know" anomalies (no invented severity words), and a line-item
// list that always shows the participant contribution ("You paid").
function LegacyStatementView({ stmt, colors }: { stmt: Statement; colors: any }) {
  const anomalies = stmt.anomalies || [];
  const items = stmt.line_items || [];
  return (
    <>
      {stmt.summary ? (
        <Card testID="summary-card" style={{ backgroundColor: colors.surface2 }}>
          <T variant="label">IN PLAIN ENGLISH</T>
          <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: 8 }}>{stmt.summary}</T>
        </Card>
      ) : null}

      {anomalies.length > 0 ? (
        <Card testID="anomalies-card">
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <T variant="label">THINGS TO KNOW</T>
            {(stmt.anomaly_dollar_impact_total || 0) > 0 ? (
              <T variant="small" style={{ color: colors.terracotta }} testID="anomalies-total-impact">Potential impact: {money(stmt.anomaly_dollar_impact_total)}</T>
            ) : null}
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {anomalies.map((a, i) => {
              const isAlert = (a.severity || "").toLowerCase() === "alert" || (a.severity || "").toLowerCase() === "high";
              return (
                <View key={a.id || i} testID={`anomaly-${a.rule || a.id || i}`} style={{ flexDirection: "row", gap: 10, borderBottomWidth: i === anomalies.length - 1 ? 0 : 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
                  <AlertTriangle size={16} color={isAlert ? colors.terracotta : colors.sage} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{a.title || a.headline || "Flagged item"}</T>
                    {a.detail || a.description || a.message ? <T variant="small" style={{ marginTop: 2 }}>{a.detail || a.description || a.message}</T> : null}
                    {a.dollar_impact != null && a.dollar_impact > 0 ? <T variant="small" style={{ color: colors.terracotta, marginTop: 2 }}>Potential impact: {money(a.dollar_impact)}</T> : null}
                    {a.suggested_action ? <T variant="small" style={{ color: colors.primary, marginTop: 4, fontStyle: "italic" }}>→ {a.suggested_action}</T> : null}
                    {a.rule ? <T style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: colors.muted, marginTop: 4 }}>{String(a.rule).toUpperCase()}</T> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card testID="line-items-table">
        <T variant="label" style={{ marginBottom: spacing.sm }}>LINE ITEMS</T>
        {items.length === 0 ? (
          <T variant="bodyMuted">No line items were decoded for this statement.</T>
        ) : (
          <View>
            {items.map((li, i) => (
              <View key={i} style={{ paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <T variant="small" style={{ flex: 1, color: colors.text }} numberOfLines={2}>
                    {li.date ? `${li.date} · ` : ""}{li.service_name || li.description || "Service"}
                  </T>
                  <T style={{ fontFamily: fonts.mono, fontSize: 13 }}>{money(li.total ?? li.amount ?? 0)}</T>
                </View>
                <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
                  {li.stream || "Other"} · you paid {money(li.contribution_paid ?? li.participant_contribution ?? 0)}
                  {li.government_paid != null ? ` · govt ${money(li.government_paid)}` : ""}
                </T>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.sm },
});
