// Rich decode result view for mobile — mirrors the web DecoderResultView
// sections: plain-English summary, money banner, budget-continuity panel,
// anomaly panel (issues + advisories), stream breakdown, full line-item table,
// input-method note, and a CSV/PDF/share download bar. Reads the same nested
// { extracted, audit } payload the web view consumes.
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronUp, FileDown, FileText, Info, PenLine, Share2, ShieldCheck } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI, cleanTitle, plainBody, ruleLabel } from "@/src/utils/format";
import { normaliseDecode, exportDecodedCsv, exportDecodedPdf } from "@/src/lib/decoderExport";
import { StatementInsightGraphics } from "@/src/components/InsightGraphics";

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

export default function DecoderResultView({ result, onDraftLetter }: { result: any; onDraftLetter?: (a: any) => Promise<void> | void }) {
  const { colors } = useTheme();
  const n = normaliseDecode(result);
  // DEC-1 publish gate — mirrors web DecoderResultView. When the statement's
  // own numbers do not reconcile the backend refuses to publish a trustworthy
  // summary, so we must NOT present the (untrusted) totals as fact.
  const blocked = result?.publishable === false;
  const publishBlock = result?.publish_block || {};
  const blockMessage = typeof result?.summary === "string" ? result.summary : "";
  const lowConfidence = !!result?.low_confidence;
  const extractionConfidence = result?.audit?.extraction_confidence;
  const _rawAnoms: any[] = result?.audit?.anomalies || [];
  const _blockerRules = new Set((publishBlock.rules || []).map((r: any) => String(r || "").toUpperCase()));
  const blockerAnoms = _rawAnoms.filter((a) => _blockerRules.has(String(a?.rule || "").toUpperCase()));
  const [busy, setBusy] = useState<"" | "csv" | "pdf" | "share">("");
  const [openStreams, setOpenStreams] = useState<Record<string, boolean>>({});
  const [showTable, setShowTable] = useState(false);
  const [openBands, setOpenBands] = useState<Record<string, boolean>>({});
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const runDraft = onDraftLetter
    ? async (a: any, key: string) => { setDraftKey(key); try { await onDraftLetter(a); } finally { setDraftKey(null); } }
    : null;

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
      {blocked ? <PublishBlockPanel block={publishBlock} message={blockMessage} blockers={blockerAnoms} onDraftLetter={onDraftLetter} /> : null}
      {lowConfidence ? <LowConfidenceBanner confidence={extractionConfidence} /> : null}
      {/* Persona-aware hero (matches web default copy) */}
      {!blocked ? (
        <T testID="decoder-persona-hero" style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 31, color: colors.primary }}>Here is what we found in the statement.</T>
      ) : null}
      {isClean && !blocked ? (
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

      {/* Short plain-English summary (2 sentences) — worded overview, not a wall */}
      {n.summaryText && !blocked ? (
        <Card testID="decoder-plain-english-summary" style={{ backgroundColor: colors.surface2 }}>
          <T variant="label" style={{ color: colors.primary }}>IN PLAIN ENGLISH</T>
          <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: 8 }}>
            {((sanitizeAI(n.summaryText).match(/[^.!?]+[.!?]+/g) || [sanitizeAI(n.summaryText)]).slice(0, 2).join(" ")).trim()}
          </T>
        </Card>
      ) : null}

      {/* Money summary + graphics + budget — hidden when blocked so untrusted totals are never presented as fact. */}
      {!blocked ? (
      <>
      <View testID="decoder-summary-banner" style={[styles.banner, { backgroundColor: colors.primary }]}>
        <T testID="decoder-summary-header-line" style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.85)" }}>
          {[periodLabel, n.meta.participant, n.meta.classification, n.meta.provider].filter(Boolean).join(" · ")}
        </T>
        <View style={styles.tileRow}>
          <Tile label="Total billed" value={aud(n.meta.gross)} />
          <Tile label="Your share" value={aud(n.meta.contribution)} gold />
        </View>
        <View style={styles.tileRow}>
          <Tile label="Government paid" value={aud(n.meta.government_paid)} />
          <Tile label="Budget left this quarter" value={n.meta.budget_remaining != null ? aud(n.meta.budget_remaining) : "—"} />
        </View>
        {(() => {
          const you = Number(n.meta.contribution) || 0;
          const govt = Number(n.meta.government_paid) || 0;
          const tot = you + govt;
          if (tot <= 0) return null;
          const govtPct = Math.round((govt / tot) * 100);
          const youPct = 100 - govtPct;
          return (
            <View testID="decoder-who-paid" style={{ marginTop: spacing.xs }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>WHO PAID WHAT</T>
              <View style={{ flexDirection: "row", height: 34, borderRadius: 8, overflow: "hidden" }}>
                <View style={{ width: `${govtPct}%`, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}>
                  {govtPct >= 16 ? <T style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bodySemi }}>Govt {govtPct}%</T> : null}
                </View>
                <View style={{ width: `${youPct}%`, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
                  {youPct >= 12 ? <T style={{ color: "#fff", fontSize: 11, fontFamily: fonts.bodySemi }}>You {youPct}%</T> : null}
                </View>
              </View>
              <T style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 6 }}>The government covered {aud(govt)} of this statement; your share was {aud(you)}.</T>
            </View>
          );
        })()}
      </View>

      {/* Glanceable donut graphics — mirrors web StatementInsightGraphics */}
      <StatementInsightGraphics
        govt={Number(n.meta.government_paid) || 0}
        you={Number(n.meta.contribution) || 0}
        counts={{ high: c.high, medium: c.medium, low: c.low }}
        onOpenIssues={() => setOpenBands({ high: true, medium: true, low: true, informational: true })}
      />

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
      </>
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
                      {a.rule ? <View style={{ backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted }} testID={`anomaly-rule-badge-${a.rule}`}>{ruleLabel(a.rule)}</T></View> : null}
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 8 }}>{cleanTitle(a.headline)}</T>
                    {a.dollar_impact > 0 ? (
                      <View style={{ alignSelf: "flex-start", marginTop: 6, backgroundColor: colors.errorSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.terracotta }}>Could affect {aud(a.dollar_impact)}</T>
                      </View>
                    ) : null}
                    {a.detail ? <T variant="small" style={{ marginTop: 8, lineHeight: 20 }}>{plainBody(a.detail, 340)}</T> : null}
                    {a.suggested_action ? (
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 10 }}>
                        <T style={{ fontSize: 13, color: colors.text, flex: 1, lineHeight: 19 }}>
                          <T style={{ fontFamily: fonts.bodySemi }}>What to do: </T>{plainBody(a.suggested_action, 300)}
                        </T>
                      </View>
                    ) : null}
                    {Array.isArray(a.evidence) && a.evidence.filter((e: any) => typeof e === "string" && e.trim()).length ? (
                      <View testID={`anomaly-card-${g.band}-${i}-evidence`} style={{ marginTop: 10, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <FileText size={12} color={colors.muted} />
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>FROM YOUR STATEMENT</T>
                        </View>
                        {a.evidence.filter((e: any) => typeof e === "string" && e.trim()).map((e: string, j: number) => (
                          <T key={j} style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text, lineHeight: 18 }}>{e}</T>
                        ))}
                      </View>
                    ) : null}
                    {runDraft ? (
                      <Pressable
                        testID={`anomaly-card-${g.band}-${i}-draft-letter`}
                        onPress={() => runDraft(a, `${g.band}-${i}`)}
                        disabled={draftKey === `${g.band}-${i}`}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 11, opacity: draftKey === `${g.band}-${i}` ? 0.6 : 1 }}
                      >
                        <PenLine size={15} color="#fff" />
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" }}>{draftKey === `${g.band}-${i}` ? "Starting letter…" : "Draft a letter about this"}</T>
                      </Pressable>
                    ) : null}
                  </Card>
                );
              }) : null}
            </View>
          );
        })}
      </View>

      {/* Stream breakdown — hidden when blocked (untrusted totals) */}
      {n.streams.length && !blocked ? (
        <View testID="decoder-stream-breakdown">
          <T variant="label" style={{ marginBottom: spacing.sm }}>WHERE THE MONEY WENT</T>
          <View style={{ gap: spacing.sm }}>
            {n.streams.map((s: any, sIdx: number) => {
              const open = !!openStreams[s.stream];
              const items = n.lineItems.filter((li: any) => (li.stream === (STREAM_DISPLAY_MAP[s.stream] || s.stream)) && !li.is_cancellation);
              const STREAM_TONES = ["#0E4D52", "#A5512B", "#B23A2E", "#425F47", "#8A4423", "#0A3E42"];
              const tone = STREAM_TONES[sIdx % STREAM_TONES.length];
              return (
                <Card key={s.stream} testID={`stream-card-${s.stream}`} style={{ padding: 0, overflow: "hidden" }}>
                  <Pressable onPress={() => setOpenStreams((p) => ({ ...p, [s.stream]: !p[s.stream] }))} style={{ padding: spacing.md, backgroundColor: tone }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.75)" }}>{(STREAM_DISPLAY_LONG[s.stream] || s.stream).toUpperCase()}</T>
                      {open ? <ChevronUp size={16} color="rgba(255,255,255,0.85)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.85)" />}
                    </View>
                    <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 4, color: "#fff" }}>{aud(s.gross_total)}</T>
                    <T style={{ fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{s.line_item_count} item{s.line_item_count === 1 ? "" : "s"} · you paid {aud(s.participant_contribution)}</T>
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
          {blocked ? (
            <T variant="small" testID="decoder-table-unverified-note" style={{ color: colors.muted, marginBottom: 8, lineHeight: 18 }}>These line items are shown exactly as decoded. The totals have not been verified because the statement does not reconcile, so treat every figure as unconfirmed until the provider corrects it.</T>
          ) : null}
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

function PublishBlockPanel({ block, message, blockers = [], onDraftLetter }: { block: any; message?: string; blockers?: any[]; onDraftLetter?: (a: any) => Promise<void> | void }) {
  const { colors } = useTheme();
  const [draftKey, setDraftKey] = useState<number | null>(null);
  const fallbackItems = Array.isArray(block?.items) ? block.items.filter((it: any) => it && (it.headline || it.detail)) : [];
  const rows = blockers.length > 0 ? blockers : fallbackItems;
  const reason = block?.reason || "This statement's own numbers do not reconcile, so a plain-English summary could be misleading.";
  const runDraft = onDraftLetter ? async (anom: any, key: number) => { setDraftKey(key); try { await onDraftLetter(anom); } finally { setDraftKey(null); } } : null;
  return (
    <View testID="decoder-publish-block" style={{ borderWidth: 2, borderColor: colors.terracotta, backgroundColor: colors.errorSoft, borderRadius: radius.lg, padding: spacing.lg }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.terracotta, alignItems: "center", justifyContent: "center" }}>
          <AlertOctagon size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T testID="decoder-publish-block-title" style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.primary }}>We can&apos;t publish a trustworthy summary of this statement yet</T>
          <T variant="small" style={{ marginTop: 6, color: colors.text, lineHeight: 20 }}>{reason}</T>
        </View>
      </View>
      {rows.length > 0 ? (
        <View testID="decoder-publish-block-items" style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {rows.map((it: any, i: number) => {
            const headline = it.headline || it.title;
            const evidence = Array.isArray(it.evidence) ? it.evidence.filter((e: any) => typeof e === "string" && e.trim()) : [];
            const canDraft = runDraft && blockers.length > 0;
            return (
              <View key={i} testID={`decoder-publish-block-item-${i}`} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.terracotta + "55", borderRadius: radius.md, padding: spacing.md }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <AlertTriangle size={16} color={colors.terracotta} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{cleanTitle(headline)}</T>
                    {it.detail ? <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>{plainBody(it.detail, 300)}</T> : null}
                    {evidence.length > 0 ? (
                      <View testID={`decoder-publish-block-evidence-${i}`} style={{ marginTop: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <FileText size={12} color={colors.muted} />
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>FROM YOUR STATEMENT</T>
                        </View>
                        {evidence.map((e: string, j: number) => <T key={j} style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text, lineHeight: 18 }}>{e}</T>)}
                      </View>
                    ) : null}
                    {canDraft ? (
                      <Pressable testID={`decoder-publish-block-email-${i}`} onPress={() => runDraft!(it, i)} disabled={draftKey === i}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, opacity: draftKey === i ? 0.6 : 1 }}>
                        <PenLine size={14} color="#fff" />
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: "#fff" }}>{draftKey === i ? "Starting email…" : "Email my provider about this"}</T>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (message ? (
        <T testID="decoder-publish-block-message" variant="small" style={{ marginTop: spacing.md, color: colors.text, lineHeight: 20 }}>{message}</T>
      ) : null)}
      <T variant="small" style={{ marginTop: spacing.md, color: colors.muted, lineHeight: 18, fontSize: 12 }}>The full checks are listed below. Once the provider corrects these figures or confirms them, re-run the statement and we&apos;ll produce the complete plain-English breakdown.</T>
    </View>
  );
}

function LowConfidenceBanner({ confidence }: { confidence?: number }) {
  const { colors } = useTheme();
  const pct = typeof confidence === "number" ? Math.round(confidence * 100) : null;
  return (
    <View testID="decoder-low-confidence-banner" style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: spacing.md }}>
      <Info size={16} color={colors.gold} style={{ marginTop: 2 }} />
      <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>
        <T style={{ fontFamily: fonts.bodySemi }}>Some figures were hard to read. </T>
        Parts of this statement decoded with low confidence{pct != null ? ` (around ${pct}%)` : ""}, so please double-check the amounts against your original statement.
      </T>
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
