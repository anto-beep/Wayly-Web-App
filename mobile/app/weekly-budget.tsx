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
  Archive, CalendarClock, CalendarDays, CheckCircle2, Clock, Plus, RefreshCw, X,
} from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { BudgetLadderCard } from "@/src/components/BudgetLadderCard";
import { FundtrackAlerts } from "@/src/components/fundtrack/FundtrackAlerts";
import { ChargeEntrySheet } from "@/src/components/fundtrack/ChargeEntrySheet";
import { WhatIfCareSheet } from "@/src/components/fundtrack/WhatIfCareSheet";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
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

          {/* what you've used */}
          {(data.used || []).length > 0 ? (
            <Card testID="weekly-used">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
                <CheckCircle2 size={16} color={colors.sage} />
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: colors.heading }}>What you've recorded this quarter</T>
              </View>
              {data.used.slice(0, 12).map((u: any) => (
                <View key={u.id} testID={`weekly-used-${u.id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.body, fontSize: 14 }} numberOfLines={1}>{u.service_name}</T>
                    <T variant="small" style={{ fontSize: 12 }}>{shortDate(u.date)} · {u.source === "invoice" ? "from an invoice" : u.source === "catch_up" ? "catch-up" : "you entered"}</T>
                  </View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>{u.unpriced ? "unpriced" : money(u.amount)}</T>
                </View>
              ))}
            </Card>
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
      onSaved?.();
    } catch { /* ignore */ } finally { setBusy(false); }
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  actionCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  actionIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
