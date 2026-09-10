import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle2, AlertTriangle, DollarSign, ExternalLink } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, Select, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const STATUS_LABEL: Record<string, string> = {
  review_complete_refund_pending: "Refund pending",
  not_yet_calculated: "Refund pending",
  pending_receipt: "Refund pending",
  refund_received_reconciled: "Reconciled",
  received_matches_expected: "Reconciled",
  refund_received_variance_flagged: "Variance flagged · dispute opened",
  received_less_than_expected_disputed: "Variance flagged · dispute opened",
};
const METHODS = [
  { value: "prepaid_less_delivered_services", label: "Prepaid less delivered services" },
  { value: "unused_credit_from_agreement", label: "Unused credit from agreement" },
  { value: "pro_rata_month_charge", label: "Pro-rata month charge" },
  { value: "other", label: "Other" },
];

function money(m: any): string {
  if (!m || m.amount === null || m.amount === undefined) return "—";
  return `$${Number(m.amount).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LInput({ label, value, onChangeText, testID, colors }: any) {
  return (
    <View>
      <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</T>
      <TextInput testID={testID} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholderTextColor={colors.muted}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: colors.text, fontFamily: fonts.mono, backgroundColor: colors.bg }} />
    </View>
  );
}

export default function SwitchSettlementScreen() {
  const { colors } = useTheme();
  const { sid } = useLocalSearchParams<{ sid: string }>();
  const [sw, setSw] = useState<any>(null);
  const [settlement, setSettlement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    if (!sid) return;
    setLoading(true); setLoadErr("");
    try {
      const data = await apiFetch<any>(`/psw1/switches/${sid}`);
      setSw(data.switch);
      if (data.switch?.post_switch_settlement_id) {
        setSettlement({
          id: data.switch.post_switch_settlement_id,
          refund_calculated_amount: data.switch.refund_amount_expected,
          refund_received_amount: data.switch.refund_amount_received,
          refund_status: data.switch.refund_status,
        });
      } else {
        setSettlement(null);
      }
    } catch (e) { setLoadErr(e instanceof ApiError ? e.message : "Could not load settlement."); }
    finally { setLoading(false); }
  }, [sid]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading…" /></View>;

  const hasSettlement = !!settlement && settlement.refund_calculated_amount;
  const expected = settlement?.refund_calculated_amount?.amount || 0;
  const received = settlement?.refund_received_amount?.amount;
  const variance = received !== null && received !== undefined ? +(expected - received).toFixed(2) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Post-Switch Settlement" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="psw1-settlement-root">
        <PageIntro
          eyebrow="Post-Switch Settlement"
          title={`Refund Tracking for ${sw?.current_provider_name || "This Switch"}`}
          description="Any prepaid balance the old provider held should come back to you. This dashboard tracks the expected refund, records what actually arrives, and opens a dispute case if there's a shortfall."
          whatItDoes="Records the expected refund amount, logs the actual receipt when it arrives, and flags any variance so you can act quickly."
        />

        {loadErr ? <T variant="small" style={{ color: colors.terracotta }} testID="psw1-settle-load-error">{loadErr}</T> : null}

        {!hasSettlement ? (
          <CreateSettlementForm sid={sid!} colors={colors} onCreated={load} />
        ) : (
          <>
            <Card testID="psw1-settle-summary">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>STATUS</T>
                  <View style={{ backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6, alignSelf: "flex-start" }}>
                    <T testID="psw1-settle-status" style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.primary }}>{(STATUS_LABEL[settlement.refund_status] || settlement.refund_status || "").toUpperCase()}</T>
                  </View>
                </View>
                <DollarSign size={24} color={colors.muted} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>EXPECTED</T>
                  <T testID="psw1-settle-expected" style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, marginTop: 2 }}>{money(settlement.refund_calculated_amount)}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>RECEIVED</T>
                  <T testID="psw1-settle-received" style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, marginTop: 2 }}>{settlement.refund_received_amount ? money(settlement.refund_received_amount) : "not yet"}</T>
                </View>
              </View>
              {settlement.refund_received_amount ? <VarianceStrip variance={variance} colors={colors} /> : null}
            </Card>

            {!settlement.refund_received_amount ? (
              <ReceiveRefundForm settlementId={settlement.id} colors={colors} onRecorded={load} />
            ) : null}

            {sw?.related_case_ids?.length > 0 || settlement.refund_status === "refund_received_variance_flagged" ? (
              <Card style={{ backgroundColor: colors.surface2 }}>
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>LINKED CASES</T>
                <T variant="small" style={{ color: colors.text, marginTop: 6 }}>Dispute case created via LOOP-1. Track progress in your cases list.</T>
                <Button label="Open Cases" variant="outline" icon={ExternalLink} testID="psw1-settle-cases-link" onPress={() => router.push("/cases")} style={{ marginTop: spacing.sm }} />
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function VarianceStrip({ variance, colors }: any) {
  if (variance === null || variance === undefined || Math.abs(variance) < 0.01) {
    return (
      <View testID="psw1-settle-variance-zero" style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }}>
        <CheckCircle2 size={16} color={colors.sage} />
        <T variant="small" style={{ color: colors.text, flex: 1 }}>Refund received matches expected. No variance.</T>
      </View>
    );
  }
  const shortfall = variance > 0;
  return (
    <View testID="psw1-settle-variance" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: shortfall ? colors.errorSoft : colors.alertSoft, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }}>
      <AlertTriangle size={16} color={shortfall ? colors.terracotta : colors.alert} />
      <View style={{ flex: 1 }}>
        <T variant="small" style={{ fontFamily: fonts.bodySemi, color: shortfall ? colors.terracotta : colors.alert }}>{shortfall ? "Refund shortfall" : "Refund overage"}: ${Math.abs(variance).toFixed(2)}</T>
        <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>{shortfall ? "A LOOP-1 dispute case was opened automatically. Track progress under Cases." : "You received more than expected. This may be an accounting adjustment on the provider's side."}</T>
      </View>
    </View>
  );
}

function CreateSettlementForm({ sid, colors, onCreated }: any) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("prepaid_less_delivered_services");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!amount) { setErr("Enter the expected refund amount."); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch(`/psw1/switches/${sid}/post-switch-settlement`, { method: "POST", body: { refund_calculated_amount: Number(amount), refund_calculation_method: method } });
      onCreated();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not create settlement."); }
    finally { setBusy(false); }
  };
  return (
    <Card testID="psw1-settle-create-form">
      <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>CREATE SETTLEMENT RECORD</T>
      <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 19 }}>The old provider&apos;s final invoice should reflect only services delivered up to the effective date. Any prepaid balance is owed back to you.</T>
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <LInput label="Refund expected (AUD)" value={amount} onChangeText={setAmount} testID="psw1-settle-create-amount" colors={colors} />
        <Select label="Calculation basis" value={method} onChange={setMethod} options={METHODS} testID="psw1-settle-create-method" />
      </View>
      {err ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{err}</T> : null}
      <Button label="Create settlement" testID="psw1-settle-create-submit" loading={busy} onPress={submit} style={{ marginTop: spacing.md }} />
    </Card>
  );
}

function ReceiveRefundForm({ settlementId, colors, onRecorded }: any) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!amount) { setErr("Enter the amount received."); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch(`/psw1/settlements/${settlementId}/refund-received`, { method: "POST", body: { refund_received_amount: Number(amount) } });
      onRecorded();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not record refund receipt."); }
    finally { setBusy(false); }
  };
  return (
    <Card testID="psw1-settle-receive-form">
      <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>RECORD REFUND RECEIPT</T>
      <View style={{ marginTop: spacing.sm }}>
        <LInput label="Amount received (AUD)" value={amount} onChangeText={setAmount} testID="psw1-settle-amount-input" colors={colors} />
      </View>
      {err ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="psw1-settle-error">{err}</T> : null}
      <Button label="Record receipt" testID="psw1-settle-submit" loading={busy} onPress={submit} style={{ marginTop: spacing.md }} />
    </Card>
  );
}
