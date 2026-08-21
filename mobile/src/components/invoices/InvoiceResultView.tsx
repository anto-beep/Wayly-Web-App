// Mobile Invoice Checker result view — exact-match port of the web
// components/invoices/InvoiceResultView.jsx + the result composition in
// pages/tools/InvoiceCheckerTool.jsx. Same sections, same wording, same
// arithmetic, same check codes and refund figures. No mobile-invented labels.
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, Receipt, Building2, Calendar, Hash, HelpCircle, Sparkles, ChevronDown, ChevronUp, Shield, ShieldAlert, Download, FileText, PenLine } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";
import { downloadAndShare } from "@/src/lib/download";

function aud(n: any): string {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function auDate(v: any, long = false): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-AU", long ? { day: "numeric", month: "short", year: "numeric" } : undefined);
}

const SHAPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  combined: "Combined statement + invoice",
  combined_unsplit: "Combined document",
  statement: "Statement",
  remittance: "Remittance advice",
  receipt: "Receipt",
};

const CHECK_TITLES: Record<string, string> = {
  C1: "Clinical care contribution should be nil",
  C2: "Personal care contribution after 1 October 2026 should be nil",
  C3: "Rate looks asymmetric between weekday and weekend",
  C4: "Care management or prohibited fees",
  C5: "Charged after the service was delivered",
  C6: "Line arithmetic error (quantity × rate does not match total)",
  C7: "Invoice does not match statement side",
  C8: "GST charged on a GST-free service",
  C9: "Adjustment or refund line",
  C10: "Lifetime cap indicative check",
  C11: "Duplicate line",
  C12: "Rate exceeds published price",
};
const titleForCheck = (ref: any) => CHECK_TITLES[String(ref).toUpperCase()] || `Check ${ref}`;

function findingImpact(f: any): number {
  return Number(
    f?.financial_impact?.amount
      ?? f?.observed?.overcharge_amount
      ?? f?.observed?.refund_amount
      ?? f?.observed?.excess_amount
      ?? f?.observed?.difference
      ?? f?.observed?.gst_amount
      ?? f?.observed?.contribution_amount
      ?? 0
  );
}
function sumRefund(findings: any[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const f of findings || []) {
    const impact = findingImpact(f);
    if (!isFinite(impact) || impact <= 0) continue;
    const ids = (f?.line_ids || f?.affected_line_ids || []).slice().sort().join("|");
    const key = ids ? `${f?.check_id || ""}::${ids}` : `raw::${Math.random()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += impact;
  }
  return total;
}

const SEVERITY_ORDER = ["blocker", "critical", "high", "medium", "low", "info"];
function severityKey(f: any): string {
  const t = Number(f?.tier);
  if (isFinite(t) && t > 0) {
    if (t === 1) return "critical";
    if (t === 2) return "high";
    if (t === 3) return "medium";
    if (t === 4) return "low";
    return "info";
  }
  const s = String(f?.severity || f?.priority || "medium").toLowerCase();
  if (SEVERITY_ORDER.includes(s)) return s;
  if (s.includes("block") || s.includes("critical")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("low")) return "low";
  if (s.includes("info") || s.includes("watch")) return "info";
  return "medium";
}

const VERDICT_META: Record<string, { heading: string; body: string; icon: any; tone: (c: any) => string }> = {
  all_clear: { heading: "Looks all clear", body: "We checked this invoice against the current Support at Home rules and could not find anything worth raising.", icon: CheckCircle2, tone: (c) => c.sage },
  items_to_note: { heading: "A few items to note", body: "Nothing needs urgent action, but there are one or two informational items worth reading.", icon: Info, tone: (c) => c.gold },
  questions_to_raise: { heading: "Some questions to raise", body: "We found lines worth asking your provider about before you pay.", icon: HelpCircle, tone: (c) => c.gold },
  check_before_paying: { heading: "Check before you pay", body: "We found something that may breach the Support at Home rules. Please raise these with your provider before paying.", icon: AlertTriangle, tone: (c) => c.terracotta },
};

function BannerTile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: "47%" }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: "rgba(255,255,255,0.7)" }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.mono, fontSize: 20, color: gold ? colors.gold : "#fff", marginTop: 2 }}>{value}</T>
    </View>
  );
}

export function InvoiceResultBanner({ result }: { result: any }) {
  const { colors } = useTheme();
  const rec = result?.reconciliation || {};
  const findings = rec.findings || [];
  const lines = rec.lines || [];
  const invoiceTotal = Number(rec.invoice_total ?? result?.invoice_total ?? 0);
  const refundOwed = sumRefund(findings);
  const disputed = new Set(findings.flatMap((f: any) => f?.line_ids || f?.affected_line_ids || (f?.line_number ? [f.line_number] : [])));
  const netPayable = Math.max(0, invoiceTotal - refundOwed);
  const metaBits = [
    lines.length ? `${lines.length} line item${lines.length === 1 ? "" : "s"}` : null,
    disputed.size ? `${disputed.size} disputed` : null,
    result?.provider_abn ? `ABN ${result.provider_abn}` : null,
    result?.due_date ? `Due ${auDate(result.due_date)}` : null,
  ].filter(Boolean) as string[];
  return (
    <View testID="inv1-summary-banner" style={[styles.banner, { backgroundColor: colors.primary }]}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.85)" }}>
        {[result?.invoice_date ? auDate(result.invoice_date, true) : "Invoice", result?.provider_name, result?.document_shape && result.document_shape !== "invoice" ? result.document_shape : null].filter(Boolean).join(" · ")}
      </T>
      <View style={styles.tileRow}>
        <BannerTile label="Amount billed" value={aud(invoiceTotal)} />
        <BannerTile label="Potential refund" value={aud(refundOwed)} gold />
      </View>
      <View style={styles.tileRow}>
        <BannerTile label="Net payable" value={aud(netPayable)} />
        <BannerTile label="Issues" value={String(findings.length)} />
      </View>
      {metaBits.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)", marginTop: spacing.sm, paddingTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: 14 }} testID="inv1-summary-meta">
          {metaBits.map((b, i) => <T key={i} style={{ fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{b}</T>)}
        </View>
      ) : null}
    </View>
  );
}

export function InvoiceMetadataStrip({ result }: { result: any }) {
  const { colors } = useTheme();
  const items = [
    { Icon: Building2, label: "Provider", value: result?.provider_name },
    { Icon: Calendar, label: "Invoice date", value: auDate(result?.invoice_date, true) },
    { Icon: Calendar, label: "Due date", value: auDate(result?.due_date, true) },
    { Icon: Hash, label: "Invoice #", value: result?.invoice_number || result?.reconciliation?.invoice_number },
  ].filter((x) => x.value);
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }} testID="inv1-meta-strip">
      {items.map((it, i) => (
        <View key={i} style={{ width: "47%", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <it.Icon size={11} color={colors.muted} />
            <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>{it.label.toUpperCase()}</T>
          </View>
          <T style={{ fontFamily: fonts.body, fontSize: 14, color: colors.text, marginTop: 3 }} numberOfLines={1}>{it.value}</T>
        </View>
      ))}
    </View>
  );
}

export function VerdictBanner({ verdict, findings = [], lineCount = 0 }: { verdict: string; findings?: any[]; lineCount?: number }) {
  const { colors } = useTheme();
  const meta = VERDICT_META[verdict] || VERDICT_META.all_clear;
  const VIcon = meta.icon;
  const tone = meta.tone(colors);
  const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  findings.forEach((f) => { if (tierCounts[f.tier] !== undefined) tierCounts[f.tier] += 1; });
  return (
    <Card testID={`inv1-verdict-${verdict}`} style={{ borderColor: tone, borderWidth: 1.5 }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <VIcon size={28} color={tone} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.text }}>{meta.heading}</T>
          <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>{meta.body}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm }}>
            <View style={[styles.pill, { backgroundColor: colors.surface2 }]}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted }}>{lineCount} line{lineCount === 1 ? "" : "s"} read</T></View>
            {[4, 3, 2, 1].map((t) => tierCounts[t] > 0 ? (
              <View key={t} testID={`inv1-tier-count-${t}`} style={[styles.pill, { backgroundColor: colors.surface2 }]}><T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted }}>{tierCounts[t]} Tier {t}</T></View>
            ) : null)}
          </View>
        </View>
      </View>
    </Card>
  );
}

// Collapse the six raw severities into the three plain-English bands the
// user asked for (mirrors the Statement Decoder): High / Medium / Low.
const BANDS = ["high", "medium", "low"] as const;
type Band = (typeof BANDS)[number];
const BAND_LABEL: Record<Band, string> = { high: "High priority", medium: "Medium", low: "Low" };
function bandOf(f: any): Band {
  const s = severityKey(f);
  if (s === "blocker" || s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}
function bandStyle(band: Band, colors: any): { pill: string; Icon: any } {
  if (band === "high") return { pill: colors.terracotta, Icon: AlertOctagon };
  if (band === "medium") return { pill: colors.gold, Icon: ShieldAlert };
  return { pill: colors.sage, Icon: Shield };
}

const CATEGORY_LABEL: Record<string, string> = {
  clinical_care: "Clinical care", personal_care: "Personal care", everyday_living: "Everyday living",
  care_management: "Care management", assistive_technology: "Assistive technology",
  home_modifications: "Home modifications", nursing: "Nursing", allied_health: "Allied health",
  transport: "Transport", unknown: "Other",
};
const catLabel = (c: any) => (c ? CATEGORY_LABEL[String(c)] || String(c).replace(/_/g, " ") : "");

function IssueCard({ f, idx, band, onDraftLetter }: { f: any; idx: number; band: Band; onDraftLetter?: (i: number) => void }) {
  const { colors } = useTheme();
  const bs = bandStyle(band, colors);
  const impact = findingImpact(f);
  const ref = f?.check_id || f?.rule_id || f?.code || `#${idx + 1}`;
  const lineIds = f?.line_ids?.length ? f.line_ids : (f?.affected_line_ids || (f?.line_number ? [f.line_number] : []));
  const lineHints = lineIds && lineIds.length
    ? (typeof lineIds[0] === "number" ? `Line ${lineIds.join(", ")}` : `Line ${lineIds.map((x: any) => String(x).slice(0, 8)).join(", ")}`)
    : null;
  const title = f?.title || f?.headline || f?.label || titleForCheck(ref);
  const description = f?.description || f?.narrative || null;
  const action = f?.recommended_action || f?.suggested_question || f?.escalation || null;
  return (
    <View testID={`inv1-issue-${idx}`} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: bs.pill, alignItems: "center", justifyContent: "center" }}>
          <bs.Icon size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <View style={{ backgroundColor: bs.pill, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.4, color: "#fff" }}>{BAND_LABEL[band].toUpperCase()}</T>
            </View>
            <T style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.muted }}>{String(ref)}</T>
            {lineHints ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{lineHints}</T> : null}
          </View>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, marginTop: 6 }}>{sanitizeAI(title)}</T>
          {description ? <T variant="small" style={{ marginTop: 3, lineHeight: 19 }}>{sanitizeAI(description)}</T> : null}
          {action ? (
            <View testID={`inv1-issue-action-${idx}`} style={{ marginTop: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 }}>
              <T style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text }}><T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>What to do: </T>{sanitizeAI(action)}</T>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
            {impact > 0 ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Potential refund: {aud(impact)}</T> : null}
            {onDraftLetter ? (
              <Pressable testID={`inv1-issue-letter-${idx}`} onPress={() => onDraftLetter(idx)} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <PenLine size={13} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Draft letter</T>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function SeverityGroup({ band, entries, onDraftLetter }: { band: Band; entries: { f: any; i: number }[]; onDraftLetter?: (i: number) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(true);
  const bs = bandStyle(band, colors);
  return (
    <View testID={`inv1-severity-group-${band}`} style={{ marginTop: spacing.sm }}>
      <Pressable testID={`inv1-severity-toggle-${band}`} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bs.pill, alignItems: "center", justifyContent: "center" }}>
            <bs.Icon size={13} color="#fff" />
          </View>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{BAND_LABEL[band]}</T>
          <T variant="small" style={{ color: colors.muted }}>({entries.length})</T>
        </View>
        {open ? <ChevronUp size={16} color={colors.muted} /> : <ChevronDown size={16} color={colors.muted} />}
      </Pressable>
      {open ? (
        <View testID={`inv1-severity-items-${band}`} style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {entries.map(({ f, i }) => <IssueCard key={f.id || i} f={f} idx={i} band={band} onDraftLetter={onDraftLetter} />)}
        </View>
      ) : null}
    </View>
  );
}

export function InvoiceIssueRegister({ findings, onDraftLetter }: { findings: any[]; onDraftLetter?: (i: number) => void }) {
  const { colors } = useTheme();
  if (!findings || findings.length === 0) {
    return (
      <Card testID="inv1-no-findings" style={{ borderStyle: "dashed", borderWidth: 2, borderColor: colors.sage, backgroundColor: colors.sageSoft, alignItems: "center" }}>
        <CheckCircle2 size={34} color={colors.sage} />
        <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 8 }}>Nothing worth raising</T>
        <T variant="small" style={{ textAlign: "center", marginTop: 4 }}>Every check passed on this invoice. See the charges below for the full list of what we looked at.</T>
      </Card>
    );
  }
  const withIdx = findings.map((f, i) => ({ f, i }));
  const bandGroups = BANDS
    .map((band) => ({ band, entries: withIdx.filter(({ f }) => bandOf(f) === band) }))
    .filter((g) => g.entries.length > 0);
  return (
    <View testID="inv1-issue-register" style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Receipt size={18} color={colors.primary} />
          <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text }}>Issue Register</T>
        </View>
        <T variant="small" style={{ color: colors.muted }}>{findings.length} total</T>
      </View>
      {bandGroups.map((g) => (
        <SeverityGroup key={g.band} band={g.band} entries={g.entries} onDraftLetter={onDraftLetter} />
      ))}
    </View>
  );
}

export function InvoiceChargesTable({ result }: { result: any }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const rec = result?.reconciliation || {};
  const lines: any[] = rec.lines || [];
  if (lines.length === 0) return null;
  const disputed = new Set((rec.findings || []).flatMap((f: any) => f?.line_ids || f?.affected_line_ids || []));
  return (
    <View testID="inv1-charges">
      <Pressable testID="inv1-charges-toggle" onPress={() => setOpen((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {open ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>{open ? "Hide" : "Show"} what&apos;s been charged ({lines.length} line{lines.length === 1 ? "" : "s"})</T>
      </Pressable>
      {open ? (
        <View testID="inv1-charges-table" style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          {lines.map((ln, i) => {
            const isDisputed = ln.line_id && disputed.has(ln.line_id);
            return (
              <View key={ln.line_id || i} style={{ borderWidth: 1, borderColor: isDisputed ? colors.terracotta : colors.border, backgroundColor: isDisputed ? colors.errorSoft : colors.surface, borderRadius: radius.md, padding: spacing.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, flex: 1 }}>{ln.service_type || String(ln.raw_text || "").slice(0, 40) || "Service"}</T>
                  <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{ln.gross_cost != null ? aud(ln.gross_cost) : "—"}</T>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                  {ln.service_date ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{auDate(ln.service_date)}</T> : null}
                  {ln.service_category ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{catLabel(ln.service_category)}</T> : null}
                  {ln.units_or_hours != null ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>{ln.units_or_hours} x {ln.unit_price != null ? aud(ln.unit_price) : "—"}</T> : null}
                  {ln.gst_amount != null ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>GST {aud(ln.gst_amount)}</T> : null}
                  {ln.contribution_amount != null ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>You: {aud(ln.contribution_amount)}</T> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function InvoiceDownloadBar({ invoiceId }: { invoiceId?: string }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  if (!invoiceId) return null;
  const go = async (kind: "original" | "report" | "csv") => {
    setBusy(kind);
    try {
      if (kind === "csv") {
        await downloadAndShare(`/invoices/${invoiceId}/export.csv`, "Wayly-Invoice-Check.csv");
      } else {
        await downloadAndShare(`/invoices/${invoiceId}/download?kind=${kind}`, kind === "report" ? "Wayly-Invoice-Report.pdf" : "invoice.pdf");
      }
    } catch { /* surfaced by share sheet failure; keep quiet */ }
    finally { setBusy(null); }
  };
  const btn = (label: string, kind: "original" | "report" | "csv", Icon: any, primary?: boolean) => (
    <Pressable
      testID={`inv1-download-${kind === "report" ? "pdf" : kind}-btn`}
      onPress={() => go(kind)}
      disabled={busy === kind}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: primary ? colors.primary : colors.surface, borderWidth: primary ? 0 : 1, borderColor: colors.border, opacity: busy === kind ? 0.5 : 1 }}
    >
      <Icon size={14} color={primary ? "#fff" : colors.text} />
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: primary ? "#fff" : colors.text }}>{label}</T>
    </Pressable>
  );
  return (
    <View testID="inv1-download-bar" style={{ backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
      <T variant="small" style={{ color: colors.muted }}>Save or view this checked invoice.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {btn("Original", "original", FileText)}
        {btn("CSV", "csv", Download)}
        {btn("PDF report", "report", Download, true)}
      </View>
    </View>
  );
}

export function WaylySummaryCard({ summary }: { summary?: string }) {
  const { colors } = useTheme();
  if (!summary) return null;
  return (
    <Card testID="inv1-summary">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={15} color={colors.primary} />
        </View>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 0.3, color: colors.primary }}>Wayly Summary</T>
      </View>
      <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: colors.text }}>{sanitizeAI(summary)}</T>
    </Card>
  );
}

export function InvoiceMetaCard({ result }: { result: any }) {
  const { colors } = useTheme();
  const abn = result?.provider_abn ? String(result.provider_abn).replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4") : null;
  const rows: [string, any][] = [
    ["Provider", result?.provider_name],
    ["ABN", abn],
    ["Invoice date", auDate(result?.invoice_date) || result?.invoice_date],
    ["Due date", auDate(result?.due_date) || result?.due_date],
    ["Document shape", result?.document_shape ? (SHAPE_LABEL[result.document_shape] || result.document_shape) : null],
  ].filter(([, v]) => Boolean(v));
  if (rows.length === 0) return null;
  return (
    <Card testID="inv1-meta-card">
      <T variant="label" style={{ color: colors.muted, marginBottom: spacing.sm }}>INVOICE DETAILS</T>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: spacing.md }}>
          <T variant="small" style={{ color: colors.muted }}>{label}</T>
          <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text, flex: 1, textAlign: "right" }}>{String(value)}</T>
        </View>
      ))}
    </Card>
  );
}

export default function InvoiceResultView({ result, onDraftLetter }: { result: any; onDraftLetter?: (i: number) => void }) {
  const rec = result?.reconciliation || {};
  const invoiceId = result?.invoice_id || result?.id;
  return (
    <View testID="inv1-result" style={{ gap: spacing.md }}>
      <InvoiceResultBanner result={result} />
      <InvoiceMetadataStrip result={result} />
      <InvoiceDownloadBar invoiceId={invoiceId} />
      <VerdictBanner verdict={rec.overall_verdict || "all_clear"} findings={rec.findings || []} lineCount={(rec.lines || []).length} />
      <WaylySummaryCard summary={rec.summary_md} />
      <InvoiceMetaCard result={result} />
      <InvoiceIssueRegister findings={rec.findings || []} onDraftLetter={onDraftLetter} />
      <InvoiceChargesTable result={result} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  tileRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
