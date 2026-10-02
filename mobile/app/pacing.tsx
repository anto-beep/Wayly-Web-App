/**
 * QP-1 Quarterly Pacing (mobile) — parity with the web QuarterlyPacing screen.
 *
 * Four tabs:
 *   Pacing     — envelope, actual spent, projection, pace status, confidence,
 *                underspend flag, and a "How is this calculated?" breakdown.
 *   This week  — log a one-off service, reconcile from a decoded statement,
 *                paste-CSV reconcile, and this-week / not-yet-confirmed ledger
 *                rows with Confirm / Missed / Changed actions.
 *   Schedules  — add a recurring service, list + end schedules.
 *   History    — the previous four quarters.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp, FileCheck2, Info,
  MinusCircle, Plus, TrendingDown, TrendingUp, XCircle,
} from "lucide-react-native";

import { AppHeader, Badge, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

const CADENCE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "one_off", label: "One-off" },
];
const DAYS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
];

const TABS = [
  { k: "pacing", label: "Pacing" },
  { k: "week", label: "This week" },
  { k: "schedules", label: "Schedules" },
  { k: "history", label: "History" },
];

type Ledger = {
  id: string; service_type: string; provider_name?: string | null; expected_date: string;
  expected_duration_hours?: number | null; expected_rate?: number | null;
  expected_amount?: number | null; actual_amount?: number | null; state: string; notes?: string | null;
};
type Pacing = any;

function paceMeta(status: string | undefined, colors: any) {
  switch (status) {
    case "green": return { label: "On track", color: colors.success, bg: colors.successSoft, Icon: CheckCircle2 };
    case "amber": return { label: "Watch this", color: colors.alert, bg: colors.alertSoft, Icon: AlertTriangle };
    case "red": return { label: "Over pace", color: colors.terracotta, bg: colors.errorSoft, Icon: TrendingUp };
    case "underspend": return { label: "Underspending", color: colors.primary, bg: colors.sageSoft, Icon: TrendingDown };
    default: return { label: "Not enough data yet", color: colors.muted, bg: colors.surface2, Icon: Info };
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export default function PacingScreen() {
  const { activeId, active } = useParticipants();
  const { colors } = useTheme();
  const classification = Number(active?.classification_level) || null;

  const [tab, setTab] = useState("pacing");
  const [pacing, setPacing] = useState<Pacing | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!activeId) { setLoading(false); return; }
    setError("");
    try {
      const q = classification ? `?participant_id=${activeId}&classification=${classification}` : `?participant_id=${activeId}`;
      const [p, l, s] = await Promise.all([
        apiFetch<Pacing>(`/qp1/pacing${q}`),
        apiFetch<{ entries: Ledger[] }>(`/qp1/ledger?participant_id=${activeId}`),
        apiFetch<{ schedules: any[] }>(`/qp1/schedules?participant_id=${activeId}`),
      ]);
      setPacing(p);
      setLedger(l?.entries || []);
      setSchedules(s?.schedules || []);
    } catch {
      setError("Could not load pacing.");
    } finally {
      setLoading(false);
    }
  }, [activeId, classification]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Quarterly Pacing"
        subtitle={pacing?.quarter?.label ? `${pacing.quarter.label} · Day ${pacing.quarter.elapsed_days} of ${pacing.quarter.total_days}` : undefined}
        onBack={() => router.back()}
      />

      {/* Tab chip row — single horizontal scroller, selected changes colour only */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
        style={{ flexGrow: 0 }}
      >
        {TABS.map((t) => {
          const on = tab === t.k;
          return (
            <Pressable
              key={t.k}
              testID={`qp1-tab-${t.k}`}
              onPress={() => setTab(t.k)}
              style={[styles.tab, { flexShrink: 0, backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
            >
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: on ? "#fff" : colors.text }}>{t.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <Loading />
      ) : !activeId ? (
        <StatePanel testID="qp1-empty-participant" icon={Calendar} title="Add a participant to start pacing" message="Quarterly Pacing needs a participant profile so it knows the classification level and quarterly envelope." />
      ) : error && !pacing ? (
        <StatePanel testID="qp1-error" icon={TrendingUp} title="Couldn't load pacing" actionLabel="Retry" onAction={reload} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {tab === "pacing" && <PacingTab pacing={pacing} />}
          {tab === "week" && <WeekTab ledger={ledger} participantId={activeId} onChanged={reload} />}
          {tab === "schedules" && <SchedulesTab schedules={schedules} participantId={activeId} onChanged={reload} />}
          {tab === "history" && <HistoryTab participantId={activeId} classification={classification} />}
        </ScrollView>
      )}
    </View>
  );
}

// ============================== PACING TAB ==============================

function PacingTab({ pacing }: { pacing: Pacing }) {
  const { colors } = useTheme();
  const [openCalc, setOpenCalc] = useState(false);
  if (!pacing) return null;
  const meta = paceMeta(pacing.pace_status, colors);
  const { Icon } = meta;

  return (
    <View style={{ gap: spacing.md }} testID="qp1-pacing-view">
      <Card testID={`qp1-pace-card-${pacing.pace_status}`} style={{ backgroundColor: meta.bg, borderColor: meta.color }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={meta.color} />
            </View>
            <View>
              <T variant="label" style={{ color: colors.muted }}>PACE</T>
              <T style={{ fontFamily: fonts.heading, fontSize: 24, color: meta.color }}>{meta.label}</T>
            </View>
          </View>
          <T variant="label" style={{ color: colors.muted }}>Confidence: {pacing.confidence}</T>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
          <Stat label="ENVELOPE" value={money(pacing.envelope)} testID="qp1-stat-envelope" />
          <Stat label="ACTUAL SPENT" value={money(pacing.actual_spent)} testID="qp1-stat-spent" />
          <Stat label="PROJECTED TOTAL" value={money(pacing.projected_end_of_quarter_total)} testID="qp1-stat-projected" />
        </View>

        {pacing.underspend_flag ? (
          <View testID="qp1-underspend-warning" style={{ flexDirection: "row", gap: 10, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
            <TrendingDown size={16} color={colors.primary} style={{ marginTop: 2 }} />
            <T variant="small" style={{ flex: 1, lineHeight: 20 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Heads up, funds may roll off. </T>
              You&apos;re on track to underspend by more than the rollover cap ({money(pacing.rollover_cap_aud)}). Consider bringing forward services that were paused.
            </T>
          </View>
        ) : null}
      </Card>

      <Card testID="qp1-how-calculated">
        <Pressable onPress={() => setOpenCalc((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T style={{ fontFamily: fonts.headingSemi, fontSize: 17 }}>How is this calculated?</T>
          {openCalc ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
        </Pressable>
        {openCalc ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <T variant="small" style={{ lineHeight: 20 }}>
              Actual spent = reconciled + confirmed + assumed + ad-hoc totals. Reconciled comes from decoded statements, confirmed comes from your weekly check-in, assumed applies to services scheduled more than 7 days ago but still not confirmed, and ad-hoc is anything you logged outside a schedule.
            </T>
            <T variant="small" style={{ lineHeight: 20 }}>
              Projected end-of-quarter total = actual spent + the sum of remaining expected entries in your ledger for this quarter.
            </T>
            <T variant="small" style={{ lineHeight: 20 }}>
              Pace status: On track when projected is within 5% of envelope, Watch this within 15%, Over pace more than 15% over. We flag underspend separately when projected falls more than the rollover cap below envelope.
            </T>
            <View style={{ marginTop: 4, gap: 4 }}>
              <CalcLine label="Reconciled" value={money(pacing.reconciled_total)} />
              <CalcLine label="Confirmed" value={money(pacing.confirmed_total)} />
              <CalcLine label="Assumed" value={money(pacing.assumed_total)} />
              <CalcLine label="Ad-hoc" value={money(pacing.adhoc_total)} />
              <CalcLine label="Expected remaining" value={money(pacing.expected_remaining_total)} />
              <CalcLine label="Pace target today" value={money(pacing.expected_pace_today)} />
            </View>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm }}>
      <T style={{ fontFamily: fonts.body, fontSize: 9, letterSpacing: 0.4, color: colors.muted }}>{label}</T>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, marginTop: 2 }}>{value}</T>
    </View>
  );
}

function CalcLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T variant="small">{label}</T>
      <T style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>{value}</T>
    </View>
  );
}

// ============================== WEEK TAB ==============================

function WeekTab({ ledger, participantId, onChanged }: { ledger: Ledger[]; participantId: string; onChanged: () => void }) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayISO = monday.toISOString().slice(0, 10);
  const sundayISO = sunday.toISOString().slice(0, 10);

  const inWeek = ledger.filter((e) => e.expected_date >= mondayISO && e.expected_date <= sundayISO);
  const past = ledger.filter((e) => e.expected_date < mondayISO && (e.state === "expected" || e.state === "assumed")).slice(-8);

  return (
    <View style={{ gap: spacing.md }} testID="qp1-week-view">
      <AdHocForm participantId={participantId} onSaved={onChanged} />
      <ReconcileFromStatementForm participantId={participantId} onDone={onChanged} />
      <ReconcileForm participantId={participantId} onDone={onChanged} />
      <BucketList title="This week" subtitle={`${mondayISO} to ${sundayISO}`} entries={inWeek} onChanged={onChanged}
        emptyText="Nothing scheduled this week. Add an ad-hoc service if something happened." testIdPrefix="qp1-week-current" />
      {past.length > 0 ? (
        <BucketList title="Not yet confirmed" subtitle="Older expected services still open. Confirm, mark missed, or note a change."
          entries={past} onChanged={onChanged} emptyText="Everything up to date." testIdPrefix="qp1-week-past" />
      ) : null}
    </View>
  );
}

function BucketList({ title, subtitle, entries, onChanged, emptyText, testIdPrefix }: any) {
  const { colors } = useTheme();
  return (
    <Card testID={`${testIdPrefix}-card`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <T variant="h3">{title}</T>
          {subtitle ? <T variant="small" style={{ marginTop: 2 }}>{subtitle}</T> : null}
        </View>
        <T variant="small">{entries.length} item{entries.length === 1 ? "" : "s"}</T>
      </View>
      {entries.length === 0 ? (
        <T variant="small" style={{ marginTop: spacing.md }}>{emptyText}</T>
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {entries.map((e: Ledger) => <LedgerRow key={e.id} entry={e} onChanged={onChanged} />)}
        </View>
      )}
    </Card>
  );
}

const STATE_BADGE: Record<string, { label: string; tone: any }> = {
  expected: { label: "Expected", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "success" },
  missed: { label: "Missed", tone: "error" },
  changed: { label: "Changed", tone: "alert" },
  assumed: { label: "Assumed", tone: "alert" },
  ad_hoc: { label: "Ad-hoc", tone: "brand" },
  reconciled: { label: "Reconciled", tone: "success" },
};

function LedgerRow({ entry, onChanged }: { entry: Ledger; onChanged: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [showChanged, setShowChanged] = useState(false);
  const [dur, setDur] = useState(entry.expected_duration_hours != null ? String(entry.expected_duration_hours) : "");
  const [rate, setRate] = useState(entry.expected_rate != null ? String(entry.expected_rate) : "");
  const [note, setNote] = useState("");

  const badge = STATE_BADGE[entry.state] || { label: entry.state, tone: "neutral" };
  const done = entry.state !== "expected" && entry.state !== "assumed";
  const amount = entry.actual_amount ?? entry.expected_amount ?? 0;

  async function act(kind: string, body?: any) {
    setBusy(true);
    try {
      await apiFetch(`/qp1/ledger/${entry.id}/${kind}`, { method: "POST", body: body || {} });
      setShowChanged(false);
      onChanged();
    } catch { /* silent */ }
    finally { setBusy(false); }
  }

  return (
    <View testID={`qp1-ledger-row-${entry.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: done ? colors.surface2 : colors.surface }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{entry.service_type}</T>
            <Badge testID={`qp1-ledger-state-${entry.id}`} label={badge.label} tone={badge.tone} />
          </View>
          <T variant="small" style={{ marginTop: 4 }}>
            {entry.expected_date}
            {entry.provider_name ? ` · ${entry.provider_name}` : ""}
            {entry.expected_duration_hours ? ` · ${entry.expected_duration_hours}h @ ${money(entry.expected_rate || 0)}/hr` : ""}
          </T>
        </View>
        <T style={{ fontFamily: fonts.headingSemi, fontSize: 16 }}>{money(amount)}</T>
      </View>

      {!done ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionBtn testID={`qp1-confirm-${entry.id}`} label="Confirm" icon={CheckCircle2} onPress={() => act("confirm")} disabled={busy} filled />
          <ActionBtn testID={`qp1-missed-${entry.id}`} label="Missed" icon={XCircle} onPress={() => act("missed")} disabled={busy} tone={colors.terracotta} />
          <ActionBtn testID={`qp1-changed-toggle-${entry.id}`} label="Changed" icon={MinusCircle} onPress={() => setShowChanged((v) => !v)} disabled={busy} />
        </View>
      ) : null}

      {!done && showChanged ? (
        <View testID={`qp1-changed-form-${entry.id}`} style={{ gap: spacing.sm, marginTop: 4 }}>
          <Field label="Actual hours" required testID={`qp1-changed-hours-${entry.id}`} value={dur} onChangeText={setDur} keyboardType="decimal-pad" />
          <Field label="Actual $/hr" required testID={`qp1-changed-rate-${entry.id}`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <Field label="Note" optional testID={`qp1-changed-note-${entry.id}`} value={note} onChangeText={setNote} />
          <Button label="Save change" testID={`qp1-changed-save-${entry.id}`} loading={busy}
            onPress={() => act("changed", { actual_duration_hours: Number(dur) || null, actual_rate: Number(rate) || null, notes: note || null })} />
        </View>
      ) : null}

      {entry.notes ? <T variant="small" style={{ fontStyle: "italic" }}>Note: {entry.notes}</T> : null}
    </View>
  );
}

function ActionBtn({ label, icon: Icon, onPress, disabled, filled, tone, testID }: any) {
  const { colors } = useTheme();
  const c = tone || colors.primary;
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: filled ? 0 : 1.5, borderColor: c, backgroundColor: filled ? colors.primary : "transparent", opacity: disabled ? 0.55 : 1 }}>
      <Icon size={15} color={filled ? "#fff" : c} />
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: filled ? "#fff" : c }}>{label}</T>
    </Pressable>
  );
}

function AdHocForm({ participantId, onSaved }: { participantId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [provider, setProvider] = useState("");
  const [when, setWhen] = useState(today());
  const [dur, setDur] = useState("1");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const { colors } = useTheme();

  async function save() {
    setErr("");
    if (!serviceType.trim()) { setErr("Add a service type"); return; }
    if (!dur || !rate) { setErr("Enter duration and rate"); return; }
    setBusy(true);
    try {
      await apiFetch("/qp1/ledger/ad_hoc", { method: "POST", body: {
        participant_id: participantId, service_type: serviceType.trim(), provider_name: provider.trim() || null,
        actual_date: when, actual_duration_hours: Number(dur), actual_rate: Number(rate), notes: note.trim() || null,
      } });
      setServiceType(""); setProvider(""); setDur("1"); setRate(""); setNote(""); setOpen(false);
      onSaved();
    } catch { setErr("Could not save"); }
    finally { setBusy(false); }
  }

  return (
    <Card testID="qp1-adhoc-card">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T variant="h3">Log a one-off service</T>
          <T variant="small" style={{ marginTop: 2 }}>Anything that happened outside your schedule.</T>
        </View>
        <Button label={open ? "Close" : "Log ad-hoc"} testID="qp1-adhoc-toggle" variant="outline" icon={Plus} onPress={() => setOpen((v) => !v)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
      </View>
      {open ? (
        <View testID="qp1-adhoc-form" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Field label="Service type" required testID="qp1-adhoc-service" value={serviceType} onChangeText={setServiceType} />
          <Field label="Provider" optional testID="qp1-adhoc-provider" value={provider} onChangeText={setProvider} />
          <DateField label="Date" required testID="qp1-adhoc-date" value={when} onChange={setWhen} />
          <Field label="Hours" required testID="qp1-adhoc-hours" value={dur} onChangeText={setDur} keyboardType="decimal-pad" />
          <Field label="Rate $/hr" required testID="qp1-adhoc-rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <Field label="Note" optional testID="qp1-adhoc-note" value={note} onChangeText={setNote} />
          {err ? <T variant="small" style={{ color: colors.terracotta }}>{err}</T> : null}
          <Button label="Save one-off" testID="qp1-adhoc-save" loading={busy} onPress={save} />
        </View>
      ) : null}
    </Card>
  );
}

function ReconcileFromStatementForm({ participantId, onDone }: { participantId: string; onDone: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [statements, setStatements] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!open || statements !== null) return;
    (async () => {
      try {
        const data = await apiFetch<any>("/statements");
        const items = Array.isArray(data) ? data : (data?.items || []);
        const withLines = items.filter((s: any) => (s.line_items || []).length > 0);
        withLines.sort((a: any, b: any) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")));
        setStatements(withLines);
        if (withLines[0]) setSelectedId(withLines[0].id);
      } catch { setErr("Could not load statements"); setStatements([]); }
    })();
  }, [open, statements]);

  async function submit() {
    setErr(""); setResult(null);
    if (!selectedId) { setErr("Choose a statement"); return; }
    setBusy(true);
    try {
      const data = await apiFetch<any>("/qp1/reconciliations/from-statement", { method: "POST", body: {
        participant_id: participantId, statement_id: selectedId, create_adhoc_for_unmatched: true,
      } });
      setResult(data);
      onDone();
    } catch { setErr("Reconciliation failed"); }
    finally { setBusy(false); }
  }

  const opts = (statements || []).map((s: any) => ({
    value: s.id,
    label: `${s.period_label || s.filename || s.id.slice(0, 8)} · ${(s.line_items || []).length} lines`,
  }));

  return (
    <Card testID="qp1-reconcile-statement-card" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sage }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <T variant="h3">Reconcile from a decoded statement</T>
            <Badge label="Recommended" tone="success" />
          </View>
          <T variant="small" style={{ marginTop: 2 }}>Pull line items straight from a Wayly-decoded statement, no copy-paste. Matches lift confidence to high.</T>
        </View>
      </View>
      <Button label={open ? "Close" : "Pick a statement"} testID="qp1-reconcile-statement-toggle" variant="secondary" icon={FileCheck2} onPress={() => setOpen((v) => !v)} style={{ marginTop: spacing.md }} />
      {open ? (
        <View testID="qp1-reconcile-statement-form" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {statements === null ? (
            <T variant="small">Loading statements…</T>
          ) : statements.length === 0 ? (
            <T variant="small">No decoded statements with line items yet. Upload one on the Statements page and it will appear here.</T>
          ) : (
            <>
              <Select label="Statement" required testID="qp1-reconcile-statement-select" value={selectedId} onChange={setSelectedId} options={opts} />
              {err ? <T testID="qp1-reconcile-statement-error" variant="small" style={{ color: colors.terracotta }}>{err}</T> : null}
              <Button label={busy ? "Reconciling…" : "Reconcile now"} testID="qp1-reconcile-statement-submit" variant="secondary" loading={busy} disabled={!selectedId} onPress={submit} />
              {result ? (
                <View testID="qp1-reconcile-statement-result" style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
                  <T style={{ fontFamily: fonts.headingSemi, fontSize: 15, color: colors.success }}>
                    {result.matched_count} matched · {result.unmatched_count} logged as ad-hoc · {result.lines_considered} lines considered
                  </T>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

function ReconcileForm({ participantId, onDone }: { participantId: string; onDone: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  function parseCsv(input: string) {
    return input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 2) return null;
      const iso = parts[0];
      const amount = Number(parts[1]);
      const description = parts.slice(2).join(",").trim() || null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isFinite(amount)) return null;
      return { line_date: iso, amount, description };
    }).filter(Boolean);
  }

  async function submit() {
    setErr(""); setResult(null);
    const lines = parseCsv(csv);
    if (lines.length === 0) { setErr("Paste at least one line: YYYY-MM-DD, amount, description"); return; }
    setBusy(true);
    try {
      const data = await apiFetch<any>("/qp1/reconciliations", { method: "POST", body: {
        participant_id: participantId, statement_ref: ref.trim() || null, lines, create_adhoc_for_unmatched: true,
      } });
      setResult(data);
      onDone();
    } catch { setErr("Reconciliation failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card testID="qp1-reconcile-card">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T variant="h3">Reconcile against a statement</T>
          <T variant="small" style={{ marginTop: 2 }}>Paste one line per row from your provider statement (date, amount, description). Matches replace assumed spend and lift the pacing confidence.</T>
        </View>
        <Button label={open ? "Close" : "Reconcile"} testID="qp1-reconcile-toggle" variant="outline" icon={FileCheck2} onPress={() => setOpen((v) => !v)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
      </View>
      {open ? (
        <View testID="qp1-reconcile-form" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Field label="Statement reference" optional testID="qp1-reconcile-ref" value={ref} onChangeText={setRef} />
          <Field label="Statement lines (one per row: YYYY-MM-DD, amount, description)" required testID="qp1-reconcile-csv"
            value={csv} onChangeText={setCsv} placeholder="2026-08-04, 108.75, BlueBerry Care visit" multiline
            style={{ }} />
          {err ? <T testID="qp1-reconcile-error" variant="small" style={{ color: colors.terracotta }}>{err}</T> : null}
          <Button label={busy ? "Reconciling…" : "Reconcile lines"} testID="qp1-reconcile-submit" loading={busy} onPress={submit} />
          {result ? (
            <View testID="qp1-reconcile-result" style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.sageSoft }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 15, color: colors.success }}>
                {result.matched_count} matched · {result.unmatched_count} logged as ad-hoc
              </T>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// ============================== SCHEDULES TAB ==============================

function SchedulesTab({ schedules, participantId, onChanged }: { schedules: any[]; participantId: string; onChanged: () => void }) {
  return (
    <View style={{ gap: spacing.md }} testID="qp1-schedules-view">
      <ScheduleForm participantId={participantId} onSaved={onChanged} />
      <Card>
        <T variant="h3">Your schedules</T>
        {schedules.length === 0 ? (
          <T variant="small" style={{ marginTop: spacing.sm }}>No schedules yet. Add one above to start tracking pacing.</T>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {schedules.map((s) => <ScheduleRow key={s.id} sched={s} onChanged={onChanged} />)}
          </View>
        )}
      </Card>
    </View>
  );
}

function ScheduleRow({ sched, onChanged }: { sched: any; onChanged: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  async function end() {
    setBusy(true);
    try { await apiFetch(`/qp1/schedules/${sched.id}`, { method: "DELETE" }); onChanged(); }
    catch { /* silent */ }
    finally { setBusy(false); }
  }
  const cadenceLabel = sched.cadence === "weekly" || sched.cadence === "fortnightly"
    ? `${sched.cadence} · ${DAYS[sched.cadence_day ?? 0]?.label || ""}`
    : sched.cadence === "monthly" ? `monthly · day ${sched.cadence_day_of_month || 1}` : "one-off";
  return (
    <View testID={`qp1-schedule-row-${sched.id}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{sched.service_type}</T>
        <T variant="small" style={{ marginTop: 2 }}>
          {cadenceLabel} · {sched.duration_hours}h @ {money(sched.hourly_rate)}/hr{sched.provider_name ? ` · ${sched.provider_name}` : ""} · from {sched.effective_from}
        </T>
      </View>
      <Pressable testID={`qp1-schedule-end-${sched.id}`} onPress={end} disabled={busy} hitSlop={8}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.terracotta, opacity: busy ? 0.5 : 1 }}>End schedule</T>
      </Pressable>
    </View>
  );
}

function ScheduleForm({ participantId, onSaved }: { participantId: string; onSaved: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [provider, setProvider] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [day, setDay] = useState("1");
  const [dom, setDom] = useState("1");
  const [dur, setDur] = useState("1");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(today());
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!serviceType.trim() || !dur || !rate) { setErr("Fill service type, duration and rate"); return; }
    setBusy(true);
    try {
      await apiFetch("/qp1/schedules", { method: "POST", body: {
        participant_id: participantId, service_type: serviceType.trim(), provider_name: provider.trim() || null,
        cadence,
        cadence_day: (cadence === "weekly" || cadence === "fortnightly") ? Number(day) : null,
        cadence_day_of_month: cadence === "monthly" ? Number(dom) : null,
        duration_hours: Number(dur), hourly_rate: Number(rate), effective_from: from,
      } });
      setServiceType(""); setProvider(""); setDur("1"); setRate(""); setOpen(false);
      onSaved();
    } catch { setErr("Could not save"); }
    finally { setBusy(false); }
  }

  return (
    <Card testID="qp1-schedule-form-card">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T variant="h3">Add a recurring service</T>
          <T variant="small" style={{ marginTop: 2 }}>This drives your pacing calculation.</T>
        </View>
        <Button label={open ? "Close" : "Add schedule"} testID="qp1-schedule-toggle" variant="outline" icon={Plus} onPress={() => setOpen((v) => !v)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
      </View>
      {open ? (
        <View testID="qp1-schedule-form" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Field label="Service type" required testID="qp1-schedule-service" value={serviceType} onChangeText={setServiceType} />
          <Field label="Provider" optional testID="qp1-schedule-provider" value={provider} onChangeText={setProvider} />
          <Select label="Cadence" required testID="qp1-schedule-cadence" value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} />
          {(cadence === "weekly" || cadence === "fortnightly") ? (
            <Select label="Day of week" required testID="qp1-schedule-day" value={day} onChange={setDay} options={DAYS} />
          ) : null}
          {cadence === "monthly" ? (
            <Field label="Day of month" required testID="qp1-schedule-dom" value={dom} onChangeText={setDom} keyboardType="number-pad" />
          ) : null}
          <Field label="Hours per visit" required testID="qp1-schedule-hours" value={dur} onChangeText={setDur} keyboardType="decimal-pad" />
          <Field label="Rate $/hr" required testID="qp1-schedule-rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <DateField label="Start date" required testID="qp1-schedule-from" value={from} onChange={setFrom} maximumDate={new Date(2100, 0, 1)} />
          {err ? <T variant="small" style={{ color: colors.terracotta }}>{err}</T> : null}
          <Button label="Save schedule" testID="qp1-schedule-save" loading={busy} onPress={save} />
        </View>
      ) : null}
    </Card>
  );
}

// ============================== HISTORY TAB ==============================

function HistoryTab({ participantId, classification }: { participantId: string; classification: number | null }) {
  const { colors } = useTheme();
  const [history, setHistory] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const q = classification
          ? `?participant_id=${participantId}&classification=${classification}&quarters=4`
          : `?participant_id=${participantId}&quarters=4`;
        const data = await apiFetch<any>(`/qp1/pacing/history${q}`);
        if (alive) setHistory(data.history || []);
      } catch { if (alive) setErr("Could not load history"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [participantId, classification]);

  if (loading) return <Loading />;
  if (err) return <StatePanel testID="qp1-history-error" icon={Info} title={err} />;

  return (
    <View style={{ gap: spacing.md }} testID="qp1-history-view">
      <View>
        <T variant="label">PAST QUARTERS</T>
        <T style={{ fontFamily: fonts.heading, fontSize: 22, marginTop: 4 }}>How the last four quarters landed.</T>
        <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>Ledger totals across previous quarters. Blank ones mean no data was tracked in Wayly at the time.</T>
      </View>
      {(history || []).map((h) => <HistoryCard key={h.quarter.start} snap={h} />)}
    </View>
  );
}

function HistoryCard({ snap }: { snap: any }) {
  const { colors } = useTheme();
  const meta = paceMeta(snap.pace_status, colors);
  const noData = snap.entries_counted === 0;
  const pct = snap.envelope > 0 ? Math.min(120, Math.round((snap.actual_spent / snap.envelope) * 100)) : 0;
  return (
    <Card testID={`qp1-history-card-${snap.quarter.start}`} style={{ borderColor: meta.color }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T style={{ fontFamily: fonts.headingSemi, fontSize: 16 }}>{snap.quarter.label}</T>
        <T variant="label" style={{ color: meta.color }}>{meta.label}</T>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <T variant="small">Envelope</T>
          <T style={{ fontFamily: fonts.headingSemi, fontSize: 17 }}>{money(snap.envelope)}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="small">Spent</T>
          <T style={{ fontFamily: fonts.headingSemi, fontSize: 17 }}>{noData ? "Not tracked" : money(snap.actual_spent)}</T>
        </View>
      </View>
      {!noData && snap.envelope > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surface2, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(pct, 100)}%`, height: "100%", backgroundColor: meta.color }} />
          </View>
          <T variant="small" style={{ marginTop: 4 }}>{pct}% of envelope · {snap.entries_counted} entries</T>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
});
