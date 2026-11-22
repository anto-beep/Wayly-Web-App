/**
 * WhatIfCareSheet (mobile) — FUNDTRACK-1 "What if I add care?" (parity with web
 * WhatIfCareDialog). Inputs: service, price, category, date, frequency (once /
 * every week until a date). Outputs: visits, total budget impact at full price,
 * participant share, the REVISED spare (H), and any quarter boundary crossed.
 * "Book this care" persists the visits as booked (counting in G).
 */
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, X } from "lucide-react-native";

import { Button, DateField, Field, Select, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

const FUTURE = new Date(2100, 0, 1);
const nextWeekISO = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
const quarterEndGuessISO = () => {
  const d = new Date(); const m = d.getMonth();
  const qEndMonth = [2, 2, 2, 5, 5, 5, 8, 8, 8, 11, 11, 11][m];
  const day = [31, 31, 31, 30, 30, 30, 30, 30, 30, 31, 31, 31][m];
  return new Date(d.getFullYear(), qEndMonth, day).toISOString().slice(0, 10);
};
const STREAMS = [
  { value: "Clinical", label: "Clinical" },
  { value: "Independence", label: "Independence" },
  { value: "Everyday Living", label: "Everyday Living" },
];
const FREQ = [{ value: "once", label: "Just once" }, { value: "weekly", label: "Every week" }];

export function WhatIfCareSheet({ pid, savedServices = [], visible, onClose, onSaved }: any) {
  const { colors } = useTheme();
  const first = savedServices[0];
  const [serviceName, setServiceName] = useState(first?.service_name || "");
  const [stream, setStream] = useState(first?.stream || "Everyday Living");
  const [unitPrice, setUnitPrice] = useState(first ? String(first.last_amount) : "");
  const [date, setDate] = useState(nextWeekISO());
  const [frequency, setFrequency] = useState("weekly");
  const [until, setUntil] = useState(quarterEndGuessISO());
  const [result, setResult] = useState<any>(null);
  const [computing, setComputing] = useState(false);
  const [booking, setBooking] = useState(false);
  const timer = useRef<any>(null);

  const reset = () => {
    const f = savedServices[0];
    setServiceName(f?.service_name || ""); setStream(f?.stream || "Everyday Living");
    setUnitPrice(f ? String(f.last_amount) : ""); setDate(nextWeekISO());
    setFrequency("weekly"); setUntil(quarterEndGuessISO()); setResult(null);
  };
  const close = () => { onClose?.(); };

  const pickSaved = (sid: string) => {
    const svc = savedServices.find((s: any) => s.service_id === sid);
    if (svc) { setServiceName(svc.service_name); setStream(svc.stream); setUnitPrice(String(svc.last_amount)); }
  };

  useEffect(() => {
    if (!visible) return;
    if (!serviceName || unitPrice === "") { setResult(null); return; }
    clearTimeout(timer.current);
    setComputing(true);
    timer.current = setTimeout(async () => {
      try {
        const data: any = await apiFetch(`/fundtrack/participants/${pid}/what-if`, {
          method: "POST",
          body: { service_name: serviceName, stream, unit_price: Number(unitPrice), date, frequency, until: frequency === "weekly" ? until : null },
        });
        setResult(data.what_if);
      } catch { setResult(null); } finally { setComputing(false); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [visible, pid, serviceName, stream, unitPrice, date, frequency, until]);

  const book = async () => {
    setBooking(true);
    try {
      const data: any = await apiFetch(`/fundtrack/participants/${pid}/what-if`, {
        method: "POST",
        body: { service_name: serviceName, stream, unit_price: Number(unitPrice), date, frequency, until: frequency === "weekly" ? until : null, save: true },
      });
      onSaved?.(data.saved); reset(); onClose?.();
    } catch { /* ignore */ } finally { setBooking(false); }
  };

  const over = result?.revised_spare_is_negative;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, maxHeight: "90%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <CalendarClock size={20} color={colors.gold} />
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, color: colors.heading }}>What if I add care?</T>
            </View>
            <Pressable testID="whatif-close" onPress={close} hitSlop={8}><X size={22} color={colors.muted} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {savedServices.length > 0 ? (
              <Select label="Pick from your usual care" testID="whatif-saved" value={""} onChange={pickSaved} placeholder="Choose a service…"
                options={savedServices.map((s: any) => ({ value: s.service_id, label: `${s.service_name} · ${money(s.last_amount)}` }))} />
            ) : null}
            <Field label="Service" value={serviceName} onChangeText={setServiceName} placeholder="e.g. Cleaning" testID="whatif-service" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}><Field label="Price per visit ($)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="0" testID="whatif-price" /></View>
              <View style={{ flex: 1 }}><Select label="Category" value={stream} onChange={setStream} options={STREAMS} testID="whatif-stream" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}><DateField label="Starting" value={date} onChange={setDate} maximumDate={FUTURE} testID="whatif-date" /></View>
              <View style={{ flex: 1 }}><Select label="How often" value={frequency} onChange={setFrequency} options={FREQ} testID="whatif-frequency" /></View>
            </View>
            {frequency === "weekly" ? (
              <DateField label="Until" value={until} onChange={setUntil} maximumDate={FUTURE} testID="whatif-until" />
            ) : null}

            <View testID="whatif-result" style={{ borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, borderColor: over ? colors.terracotta + "55" : colors.primary + "33", backgroundColor: over ? colors.errorSoft : colors.surface2 }}>
              {computing ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Loader2 size={16} color={colors.muted} /><T variant="small">Working it out…</T></View>
              ) : !result ? (
                <T variant="small">Pick a service and price to see the effect.</T>
              ) : (
                <>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm }}>
                    <Stat label="Visits" value={String(result.visits)} />
                    <Stat label="Total cost" value={money(result.total_budget_impact_aud)} />
                    <Stat label="Est. participant share" value={money(result.participant_share_aud)} />
                    <Stat label="Spare for extra care, after" value={money(result.revised_spare_aud)} over={over} testID="whatif-revised-h" />
                  </View>
                  {result.quarter_boundary_crossed ? (
                    <View testID="whatif-boundary" style={{ flexDirection: "row", gap: 6, marginTop: spacing.sm }}>
                      <AlertTriangle size={15} color={colors.gold} style={{ marginTop: 2 }} />
                      <T variant="small" style={{ flex: 1 }}>{result.visits_next_quarter} of these visits fall in next quarter and use next quarter's funding — shown as unconfirmed until that quarter starts.</T>
                    </View>
                  ) : null}
                  {over ? (
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.terracotta, marginTop: spacing.sm }}>This would take the spare below zero. It may push the quarter into overspend — check prices or talk to the provider first.</T>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
                      <CheckCircle2 size={15} color={colors.sage} />
                      <T variant="small" style={{ color: colors.sage }}>This fits within what's left this quarter.</T>
                    </View>
                  )}
                </>
              )}
            </View>

            <Button label="Book this care" testID="whatif-book" icon={CalendarClock} onPress={book} loading={booking} disabled={!result} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value, over, testID }: { label: string; value: string; over?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ width: "50%", paddingRight: spacing.sm }}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.6, color: colors.muted }}>{label.toUpperCase()}</T>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 2, color: over ? colors.terracotta : colors.heading }}>{value}</T>
    </View>
  );
}
