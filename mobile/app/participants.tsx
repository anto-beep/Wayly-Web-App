import React, { useCallback, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Users, Plus, Star, Trash2, Copy, X, Activity, Edit3, Crown, RotateCcw, AlertTriangle, ArrowUpRight,
} from "lucide-react-native";

import { AppHeader, Button, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

const COLOR_SWATCHES = ["#0E2A47", "#2BC4D6", "#7C9B82", "#C76B5A", "#5F4E76"];

type PP = {
  id: string; first_name?: string; last_name?: string; preferred_name?: string;
  is_primary?: boolean; classification?: number | null; provider_name?: string | null;
  household_email?: string | null; color_index?: number; status?: string;
  removal_confirmed_at?: string; data_purge_scheduled_at?: string;
};

function copyText(text: string, onDone: () => void) {
  const nav = (globalThis as any).navigator;
  if (nav?.clipboard?.writeText) { nav.clipboard.writeText(text); onDone(); }
  else Alert.alert("Forwarding email", text);
}

export default function ParticipantsScreen() {
  const { user } = useAuth();
  const { reload } = useParticipants();
  const { colors, shadow } = useTheme();
  const [active, setActive] = useState<PP[]>([]);
  const [removed, setRemoved] = useState<PP[]>([]);
  const [account, setAccount] = useState<{ base_plan?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", classification: "", provider_name: "" });
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        apiFetch<{ items?: PP[] }>("/v2/participants?include_removed=true").catch(() => ({ items: [] as PP[] })),
        apiFetch<{ base_plan?: string }>("/account").catch(() => null),
      ]);
      const all = pRes?.items || [];
      setActive(all.filter((p) => p.status === "ACTIVE"));
      setRemoved(all.filter((p) => p.status === "PENDING_REMOVAL" || p.status === "REMOVED"));
      setAccount(aRes);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const basePlan = (account?.base_plan || user?.plan || "free").toUpperCase();
  const baseFortnight = basePlan === "FAMILY" ? 49.5 : 24.5;
  const addonCount = Math.max(0, active.length - (basePlan === "FAMILY" ? 2 : 1));
  const fortnightTotal = baseFortnight + addonCount * 24.5;

  const submitAdd = async () => {
    setAddErr("");
    if (!form.first_name.trim()) { setAddErr("First name is required."); return; }
    if (!form.last_name.trim()) { setAddErr("Last name is required."); return; }
    setSaving(true);
    try {
      await apiFetch("/v2/participants", { method: "POST", body: {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        classification: form.classification ? Number(form.classification) : null,
        provider_name: form.provider_name.trim() || null, statement_format: "unknown",
      } });
      setShowAdd(false); setForm({ first_name: "", last_name: "", classification: "", provider_name: "" });
      await loadAll(); await reload();
    } catch (e) { setAddErr(e instanceof ApiError ? e.message : "Could not add participant."); }
    finally { setSaving(false); }
  };

  const promote = (p: PP) => Alert.alert("Make primary", `Set ${p.first_name} as the primary participant?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Make primary", onPress: async () => { try { await apiFetch(`/participants/${p.id}/promote`, { method: "POST", body: {} }); await loadAll(); await reload(); } catch { Alert.alert("Could not promote"); } } },
  ]);

  const remove = (p: PP) => Alert.alert("Remove participant", `Remove ${p.first_name}? Data is kept for 60 days.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => { try { await apiFetch(`/v2/participants/${p.id}`, { method: "DELETE", body: { downgrade: false } }); await loadAll(); await reload(); } catch { Alert.alert("Could not remove"); } } },
  ]);

  const restore = async (p: PP) => { try { await apiFetch(`/v2/participants/${p.id}/restore`, { method: "POST", body: {} }); await loadAll(); await reload(); } catch { Alert.alert("Could not restore"); } };

  const hardDelete = (p: PP) => {
    const full = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    Alert.alert("Delete now", `Permanently delete all of ${full}'s data? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await apiFetch(`/v2/participants/${p.id}/hard-delete`, { method: "POST", body: { confirm_full_name: full } }); await loadAll(); } catch { Alert.alert("Could not delete"); } } },
    ]);
  };

  const shareView = async (p: PP) => {
    try {
      const res = await apiFetch<{ url?: string; share_url?: string; link?: string }>(`/participants/${p.id}/share-link`, { method: "POST", body: {} });
      const url = res?.url || res?.share_url || res?.link;
      Alert.alert("Share view", url ? `Read-only link:\n\n${url}` : "Share link created.");
    } catch { Alert.alert("Could not create a share link right now."); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Participants" subtitle={`${active.length} active`} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading participants…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <View>
            <T style={{ fontFamily: fonts.heading, fontSize: 26 }}>Participants <T variant="small">· {active.length} active</T></T>
            <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>Family plan covers 2, additional participants are $24.50 per fortnight each.</T>
            <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 6 }}>
              Current plan: <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text }}>{basePlan}</T> · ${fortnightTotal.toFixed(2)} per fortnight{addonCount > 0 ? ` · ${addonCount} additional participant${addonCount === 1 ? "" : "s"}` : ""}
            </T>
          </View>

          <Button label="Add participant" testID="participants-add-btn" icon={Plus} variant="secondary" onPress={() => setShowAdd(true)} />

          {active.length === 0 ? (
            <StatePanel testID="participants-empty" icon={Users} title="Add your first participant to get started." />
          ) : (
            active.map((p, idx) => {
              const color = COLOR_SWATCHES[(p.color_index ?? idx) % 5];
              const planTag = basePlan === "SOLO" ? "Covered by Solo plan" : idx < 2 ? "Covered by Family plan" : "Additional participant · $24.50 per fortnight";
              return (
                <View key={p.id} testID={`participant-card-${p.id}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                  <View style={{ height: 4, backgroundColor: color, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }} />
                  <View style={{ padding: spacing.md, gap: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <T style={{ fontFamily: fonts.heading, fontSize: 20 }}>{p.first_name} {p.last_name}</T>
                      {p.is_primary ? (
                        <View style={[styles.primaryPill, { backgroundColor: colors.goldSoft }]}>
                          <Star size={11} color={colors.gold} />
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.4, color: colors.gold }}>PRIMARY</T>
                        </View>
                      ) : null}
                    </View>
                    {p.classification ? <T variant="small">Classification {p.classification} · {p.provider_name || "—"}</T> : null}
                    <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.gold }}>{planTag}</T>
                    {p.household_email ? (
                      <View style={[styles.emailChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                        <T style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text, flex: 1 }} numberOfLines={1}>{p.household_email}</T>
                        <Pressable testID={`participant-copy-email-${p.id}`} hitSlop={8} onPress={() => copyText(p.household_email as string, () => Alert.alert("Copied"))}>
                          <Copy size={15} color={colors.muted} />
                        </Pressable>
                      </View>
                    ) : null}
                    <View style={styles.actionRow}>
                      <ActionLink icon={Activity} label="Timeline" testID={`participant-timeline-${p.id}`} onPress={() => router.push("/timeline")} color={colors.primary} />
                      <ActionLink icon={Edit3} label="Edit details" testID={`participant-edit-${p.id}`} onPress={() => router.push(`/participant/${p.id}`)} color={colors.primary} />
                      <ActionLink icon={ArrowUpRight} label="Share view" testID={`participant-share-${p.id}`} onPress={() => shareView(p)} color={colors.primary} />
                      {!p.is_primary ? <ActionLink icon={Crown} label="Make primary" testID={`participant-promote-${p.id}`} onPress={() => promote(p)} color={colors.primary} /> : null}
                      {!p.is_primary ? <ActionLink icon={Trash2} label="Remove" testID={`participant-remove-${p.id}`} onPress={() => remove(p)} color={colors.terracotta} /> : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {removed.length > 0 ? (
            <View testID="participants-removed-section" style={{ marginTop: spacing.md }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Removed participants</T>
              <T variant="small" style={{ marginTop: 2, marginBottom: spacing.sm }}>Data kept for 60 days from removal. Restore anytime within that window.</T>
              <View style={{ gap: spacing.sm }}>
                {removed.map((p) => {
                  const purge = p.data_purge_scheduled_at ? new Date(p.data_purge_scheduled_at) : null;
                  const days = purge ? Math.max(0, Math.ceil((purge.getTime() - Date.now()) / 86400000)) : 0;
                  return (
                    <View key={p.id} testID={`removed-${p.id}`} style={[styles.removedRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{p.first_name} {p.last_name}</T>
                        <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          Removed {p.removal_confirmed_at ? formatDate(p.removal_confirmed_at) : "—"}{purge ? ` · Auto-deletes in ${days} days` : ""}
                        </T>
                      </View>
                      {p.status === "PENDING_REMOVAL" ? (
                        <View style={{ flexDirection: "row", gap: spacing.sm }}>
                          <Pressable testID={`restore-${p.id}`} onPress={() => restore(p)} style={[styles.smallBtn, { borderColor: colors.sage }]}>
                            <RotateCcw size={13} color={colors.sage} />
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.sage }}>Restore</T>
                          </Pressable>
                          <Pressable testID={`hard-delete-${p.id}`} onPress={() => hardDelete(p)} style={[styles.smallBtn, { borderColor: colors.terracotta }]}>
                            <AlertTriangle size={13} color={colors.terracotta} />
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.terracotta }}>Delete now</T>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Add participant modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modalWrap, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Add a participant</T>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={10}><X size={20} color={colors.muted} /></Pressable>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Field label="First name" required testID="form-first-name" value={form.first_name} onChangeText={(v) => setForm({ ...form, first_name: v })} />
              <Field label="Last name" required testID="form-last-name" value={form.last_name} onChangeText={(v) => setForm({ ...form, last_name: v })} />
              <Field label="Classification" optional testID="form-classification" value={form.classification} onChangeText={(v) => setForm({ ...form, classification: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder="1-8" />
              <Field label="Provider" optional testID="form-provider" value={form.provider_name} onChangeText={(v) => setForm({ ...form, provider_name: v })} />
              {addErr ? <T variant="small" style={{ color: colors.terracotta }}>{addErr}</T> : null}
              <Button label="Add participant" testID="form-submit-add" onPress={submitAdd} loading={saving} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionLink({ icon: Icon, label, onPress, color, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon size={13} color={color} />
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  primaryPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  emailChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs, paddingTop: spacing.sm },
  removedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg },
});
