/**
 * Report detail (mobile) — in-app parity with the web ReportPreview in
 * Reports.jsx. Fetches GET /api/reports/{id}/data and renders per-type
 * layouts (summary, stat grids, tables) plus a Download PDF action.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Download, FileBarChart } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate, formatDateTime, money } from "@/src/utils/format";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

// ------------------------------- primitives -------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <T variant="h3" style={{ marginBottom: spacing.sm }}>{title}</T>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <T variant="small" style={{ fontStyle: "italic" }}>{children}</T>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 3 }}>
      <T variant="label" style={{ color: undefined }}>{label}:</T>
      <T variant="small" style={{ flex: 1 }}>{value}</T>
    </View>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>{label}</T>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 2, color: tone || colors.text }}>{String(value)}</T>
      {sub ? <T variant="small" style={{ fontSize: 11, marginTop: 2 }}>{sub}</T> : null}
    </View>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>{children}</View>;
}

const TRAFFIC: Record<string, "success" | "alert" | "error"> = { green: "success", amber: "alert", red: "error" };

function Bar({ pct, traffic }: { pct?: number; traffic?: string }) {
  const { colors } = useTheme();
  const c = traffic === "green" ? colors.success : traffic === "amber" ? colors.alert : traffic === "red" ? colors.terracotta : colors.primary;
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surface2, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, pct || 0)}%`, height: "100%", backgroundColor: c }} />
    </View>
  );
}

function SevBadge({ sev }: { sev?: string }) {
  const tone = sev === "HIGH" ? "error" : sev === "MEDIUM" ? "alert" : "neutral";
  return <Badge label={sev || "LOW"} tone={tone as any} />;
}

// Horizontally scrollable table. `head` = string[]; `rows` = cell[][] where
// a cell is a string or a React node.
function Table({ head, rows, foot, empty }: { head: string[]; rows: any[][]; foot?: any[]; empty?: string }) {
  const { colors } = useTheme();
  if (!rows || rows.length === 0) return empty ? <Empty>{empty}</Empty> : null;
  const colW = 130;
  const renderCell = (cell: any, key: string, w: number) =>
    typeof cell === "string" || typeof cell === "number"
      ? <T key={key} variant="small" style={{ width: w, paddingRight: 8 }}>{String(cell)}</T>
      : <View key={key} style={{ width: w, paddingRight: 8 }}>{cell}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6 }}>
          {head.map((h, i) => (
            <T key={i} style={{ width: colW, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.3, color: colors.muted, textTransform: "uppercase", paddingRight: 8 }}>{h}</T>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {row.map((cell, j) => renderCell(cell, `${i}-${j}`, colW))}
          </View>
        ))}
        {foot ? (
          <View style={{ flexDirection: "row", paddingVertical: 8 }}>
            {foot.map((cell, j) => (
              <T key={j} style={{ width: colW, fontFamily: fonts.bodySemi, fontSize: 13, paddingRight: 8 }}>{String(cell)}</T>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ------------------------------- per-type views -------------------------------

function HouseholdSummaryView({ data }: any) {
  const q = data.quarter || {};
  const stats = data.stats || {};
  const { colors } = useTheme();
  return (
    <>
      <StatGrid>
        <StatCard label={`Budget · ${q.label || ""}`} value={`${q.pct ?? 0}%`} sub={`${money(q.spent)} of ${money(q.budget)}`} />
        <StatCard label="Services this quarter" value={stats.services_count ?? 0} />
        <StatCard label="Anomalies flagged" value={stats.anomalies_count ?? 0} sub={stats.anomalies_severity} />
        <StatCard label="Open concerns" value={stats.open_concerns ?? 0} tone={stats.open_concerns ? colors.terracotta : undefined} />
      </StatGrid>
      <Section title="Active services">
        <Table head={["Service", "Worker", "Stream", "Rate"]} rows={(data.active_services || []).map((s: any) => [s.service, s.worker || "", s.stream || "", s.rate ? money(s.rate) : ""])} empty="No active services recorded." />
      </Section>
      <Section title="Care team">
        <Table head={["Name", "Role", "Phone"]} rows={(data.care_team || []).map((m: any) => [m.name, m.role || "", m.phone || ""])} empty="No care team members recorded." />
      </Section>
      <Section title="Upcoming">
        <Line label="Next scheduled visit" value={data.next_visit ? `${formatDateTime(data.next_visit.starts_at)} · ${data.next_visit.service || ""} · ${data.next_visit.worker || ""}` : "No upcoming visits."} />
        <Line label="Next AT-HM expiry" value={data.next_athm ? `${data.next_athm.item_description} · expires ${formatDate(data.next_athm.expires_at)}` : "No AT-HM commitments."} />
      </Section>
      <Section title="Recent concerns">
        <Table head={["Date", "Type", "Headline", "Status"]} rows={(data.recent_concerns || []).map((c: any) => [formatDate(c.created_at), c.type || "", c.title || c.headline || "", c.status || "open"])} empty="No concerns recorded." />
      </Section>
      <Section title="Hospitalisation (last 12 months)">
        <Table head={["Admitted", "Discharged", "Hospital", "Duration", "RCP"]} rows={(data.hospitalisations || []).map((h: any) => [formatDate(h.admitted_at), h.discharged_at ? formatDate(h.discharged_at) : "", h.hospital_name || "", h.duration_days ? `${h.duration_days} d` : "", h.rcp_requested ? "yes" : "no"])} empty="No hospitalisations recorded in the last 12 months." />
      </Section>
    </>
  );
}

function QuarterlyBudgetView({ data }: any) {
  const ov = data.overview || {};
  const ro = data.rollover || {};
  const { colors } = useTheme();
  return (
    <>
      <Section title="Budget overview">
        <Bar pct={ov.pct} traffic={ov.traffic} />
        <T variant="small" style={{ marginTop: 8 }}>{ov.pct ?? 0}% used · {money(ov.spent)} of {money(ov.budget)} · {money(ov.remaining)} remaining</T>
        {ro.above_cap > 0 ? (
          <View style={{ marginTop: 8, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.goldSoft }}>
            <T variant="small">Rollover alert: about {money(ro.projected_unspent)} may be unspent at quarter end. Only {money(ro.rollover_cap)} rolls over, {money(ro.above_cap)} above the cap may be forfeited.</T>
          </View>
        ) : null}
      </Section>
      <Section title="Spending by stream">
        {(data.streams || []).map((s: any) => (
          <View key={s.name} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{s.name}</T>
              <T variant="small">{money(s.spent)} of {money(s.cap)} ({s.pct}%)</T>
            </View>
            <View style={{ marginTop: 4 }}><Bar pct={s.pct} traffic={s.traffic} /></View>
            <T variant="small" style={{ fontSize: 11, marginTop: 2 }}>Your contribution {money(s.contribution)} · Government paid {money(s.government)}</T>
          </View>
        ))}
      </Section>
      <Section title="Care management">
        <Bar pct={data.care_management?.pct} traffic={data.care_management?.traffic} />
        <T variant="small" style={{ marginTop: 8 }}>{data.care_management?.pct ?? 0}% used · {money(data.care_management?.used)} of {money(data.care_management?.cap)}</T>
      </Section>
      <Section title="Anomalies this quarter">
        <Table head={["Severity", "Headline", "$ impact"]} rows={(data.anomalies || []).map((a: any) => [<SevBadge key={a.headline} sev={a.severity} />, a.headline, money(a.dollar_impact || 0)])} empty="No anomalies flagged this quarter." />
      </Section>
    </>
  );
}

function AnnualFinancialView({ data }: any) {
  const s = data.stats || {};
  return (
    <>
      <StatGrid>
        <StatCard label="Annual entitlement" value={money(s.annual_entitlement)} />
        <StatCard label="Total gross" value={money(s.gross)} />
        <StatCard label="Your contribution" value={money(s.contribution)} />
        <StatCard label="Government paid" value={money(s.government)} />
        <StatCard label="Lifetime cap used" value={money(s.lifetime_cap_used)} sub={`${s.lifetime_cap_pct ?? 0}%`} />
        <StatCard label="Lifetime cap remaining" value={money(s.lifetime_cap_remaining)} />
      </StatGrid>
      <Section title="Contributions by stream">
        <Table head={["Stream", "Annual total", "Your contribution", "Government"]} rows={(data.by_stream || []).map((st: any) => [st.name, money(st.total), money(st.contribution), money(st.government)])} empty="No stream data." />
      </Section>
    </>
  );
}

function AnomalySavingsView({ data }: any) {
  const hero = data.hero || {};
  const sub = data.subscription || {};
  const { colors } = useTheme();
  return (
    <>
      <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
        <T variant="label" style={{ color: colors.gold }}>IN POTENTIAL BILLING ERRORS IDENTIFIED</T>
        <T style={{ fontFamily: fonts.heading, fontSize: 32, marginTop: 4 }}>{money(hero.total_value)}</T>
        <T variant="small" style={{ marginTop: 2 }}>Across {hero.statements_count} statements · {hero.anomalies_count} flagged · {hero.resolved_count} resolved</T>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard label="Resolved" value={money(hero.resolved_value)} />
          <StatCard label="Outstanding" value={money(hero.outstanding_value)} />
        </View>
      </Card>
      <Section title="Anomalies by type">
        <Table head={["Type", "Count", "Total", "Resolved", "Outstanding"]} rows={(data.by_type || []).map((t: any) => [t.type, t.count, money(t.value), money(t.resolved), money(t.outstanding)])} empty="No anomalies have been flagged in this period. Keep decoding your statements, each one is another chance to catch errors." />
      </Section>
      <Section title="Timeline of anomalies">
        <Table head={["Date", "Severity", "Headline", "Value", "Status"]} rows={(data.timeline || []).map((t: any) => [t.date ? formatDate(t.date) : "", <SevBadge key={t.headline + t.date} sev={t.severity} />, t.headline, money(t.value), t.status])} empty="No anomalies to display." />
      </Section>
      <Section title="Subscription value">
        <T variant="small">Wayly subscription cost over this period: {money(sub.total)} ({sub.plan})</T>
        <T variant="small" style={{ marginTop: 2 }}>Anomalies identified: {money(hero.total_value)}</T>
        <T variant="small" style={{ marginTop: 2 }}>Anomalies resolved: {money(hero.resolved_value)}</T>
        {hero.resolved_value > sub.total ? (
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: 6 }}>Wayly has more than paid for itself · {sub.roi}x return</T>
        ) : (
          <T variant="small" style={{ marginTop: 6 }}>Keep decoding your monthly statements, each one is another chance to catch errors.</T>
        )}
      </Section>
    </>
  );
}

function ProviderPerformanceView({ data }: any) {
  const { colors } = useTheme();
  if (data.locked) {
    return <Section title="Provider Performance"><Empty>This report requires at least {data.statements_needed} decoded statements. You have {data.statements_available}. Keep decoding.</Empty></Section>;
  }
  return (
    <>
      <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.primary }}>
        <T variant="small"><T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Private. </T>This report is for your records only. It is not visible to your provider and will never be shared by Wayly.</T>
      </Card>
      <Card>
        <View style={{ alignItems: "center" }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 48, color: colors.gold }}>{data.grade}</T>
          <T variant="small">{data.grade_label}</T>
        </View>
      </Card>
      <StatGrid>
        <StatCard label="Visits delivered" value={`${data.delivery?.pct ?? 0}%`} sub={`${data.delivery?.delivered ?? 0} of ${data.delivery?.total ?? 0}`} />
        <StatCard label="Anomaly-free statements" value={`${data.billing?.anomaly_free_pct ?? 0}%`} sub={`${data.billing?.with_anomaly ?? 0} of ${data.billing?.statements_count ?? 0} had anomalies`} />
        <StatCard label="Correspondence responded" value={`${data.correspondence?.responded ?? 0} / ${data.correspondence?.total ?? 0}`} />
        <StatCard label="Avg anomaly $ / statement" value={money(data.billing?.avg_value)} />
      </StatGrid>
      <Section title="Billing accuracy">
        <Table head={["Statement", "Anomalies", "Total value", "Resolved"]} rows={(data.billing?.per_statement || []).map((r: any) => [r.statement, r.anomaly_count, money(r.value), `${r.resolved_count} of ${r.anomaly_count}`])} empty="No statements in scope." />
      </Section>
    </>
  );
}

function ComplaintDossierView({ data }: any) {
  const { colors } = useTheme();
  return (
    <>
      <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
        <Line label="Prepared for submission to" value={data.addressed_to || ""} />
        <Line label="Participant" value={`${data.participant?.first_name || ""} ${data.participant?.last_name || ""}${data.participant?.date_of_birth ? ` · DOB ${data.participant.date_of_birth}` : ""}`} />
        <Line label="Provider" value={data.household?.provider_name || ""} />
        <Line label="Period" value={`${data.date_range?.start || ""} to ${data.date_range?.end || ""}`} />
      </Card>
      <Section title="Concerns">
        <Table head={["Date", "Type", "Title", "Severity", "Status"]} rows={(data.concerns || []).map((c: any) => [formatDate(c.created_at), c.type || "", c.title || c.headline || "", c.severity || "", c.status || "open"])} empty="No concerns recorded in this period." />
      </Section>
      <Section title="Correspondence history">
        <Table head={["Date sent", "Type", "Recipient", "Response"]} rows={(data.correspondence || []).map((c: any) => [c.sent_at ? formatDate(c.sent_at) : "", c.type || "", c.recipient || "", c.response_received_at ? formatDate(c.response_received_at) : "No response"])} empty="No correspondence recorded." />
      </Section>
      <Section title="Billing anomaly evidence">
        <Table head={["Statement", "Type", "Severity", "$ impact", "Status"]} rows={(data.anomalies || []).map((a: any, i: number) => [a.statement || "", a.headline, <SevBadge key={i} sev={a.severity} />, money(a.dollar_impact || 0), a.status || "pending"])} empty="No HIGH or MEDIUM anomalies in this period." />
      </Section>
    </>
  );
}

function CareTimelineView({ data }: any) {
  const { colors } = useTheme();
  const dot = (c: string) => c === "navy" ? colors.primary : c === "gold" ? colors.gold : c === "red" ? colors.terracotta : colors.sage;
  return (
    <Section title="Care Timeline">
      {data.events?.length ? (
        <View style={{ gap: spacing.sm }}>
          {data.events.map((ev: any, i: number) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: dot(ev.color) }} />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{ev.date ? formatDate(ev.date) : ""} · {ev.headline}</T>
                {ev.detail ? <T variant="small" style={{ marginTop: 2 }}>{ev.detail}</T> : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Empty>No significant events recorded yet. Events appear here as you log hospitalisations, Care-Plan Changes, AT-HM installations, and concerns.</Empty>
      )}
    </Section>
  );
}

function StatementDigestView({ data }: any) {
  const t = data.totals || {};
  return (
    <>
      <StatGrid>
        <StatCard label="Statements" value={t.statements ?? 0} />
        <StatCard label="Total gross" value={money(t.gross)} />
        <StatCard label="Total contributions" value={money(t.contribution)} />
        <StatCard label="Anomalies" value={t.anomalies ?? 0} />
      </StatGrid>
      <Section title="Statements">
        <Table head={["Month", "Provider", "Gross", "Contribution", "Govt", "Anomalies"]} rows={(data.rows || []).map((r: any) => [r.period, r.provider, money(r.gross), money(r.contribution), money(r.government), `${r.anomaly_counts?.HIGH ? r.anomaly_counts.HIGH + " H " : ""}${r.anomaly_counts?.MEDIUM ? r.anomaly_counts.MEDIUM + " M " : ""}${r.anomaly_counts?.LOW ? r.anomaly_counts.LOW + " L" : ""}`.trim() || ""])} empty="No statements decoded yet in this period." />
      </Section>
    </>
  );
}

function ReportBody({ type, data }: { type: string; data: any }) {
  switch (type) {
    case "HOUSEHOLD_SUMMARY": return <HouseholdSummaryView data={data} />;
    case "QUARTERLY_BUDGET": return <QuarterlyBudgetView data={data} />;
    case "ANNUAL_FINANCIAL": return <AnnualFinancialView data={data} />;
    case "ANOMALY_SAVINGS": return <AnomalySavingsView data={data} />;
    case "PROVIDER_PERFORMANCE": return <ProviderPerformanceView data={data} />;
    case "COMPLAINT_DOSSIER": return <ComplaintDossierView data={data} />;
    case "CARE_TIMELINE": return <CareTimelineView data={data} />;
    case "STATEMENT_DIGEST": return <StatementDigestView data={data} />;
    default: return null;
  }
}

// ------------------------------- screen -------------------------------

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [report, setReport] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setError(true); setLoading(false); return; }
    setError(false);
    try {
      const res = await apiFetch<{ report: any; data: any }>(`/reports/${id}/data`);
      setReport(res.report);
      setData(res.data || {});
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await apiFetch<{ url?: string }>(`/reports/${id}/download`);
      if (res?.url) {
        const url = res.url.startsWith("http") ? res.url : `${SITE_BASE}${res.url}`;
        await WebBrowser.openBrowserAsync(url);
      }
    } catch { /* ignore */ }
    finally { setDownloading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Report"
        onBack={() => router.back()}
        right={report ? <Button label="Download" testID="report-detail-download" variant="secondary" icon={Download} loading={downloading} onPress={download} style={{ minHeight: 40, paddingHorizontal: 14 }} /> : undefined}
      />
      {loading ? (
        <Loading />
      ) : error || !report ? (
        <StatePanel testID="report-detail-error" icon={FileBarChart} title="Couldn't open this report" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} testID="report-detail">
          <View>
            <T style={{ fontFamily: fonts.heading, fontSize: 24 }}>{report.report_name}</T>
            <T variant="small" style={{ marginTop: 4 }}>
              Generated {formatDateTime(report.created_at)}
              {data?.participant ? ` · ${data.participant.first_name || ""} ${data.participant.last_name || ""}` : ""}
            </T>
          </View>
          {data?.exec_summary ? (
            <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }} testID="report-detail-summary">
              <T variant="h3" style={{ marginBottom: 6 }}>Summary</T>
              <T variant="small" style={{ lineHeight: 21 }}>{data.exec_summary}</T>
            </Card>
          ) : null}
          <ReportBody type={report.report_type} data={data} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flexGrow: 1, flexBasis: "46%", borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
