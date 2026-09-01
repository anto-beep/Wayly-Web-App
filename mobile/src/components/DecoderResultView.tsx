// Rich decode result view for mobile — mirrors the web DecoderResultView
// sections: plain-English summary, money banner, budget-continuity panel,
// anomaly panel (issues + advisories), stream breakdown, full line-item table,
// input-method note, and a CSV/PDF/share download bar. Reads the same nested
// { extracted, audit } payload the web view consumes.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { AlertTriangle, ChevronDown, ChevronUp, FileDown, Share2, ShieldCheck } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";
import { normaliseDecode, exportDecodedCsv, exportDecodedPdf } from "@/src/lib/decoderExport";

function aud(n: any): string {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
}
function fmtDate(v: any): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}

const STREAM_DISPLAY_MAP: Record<string, string> = { EverydayLiving: "Everyday Living", ATHM: "AT-HM", CareMgmt: "Care Management" };
const STREAM_DISPLAY_LONG: Record<string, string> = { EverydayLiving: "Everyday Living", ATHM: "AT-HM (assistive tech & home mods)", CareMgmt: "Care Management" };

export default function DecoderResultView({ result }: { result: any }) {
  const { colors } = useTheme();
  const n = normaliseDecode(result);
  const [busy, setBusy] = useState<"" | "csv" | "pdf" | "share">("");
  const [openStreams, setOpenStreams] = useState<Record<string, boolean>>({});
  const [showTable, setShowTable] = useState(false);
  const [openBands, setOpenBands] = useState<Record<string, boolean>>({});

  // DOC-PARITY-1 v2 decision 5: four severity bands rendered High → Medium →
  // Low → Informational. `info`/`advisory` collapse into Informational.
  const bandOf = (sev: string) => {
    const s = (sev || "").toLowerCase();
    if (s === "info" || s === "informational" || s === "advisory") return "informational";
    if (s === "high" || s === "medium" || s === "low") return s;
    return "low";
  };
  const BANDS = ["high", "medium", "low", "informational"] as const;
  const BAND_HEADER: Record<string, string> = {
    high: "High priority", medium: "Medium", low: "Low", informational: "Informational",
  };
  const bandGroups = BANDS
    .map((band) => ({ band, items: n.anomalies.filter((a: any) => bandOf(a.severity) === band) }))
    .filter((g) => g.items.length > 0);
  const isBandOpen = (b: string) => openBands[b] !== false; // default expanded
  const toggleBand = (b: string) => setOpenBands((p) => ({ ...p, [b]: p[b] === false }));

  // DOC-PARITY-1 decision 8: DD/MM/YYYY period range when ISO bounds exist.
  const _ext = result?.extracted || {};
  const periodLabel = (_ext.period_start && _ext.period_end)
    ? `${fmtDate(_ext.period_start)} to ${fmtDate(_ext.period_end)}`
    : (n.meta.period || "Statement");
  const c = n.counts;
  const method = result?.input_method;
  const methodBody = method === "image_vision" || method === "pdf_scanned"
    ? "This statement was read from a photo or scan. Image processing is less accurate than text — verify dollar figures against your original statement."
    : method === "word_document"
    ? "This statement was read from a Word document. Table formatting can reorder data — verify line items if anything looks out of place."
    : "";

  const topBanner = c.high > 0
    ? { bg: colors.errorSoft, fg: colors.terracotta, text: `${c.high} high-priority thing${c.high === 1 ? "" : "s"} to review.` }
    : c.medium > 0
    ? { bg: colors.alertSoft, fg: colors.alert, text: `${c.medium} thing${c.medium === 1 ? "" : "s"} worth a closer look.` }
    : c.low > 0
    ? { bg: colors.sageSoft, fg: colors.sage, text: `${c.low} small note${c.low === 1 ? "" : "s"}, mostly informational.` }
    : { bg: colors.sageSoft, fg: colors.sage, text: "Statement looks clean. Nothing unusual found." };

  const sevMeta = (s: string) => {
    const b = bandOf(s);
    return b === "high" ? { bg: colors.terracotta, label: "High", soft: false }
      : b === "medium" ? { bg: colors.gold, label: "Medium", soft: false }
      : b === "informational" ? { bg: colors.sage, label: "Informational", soft: true }
      : { bg: colors.sage, label: "Low", soft: false };
  };

  const doExport = async (kind: "csv" | "pdf" | "share") => {
    setBusy(kind);
    try { if (kind === "csv") await exportDecodedCsv(result); else await exportDecodedPdf(result); }
    catch { Alert.alert("Export failed", "Could not create the file. Please try again."); }
    finally { setBusy(""); }
  };

  const balanceKnown = [n.meta.opening_balance, n.meta.allocation, n.meta.closing_balance].filter((v) => v != null && v !== "").length;
  const isClean = c.high === 0 && c.medium === 0 && c.low === 0;

  return (
    <View style={{ gap: spacing.md }} testID="decoder-result-v2">
      {/* Persona-aware hero (matches web default copy) */}
      <T testID="decoder-persona-hero" style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 31, color: colors.primary }}>Here is what we found in the statement.</T>
      {isClean ? (
        <T testID="decoder-charged-correctly" variant="small" style={{ marginTop: -6 }}>Everything on this statement has been charged in line with the Support at Home plan.</T>
      ) : null}
      {result?.partial_result ? (
        <View testID="decoder-partial-warning" style={[styles.notice, { backgroundColor: colors.alertSoft }]}>
          <T variant="small" style={{ color: colors.text }}>Partial result — we had trouble reading parts of this statement. Here is what we could extract.</T>
        </View>
      ) : null}
      {result?.redaction_notice ? (
        <View testID="decoder-redaction-notice" style={[styles.notice, { backgroundColor: colors.surface2 }]}>
          <T variant="small">{sanitizeAI(result.redaction_notice)}</T>
        </View>
      ) : null}
      {methodBody ? (
        <View testID="decoder-format-disclaimer" style={[styles.notice, { backgroundColor: colors.alertSoft }]}>
          <T variant="small" style={{ color: colors.text }}>{methodBody}</T>
        </View>
      ) : null}

      {/* Download bar */}
      <View testID="decoder-download-bar" style={[styles.downloadBar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <T variant="small" style={{ flex: 1 }}>Save a copy of this decoded statement for your records.</T>
        <Pressable testID="decoder-share-pdf-btn" onPress={() => doExport("share")} disabled={!!busy} style={[styles.dlBtn, { borderColor: colors.primary }]}>
          <Share2 size={14} color={colors.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>{busy === "share" ? "…" : "Share this decode"}</T>
        </Pressable>
        <Pressable testID="decoder-download-csv-btn" onPress={() => doExport("csv")} disabled={!!busy} style={[styles.dlBtn, { borderColor: colors.border }]}>
          <FileDown size={14} color={colors.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>{busy === "csv" ? "…" : "Download CSV"}</T>
        </Pressable>
        <Pressable testID="decoder-download-pdf-btn" onPress={() => doExport("pdf")} disabled={!!busy} style={[styles.dlBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <FileDown size={14} color="#fff" />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: "#fff" }}>{busy === "pdf" ? "…" : "Download PDF"}</T>
        </Pressable>
      </View>

      {/* Plain-English summary */}
      {n.summaryText ? (
        <Card testID="decoder-plain-english-summary" style={{ backgroundColor: colors.surface2 }}>
          <T variant="label" style={{ color: colors.primary }}>IN PLAIN ENGLISH</T>
          <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: 8 }}>{sanitizeAI(n.summaryText)}</T>
          <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 10 }}>AI-generated summary. Always verify important figures with your provider or My Aged Care before acting.</T>
        </Card>
      ) : null}

      {/* Money summary banner */}
      <View testID="decoder-summary-banner" style={[styles.banner, { backgroundColor: colors.primary }]}>
        <T testID="decoder-summary-header-line" style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.85)" }}>
          {[periodLabel, n.meta.participant, n.meta.classification, n.meta.provider].filter(Boolean).join(" · ")}
        </T>
        <View style={styles.tileRow}>
          <Tile label="Gross billed" value={aud(n.meta.gross)} />
          <Tile label="Your contribution" value={aud(n.meta.contribution)} gold />
        </View>
        <View style={styles.tileRow}>
          <Tile label="Government paid" value={aud(n.meta.government_paid)} />
          <Tile label="Budget remaining" value={n.meta.budget_remaining != null ? aud(n.meta.budget_remaining) : "—"} />
        </View>
      </View>

      {/* Budget continuity */}
      {balanceKnown >= 2 ? (
        <Card testID="decoder-balance-panel">
          <T variant="label">BUDGET CONTINUITY</T>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
            <BalCell label="Opening" value={n.meta.opening_balance} testID="decoder-opening-balance" />
            <BalCell label="Allocation" value={n.meta.allocation} testID="decoder-allocation" />
            <BalCell label="Closing" value={n.meta.closing_balance} testID="decoder-closing-balance" />
          </View>
        </Card>
      ) : null}

      {/* Anomaly panel */}
      <View testID="decoder-anomaly-panel">
        <View style={[styles.topBanner, { backgroundColor: topBanner.bg, borderLeftColor: topBanner.fg }]} testID="anomaly-top-banner">
          {c.high + c.medium + c.low === 0 ? <ShieldCheck size={18} color={topBanner.fg} /> : <AlertTriangle size={18} color={topBanner.fg} />}
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, flex: 1 }}>{topBanner.text}</T>
        </View>
        {bandGroups.map((g) => {
          const open = isBandOpen(g.band);
          const headMeta = sevMeta(g.band);
          return (
            <View key={g.band} testID={`severity-group-${g.band}`} style={{ marginTop: spacing.sm }}>
              <Pressable
                testID={`severity-group-toggle-${g.band}`}
                onPress={() => toggleBand(g.band)}
                style={[styles.groupHeader, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <View style={[styles.sevChip, { backgroundColor: headMeta.bg }]}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: "#fff" }}>{g.items.length}</T>
                  </View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{BAND_HEADER[g.band]}</T>
                </View>
                {open ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}
              </Pressable>
              {open ? g.items.map((a: any, i: number) => {
                const meta = sevMeta(a.severity || "low");
                return (
                  <Card key={i} testID={`anomaly-card-${g.band}-${i}`} style={{ marginTop: spacing.sm, borderLeftWidth: meta.soft ? 4 : 0, borderLeftColor: meta.soft ? colors.sage : undefined }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <View style={[styles.sevChip, { backgroundColor: meta.bg }]}><T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: "#fff" }}>{meta.label.toUpperCase()}</T></View>
                      {a.rule ? <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: colors.muted }} testID={`anomaly-rule-badge-${a.rule}`}>{String(a.rule).replace(/_/g, " ").toUpperCase()}</T> : null}
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 8 }}>{sanitizeAI(a.headline)}</T>
                    {a.detail ? <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>{sanitizeAI(a.detail)}</T> : null}
                    {a.dollar_impact > 0 ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, marginTop: 6 }}>Potential impact: {aud(a.dollar_impact)}</T> : null}
                    {a.evidence?.length ? (
                      <View style={{ marginTop: 6, gap: 3 }}>
                        {a.evidence.map((e: string, j: number) => <T key={j} variant="small" style={{ color: colors.muted }}>▸ {sanitizeAI(e)}</T>)}
                      </View>
                    ) : null}
                    {a.suggested_action ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary, marginTop: 8 }}>→ {sanitizeAI(a.suggested_action)}</T> : null}
                    {!meta.soft ? (
                      <View testID="ai-anomaly-disclaimer" style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                        <AlertTriangle size={12} color={colors.alert} />
                        <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.alert, flex: 1 }}>This flag is AI-generated and may be incorrect. Verify before acting.</T>
                      </View>
                    ) : null}
                  </Card>
                );
              }) : null}
            </View>
          );
        })}
      </View>

      {/* Stream breakdown */}
      {n.streams.length ? (
        <View testID="decoder-stream-breakdown">
          <T variant="label" style={{ marginBottom: spacing.sm }}>STREAM BREAKDOWN</T>
          <View style={{ gap: spacing.sm }}>
            {n.streams.map((s: any) => {
              const open = !!openStreams[s.stream];
              const items = n.lineItems.filter((li: any) => (li.stream === (STREAM_DISPLAY_MAP[s.stream] || s.stream)) && !li.is_cancellation);
              return (
                <Card key={s.stream} testID={`stream-card-${s.stream}`} style={{ padding: 0, overflow: "hidden" }}>
                  <Pressable onPress={() => setOpenStreams((p) => ({ ...p, [s.stream]: !p[s.stream] }))} style={{ padding: spacing.md }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <T variant="label">{STREAM_DISPLAY_LONG[s.stream] || s.stream}</T>
                      {open ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}
                    </View>
                    <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 4 }}>{aud(s.gross_total)}</T>
                    <T variant="small">{s.line_item_count} item{s.line_item_count === 1 ? "" : "s"} · you paid {aud(s.participant_contribution)}</T>
                  </Pressable>
                  {open ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 }}>
                      {items.length === 0 ? <T variant="small" style={{ padding: spacing.md }}>No line items in this stream.</T> : items.map((li: any, i: number) => (
                        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", padding: spacing.sm, gap: 8 }}>
                          <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{fmtDate(li.date)} · {li.service_name || "Service"}</T>
                          <T style={{ fontFamily: fonts.mono, fontSize: 12 }}>{aud(li.gross)}</T>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Full line-item table (collapsible) */}
      {n.lineItems.length ? (
        <View testID="decoder-full-table">
          <Pressable testID="decoder-table-toggle" onPress={() => setShowTable((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {showTable ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>{showTable ? "Hide" : "Show"} full line-item table ({n.lineItems.length})</T>
          </Pressable>
          {showTable ? (
            <Card style={{ marginTop: spacing.sm, padding: 0, overflow: "hidden" }}>
              {n.lineItems.map((li: any, i: number) => (
                <View key={i} style={{ padding: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T variant="small" style={{ flex: 1, color: li.is_cancellation ? colors.muted : colors.text, fontStyle: li.is_cancellation ? "italic" : "normal" }} numberOfLines={2}>
                      {fmtDate(li.date)} · {li.service_name || "Service"}{li.service_code ? ` (${li.service_code})` : ""}
                    </T>
                    <T style={{ fontFamily: fonts.mono, fontSize: 12, textDecorationLine: li.is_cancellation ? "line-through" : "none" }}>{aud(li.gross)}</T>
                  </View>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>
                    {li.stream}{li.hours ? ` · ${li.hours}` : ""}{li.unit_rate ? ` @ ${aud(li.unit_rate)}` : ""} · you paid {aud(li.participant_contribution)} · govt {aud(li.government_paid)}
                  </T>
                  {li.provider_notes ? <T variant="small" style={{ color: colors.terracotta, marginTop: 2 }}>⚠ {sanitizeAI(li.provider_notes)}</T> : null}
                </View>
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Tile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: "rgba(255,255,255,0.7)" }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.mono, fontSize: 20, color: gold ? colors.gold : "#fff", marginTop: 2 }}>{value}</T>
    </View>
  );
}
function BalCell({ label, value, testID }: { label: string; value: any; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>{label.toUpperCase()}</T>
      <T testID={testID} style={{ fontFamily: fonts.mono, fontSize: 15, color: colors.text, marginTop: 2 }}>{value != null ? aud(value) : "—"}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: radius.md, padding: spacing.md },
  downloadBar: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, flexWrap: "wrap" },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  banner: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  tileRow: { flexDirection: "row", gap: spacing.md },
  topBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderLeftWidth: 4, borderRadius: radius.md, padding: spacing.md },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  sevChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
