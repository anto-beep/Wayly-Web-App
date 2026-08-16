import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, Info, CheckCircle2, ChevronDown, ExternalLink } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, sanitizeAI } from "@/src/utils/format";

const UNIT_WORD: Record<string, string> = { hour: "per hour", trip: "per trip", meal: "per meal", month: "per month", kilometre: "per kilometre" };
const UNIT_LABEL: Record<string, string> = { hour: "$ per hour", trip: "$ per trip", meal: "$ per meal", month: "$ per month", kilometre: "$ per kilometre" };
const PENSION_OPTS = [
  { key: "full", label: "Full Age Pension" },
  { key: "part", label: "Part Age Pension" },
  { key: "cshc", label: "Commonwealth Seniors Health Card" },
  { key: "self", label: "Self-funded" },
];
const STREAM_ORDER = ["Clinical", "Independence", "Everyday Living"];

type Svc = { service: string; stream: string; unit: string; available: boolean; checkable: boolean; notes: string | null };

export default function ProviderPriceChecker() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const [services, setServices] = useState<Svc[]>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [service, setService] = useState("Personal care");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [transportUnit, setTransportUnit] = useState("trip");
  const [rate, setRate] = useState("");
  const [provider, setProvider] = useState(active?.provider_name || "");
  const [isGrandfathered, setIsGrandfathered] = useState(false);
  const [afterHours, setAfterHours] = useState(false);
  const [ceState, setCeState] = useState<any>(null);
  const [inlinePension, setInlinePension] = useState("");
  const [continueAnyway, setContinueAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    apiFetch<{ snapshot_id: string; services: Svc[] }>("/ppc/services").then((d) => { setServices(d.services || []); setSnapshotId(d.snapshot_id || null); }).catch(() => {});
    apiFetch<{ state: any }>("/tools/ce/state").then((d) => setCeState(d?.state || null)).catch(() => setCeState(null));
  }, []);

  useEffect(() => {
    if (active?.provider_name) setProvider((p) => p || active.provider_name || "");
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const g: Record<string, Svc[]> = {};
    services.forEach((s) => { (g[s.stream] || (g[s.stream] = [])).push(s); });
    return g;
  }, [services]);

  const selectedRow = useMemo(() => services.find((s) => s.service === service) || null, [services, service]);
  const activeUnit = service === "Transport" && transportUnit === "kilometre" ? "kilometre" : (selectedRow?.unit || "hour");

  const submit = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const body = {
        service, rate: parseFloat(rate), provider: provider || null, snapshot_id: snapshotId,
        pension_status: ceState?.pension_status || inlinePension || null,
        is_grandfathered: isGrandfathered, after_hours_toggle: afterHours,
        check_date: new Date().toISOString().slice(0, 10),
        unit_override: service === "Transport" ? transportUnit : null,
      };
      const data = await apiFetch("/public/price-check-v2", { method: "POST", body });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check price.");
    } finally { setBusy(false); }
  };

  const guard = result?.quality_guard;
  const showGuard = guard && !continueAnyway;
  const pos = result?.position || "in";
  const posColor = pos === "above" ? colors.terracotta : pos === "below" ? colors.primary : colors.sage;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Provider Price Checker" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Provider Price Checker</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {"Tell us what you are being charged. We compare your provider's rate against the Department of Health's indicative price range for that service, and show your out-of-pocket share."}
          </T>

          {/* Cap deferral note */}
          <Card testID="pc-caps-note" style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
            <T variant="small" style={{ lineHeight: 20 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Price caps deferred. </T>
              {"The Australian Government has deferred the planned 1 July 2026 national provider price caps under Support at Home indefinitely. This tool compares your provider's rate against the indicative ranges published by the Department of Health, not a government cap."}
            </T>
          </Card>

          {/* Grandfathered gate */}
          <Pressable testID="pc-grandfathered-gate" onPress={() => setIsGrandfathered((v) => !v)} style={[styles.gfRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={[styles.checkbox, { borderColor: isGrandfathered ? colors.primary : colors.muted, backgroundColor: isGrandfathered ? colors.primary : "transparent" }]} testID="pc-grandfathered-checkbox">
              {isGrandfathered ? <CheckCircle2 size={14} color="#fff" /> : null}
            </View>
            <T variant="small" style={{ flex: 1, lineHeight: 19 }}>
              Are you on grandfathered Home Care Package transitional pricing? <T variant="small" style={{ color: colors.muted }}>(You were on HCP before 1 November 2025 and have not moved to Support at Home pricing.)</T>
            </T>
          </Pressable>

          {/* Form */}
          <Card testID="price-checker">
            <T variant="small" style={{ color: colors.muted, marginBottom: 6 }}>Service</T>
            <Pressable testID="pc-service" onPress={() => setPickerOpen((v) => !v)} style={[styles.select, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <T style={{ flex: 1, color: colors.text }}>{service}</T>
              <ChevronDown size={18} color={colors.muted} />
            </Pressable>
            {pickerOpen ? (
              <View style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {STREAM_ORDER.filter((s) => grouped[s]?.length).map((streamName) => (
                    <View key={streamName}>
                      <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.muted, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface2 }}>{streamName}</T>
                      {(grouped[streamName] || []).map((r) => (
                        <Pressable key={r.service} testID={`pc-service-opt-${r.service_code || r.service}`} onPress={() => { setService(r.service); setPickerOpen(false); setResult(null); setContinueAnyway(false); }} style={{ paddingHorizontal: spacing.md, paddingVertical: 10 }}>
                          <T style={{ color: service === r.service ? colors.primary : colors.text, fontFamily: service === r.service ? fonts.bodySemi : fonts.body }}>{r.service}{!r.checkable ? ", no range published" : ""}</T>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {service === "Transport" ? (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                {([["trip", "per trip"], ["kilometre", "per kilometre"]] as const).map(([v, label]) => {
                  const on = transportUnit === v;
                  return (
                    <Pressable key={v} testID={`pc-transport-${v}`} onPress={() => setTransportUnit(v)} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{label}</T>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              <T variant="small" style={{ color: colors.muted, marginBottom: 4 }}>Rate charged ({UNIT_LABEL[activeUnit] || "$ per unit"})</T>
              <TextInput testID="pc-rate" value={rate} onChangeText={(v) => { setRate(v.replace(/[^0-9.]/g, "")); setResult(null); setContinueAnyway(false); }} keyboardType="decimal-pad" placeholder="e.g. 100" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <T variant="small" style={{ color: colors.muted, marginBottom: 4 }}>Provider (optional)</T>
              <TextInput testID="pc-provider" value={provider} onChangeText={setProvider} placeholder="Provider name" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]} />
              <T variant="small" style={{ color: colors.muted, marginTop: 4, fontSize: 11 }}>Optional. Helps Wayly build a provider price picture.</T>
            </View>

            {/* Inline pension picker when CE state absent */}
            {!ceState ? (
              <View testID="pc-inline-picker" style={[styles.innerBox, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Which best describes you?</T>
                <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>{'This determines your share of the rate. Optional, but it makes the "Your Share" figure real.'}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {PENSION_OPTS.map((o) => {
                    const on = inlinePension === o.key;
                    return (
                      <Pressable key={o.key} testID={`pc-pension-${o.key}`} onPress={() => setInlinePension(o.key)} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{o.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
          <Button label="Check this price" testID="pc-submit" icon={Sparkles} onPress={submit} loading={busy} disabled={!rate} />

          {result ? (
            <View testID="pc-result" style={{ gap: spacing.md }}>
              {showGuard ? (
                <Card testID="pc-quality-guard" style={{ backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <AlertTriangle size={20} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Quick sanity check</T>
                      <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>{guard.prompt}</T>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                        {guard.after_hours_toggle_available ? (
                          <Button label="Yes, this was after-hours" testID="pc-guard-after-hours" onPress={() => { setAfterHours(true); setContinueAnyway(false); submit(); }} style={{ paddingHorizontal: spacing.md, minHeight: 42 }} />
                        ) : null}
                        {guard.allow_continue ? (
                          <Button label="Continue anyway" variant="outline" testID="pc-guard-continue" onPress={() => setContinueAnyway(true)} style={{ paddingHorizontal: spacing.md, minHeight: 42 }} />
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Card>
              ) : result.direction === "non_checkable" ? (
                <Card testID="pc-non-checkable">
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Info size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text }}>No indicative range for this fee type</T>
                      <T variant="body" style={{ marginTop: 6, lineHeight: 22 }}>{sanitizeAI(result.plain_language)}</T>
                    </View>
                  </View>
                </Card>
              ) : (
                <>
                  <Card testID="pc-how-this-compares">
                    <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>HOW THIS COMPARES</T>
                    <T style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: posColor, marginTop: 6 }} testID="pc-position">{sanitizeAI(result.plain_language)}</T>
                    {result.distance_summary ? <T variant="body" style={{ marginTop: 6 }} testID="pc-distance">{result.distance_summary}</T> : null}
                    {result.stream ? (
                      <View testID="pc-stream" style={[styles.streamChip, { backgroundColor: colors.sageSoft }]}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.sage }}>{result.stream}</T>
                      </View>
                    ) : null}
                    {result.doh_caveat ? <T variant="small" style={{ marginTop: spacing.md, fontStyle: "italic", lineHeight: 20 }}>{result.doh_caveat}</T> : null}
                  </Card>

                  {/* Stat cards */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    <StatCard label="You are charged" value={money(result.charged)} sub={UNIT_WORD[result.unit] || `per ${result.unit}`} colors={colors} testID="pc-stat-charged" />
                    <ShareCard share={result.your_share} unit={result.unit} colors={colors} />
                    {result.lower != null && result.upper != null ? (
                      <StatCard label="Indicative range" value={`${money(result.lower)} to ${money(result.upper)}`} sub={`DoH ${snapshotId || ""}`} colors={colors} testID="pc-range" small />
                    ) : (
                      <StatCard label="Indicative range" value="Not published" sub="for this service" colors={colors} testID="pc-range-unavailable" small />
                    )}
                  </View>

                  <T variant="small" style={{ color: colors.muted }} testID="pc-source-line">
                    Indicative median: {result.median != null ? money(result.median) : "unavailable"} {result.unit ? `per ${result.unit}` : ""}.
                  </T>

                  {result.after_hours_note ? <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}><T variant="small" style={{ lineHeight: 20 }} testID="pc-after-hours-note">{result.after_hours_note}</T></Card> : null}
                  {result.nursing_consumables_note ? <Card style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}><T variant="small" style={{ lineHeight: 20 }} testID="pc-nursing-note">{result.nursing_consumables_note}</T></Card> : null}
                </>
              )}
            </View>
          ) : null}

          {result?.how_this_works_bullets?.length ? (
            <Card testID="pc-how-this-works">
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.sm }}>HOW THIS WORKS</T>
              {result.how_this_works_bullets.map((b: string, i: number) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }} testID={`pc-hw-item-${i}`}>
                  <T style={{ color: colors.sage }}>•</T>
                  <T variant="small" style={{ flex: 1, lineHeight: 19 }}>{b}</T>
                </View>
              ))}
              <Pressable onPress={() => Linking.openURL("https://www.health.gov.au/topics/aged-care/support-at-home/prices")} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                <T variant="small" style={{ color: colors.primary }}>Department of Health, indicative prices</T>
                <ExternalLink size={13} color={colors.primary} />
              </Pressable>
            </Card>
          ) : null}

          <ToolExplainer toolKey="provider-price-checker" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function StatCard({ label, value, sub, colors, testID, small }: any) {
  return (
    <View testID={testID} style={{ minWidth: 150, flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.mono, fontSize: small ? 16 : 22, color: colors.text, marginTop: 2 }}>{value}</T>
      {sub ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 }}>{sub}</T> : null}
    </View>
  );
}

function ShareCard({ share, unit, colors }: any) {
  if (!share) return null;
  const mode = share.mode;
  let value = money(share.amount || 0);
  let sub = share.rate_pct != null ? `${share.rate_pct}% contribution rate` : (unit ? (UNIT_WORD[unit] || `per ${unit}`) : "");
  let explanation = "";
  if (mode === "picker") { value = "—"; explanation = "Choose your situation above to see your out-of-pocket per unit."; sub = ""; }
  else if (mode === "clinical") { value = money(0); explanation = share.explanation || ""; }
  else if (mode === "grandfathered" || mode === "unavailable") { value = ""; explanation = share.explanation || ""; }
  else if (mode === "band") { value = `${money(share.band?.share_low || 0)} to ${money(share.band?.share_high || 0)}`; explanation = share.explanation || ""; sub = ""; }
  return (
    <View testID="pc-your-share" style={{ minWidth: 150, flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface2, padding: spacing.md }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>YOUR SHARE</T>
      {value ? <T style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.text, marginTop: 2 }}>{value}</T> : null}
      {sub ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 }}>{sub}</T> : null}
      {explanation ? <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text, marginTop: 4, lineHeight: 16 }}>{explanation}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gfRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  select: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48 },
  picker: { borderWidth: 1, borderRadius: radius.md, marginTop: 6, overflow: "hidden" },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontFamily: fonts.body, fontSize: 15 },
  innerBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  streamChip: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: spacing.sm },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
