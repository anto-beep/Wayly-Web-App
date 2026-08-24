import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Plus, Share2, Trash2 } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

type Referral = { id: string; referred_to: string; kind: string; contact?: string; reason?: string; status: string; referred_at?: string };

const KINDS = [
  { v: "GP", label: "GP" },
  { v: "specialist", label: "Specialist" },
  { v: "allied_health", label: "Allied health" },
  { v: "support_service", label: "Support service" },
  { v: "other", label: "Other" },
];
const STATUSES = ["open", "in_progress", "completed", "declined"];
const STATUS_TONE: Record<string, "brand" | "alert" | "success" | "neutral"> = {
  open: "brand", in_progress: "alert", completed: "success", declined: "neutral",
};

export default function ReferralsScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("specialist");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try { setItems(await apiFetch<Referral[]>("/referrals")); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    setErr("");
    if (!to.trim()) { setErr("Enter who the referral is to."); return; }
    setSaving(true);
    try {
      await apiFetch("/referrals", { method: "POST", body: { referred_to: to.trim(), kind, contact: contact.trim() || null, reason: reason.trim() || null, status: "open", referred_at: new Date().toISOString() } });
      setTo(""); setContact(""); setReason(""); setKind("specialist"); setShowForm(false);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add the referral. Please try again.");
    } finally { setSaving(false); }
  };

  const cycleStatus = async (r: Referral) => {
    const next = STATUSES[(STATUSES.indexOf(r.status) + 1) % STATUSES.length];
    setItems((xs) => xs.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    try { await apiFetch(`/referrals/${r.id}`, { method: "PATCH", body: { ...r, status: next } }); }
    catch { load(); }
  };

  const remove = (r: Referral) => {
    Alert.alert("Remove referral", `Remove the referral to ${r.referred_to}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await apiFetch(`/referrals/${r.id}`, { method: "DELETE" }); await load(); } catch { /* ignore */ }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Referrals" subtitle="GP, allied health & specialist referrals" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading referrals…" />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {!showForm ? (
              <Button label="Log a referral" testID="referrals-add-btn" icon={Plus} onPress={() => setShowForm(true)} />
            ) : (
              <Card testID="referrals-form">
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>New referral</T>
                <Field label="Referred to" testID="referrals-to-input" value={to} onChangeText={setTo} placeholder="e.g. Dr Lee" />
                <T variant="label" style={{ marginTop: spacing.md, marginBottom: 6 }}>KIND</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {KINDS.map((k) => {
                    const active = kind === k.v;
                    return (
                      <Pressable key={k.v} testID={`referrals-kind-${k.v}`} onPress={() => setKind(k.v)}
                        style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{k.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
                <Field label="Phone / email (optional)" testID="referrals-contact-input" value={contact} onChangeText={setContact} style={{ marginTop: spacing.md }} />
                <Field label="Reason (optional)" testID="referrals-reason-input" value={reason} onChangeText={setReason} multiline style={{ marginTop: spacing.md }} />
                {err ? <T variant="small" testID="referrals-error" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{err}</T> : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button label="Cancel" testID="referrals-cancel" variant="ghost" onPress={() => { setShowForm(false); setErr(""); }} style={{ flex: 1 }} />
                  <Button label="Add referral" testID="referrals-submit" icon={Plus} onPress={add} loading={saving} style={{ flex: 2 }} />
                </View>
              </Card>
            )}

            {items.length === 0 ? (
              <StatePanel icon={Share2} title="No referrals yet" message="Track every clinical and support-service referral so you never lose visibility, invaluable when a new GP asks for history." />
            ) : (
              items.map((r, i) => (
                <Card key={r.id} testID={`referral-row-${i}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{r.referred_to}</T>
                      <T variant="small" style={{ marginTop: 2, textTransform: "capitalize" }}>{(r.kind || "").replace(/_/g, " ")} · {formatDate(r.referred_at)}</T>
                      {r.reason ? <T variant="small" style={{ marginTop: 4 }}>{r.reason}</T> : null}
                      {r.contact ? <T variant="small" style={{ marginTop: 2, color: colors.muted }}>{r.contact}</T> : null}
                    </View>
                    <Pressable testID={`referral-remove-${i}`} hitSlop={8} onPress={() => remove(r)}><Trash2 size={18} color={colors.terracotta} /></Pressable>
                  </View>
                  <Pressable testID={`referral-status-${i}`} onPress={() => cycleStatus(r)} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
                    <Badge label={(r.status || "").replace(/_/g, " ").toUpperCase()} tone={STATUS_TONE[r.status] || "neutral"} />
                  </Pressable>
                </Card>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
