// Mobile mirror of web StatementInsightGraphics + InvoiceInsightGraphics.
// Glanceable SVG donut cards on solid brand panels (white text), matching the
// web "Where the money went" / "What we found" graphics. Segments are tappable
// (legend rows + donut) and call onOpenIssues so the user can jump to detail.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { ChevronRight } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const TEAL = "#0E4D52";
const CLAY = "#A5512B";
const SAGE = "#8FBF95";
const GOLD = "#F0B267";
const CORAL = "#F0857A";
const MINT = "#A8C7AB";

function aud0(n: any): string {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("en-AU")}`;
}

type Seg = { value: number; color: string };

function Donut({ segments, size = 132, stroke = 22, children }: { segments: Seg[]; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + (x.value > 0 ? x.value : 0), 0) || 1;
  let accum = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill as any}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
          {segments.map((seg, i) => {
            if (seg.value <= 0) return null;
            const dash = (seg.value / total) * circ;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={seg.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-accum}
              />
            );
            accum += dash;
            return el;
          })}
        </G>
      </Svg>
      <View style={{ alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

function LegendRow({ color, label, value, onPress, chevron }: { color: string; label: string; value: string; onPress?: () => void; chevron?: boolean }) {
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={styles.legendRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <T style={{ fontFamily: fonts.body, fontSize: 13, color: "#fff" }}>{label}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" }}>{value}</T>
        {chevron ? <ChevronRight size={14} color="rgba(255,255,255,0.7)" /> : null}
      </View>
    </Wrap>
  );
}

function Panel({ bg, eyebrow, hint, children }: { bg: string; eyebrow: string; hint?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.panel, { backgroundColor: bg }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.7)" }}>{eyebrow.toUpperCase()}</T>
        {hint ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.6, color: "rgba(255,255,255,0.6)" }}>TAP TO OPEN</T>
            <ChevronRight size={11} color="rgba(255,255,255,0.6)" />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>{children}</View>
    </View>
  );
}

// Statement: government vs you (money) + severity of findings.
export function StatementInsightGraphics({ govt, you, counts, onOpenIssues }: { govt: number; you: number; counts: { high: number; medium: number; low: number }; onOpenIssues?: () => void }) {
  const hasMoney = govt > 0 || you > 0;
  const totalFlags = counts.high + counts.medium + counts.low;
  const govtPct = hasMoney ? Math.round((govt / (govt + you)) * 100) : 0;
  const sev: { color: string; label: string; value: number }[] = [
    { color: CORAL, label: "Needs attention", value: counts.high },
    { color: GOLD, label: "Worth a look", value: counts.medium },
    { color: MINT, label: "For your info", value: counts.low },
  ].filter((s) => s.value > 0);
  if (!hasMoney && totalFlags === 0) return null;
  return (
    <View style={{ gap: spacing.md }} testID="statement-graphics">
      {hasMoney ? (
        <Panel bg={TEAL} eyebrow="Where the money went">
          <Donut segments={[{ value: govt, color: SAGE }, { value: you, color: GOLD }]}>
            <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff", lineHeight: 26 }}>{govtPct}%</T>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" }}>FUNDED</T>
          </Donut>
          <View style={{ flex: 1, gap: 8 }}>
            <LegendRow color={SAGE} label="Government" value={aud0(govt)} />
            <LegendRow color={GOLD} label="You paid" value={aud0(you)} />
          </View>
        </Panel>
      ) : null}
      {totalFlags > 0 ? (
        <Panel bg={CLAY} eyebrow="What we found" hint={!!onOpenIssues}>
          <Pressable onPress={onOpenIssues} testID="statement-severity-donut">
            <Donut segments={sev}>
              <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff", lineHeight: 26 }}>{totalFlags}</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" }}>TO KNOW</T>
            </Donut>
          </Pressable>
          <View style={{ flex: 1, gap: 8 }}>
            {sev.map((s) => (
              <LegendRow key={s.label} color={s.color} label={s.label} value={String(s.value)} onPress={onOpenIssues} chevron={!!onOpenIssues} />
            ))}
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

function invFindingImpact(f: any): number {
  return Number(
    f?.financial_impact?.amount ?? f?.observed?.overcharge_amount ?? f?.observed?.refund_amount ??
    f?.observed?.excess_amount ?? f?.observed?.difference ?? f?.observed?.gst_amount ??
    f?.observed?.contribution_amount ?? 0
  );
}
function invSumRefund(findings: any[]): number {
  const seen = new Set<string>();
  let t = 0;
  for (const f of findings || []) {
    const v = invFindingImpact(f);
    if (!isFinite(v) || v <= 0) continue;
    const ids = (f?.line_ids || f?.affected_line_ids || []).slice().sort().join("|");
    const key = ids ? `${f?.check_id || ""}::${ids}` : `raw::${Math.random()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    t += v;
  }
  return t;
}
function invBandOf(f: any): "high" | "medium" | "low" {
  const tr = Number(f?.tier);
  // Backend Tier: HIGHER number = MORE severe (T4 check-before-paying is top).
  if (isFinite(tr) && tr > 0) { if (tr >= 4) return "high"; if (tr === 3) return "medium"; return "low"; }
  const s = String(f?.severity || f?.priority || "medium").toLowerCase();
  if (s.includes("block") || s.includes("critical") || s.includes("high")) return "high";
  if (s.includes("low") || s.includes("info") || s.includes("watch")) return "low";
  return "medium";
}

// Invoice: net payable vs potential refund (money) + severity of findings.
export function InvoiceInsightGraphics({ billed, findings, onOpenIssues }: { billed: number; findings: any[]; onOpenIssues?: () => void }) {
  const refund = invSumRefund(findings);
  const counts = { high: 0, medium: 0, low: 0 };
  (findings || []).forEach((f) => { counts[invBandOf(f)] += 1; });
  const net = Math.max(0, billed - refund);
  const netPct = billed > 0 ? Math.round((net / billed) * 100) : 0;
  const totalFlags = counts.high + counts.medium + counts.low;
  const sev: { color: string; label: string; value: number }[] = [
    { color: CORAL, label: "High priority", value: counts.high },
    { color: GOLD, label: "Worth a look", value: counts.medium },
    { color: MINT, label: "For your info", value: counts.low },
  ].filter((s) => s.value > 0);
  if (billed <= 0 && totalFlags === 0) return null;
  return (
    <View style={{ gap: spacing.md }} testID="invoice-graphics">
      {billed > 0 ? (
        <Panel bg={TEAL} eyebrow="Where your money stands">
          <Donut segments={[{ value: net, color: SAGE }, { value: refund, color: GOLD }]}>
            <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff", lineHeight: 26 }}>{netPct}%</T>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" }}>PAYABLE</T>
          </Donut>
          <View style={{ flex: 1, gap: 8 }}>
            <LegendRow color={SAGE} label="Net payable" value={aud0(net)} />
            <LegendRow color={GOLD} label="Potential refund" value={aud0(refund)} />
            <T style={{ fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>of {aud0(billed)} billed</T>
          </View>
        </Panel>
      ) : null}
      {totalFlags > 0 ? (
        <Panel bg={CLAY} eyebrow="What we found" hint={!!onOpenIssues}>
          <Pressable onPress={onOpenIssues} testID="invoice-severity-donut">
            <Donut segments={sev}>
              <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff", lineHeight: 26 }}>{totalFlags}</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" }}>TO KNOW</T>
            </Donut>
          </Pressable>
          <View style={{ flex: 1, gap: 8 }}>
            {sev.map((s) => (
              <LegendRow key={s.label} color={s.color} label={s.label} value={String(s.value)} onPress={onOpenIssues} chevron={!!onOpenIssues} />
            ))}
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, padding: spacing.lg },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
});
