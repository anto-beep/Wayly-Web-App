import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Svg, { Polyline, Circle } from "react-native-svg";
import { TrendingUp, TrendingDown, Minus, PiggyBank, PartyPopper, X, AlertTriangle, Clock, Trash2, Shield } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const aud2 = (n: any) => `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: any) => { try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return String(iso || ""); } };

const MILESTONE_TIERS = [
  { threshold: 1000, label: "$1,000", copy: "$1,000 in tracked savings. That's a whole month of grocery runs, thanks to your diligence." },
  { threshold: 500, label: "$500", copy: "$500 saved by keeping an eye on prices. Real money, back in the family budget." },
  { threshold: 250, label: "$250", copy: "$250 saved so far. This is what active price-watching looks like." },
  { threshold: 100, label: "$100", copy: "Your first $100 saved. Small habits, meaningful money." },
];

function computeStats(rows: any[]) {
  const rates = rows.map((r) => Number(r.rate)).filter((n) => Number.isFinite(n));
  if (rates.length === 0) return null;
  const latest = rates[rates.length - 1];
  const previous = rates.length > 1 ? rates[rates.length - 2] : null;
  const highest = Math.max(...rates);
  const lowest = Math.min(...rates);
  const unit = rows[rows.length - 1]?.unit || rows[0]?.unit || "unit";
  const savingsVsHighest = highest - latest;
  let trendDirection: "up" | "down" | "flat" = "flat";
  if (previous !== null) trendDirection = latest < previous ? "down" : latest > previous ? "up" : "flat";
  return { latest, previous, highest, lowest, unit, savingsVsHighest, savingsVsPrevious: previous !== null ? previous - latest : 0, trendDirection };
}

export default function PriceHistory() {
  const { colors } = useTheme();
  const [checks, setChecks] = useState<any[] | null>(null);
  const [error, setError] = useState(false);
  const [milestones, setMilestones] = useState<any>(null);
  const [activeMilestone, setActiveMilestone] = useState<any>(null);
  const dismissedRef = useRef(false);

  const load = () => {
    setError(false);
    apiFetch<{ checks: any[] }>("/ppc/checks").then((r) => setChecks(r.checks || [])).catch(() => setError(true));
    apiFetch<any>("/ppc/milestones").then(setMilestones).catch(() => setMilestones({}));
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    if (!checks) return null;
    const m = new Map<string, any>();
    for (const c of checks) {
      const key = `${c.service}::${c.provider_normalised_name || ""}`;
      if (!m.has(key)) m.set(key, { key, service: c.service, provider_display_name: c.provider_display_name || "No provider entered", provider_normalised_name: c.provider_normalised_name || "", rows: [] });
      m.get(key).rows.push(c);
    }
    for (const g of m.values()) {
      g.rows.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      g.stats = computeStats(g.rows);
      g.increases = g.rows.reduce((n: number, _r: any, i: number) => (i > 0 && Number(g.rows[i].rate) > Number(g.rows[i - 1].rate) ? n + 1 : n), 0);
    }
    return Array.from(m.values()).sort((a, b) => a.service.localeCompare(b.service));
  }, [checks]);

  const snapshot = useMemo(() => {
    if (!groups || groups.length === 0) return null;
    let dropped = 0, rising = 0, flat = 0, totalSaved = 0;
    for (const g of groups) {
      const dir = g.stats?.trendDirection;
      if (dir === "down") dropped += 1; else if (dir === "up") rising += 1; else flat += 1;
      if (g.stats?.savingsVsHighest > 0) totalSaved += g.stats.savingsVsHighest;
    }
    return { total: groups.length, dropped, rising, flat, totalSaved };
  }, [groups]);

  useEffect(() => {
    if (!snapshot || !milestones || dismissedRef.current || activeMilestone) return;
    const totalSaved = snapshot.totalSaved || 0;
    const uncelebrated = MILESTONE_TIERS.find((t) => totalSaved >= t.threshold && !milestones[`crossed_${t.threshold}`]);
    if (uncelebrated) {
      setActiveMilestone(uncelebrated);
      apiFetch("/ppc/milestones/mark", { method: "POST", body: { threshold: uncelebrated.threshold } }).then(setMilestones).catch(() => {});
    }
  }, [snapshot, milestones, activeMilestone]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Your Price History" onBack={() => router.back()} />
      {checks === null && !error ? (
        <Loading label="Loading history…" />
      ) : error ? (
        <StatePanel testID="ppc-history-error" icon={Clock} title="Couldn't load your history" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {"Every rate you've saved, grouped by service and provider. We flag providers whose rates have moved more than twice in the past year, and show what you'd be saving compared to your prior rates."}
          </T>

          {activeMilestone ? (
            <Card testID="ppc-milestone-banner" style={{ borderColor: colors.sage }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <PartyPopper size={22} color={colors.sage} />
                <View style={{ flex: 1 }}>
                  <T testID="ppc-milestone-heading" style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text }}>You&apos;ve crossed {activeMilestone.label} saved</T>
                  <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>{activeMilestone.copy}</T>
                  <T variant="small" testID="ppc-milestone-total" style={{ color: colors.muted, marginTop: 6 }}>Estimated total tracked: {aud2(snapshot?.totalSaved || 0)}</T>
                </View>
                <Pressable testID="ppc-milestone-dismiss" hitSlop={8} onPress={() => { setActiveMilestone(null); dismissedRef.current = true; }}>
                  <X size={18} color={colors.muted} />
                </Pressable>
              </View>
            </Card>
          ) : null}

          {snapshot ? (
            <Card testID="ppc-history-snapshot">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <PiggyBank size={14} color={colors.muted} />
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>SAVINGS SNAPSHOT</T>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md }}>
                {[
                  { label: "Tracked", value: snapshot.total, tone: colors.text, id: "ppc-snap-total" },
                  { label: "Prices dropped", value: snapshot.dropped, tone: colors.sage, id: "ppc-snap-dropped" },
                  { label: "Prices rising", value: snapshot.rising, tone: colors.gold, id: "ppc-snap-rising" },
                  { label: "Steady", value: snapshot.flat, tone: colors.text, id: "ppc-snap-flat" },
                ].map((s) => (
                  <View key={s.label} style={{ width: "25%" }}>
                    <T testID={s.id} style={{ fontFamily: fonts.heading, fontSize: 26, color: s.tone }}>{s.value}</T>
                    <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{s.label}</T>
                  </View>
                ))}
              </View>
              {snapshot.totalSaved > 0 ? (
                <View testID="ppc-total-saved" style={{ marginTop: spacing.md, borderWidth: 1, borderColor: colors.sage, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.md }}>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>ESTIMATED SAVINGS TRACKED</T>
                  <T style={{ fontFamily: fonts.heading, fontSize: 24, color: colors.sage }}>{aud2(snapshot.totalSaved)}</T>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Sum of price drops caught across your providers. Units mix (per hour / km / visit) so treat this as an estimate.</T>
                </View>
              ) : null}
            </Card>
          ) : null}

          {groups && groups.length === 0 ? (
            <Card testID="ppc-history-empty" style={{ alignItems: "center" }}>
              <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>No saved checks yet</T>
              <T variant="small" style={{ textAlign: "center", color: colors.muted, marginTop: 6 }}>{"Head to the Price Checker and tap 'Save this result' after your first comparison, this page then builds up over time."}</T>
              <Button label="Open the Price Checker" testID="ppc-history-open-tool" onPress={() => router.replace("/tool/provider-price-checker")} style={{ marginTop: spacing.md }} />
            </Card>
          ) : null}

          {groups?.map((g) => (
            <HistoryGroup key={g.key} group={g} colors={colors} onChanged={load} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const SIGNAL_LABEL: Record<string, string> = {
  many_positive_signals: "Many Positive Signals",
  mixed_signals: "Mixed Signals",
  several_concerns: "Several Concerns",
  insufficient_data_for_summary: "Insufficient Data",
};

function HistoryGroup({ group, colors, onChanged }: any) {
  const s = group.stats;
  const flagged = group.increases > 2;
  const rates = group.rows.map((r: any) => Number(r.rate));
  const [quality, setQuality] = useState<any>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rowConfirm, setRowConfirm] = useState<any>(null); // {row, explanation, before, after}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const provider = group.provider_display_name;
    if (!provider || provider === "No provider entered") return;
    apiFetch<any>(`/ppc3/providers/${encodeURIComponent(provider)}/quality-profile`)
      .then((r) => setQuality(r?.profile?.composite_quality_summary || null))
      .catch(() => setQuality(null));
  }, [group.provider_display_name]);

  const signalTone = (sig: string) => sig === "many_positive_signals" ? colors.sage : sig === "several_concerns" ? colors.terracotta : sig === "mixed_signals" ? colors.gold : colors.muted;
  const signalBg = (sig: string) => sig === "many_positive_signals" ? colors.sageSoft : sig === "several_concerns" ? colors.errorSoft : sig === "mixed_signals" ? colors.goldSoft : colors.surface2;

  const deleteRow = async (row: any, confirm = false) => {
    setBusy(true); setErr("");
    try {
      const res = await apiFetch<any>(`/ppc/checks/${row.id}?confirm=${confirm}`, { method: "DELETE" });
      if (res?.deleted === false && res?.requires_confirmation) {
        setRowConfirm({ row, explanation: res.explanation, before: res.flag_before, after: res.flag_after });
        return;
      }
      setRowConfirm(null); onChanged?.();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Delete failed."); }
    finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    setBusy(true); setErr("");
    try {
      await apiFetch(`/ppc/checks/provider?service=${encodeURIComponent(group.service)}&provider=${encodeURIComponent(group.provider_display_name)}`, { method: "DELETE" });
      setBulkOpen(false); onChanged?.();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Bulk delete failed."); }
    finally { setBusy(false); }
  };

  return (
    <Card testID={`ppc-history-group-${String(group.service).toLowerCase().replace(/\s+/g, "-")}`} style={{ borderColor: flagged ? colors.gold : colors.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>{String(group.service).toUpperCase()}</T>
          <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>{group.provider_display_name}</T>
          <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>{group.rows.length} saved check{group.rows.length !== 1 ? "s" : ""}</T>
          {quality && quality.overall_signal ? (
            <Pressable
              testID={`ppc-quality-chip-${group.provider_normalised_name || "n-a"}`}
              onPress={() => router.push(`/provider-quality/${encodeURIComponent(group.provider_display_name)}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 6, borderWidth: 1, borderColor: signalTone(quality.overall_signal), backgroundColor: signalBg(quality.overall_signal), borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}
            >
              <Shield size={11} color={signalTone(quality.overall_signal)} />
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.3, color: signalTone(quality.overall_signal) }}>{SIGNAL_LABEL[quality.overall_signal] || "Quality"}</T>
            </Pressable>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
        {flagged ? (
          <View testID="ppc-history-flag" style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.goldSoft, borderColor: colors.gold, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <AlertTriangle size={12} color={colors.gold} />
            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.gold }}>{group.increases} increases in 12 months</T>
          </View>
        ) : null}
        <Pressable testID="ppc-history-bulk-delete" onPress={() => setBulkOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Trash2 size={13} color={colors.muted} />
          <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>Delete provider history</T>
        </Pressable>
        </View>
      </View>

      {s ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }} testID="ppc-history-savings-block">
          {s.highest > s.latest ? <Pill testID="ppc-savings-vs-highest" label="vs Highest ever" value={s.savingsVsHighest} unit={s.unit} colors={colors} /> : null}
          {s.previous !== null ? <Pill testID="ppc-savings-vs-previous" label="vs Last scan" value={s.savingsVsPrevious} unit={s.unit} colors={colors} /> : null}
          <View testID="ppc-savings-current" style={{ flexGrow: 1, minWidth: "45%", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 }}>
            <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>LATEST SAVED RATE</T>
            <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{aud2(s.latest)}<T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>/{s.unit}</T></T>
          </View>
        </View>
      ) : null}

      {rates.length > 1 ? <Sparkline rates={rates} colors={colors} /> : null}

      <View style={{ marginTop: spacing.sm }}>
        {[...group.rows].reverse().map((c: any, i: number) => (
          <View key={c.id || i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{aud2(c.rate)} <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>per {c.unit || "unit"}</T></T>
              <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{fmtDate(c.created_at)}{c.source_statement_id ? " · from decoded statement" : ""}</T>
            </View>
            <Pressable testID={`ppc-history-row-delete-${c.id}`} hitSlop={8} disabled={busy} onPress={() => deleteRow(c, false)} style={{ padding: 6 }}>
              <Trash2 size={15} color={colors.muted} />
            </Pressable>
          </View>
        ))}
      </View>
      {err ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="ppc-history-delete-error">{err}</T> : null}

      {/* Bulk delete confirm */}
      <Modal visible={bulkOpen} transparent animationType="fade" onRequestClose={() => setBulkOpen(false)}>
        <Pressable style={{ flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay }} onPress={() => setBulkOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }} onPress={(e) => e.stopPropagation()} testID="ppc-history-bulk-modal">
            <T style={{ fontFamily: fonts.heading, fontSize: 19, color: colors.text }}>Delete all history for this provider?</T>
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, lineHeight: 20 }}>{`This erases every saved check for ${group.provider_display_name} on ${group.service}. It also scrubs the anonymised rows from Wayly's provider aggregate. This cannot be undone.`}</T>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Button label="Cancel" variant="outline" testID="ppc-history-bulk-cancel" onPress={() => setBulkOpen(false)} style={{ flexGrow: 1 }} />
              <Button label="Delete history" testID="ppc-history-bulk-confirm" loading={busy} onPress={bulkDelete} style={{ flexGrow: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Row delete confirm (flag-reducing) */}
      <Modal visible={Boolean(rowConfirm)} transparent animationType="fade" onRequestClose={() => setRowConfirm(null)}>
        <Pressable style={{ flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay }} onPress={() => setRowConfirm(null)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }} onPress={(e) => e.stopPropagation()} testID="ppc-history-row-delete-confirm">
            <T style={{ fontFamily: fonts.heading, fontSize: 19, color: colors.text }}>Confirm delete</T>
            <T variant="small" style={{ color: colors.text, marginTop: spacing.sm, lineHeight: 20 }}>{rowConfirm?.explanation}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>{`Before: ${rowConfirm?.before ?? 0} increases counted. After: ${rowConfirm?.after ?? 0} increases.`}</T>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Button label="Keep it" variant="outline" testID="ppc-history-row-keep" onPress={() => setRowConfirm(null)} style={{ flexGrow: 1 }} />
              <Button label="Delete anyway" testID="ppc-history-row-delete-confirm-btn" loading={busy} onPress={() => deleteRow(rowConfirm.row, true)} style={{ flexGrow: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

function Pill({ label, value, unit, colors, testID }: any) {
  const positive = value > 0, negative = value < 0;
  const Icon = positive ? TrendingDown : negative ? TrendingUp : Minus;
  const tone = positive ? colors.sage : negative ? colors.gold : colors.muted;
  const bg = positive ? colors.sageSoft : negative ? colors.goldSoft : colors.surface2;
  return (
    <View testID={testID} style={{ flexGrow: 1, minWidth: "45%", flexDirection: "row", gap: 8, borderWidth: 1, borderColor: tone, backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 }}>
      <Icon size={15} color={tone} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>{label.toUpperCase()}</T>
        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: tone }}>{positive ? "Saved " : negative ? "Up " : "No change"}{positive || negative ? `${aud2(Math.abs(value))}/${unit}` : ""}</T>
      </View>
    </View>
  );
}

function Sparkline({ rates, colors }: { rates: number[]; colors: any }) {
  const w = 260, h = 44;
  const min = Math.min(...rates), max = Math.max(...rates);
  const span = Math.max(max - min, 1);
  const stepX = rates.length > 1 ? w / (rates.length - 1) : 0;
  const pts = rates.map((r, i) => `${(i * stepX).toFixed(1)},${(h - ((r - min) / span) * h).toFixed(1)}`).join(" ");
  return (
    <View style={{ marginTop: spacing.md }} testID="ppc-history-sparkline">
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <Polyline points={pts} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {rates.map((r, i) => (
          <Circle key={i} cx={(i * stepX).toFixed(1)} cy={(h - ((r - min) / span) * h).toFixed(1)} r={2.5} fill={colors.primary} />
        ))}
      </Svg>
    </View>
  );
}
