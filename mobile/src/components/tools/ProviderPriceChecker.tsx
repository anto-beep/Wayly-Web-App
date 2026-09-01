import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Sparkles, AlertTriangle, Info, CheckCircle2, ChevronDown, ExternalLink, Save, Clock, ArrowRight, Download, Mail, Copy, X } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { useScrollToResult } from "@/src/hooks/useScrollToResult";
import { sharePostPdf } from "@/src/lib/download";
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
  const [snapshots, setSnapshots] = useState<{ snapshot_id: string; source_date?: string }[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
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
  const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();

  useEffect(() => {
    apiFetch<{ snapshots: any[]; default_snapshot_id: string | null }>("/ppc/snapshots")
      .then((d) => { setSnapshots(d.snapshots || []); setSelectedSnapshot(d.default_snapshot_id || (d.snapshots?.[0]?.snapshot_id ?? null)); })
      .catch(() => {});
    apiFetch<{ state: any }>("/tools/ce/state").then((d) => setCeState(d?.state || null)).catch(() => setCeState(null));
  }, []);

  useEffect(() => {
    const q = selectedSnapshot ? `?snapshot_id=${encodeURIComponent(selectedSnapshot)}` : "";
    apiFetch<{ snapshot_id: string; services: Svc[] }>(`/ppc/services${q}`).then((d) => { setServices(d.services || []); setSnapshotId(d.snapshot_id || null); }).catch(() => {});
  }, [selectedSnapshot]);

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
        service, rate: parseFloat(rate), provider: provider || null, snapshot_id: selectedSnapshot || snapshotId,
        pension_status: ceState?.pension_status || inlinePension || null,
        is_grandfathered: isGrandfathered, after_hours_toggle: afterHours,
        check_date: new Date().toISOString().slice(0, 10),
        unit_override: service === "Transport" ? transportUnit : null,
      };
      const data = await apiFetch("/public/price-check-v2", { method: "POST", body });
      setResult(data);
      scrollToResult();
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
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {"Tell us what you are being charged. We compare your provider's rate against the Department of Health's indicative price range for that service, and show your out-of-pocket share."}
          </T>

          {/* Snapshot selector (WS7) + price history link */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm }}>
            <SnapshotSelector snapshots={snapshots} selected={selectedSnapshot} onChange={(v) => { setSelectedSnapshot(v); setResult(null); }} colors={colors} />
            <Pressable testID="pc-history-link" onPress={() => router.push("/price-history")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Clock size={13} color={colors.primary} />
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary }}>Your price history</T>
              <ArrowRight size={13} color={colors.primary} />
            </Pressable>
          </View>

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
            <View testID="pc-result" onLayout={onResultLayout} style={{ gap: spacing.md }}>
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

                  <SaveResultButton result={result} provider={provider} snapshotId={selectedSnapshot || snapshotId} ceState={ceState} colors={colors} />
                  <PriceExportActions result={result} provider={provider} colors={colors} />
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

function SnapshotSelector({ snapshots, selected, onChange, colors }: any) {
  if (!snapshots || snapshots.length === 0) return null;
  const fmt = (s: any) => { try { return `DoH ${new Date(s.source_date).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}`; } catch { return s.snapshot_id; } };
  const active = snapshots.find((s: any) => s.snapshot_id === selected) || snapshots[0];
  return (
    <View testID="pc-snapshot-selector" style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <T style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.5, color: colors.muted }}>DoH DATASET:</T>
      {snapshots.length === 1 ? (
        <View testID="pc-snapshot-single" style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text }}>{fmt(active)}</T>
          <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>· latest</T>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {snapshots.map((s: any, i: number) => {
            const on = s.snapshot_id === selected;
            return (
              <Pressable key={s.snapshot_id} testID={`pc-snapshot-opt-${s.snapshot_id}`} onPress={() => onChange(s.snapshot_id)} style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{fmt(s)}{i === 0 ? " · latest" : ""}</T>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SaveResultButton({ result, provider, snapshotId, ceState, colors }: any) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<any>(null);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<any>(null);

  const post = async (mergeProviderId: string | null = null) => {
    setBusy(true); setError("");
    try {
      const body = {
        service: result.service, rate: result.charged, provider: provider || null,
        snapshot_id: snapshotId || result.source_snapshot_id || null, unit: result.unit,
        position: result.position, range_lower: result.lower, range_upper: result.upper,
        median: result.median, stream: result.stream, source_date: result.source_date,
        your_share: result?.your_share?.amount ?? null, pension_status: ceState?.pension_status || null,
        is_grandfathered: Boolean(ceState?.is_grandfathered), is_after_hours: false, merge_provider_id: mergeProviderId,
      };
      const data = await apiFetch<any>("/ppc/checks", { method: "POST", body });
      if (data.saved === false && data.prompts?.length) { setPrompt(data.prompts[0]); return; }
      setSaved({ rate_increases_last_12mo: data.rate_increases_last_12mo });
      setPrompt(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  if (saved) return (
    <View testID="pc-saved-confirmation" style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.sageSoft, borderColor: colors.sage, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <CheckCircle2 size={15} color={colors.sage} />
      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.sage }}>Saved.</T>
      {saved.rate_increases_last_12mo > 2 ? <T testID="pc-rate-increase-chip" style={{ fontFamily: fonts.body, fontSize: 12, color: colors.sage }}>· {saved.rate_increases_last_12mo} increases in 12 months</T> : null}
    </View>
  );

  if (prompt) return (
    <Card testID="pc-fuzzy-prompt" style={{ borderColor: colors.gold }}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Is this the same provider?</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 19 }}>{`Looks similar to "${prompt.suggested_display_name || ""}" that you saved before. Merge so your history stays in one place?`}</T>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        <Button label="Keep separate" testID="pc-fuzzy-keep-separate" variant="outline" onPress={() => post(null)} loading={busy} style={{ flexGrow: 1 }} />
        <Button label="Yes, merge" testID="pc-fuzzy-merge" onPress={() => post(prompt.suggested_last_check_id)} loading={busy} style={{ flexGrow: 1 }} />
      </View>
    </Card>
  );

  return (
    <View>
      <Button label="Save this result" testID="pc-save-check" variant="outline" icon={Save} onPress={() => post(null)} loading={busy} />
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: 6 }}>{error}</T> : null}
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

function PriceExportActions({ result, provider, colors }: any) {
  const [busyPdf, setBusyPdf] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [error, setError] = useState("");

  const downloadPdf = async () => {
    setBusyPdf(true); setError("");
    try {
      const notes = [result.personal_care_transitional_note, result.after_hours_note, result.nursing_consumables_note].filter(Boolean);
      const body = {
        service: result.service, provider: provider || null, charged: result.charged, unit: result.unit,
        position: result.position, plain_language: result.plain_language, distance_summary: result.distance_summary,
        lower: result.lower, upper: result.upper, median: result.median, stream: result.stream,
        your_share_amount: result?.your_share?.amount ?? null, your_share_explanation: result?.your_share?.explanation ?? null,
        source_date: result.source_date, doh_caveat: result.doh_caveat, notes,
      };
      const svc = String(result.service || "check").toLowerCase().replace(/\s+/g, "-");
      await sharePostPdf("/ppc/pdf-export", body, `wayly-price-check-${svc}.pdf`);
    } catch { setError("Could not export the PDF."); }
    finally { setBusyPdf(false); }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Button label="Download PDF" variant="outline" icon={Download} testID="pc-pdf-export" loading={busyPdf} onPress={downloadPdf} style={{ flexGrow: 1, minWidth: "45%" }} />
        <Button label="Email the provider" variant="outline" icon={Mail} testID="pc-open-email" onPress={() => setEmailOpen(true)} style={{ flexGrow: 1, minWidth: "45%" }} />
      </View>
      {error ? <T variant="small" style={{ color: colors.terracotta }} testID="pc-export-error">{error}</T> : null}
      <EmailProviderModal open={emailOpen} onClose={() => setEmailOpen(false)} result={result} provider={provider} colors={colors} />
    </View>
  );
}

function EmailProviderModal({ open, onClose, result, provider, colors }: any) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeIncrease, setIncludeIncrease] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !result) return;
    setLoading(true); setError("");
    apiFetch<any>("/ppc/email-draft", { method: "POST", body: {
      service: result.service, rate: result.charged, unit: result.unit, provider: provider || null,
      lower: result.lower, upper: result.upper, source_date: result.source_date, include_increase_paragraph: includeIncrease,
    } }).then((d) => { setDraft(d); setSubject(d?.subject || ""); setBody(d?.body || ""); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not draft email."))
      .finally(() => setLoading(false));
  }, [open, result, provider, includeIncrease]);

  const copyBoth = async () => { await Clipboard.setStringAsync(`Subject: ${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const openMail = () => { Linking.openURL(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`); };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg, maxHeight: "88%" }} onPress={(e) => e.stopPropagation()} testID="pc-email-modal">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>Email the provider</T>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
          </View>
          <ScrollView style={{ marginTop: spacing.md }} keyboardShouldPersistTaps="handled">
            {loading ? <T variant="small" style={{ color: colors.muted }}>Drafting…</T> : null}
            {error ? <T variant="small" style={{ color: colors.terracotta }}>{error}</T> : null}
            {draft && !loading ? (
              <View style={{ gap: spacing.md }}>
                {(draft.increase_count || 0) > 2 ? (
                  <Pressable testID="pc-email-include-increase" onPress={() => setIncludeIncrease((v) => !v)} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: includeIncrease ? colors.primary : colors.border, backgroundColor: includeIncrease ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>{includeIncrease ? <CheckCircle2 size={13} color="#fff" /> : null}</View>
                    <T variant="small" style={{ flex: 1, lineHeight: 19, color: colors.text }}>Add the ACQSC / rate-increase paragraph ({draft.increase_count} increases in 12 months)</T>
                  </Pressable>
                ) : (
                  <T variant="small" style={{ color: colors.muted, fontStyle: "italic", fontSize: 12 }}>Once you&apos;ve saved three or more rate increases for this provider in 12 months, an optional ACQSC paragraph appears here.</T>
                )}
                <View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>SUBJECT</T>
                  <TextInput testID="pc-email-subject" value={subject} onChangeText={setSubject} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: colors.text, fontFamily: fonts.body }} />
                </View>
                <View>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>BODY</T>
                  <TextInput testID="pc-email-body" value={body} onChangeText={setBody} multiline style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 10, minHeight: 200, textAlignVertical: "top", color: colors.text, fontFamily: fonts.body, lineHeight: 21 }} />
                </View>
                {draft.disclaimer ? <T variant="small" style={{ color: colors.muted, fontStyle: "italic", fontSize: 12 }}>{draft.disclaimer}</T> : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                  <Button label={copied ? "Copied" : "Copy to clipboard"} variant="outline" icon={Copy} testID="pc-email-copy" onPress={copyBoth} style={{ flexGrow: 1 }} />
                  <Button label="Open in mail app" icon={Mail} testID="pc-email-launch" onPress={openMail} style={{ flexGrow: 1 }} />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
