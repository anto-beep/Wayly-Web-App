import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AlertCircle, ChevronRight, Clock, Users } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type Profile = {
  participant: { id: string; display_name?: string; classification?: any; provider?: string; pension_status?: string };
  household: { user_id: string; name?: string; email?: string; role?: string }[];
  financial_position: { quarterly_budget?: number | null; spent_to_date_this_quarter?: number | null; lifetime_cap_total?: number | null; last_statement_date?: string | null };
  latest_artefacts: Record<string, any>;
  open_cases: any[];
  open_cases_total: number;
  timeline: { title?: string; label?: string; created_at?: string; kind?: string }[];
};

const PENSION_LABEL: Record<string, string> = { full_pension: "Full Pension", part_pension: "Part Pension", cshc: "CSHC", self_funded: "Self-funded", unsure: "Not sure" };
const SEV_TONE: Record<string, "error" | "alert" | "neutral"> = { high: "error", medium: "alert", low: "neutral" };

const ARTEFACTS: { key: string; name: string; route: string; cta: string }[] = [
  { key: "statement", name: "Statement Decoder", route: "/statements", cta: "Decode a statement" },
  { key: "invoice_check", name: "Invoice Checker", route: "/invoices", cta: "Check an invoice" },
  { key: "care_plan_review", name: "Support Plan Reviewer", route: "/care-plans", cta: "Review a care plan" },
  { key: "classification_check", name: "Classification Check", route: "/tool/classification-self-check", cta: "Run classification check" },
  { key: "contribution_estimate", name: "Contribution Estimator", route: "/contribution-position", cta: "Estimate contribution" },
  { key: "letter", name: "Letters & Follow-ups", route: "/letters", cta: "Draft a letter" },
  { key: "price_check", name: "Price Checker", route: "/tool/provider-price-checker", cta: "Check a price" },
  { key: "budget_projection", name: "Budget Calculator", route: "/tool/budget-calculator", cta: "Calculate budget" },
];

function classLabel(c: any): string {
  if (c == null) return "";
  if (typeof c === "number") return `Level ${c}`;
  if (typeof c === "object") {
    const b = c.band ?? c.level;
    return b != null ? `Level ${b}` : (c.label || "");
  }
  return String(c);
}

// Financial fields come back as either a number or { amount, currency }.
function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.amount === "number") return v.amount;
  return null;
}

function providerLabel(pr: any): string {
  if (!pr) return "—";
  if (typeof pr === "string") return pr;
  return pr.primary || pr.name || "—";
}

export default function ParticipantProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try { setData(await apiFetch<Profile>(`/core/participants/${id}/profile`)); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const p = data?.participant;
  const fp = data?.financial_position;
  const name = p?.display_name || "Participant";

  const StatBox = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1 }}>
      <T variant="label">{label}</T>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 2 }}>{value}</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={name ? `${name}'s Profile` : "Profile"} subtitle="Participant profile" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading profile…" />
      ) : error || !data ? (
        <StatePanel icon={AlertCircle} title="Could not load profile" message="Please try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <View>
            <T variant="label">PARTICIPANT PROFILE</T>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <T style={{ fontFamily: fonts.heading, fontSize: 26 }}>{name}'s Profile</T>
              {classLabel(p?.classification) ? <T variant="small">{classLabel(p?.classification)}</T> : null}
            </View>
            <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>A single place to see every important detail about {name}. Financial position, open follow-ups, care plan health and recent activity all sit side by side.</T>
          </View>

          {/* Personal details */}
          <Card testID="pp-personal-details">
            <T variant="label">PERSONAL DETAILS</T>
            <View style={{ marginTop: spacing.sm, gap: 10 }}>
              {[["Provider", providerLabel(p?.provider)], ["Classification", classLabel(p?.classification) || "—"], ["Pension Status", PENSION_LABEL[p?.pension_status || ""] || p?.pension_status || "—"]].map(([l, v]) => (
                <View key={l}>
                  <T variant="label">{l.toUpperCase()}</T>
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15, marginTop: 1 }}>{v}</T>
                </View>
              ))}
            </View>
          </Card>

          {/* Financial position */}
          <Card testID="pp-financial-position">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Financial Position</T>
              <Pressable testID="pp-see-contribution" onPress={() => router.push("/contribution-position")}>
                <T variant="small" style={{ color: colors.primary }}>See Contribution Position →</T>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <StatBox label="QUARTERLY BUDGET" value={num(fp?.quarterly_budget) != null ? money(num(fp?.quarterly_budget)!) : "—"} />
              <StatBox label="SPENT THIS QUARTER" value={num(fp?.spent_to_date_this_quarter) != null ? money(num(fp?.spent_to_date_this_quarter)!) : "—"} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <StatBox label="LIFETIME CAP" value={num(fp?.lifetime_cap_total) != null ? money(num(fp?.lifetime_cap_total)!) : "—"} />
              <StatBox label="LAST STATEMENT" value={fp?.last_statement_date ? shortDate(fp.last_statement_date) : "—"} />
            </View>
            {num(fp?.quarterly_budget) == null ? (
              <T variant="small" style={{ marginTop: spacing.md }}>Run the Budget Calculator or upload a statement to see {name}'s live position.</T>
            ) : null}
          </Card>

          {/* Open follow-ups */}
          <Card testID="pp-follow-ups">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AlertCircle size={16} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Open Follow-Ups</T>
                <Badge label={String(data.open_cases_total || 0)} tone="neutral" />
              </View>
              <Pressable onPress={() => router.push("/cases")}><T variant="small" style={{ color: colors.primary }}>View all →</T></Pressable>
            </View>
            {(data.open_cases || []).length === 0 ? (
              <T variant="small" style={{ marginTop: spacing.sm }}>No open follow-ups. Everything is up to date.</T>
            ) : (
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {data.open_cases.map((c: any, i: number) => (
                  <Pressable key={c.id || i} onPress={() => router.push(`/case/${c.id}`)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={2}>{c.title || (c.case_type || "").replace(/_/g, " ")}</T>
                      {c.summary ? <T variant="small" numberOfLines={1}>{c.summary}</T> : null}
                    </View>
                    {c.severity ? <Badge label={c.severity.toUpperCase()} tone={SEV_TONE[c.severity] || "neutral"} /> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          {/* Household members */}
          <Card testID="pp-household">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Users size={16} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Household Members</T>
              </View>
              <Pressable onPress={() => router.push("/family-members")}><T variant="small" style={{ color: colors.primary }}>Manage access →</T></Pressable>
            </View>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {(data.household || []).map((m, i) => (
                <View key={m.user_id || i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{m.name || m.email}</T>
                  <T variant="small">{m.role}</T>
                  {m.email ? <T variant="small" style={{ color: colors.muted }}>{m.email}</T> : null}
                </View>
              ))}
            </View>
          </Card>

          {/* Latest activity */}
          <Card testID="pp-latest-activity">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>Latest Activity</T>
            <View style={{ gap: spacing.sm }}>
              {ARTEFACTS.map((a) => {
                const art = data.latest_artefacts?.[a.key];
                return (
                  <Pressable key={a.key} testID={`pp-tool-${a.key}`} onPress={() => router.push(a.route)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{a.name}</T>
                      {art ? (
                        <T variant="small" style={{ marginTop: 2 }} numberOfLines={1}>
                          {[art.summary, art.title, art.status].find((x) => typeof x === "string") || "Completed"}{typeof (art.created_at || art.date) === "string" ? ` · ${shortDate(art.created_at || art.date)}` : ""}
                        </T>
                      ) : (
                        <T variant="small" style={{ marginTop: 2, color: colors.primary }}>{a.cta} ›</T>
                      )}
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Timeline */}
          <Card testID="pp-timeline">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Timeline</T>
              <Pressable onPress={() => router.push("/timeline")}><T variant="small" style={{ color: colors.primary }}>Full Timeline →</T></Pressable>
            </View>
            {(data.timeline || []).length === 0 ? (
              <T variant="small">No recent activity yet.</T>
            ) : (
              (data.timeline || []).slice(0, 8).map((t, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 6 }}>
                  <Clock size={14} color={colors.muted} style={{ marginTop: 3 }} />
                  <View style={{ flex: 1 }}>
                    <T variant="small" style={{ color: colors.text }}>{[t.title, t.label].find((x) => typeof x === "string") || "Activity"}</T>
                    <T variant="small" style={{ color: colors.muted }}>{shortDate(t.created_at)}</T>
                  </View>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
