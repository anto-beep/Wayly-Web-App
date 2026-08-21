import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Plus, AlertCircle, ChevronRight, X } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, Select, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export const REASONS = [
  { key: "billing_disputes_unresolved", label: "Unresolved billing disputes" },
  { key: "care_quality_declined", label: "Care quality declined" },
  { key: "worker_experience_issues", label: "Worker experience issues" },
  { key: "provider_communication_breakdown", label: "Provider communication breakdown" },
  { key: "financial_reasons", label: "Financial reasons" },
  { key: "location_change", label: "Location change" },
  { key: "care_manager_concerns", label: "Care manager concerns" },
  { key: "care_plan_alignment_issues", label: "Care plan alignment issues" },
  { key: "other", label: "Other" },
];
export const STAGE_LABEL: Record<string, string> = {
  deciding: "Deciding",
  decision_confirmed: "Decision confirmed",
  notice_being_prepared: "Notice being prepared",
  notice_given_awaiting_effective_date: "Notice given · awaiting effective date",
  care_plan_transitioning: "Care plan transitioning",
  overlap_period_active: "Overlap period active",
  old_provider_closing_out: "Old provider closing out",
  final_settlement_pending: "Final settlement pending",
  new_provider_onboarded: "New provider onboarded",
  completed: "Completed",
  abandoned: "Abandoned",
};

function stageTone(stage: string, colors: any) {
  if (["completed", "new_provider_onboarded"].includes(stage)) return { bg: colors.sageSoft, fg: colors.sage };
  if (stage === "abandoned") return { bg: colors.surface2, fg: colors.muted };
  if (stage === "deciding") return { bg: colors.goldSoft, fg: colors.gold };
  if (["overlap_period_active", "old_provider_closing_out", "final_settlement_pending"].includes(stage)) return { bg: colors.alertSoft, fg: colors.alert };
  return { bg: colors.surface2, fg: colors.primary };
}

function daysAtStage(row: any): number | null {
  const enter = row?.stage_history?.[row.stage_history.length - 1]?.entered_at;
  if (!enter) return null;
  return Math.floor((Date.now() - new Date(enter).getTime()) / 86400000);
}

export default function ProviderSwitchScreen() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const pid = active?.id;
  const [rows, setRows] = useState<any[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pid) { setRows([]); return; }
    try {
      const data = await apiFetch<any>(`/psw1/participants/${pid}/switches`);
      setRows(data?.switches || []);
    } catch { setRows([]); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading switches…" /></View>;

  const activeRows = rows.filter((r) => !["completed", "abandoned"].includes(r.switch_stage));
  const history = rows.filter((r) => ["completed", "abandoned"].includes(r.switch_stage));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="psw1-list-root">
        <PageIntro
          eyebrow="Provider Switches"
          title="Managing a Provider Switch, End-to-End"
          description="Switching provider is one of the most stressful things a family can do. Wayly holds your hand from the notice letter through the overlap period to the final settlement, so nothing gets lost between the two providers."
          whatItDoes="Tracks each switch as a workflow: notice served, transition window, service overlap, and post-switch settlement of refunds or top-up invoices."
        />

        {rows.length > 0 ? (
          <SmartAISummary
            pageKey="provider-switches"
            context={{
              total: rows.length,
              active_count: activeRows.length,
              history_count: history.length,
              deciding_count: rows.filter((r) => r.switch_stage === "deciding").length,
              settlement_pending: rows.filter((r) => r.switch_stage === "final_settlement_pending").length,
            }}
          />
        ) : null}

        <Button label="New Switch" icon={Plus} testID="psw1-new-btn" onPress={() => setModalOpen(true)} disabled={!pid} />

        {rows.length === 0 ? (
          <Card testID="psw1-empty" style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <AlertCircle size={28} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm }}>No provider switches in progress.</T>
          </Card>
        ) : (
          <>
            {activeRows.length > 0 ? (
              <View testID="psw1-active-list" style={{ gap: spacing.sm }}>
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>ACTIVE SWITCHES</T>
                {activeRows.map((r) => <SwitchRow key={r.id} row={r} colors={colors} />)}
              </View>
            ) : null}
            {history.length > 0 ? (
              <View testID="psw1-history-list" style={{ gap: spacing.sm }}>
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>HISTORY</T>
                {history.map((r) => <SwitchRow key={r.id} row={r} colors={colors} />)}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <NewSwitchModal visible={modalOpen} pid={pid} colors={colors} onClose={() => setModalOpen(false)} onCreated={() => { setModalOpen(false); load(); }} />
    </View>
  );
}

function SwitchRow({ row, colors }: any) {
  const tone = stageTone(row.switch_stage, colors);
  const days = daysAtStage(row);
  const isDeciding = row.switch_stage === "deciding";
  const isSettlement = ["final_settlement_pending", "new_provider_onboarded", "completed"].includes(row.switch_stage);
  const target = isDeciding ? `/switch-decision/${row.id}` : isSettlement ? `/switch-settlement/${row.id}` : null;
  return (
    <Pressable testID={`psw1-row-${row.id}`} disabled={!target} onPress={() => target && router.push(target as any)}>
      <Card>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }} numberOfLines={1}>
          {row.current_provider_name}{row.new_provider_name ? ` → ${row.new_provider_name}` : ""}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm, flexWrap: "wrap" }}>
          <View testID={`psw1-stage-${row.id}`} style={{ backgroundColor: tone.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: tone.fg }}>{(STAGE_LABEL[row.switch_stage] || row.switch_stage).toUpperCase()}</T>
          </View>
          {days !== null ? <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{days}d at this stage</T> : null}
        </View>
        {target ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm }}>
            <T testID={isDeciding ? `psw1-decision-link-${row.id}` : `psw1-settlement-link-${row.id}`} style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>
              {isDeciding ? "Complete Decision Walkthrough" : "Settlement & Refund"}
            </T>
            <ChevronRight size={15} color={colors.primary} />
          </View>
        ) : (
          <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: spacing.sm }}>Stage in progress</T>
        )}
      </Card>
    </Pressable>
  );
}

function NewSwitchModal({ visible, pid, colors, onClose, onCreated }: any) {
  const [form, setForm] = useState({ current_provider_name: "", initial_reason_for_switch: "billing_disputes_unresolved", reason_notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await apiFetch(`/psw1/participants/${pid}/switches`, { method: "POST", body: form });
      setForm({ current_provider_name: "", initial_reason_for_switch: "billing_disputes_unresolved", reason_notes: "" });
      onCreated();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not create switch."); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.bg }]} testID="psw1-new-modal">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text }}>Start a Provider Switch</T>
            <Pressable testID="psw1-modal-close" onPress={onClose} hitSlop={10}><X size={22} color={colors.muted} /></Pressable>
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: 4 }}>Wayly supports the switching process once decided. We do not recommend providers.</T>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Field label="Current provider name" testID="psw1-modal-provider" value={form.current_provider_name} onChangeText={(v: string) => setForm({ ...form, current_provider_name: v })} />
            <Select label="Main reason" value={form.initial_reason_for_switch} onChange={(v: string) => setForm({ ...form, initial_reason_for_switch: v })} options={REASONS.map((r) => ({ value: r.key, label: r.label }))} testID="psw1-modal-reason" />
            <Field label="Notes (optional)" testID="psw1-modal-notes" value={form.reason_notes} onChangeText={(v: string) => setForm({ ...form, reason_notes: v })} multiline />
          </View>
          {err ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="psw1-modal-error">{err}</T> : null}
          <Button label="Start switch" testID="psw1-modal-submit" loading={busy} disabled={!form.current_provider_name.trim()} onPress={submit} style={{ marginTop: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
});
