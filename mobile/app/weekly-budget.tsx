/**
 * WeeklyBudget (mobile) — the FUNDTRACK-1 "weekly screen" (parity with web
 * WeeklyBudget.jsx). Order locked by spec: the dashboard ladder card, the
 * alerts, the booked care behind G visit by visit, then the three actions
 * (Add a charge, What if I add care?, Something changed). Below that: what's
 * been used, what a statement has replaced, and any pending visits.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Archive, ArrowUpDown, CalendarClock, CalendarDays, CheckCircle2, Clock, Pencil, Plus, RefreshCw, Trash2, X,
} from "lucide-react-native";

import { AppHeader, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { BudgetLadderCard } from "@/src/components/BudgetLadderCard";
import { FundtrackAlerts } from "@/src/components/fundtrack/FundtrackAlerts";
import { ChargeEntrySheet } from "@/src/components/fundtrack/ChargeEntrySheet";
import { WhatIfCareSheet } from "@/src/components/fundtrack/WhatIfCareSheet";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { toast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

const CHANGES = [
  { key: "did_not_happen", label: "Didn't happen" },
  { key: "shorter", label: "Shorter" },
  { key: "longer", label: "Longer" },
  { key: "extra_visit", label: "Extra visit" },
  { key: "cancelled", label: "Cancelled late" },
];

const SRC: Record<string, string> = { entered: "You Entered", invoice: "From An Invoice", catch_up: "Catch-Up", booked: "Booked" };
const srcLabel = (s: string) => SRC[s] || "You Entered";
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDateFull = (iso?: string) => { if (!iso) return ""; try { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; } catch { return iso; } };
const STREAM_OPTS = [
  { value: "Clinical", label: "Clinical" },
  { value: "Independence", label: "Independence" },
  { value: "Everyday Living", label: "Everyday Living" },
];

const weekRange = () => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const d = (x: Date) => x.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${d(mon)} – ${d(sun)}`;
};

export default function WeeklyBudgetScreen() {
  const { activeId, active } = useParticipants();
  const pid = activeId || active?.id || "";
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<null | "charge" | "whatif">(null);
  const [changeVisit, setChangeVisit] = useState<any>(null);

  const load = useCallback(async () => {
    if (!pid) { setLoading(false); return; }
    try { const d = await apiFetch(`/fundtrack/participants/${pid}/overview`); setData(d); }
    catch { setData(null); } finally { setLoading(false); setRefreshing(false); }
  }, [pid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAlertAction = (action: string) => {
    if (action === "what_if") setSheet("whatif");
    else if (action === "upload") router.push("/upload");
    else if (action === "letter") router.push("/letters");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="This Week's Budget"
        subtitle={data && data.enabled ? `${data.participant_name} · ${data.quarter_label} · Classification ${data.classification}` : undefined}
        onBack={() => router.back()}
      />
      {!pid ? (
        <StatePanel testID="weekly-no-participant" icon={CalendarDays} title="This week's budget"
          message="Pick a participant from the switcher at the top." />
      ) : loading ? (
        <Loading label="Loading this week's budget…" />
      ) : data && !data.enabled ? (
        <StatePanel testID="weekly-disabled" icon={CalendarDays} title="This week's budget"
          message="Budget tracking isn't switched on for this household yet." />
      ) : !data ? (
        <View style={{ padding: spacing.lg }}>
          <Card testID="weekly-empty">
            <T variant="small">We couldn't load the budget.</T>
            <Button label="Try again" variant="outline" testID="weekly-retry" onPress={load} style={{ marginTop: spacing.md, alignSelf: "flex-start", paddingHorizontal: 16 }} />
          </Card>
        </View>
      ) : (
        <ScrollView
          testID="weekly-page"
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {/* current week range */}
          <View testID="weekly-week-range" style={{ flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 6, backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "33", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <CalendarDays size={14} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.heading }}>{weekRange()}</T>
          </View>

          {/* 1 · the dashboard ladder card, unchanged */}
          {data.ladder ? <BudgetLadderCard ladder={data.ladder} /> : null}

          {/* alerts */}
          <FundtrackAlerts alerts={data.alerts} onAction={onAlertAction} />

          {/* 2 · booked care behind G, visit by visit */}
          <Card testID="weekly-booked">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
              <CalendarDays size={16} color={colors.primary} />
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: colors.heading }}>Care You've Booked</T>
            </View>
            {(data.booked || []).length === 0 ? (
              <T variant="small">Nothing booked ahead this quarter. Use "What if I add care?" to plan a visit, then book it.</T>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {data.booked.map((b: any) => (
                  <View key={b.id} testID={`weekly-booked-${b.id}`} style={[styles.row, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }} numberOfLines={1}>{b.service_name}</T>
                      <T variant="small" style={{ fontSize: 12 }}>{shortDate(b.date)} · {b.stream}{b.unpriced ? " · unpriced" : ""}</T>
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>{b.unpriced ? "—" : money(b.amount)}</T>
                    <Pressable testID={`weekly-change-${b.id}`} onPress={() => setChangeVisit(b)} hitSlop={8}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary, textDecorationLine: "underline" }}>Changed</T>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* 3 · the three actions, in this order */}
          <View testID="weekly-actions" style={{ gap: spacing.sm }}>
            <ActionCard testID="weekly-add-charge" Icon={Plus} title="Add a charge" hint="Record what actually happened" tone="teal" onPress={() => setSheet("charge")} />
            <ActionCard testID="weekly-whatif" Icon={CalendarClock} title="What if I add care?" hint="See the spare before you book" tone="clay" onPress={() => setSheet("whatif")} />
            <ActionCard testID="weekly-something-changed" Icon={RefreshCw} title="Something changed" hint="A visit was missed or different" tone="gold" onPress={() => setChangeVisit(data.booked?.[0] || { blank: true })} />
          </View>

          {/* what you've recorded — searchable / filterable / sortable list with edit + delete */}
          {(data.used || []).length > 0 ? (
            <UsedEntriesCard items={data.used} pid={pid} savedServices={data.saved_services || []} onChanged={load} />
          ) : null}

          {/* superseded by a statement */}
          {(data.superseded || []).length > 0 ? (
            <Card testID="weekly-superseded" style={{ backgroundColor: colors.surface2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Archive size={15} color={colors.muted} />
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 14, color: colors.heading }}>Replaced by your statement</T>
              </View>
              <T variant="small" style={{ fontSize: 11, marginTop: 4, marginBottom: spacing.sm }}>A statement is the official record for its period, so we've set these entries aside. We kept them so you can still see what you logged.</T>
              {data.superseded.slice(0, 8).map((s: any) => (
                <View key={s.id} testID={`weekly-superseded-${s.id}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, paddingVertical: 3 }}>
                  <T variant="small" style={{ flex: 1, textDecorationLine: "line-through" }} numberOfLines={1}>{s.service_name} · {shortDate(s.date)}</T>
                  <T variant="small" style={{ textDecorationLine: "line-through" }}>{s.unpriced ? "unpriced" : money(s.amount)}</T>
                </View>
              ))}
            </Card>
          ) : null}

          {/* pending */}
          {(data.pending || []).length > 0 ? (
            <Card testID="weekly-pending" style={{ borderColor: colors.gold, backgroundColor: colors.goldSoft }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Clock size={15} color={colors.gold} />
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 14, color: colors.heading }}>Possible pending visits</T>
              </View>
              <T variant="small" style={{ fontSize: 11, marginTop: 4, marginBottom: spacing.sm }}>Booked visits whose date has passed but aren't confirmed yet. We haven't counted these in what's left — confirm or change them.</T>
              <View style={{ gap: spacing.sm }}>
                {data.pending.map((p: any) => (
                  <View key={p.id} testID={`weekly-pending-${p.id}`} style={[styles.row, { borderColor: colors.gold + "55", backgroundColor: colors.surface }]}>
                    <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{p.service_name} · {shortDate(p.date)}</T>
                    <Pressable onPress={() => setChangeVisit(p)} hitSlop={8}><T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold, textDecorationLine: "underline" }}>Confirm or change</T></Pressable>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <T testID="weekly-source-note" variant="small" style={{ fontSize: 11 }}>{data.source_note}</T>
        </ScrollView>
      )}

      <ChargeEntrySheet pid={pid} savedServices={data?.saved_services || []} visible={sheet === "charge"} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); }} />
      <WhatIfCareSheet pid={pid} savedServices={data?.saved_services || []} visible={sheet === "whatif"} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); }} />
      {changeVisit ? (
        <VisitChangeSheet pid={pid} visit={changeVisit} onClose={() => setChangeVisit(null)} onSaved={() => { setChangeVisit(null); load(); }} />
      ) : null}
    </View>
  );
}

function ActionCard({ title, hint, Icon, onPress, tone = "teal", testID }: { title: string; hint: string; Icon: any; onPress: () => void; tone?: "teal" | "clay" | "gold"; testID: string }) {
  const { colors } = useTheme();
  const tones: Record<string, { card: string; border: string; iconBg: string; icon: string; title: string; hint: string }> = {
    teal: { card: colors.cta, border: colors.cta, iconBg: "rgba(255,255,255,0.22)", icon: "#fff", title: "#fff", hint: "rgba(255,255,255,0.85)" },
    clay: { card: colors.terracotta, border: colors.terracotta, iconBg: "rgba(255,255,255,0.22)", icon: "#fff", title: "#fff", hint: "rgba(255,255,255,0.85)" },
    gold: { card: "#C2683D", border: "#C2683D", iconBg: "rgba(255,255,255,0.22)", icon: "#fff", title: "#fff", hint: "rgba(255,255,255,0.85)" },
  };
  const t = tones[tone] || tones.teal;
  return (
    <Pressable testID={testID} onPress={onPress}
      style={({ pressed }) => [styles.actionCard, { backgroundColor: t.card, borderColor: t.border }, pressed && { opacity: 0.92 }]}>
      <View style={[styles.actionIcon, { backgroundColor: t.iconBg }]}>
        <Icon size={18} color={t.icon} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: t.title }}>{title}</T>
        <T style={{ fontFamily: fonts.body, fontSize: 12, marginTop: 1, color: t.hint }}>{hint}</T>
      </View>
    </Pressable>
  );
}

/** Mark what changed for a visit (no free text required). */
function VisitChangeSheet({ pid, visit, onClose, onSaved }: any) {
  const { colors } = useTheme();
  const [change, setChange] = useState("did_not_happen");
  const [amount, setAmount] = useState(visit?.amount ? String(visit.amount) : "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const needsAmount = change === "shorter" || change === "longer";
  const isExtra = change === "extra_visit";

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch(`/fundtrack/participants/${pid}/something-changed`, {
        method: "POST",
        body: {
          charge_id: visit?.blank ? null : visit?.id,
          service_name: isExtra ? (name || "Extra visit") : visit?.service_name,
          stream: visit?.stream,
          date: visit?.date || new Date().toISOString().slice(0, 10),
          change,
          amount: (needsAmount || isExtra) ? (amount === "" ? null : Number(amount)) : null,
          scope: "just_this",
        },
      });
      toast.success("Noted — the figures have been updated. Check your latest balance.");
      onSaved?.();
    } catch { toast.error("Could not record that change. Please try again."); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable testID="visit-change-sheet" onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.heading }}>Something changed</T>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
          </View>
          {!visit?.blank ? <T variant="small" style={{ paddingHorizontal: spacing.lg, fontSize: 12 }}>{visit?.service_name} · {shortDate(visit?.date)}</T> : null}
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {CHANGES.map((c) => {
                const active = change === c.key;
                return (
                  <Pressable key={c.key} testID={`visit-change-${c.key}`} onPress={() => setChange(c.key)}
                    style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: active ? "#fff" : colors.text }}>{c.label}</T>
                  </Pressable>
                );
              })}
            </View>
            {isExtra ? <Field label="What was the extra visit?" value={name} onChangeText={setName} placeholder="e.g. Extra cleaning" testID="visit-change-name" /> : null}
            {(needsAmount || isExtra) ? <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" testID="visit-change-amount" /> : null}
            <Button label="Save" testID="visit-change-save" onPress={submit} loading={busy} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Add (create) or edit a recorded entry (service / date / amount / category). */
function EditEntrySheet({ entry, pid, savedServices = [], onClose, onSaved }: any) {
  const { colors } = useTheme();
  const isCreate = !entry?.id;
  const [serviceName, setServiceName] = useState(entry?.service_name || "");
  const [date, setDate] = useState((entry?.date || todayISO()).slice(0, 10));
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
  const [stream, setStream] = useState(entry?.stream || "Everyday Living");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!serviceName.trim()) { toast.error("Add a service name."); return; }
    setBusy(true);
    try {
      if (isCreate) {
        await apiFetch(`/fundtrack/participants/${pid}/charges`, { method: "POST", body: { source: "entered", service_name: serviceName.trim(), stream, date: date || todayISO(), amount: amount === "" ? null : Number(amount) } });
        toast.success("Entry added. Your budget's been updated — check your latest balance.");
      } else {
        await apiFetch(`/fundtrack/charges/${entry.id}`, { method: "PATCH", body: { service_name: serviceName.trim(), date, amount: amount === "" ? null : Number(amount) } });
        toast.success("Entry updated. Your budget's been updated — check your latest balance.");
      }
      onSaved?.();
    } catch { toast.error("Could not save that entry. Please try again."); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={onClose}>
        <Pressable testID="edit-entry-sheet" onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, maxHeight: "88%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.heading }}>{isCreate ? "Add Entry" : "Edit Entry"}</T>
            <Pressable onPress={onClose} hitSlop={8} testID="edit-entry-close"><X size={22} color={colors.muted} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
            {isCreate && savedServices.length > 0 ? (
              <View>
                <T variant="small" style={{ marginBottom: 6 }}>Quick pick from your usual care</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {savedServices.slice(0, 8).map((s: any) => (
                    <Pressable key={s.service_id} testID={`edit-entry-pick-${s.service_id}`} onPress={() => { setServiceName(s.service_name); setStream(s.stream || "Everyday Living"); if (s.last_amount != null) setAmount(String(s.last_amount)); }}
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <T style={{ fontSize: 12, color: colors.heading }}>{s.service_name}</T>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <Field label="Service" value={serviceName} onChangeText={setServiceName} placeholder="e.g. Personal care" testID="edit-entry-service" />
            <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} testID="edit-entry-date" />
            <Field label="Amount ($)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Unpriced" testID="edit-entry-amount" />
            {isCreate ? <Select label="Category" value={stream} onChange={setStream} options={STREAM_OPTS} testID="edit-entry-stream" /> : null}
            <Button label={isCreate ? "Add Entry" : "Save Changes"} testID="edit-entry-save" onPress={submit} loading={busy} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Searchable / filterable / sortable recorded-entries list (parity with web). */
function UsedEntriesCard({ items, pid, savedServices, onChanged }: { items: any[]; pid: string; savedServices: any[]; onChanged: () => void }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "amount" | "service">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busyDel, setBusyDel] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  const sources = Array.from(new Set(items.map((i) => i.source))).filter(Boolean) as string[];
  const filtered = items
    .filter((i) => source === "all" || i.source === source)
    .filter((i) => !query.trim() || (i.service_name || "").toLowerCase().includes(query.trim().toLowerCase()))
    .filter((i) => { const d = (i.date || "").slice(0, 10); if (fromDate && d < fromDate) return false; if (toDate && d > toDate) return false; return true; });
  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "service") { av = (a.service_name || "").toLowerCase(); bv = (b.service_name || "").toLowerCase(); }
    else if (sortKey === "amount") { av = a.amount ?? -1; bv = b.amount ?? -1; }
    else { av = a.date || ""; bv = b.date || ""; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const toggleSort = (k: "date" | "amount" | "service") => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "service" ? "asc" : "desc"); }
  };

  const delEntry = async (id: string) => {
    setBusyDel(true);
    try { await apiFetch(`/fundtrack/charges/${id}`, { method: "DELETE" }); toast.success("Entry deleted. Your budget's been updated — check your latest balance."); setConfirmDel(null); onChanged?.(); }
    catch { toast.error("Could not delete that entry. Please try again."); } finally { setBusyDel(false); }
  };

  const sourceChips = [{ value: "all", label: "All Sources" }, ...sources.map((s) => ({ value: s, label: srcLabel(s) }))];
  const sortChips: { k: "date" | "amount" | "service"; label: string }[] = [{ k: "date", label: "Date" }, { k: "amount", label: "Amount" }, { k: "service", label: "Service" }];
  const hasFilters = !!(query || source !== "all" || fromDate || toDate);

  return (
    <Card testID="weekly-used">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
        <CheckCircle2 size={16} color={colors.sage} />
        <T numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontFamily: fonts.headingSemi, fontSize: 15, color: colors.heading }}>What You Have Recorded This Quarter</T>
        <Pressable testID="weekly-used-add" onPress={() => setAdding(true)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Plus size={13} color="#fff" />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: "#fff" }}>Add Entry</T>
        </Pressable>
      </View>

      {/* search */}
      <Field value={query} onChangeText={setQuery} placeholder="Search services" testID="weekly-used-search" style={{ marginBottom: spacing.sm }} />

      {/* source filter — single horizontal scroller (never wraps) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }} style={{ marginBottom: spacing.sm }}>
        {sourceChips.map((c) => {
          const on = source === c.value;
          return (
            <Pressable key={c.value} testID={`weekly-used-source-${c.value}`} onPress={() => setSource(c.value)}
              style={{ flexShrink: 0, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: on ? "#fff" : colors.text }}>{c.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* from–to date range */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><DateField label="From" value={fromDate} onChange={setFromDate} maximumDate={new Date()} testID="weekly-used-from" placeholder="Any" /></View>
        <View style={{ flex: 1 }}><DateField label="To" value={toDate} onChange={setToDate} maximumDate={new Date()} testID="weekly-used-to" placeholder="Any" /></View>
      </View>
      {hasFilters ? (
        <Pressable testID="weekly-used-clear" onPress={() => { setQuery(""); setSource("all"); setFromDate(""); setToDate(""); }} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: spacing.sm }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.cta }}>Clear filters</T>
        </Pressable>
      ) : null}

      {/* sort — single horizontal scroller */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center", paddingBottom: 2 }} style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
        <T variant="small" style={{ fontSize: 12, marginRight: 2 }}>Sort</T>
        {sortChips.map((s) => {
          const on = sortKey === s.k;
          return (
            <Pressable key={s.k} testID={`weekly-used-sort-${s.k}`} onPress={() => toggleSort(s.k)}
              style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, height: 32, backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: on ? "#fff" : colors.text }}>{s.label}</T>
              {on ? <ArrowUpDown size={12} color="#fff" /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* list */}
      {sorted.length === 0 ? (
        <T testID="weekly-used-empty" variant="small" style={{ textAlign: "center", paddingVertical: spacing.lg }}>No entries match your filter.</T>
      ) : sorted.map((u: any) => (
        <View key={u.id} testID={`weekly-used-${u.id}`} style={{ paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.body, fontSize: 14 }} numberOfLines={1}>{u.service_name}</T>
              <T variant="small" style={{ fontSize: 12 }}>{fmtDateFull(u.date)} · {srcLabel(u.source)}</T>
            </View>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>{u.unpriced ? "Unpriced" : money(u.amount)}</T>
          </View>
          {confirmDel === u.id ? (
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: 8, alignItems: "center" }}>
              <Pressable testID={`weekly-used-delete-confirm-${u.id}`} onPress={() => delEntry(u.id)} disabled={busyDel} hitSlop={6}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.terracotta }}>{busyDel ? "…" : "Confirm Delete"}</T>
              </Pressable>
              <Pressable onPress={() => setConfirmDel(null)} hitSlop={6}><T variant="small" style={{ fontSize: 12, color: colors.muted }}>Cancel</T></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: 8 }}>
              <Pressable testID={`weekly-used-edit-${u.id}`} onPress={() => setEditEntry(u)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pencil size={13} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Edit</T>
              </Pressable>
              <Pressable testID={`weekly-used-delete-${u.id}`} onPress={() => setConfirmDel(u.id)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Trash2 size={13} color={colors.terracotta} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.terracotta }}>Delete</T>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {editEntry ? <EditEntrySheet entry={editEntry} pid={pid} onClose={() => setEditEntry(null)} onSaved={() => { setEditEntry(null); onChanged?.(); }} /> : null}
      {adding ? <EditEntrySheet pid={pid} savedServices={savedServices} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged?.(); }} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  actionCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  actionIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
