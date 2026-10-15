import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Users, Plus, Star, Trash2, Copy, X, Activity, Edit3, Crown, RotateCcw, AlertTriangle, ArrowUpRight, CheckCircle2,
} from "lucide-react-native";

import { AppHeader, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { startAddonCheckout } from "@/src/lib/plans";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

const COLOR_SWATCHES = ["#3F6FA8", "#2BC4D6", "#7C9B82", "#C76B5A", "#5F4E76"];

type PP = {
  id: string; first_name?: string; last_name?: string; preferred_name?: string;
  is_primary?: boolean; classification?: number | null; provider_name?: string | null; provider_email?: string | null;
  household_email?: string | null; color_index?: number; status?: string;
  removal_confirmed_at?: string; data_purge_scheduled_at?: string;
};

type AddPreview = {
  branch?: string; current_plan?: string; new_plan?: string;
  addons_needed?: number; base_price_monthly?: number; addon_price_monthly?: number;
};

type AddResult = {
  participant?: PP;
  plan_upgraded_to?: string | null;
  addon?: { id?: string } | null;
};

type AccountSummary = { base_plan?: string; participants_included?: number };

function copyText(text: string, onDone: () => void) {
  const nav = (globalThis as any).navigator;
  if (nav?.clipboard?.writeText) { nav.clipboard.writeText(text); onDone(); }
  else Alert.alert("Forwarding email", text);
}

const EMPTY_FORM = { first_name: "", last_name: "", date_of_birth: "", classification: "", provider_name: "", provider_email: "", statement_format: "unknown" };

const CLASSIFICATION_OPTIONS = [
  { value: "", label: "Not sure yet" },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `Class ${n}` })),
];

const STATEMENT_FORMAT_OPTIONS = [
  { value: "unknown", label: "Not sure yet" },
  { value: "email", label: "Email PDF" },
  { value: "portal", label: "Provider portal" },
  { value: "paper", label: "Paper" },
];

// Mirrors the web ProviderPicker: when sibling participants already have
// providers, offer a dropdown of those + an "Add a different provider" escape
// to a free-text input. With no existing providers, fall back to plain text
// (matches web exactly).
function ProviderPicker({ value, onChange, existing }: { value: string; onChange: (v: string) => void; existing: string[] }) {
  const { colors } = useTheme();
  const uniq = Array.from(new Set((existing || []).filter(Boolean)));
  const [mode, setMode] = useState<"pick" | "type">(uniq.length > 0 && (!value || uniq.includes(value)) ? "pick" : "type");
  if (uniq.length === 0) {
    return <Field label="Provider" optional testID="form-provider" value={value} onChangeText={onChange} />;
  }
  if (mode === "pick") {
    return (
      <View style={{ gap: 8 }}>
        <Select
          label="Provider"
          optional
          testID="form-provider-select"
          value={uniq.includes(value) ? value : ""}
          onChange={onChange}
          placeholder="Choose a provider"
          options={[{ value: "", label: "Choose a provider" }, ...uniq.map((p) => ({ value: p, label: p }))]}
        />
        <Pressable testID="form-provider-add-new" onPress={() => { setMode("type"); onChange(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Plus size={13} color={colors.heading} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.heading }}>Add a different provider</T>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Field label="Provider" optional testID="form-provider" value={value} onChangeText={onChange} placeholder="Provider name" />
      <Pressable testID="form-provider-pick-existing" onPress={() => setMode("pick")}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.heading }}>← Pick from {uniq.length === 1 ? "the existing provider" : "existing providers"}</T>
      </Pressable>
    </View>
  );
}

export default function ParticipantsScreen() {
  const { user } = useAuth();
  const { reload } = useParticipants();
  const { colors, shadow } = useTheme();
  const [active, setActive] = useState<PP[]>([]);
  const [removed, setRemoved] = useState<PP[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [pendingAddons, setPendingAddons] = useState<any[]>([]);
  const [cancelingAddon, setCancelingAddon] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add flow
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState<"preview" | "form" | "done">("preview");
  const [addPreview, setAddPreview] = useState<AddPreview | null>(null);
  const [extraCount, setExtraCount] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState<AddResult | null>(null);
  const [addErr, setAddErr] = useState("");
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);

  // Remove flow
  const [removeTarget, setRemoveTarget] = useState<PP | null>(null);
  const [removeChoice, setRemoveChoice] = useState<"stay" | "downgrade">("stay");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        apiFetch<{ items?: PP[] }>("/v2/participants?include_removed=true").catch(() => ({ items: [] as PP[] })),
        apiFetch<{ summary?: AccountSummary; addons?: any[] }>("/account").catch(() => null),
      ]);
      const all = pRes?.items || [];
      setActive(all.filter((p) => p.status === "ACTIVE"));
      setRemoved(all.filter((p) => p.status === "PENDING_REMOVAL" || p.status === "REMOVED"));
      setSummary(aRes?.summary || null);
      // A pending add-on is an extra-participant charge that was started but
      // never confirmed (no Stripe subscription stamped yet). Surface it so the
      // owner can cancel it, matching the web rollback behaviour.
      setPendingAddons((aRes?.addons || []).filter((a) => !a?.stripe_subscription_id && a?.status !== "CANCELLED"));
    } finally { setLoading(false); }
  }, []);

  const cancelPendingAddon = async () => {
    setCancelingAddon(true);
    try {
      await apiFetch("/billing/v2/cancel-pending-addon", { method: "POST", body: {} });
      await loadAll(); await reload();
    } catch (e) { Alert.alert("Could not cancel", e instanceof ApiError ? e.message : "Please try again."); }
    finally { setCancelingAddon(false); }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const basePlan = (summary?.base_plan || user?.plan || "free").toUpperCase();
  const included = summary?.participants_included ?? (basePlan === "FAMILY" ? 2 : 1);
  const baseFortnight = basePlan === "FAMILY" ? 49.5 : 24.5;
  const addonCount = Math.max(0, active.length - included);
  const fortnightTotal = baseFortnight + addonCount * 24.5;

  // ---- Add flow ----
  const openAdd = async () => {
    setForm(EMPTY_FORM); setStep("preview"); setExtraCount(1); setAddErr(""); setLastAdded(null); setConfirmUpgrade(false);
    try {
      const data = await apiFetch<AddPreview>("/v2/participants/preview?count=1", { method: "POST", body: {} });
      setAddPreview(data);
      setShowAdd(true);
    } catch (e) {
      Alert.alert("Could not preview", e instanceof ApiError ? e.message : "Please try again.");
    }
  };

  const refreshPreview = async (count: number) => {
    try { setAddPreview(await apiFetch<AddPreview>(`/v2/participants/preview?count=${count}`, { method: "POST", body: {} })); }
    catch { /* ignore */ }
  };

  const submitAdd = async () => {
    setAddErr("");
    if (!form.first_name.trim()) { setAddErr("First name is required."); return; }
    if (!form.last_name.trim()) { setAddErr("Last name is required."); return; }
    setSaving(true);
    try {
      const data = await apiFetch<AddResult>("/v2/participants", { method: "POST", body: {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        classification: form.classification ? Number(form.classification) : null,
        provider_name: form.provider_name.trim() || null, provider_email: form.provider_email.trim() || null, statement_format: form.statement_format,
        confirm_upgrade: confirmUpgrade,
      } });
      // Extra participant on Family → pay via the SAME external-browser Stripe
      // checkout as signup (recurring $24.50/fortnight add-on). Never an in-app
      // purchase. If the user cancels, the add-on stays as a cancellable
      // "pending add-on" they can finish or remove later.
      if ((data as any)?.addon?.id) {
        try { await startAddonCheckout((data as any).addon.id); } catch { /* leaves a pending add-on */ }
      }
      setLastAdded(data);
      setStep("done");
      await loadAll(); await reload();
    } catch (e) {
      const detail = e instanceof ApiError ? (e.data as any)?.detail : null;
      if (detail?.error === "solo_upgrade_required") {
        // Solo covers one participant only. Send them back to choose Family.
        setConfirmUpgrade(false);
        setStep("preview");
        setAddPreview((prev) => ({ ...(prev || {}), branch: "solo_to_family", new_plan: "FAMILY" } as AddPreview));
        setAddErr(detail.message || "Solo covers one participant only.");
      } else {
        setAddErr(e instanceof ApiError ? e.message : "Could not add participant.");
      }
    }
    finally { setSaving(false); }
  };

  const closeAdd = () => { setShowAdd(false); setStep("preview"); setLastAdded(null); setForm(EMPTY_FORM); setAddErr(""); setConfirmUpgrade(false); };

  // ---- Other actions ----
  const promote = (p: PP) => Alert.alert("Make primary", `Set ${p.first_name} as the primary participant?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Make primary", onPress: async () => { try { await apiFetch(`/participants/${p.id}/promote`, { method: "POST", body: {} }); await loadAll(); await reload(); } catch { Alert.alert("Could not promote"); } } },
  ]);

  const openRemove = (p: PP) => { setRemoveChoice("stay"); setRemoveTarget(p); };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ plan_downgrade_scheduled?: { effective?: string } }>(`/v2/participants/${removeTarget.id}`, {
        method: "DELETE", body: { downgrade: removeChoice === "downgrade" },
      });
      setRemoveTarget(null); setRemoveChoice("stay");
      await loadAll(); await reload();
      apiFetch("/payments/sync-plan-to-participants", { method: "POST", body: {} }).catch(() => {});
      if (data?.plan_downgrade_scheduled?.effective) {
        Alert.alert("Participant removed", `Plan downgrades to Solo on ${formatDate(data.plan_downgrade_scheduled.effective)}.`);
      }
    } catch (e) { Alert.alert("Could not remove", e instanceof ApiError ? e.message : ""); }
    finally { setBusy(false); }
  };

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

  const rotateShareLink = (p: PP) => {
    Alert.alert(
      "Rotate share link",
      "This creates a new read-only link and immediately invalidates the old one. Anyone using the old link will lose access.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Rotate", style: "destructive", onPress: async () => {
          try {
            const res = await apiFetch<{ url?: string; share_url?: string; link?: string }>(`/participants/${p.id}/share-link/rotate`, { method: "POST", body: {} });
            const url = res?.url || res?.share_url || res?.link;
            Alert.alert("New share link", url ? `The old link is now invalid. New read-only link:\n\n${url}` : "Share link rotated.");
          } catch { Alert.alert("Could not rotate the share link right now."); }
        } },
      ],
    );
  };

  const canDowngradeOnRemove = basePlan === "FAMILY" && active.length === 2 && !!removeTarget && !removeTarget.is_primary;

  return (
    <View testID="participants-page" style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Participants" subtitle={`${active.length} active`} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading participants…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <View>
            <T variant="small" style={{ lineHeight: 20 }}>The people whose Support at Home care you track on this account.</T>
            <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 6 }}>
              Current plan: <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text }}>{basePlan}</T>{active.length > 0 ? ` · ${active.length} participant${active.length === 1 ? "" : "s"}` : ""}
            </T>
          </View>

          <Button label="Add participant" testID="participants-add-btn" icon={Plus} variant="secondary" onPress={openAdd} />

          {pendingAddons.length > 0 ? (
            <Card testID="pending-addon-banner" style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Pending add-on to confirm</T>
              <T variant="small" style={{ marginTop: 4, color: colors.text, lineHeight: 20 }}>
                You have {pendingAddons.length === 1 ? "an extra-participant add-on" : `${pendingAddons.length} extra-participant add-ons`} that has not been confirmed yet. You can cancel it and the participant it added will be removed.
              </T>
              <Button label="Cancel pending add-on" testID="cancel-pending-addon" variant="outline" onPress={cancelPendingAddon} loading={cancelingAddon} style={{ marginTop: spacing.sm }} />
            </Card>
          ) : null}

          {active.length === 0 ? (
            <StatePanel testID="participants-empty" icon={Users} title="Add your first participant to get started." />
          ) : (
            active.map((p, idx) => {
              const color = COLOR_SWATCHES[(p.color_index ?? idx) % 5];
              const planTag = basePlan === "SOLO" ? "Covered by Solo plan" : idx < included ? "Covered by Family plan" : "Additional participant";
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
                      <ActionLink icon={Activity} label="Timeline" testID={`participant-timeline-${p.id}`} onPress={() => router.push("/timeline")} color={colors.heading} />
                      <ActionLink icon={Edit3} label="Edit details" testID={`participant-edit-${p.id}`} onPress={() => router.push(`/participant/${p.id}`)} color={colors.heading} />
                      <ActionLink icon={ArrowUpRight} label="Share view" testID={`participant-share-${p.id}`} onPress={() => shareView(p)} color={colors.heading} />
                      <ActionLink icon={RotateCcw} label="Rotate link" testID={`participant-rotate-share-${p.id}`} onPress={() => rotateShareLink(p)} color={colors.heading} />
                      {!p.is_primary ? <ActionLink icon={Crown} label="Make primary" testID={`participant-promote-${p.id}`} onPress={() => promote(p)} color={colors.heading} /> : null}
                      {!p.is_primary ? <ActionLink icon={Trash2} label="Remove" testID={`participant-remove-${p.id}`} onPress={() => openRemove(p)} color={colors.terracotta} /> : null}
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

      {/* Add participant modal (branched, billing-aware — mirrors web) */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={closeAdd}>
        <KeyboardAvoidingView style={[styles.modalWrap, { backgroundColor: colors.overlay }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>{step === "preview" ? "Add a participant" : step === "form" ? "Their details" : "All set"}</T>
              <Pressable onPress={closeAdd} hitSlop={10} testID="add-modal-close"><X size={20} color={colors.muted} /></Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
              {addErr ? <T variant="small" style={{ color: colors.terracotta }}>{addErr}</T> : null}

              {/* PREVIEW step */}
              {step === "preview" && addPreview ? (
                <View testID="add-preview-step" style={{ gap: spacing.sm }}>
                  {addPreview.branch === "upgrade_required" ? (
                    <View style={{ gap: spacing.sm }} testID="branch-upgrade-required">
                      <T style={{ fontFamily: fonts.body, fontSize: 14 }}>Adding a participant needs an active plan.</T>
                      <T variant="small">Your Wayly plan is managed on your account. To add people to your plan, sign in at wayly.com.au, then they will appear here.</T>
                      <Button label="Close" testID="branch-upgrade-close" variant="outline" onPress={closeAdd} />
                    </View>
                  ) : null}

                  {addPreview.branch === "solo_to_family" ? (
                    <View style={{ gap: spacing.sm }} testID="branch-solo-to-family">
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Solo covers one participant only.</T>
                      <T variant="small" style={{ color: colors.muted, lineHeight: 20 }}>To cover more than one person, manage your plan on your Wayly account at wayly.com.au. Once updated, you can add them here.</T>
                      <Button label="Close" testID="cancel-stay-solo" variant="outline" onPress={closeAdd} />
                    </View>
                  ) : null}

                  {addPreview.branch === "covered_by_family" ? (
                    <View style={{ gap: spacing.sm }} testID="branch-family">
                      <T variant="small">This person is covered by your Family plan at no extra cost.</T>
                      <Button label="Continue" testID="confirm-family-add" onPress={() => setStep("form")} />
                    </View>
                  ) : null}

                  {addPreview.branch === "family_addons" ? (
                    <View style={{ gap: spacing.sm }} testID="branch-family-addons">
                      <T variant="small" style={{ lineHeight: 20 }}>Adding more people than your plan includes is managed on your Wayly account. Sign in at wayly.com.au to update your plan, then add them here.</T>
                      <Button label="Close" testID="branch-family-addons-close" variant="outline" onPress={closeAdd} />
                    </View>
                  ) : null}

                  {addPreview.branch === "adviser_included" ? (
                    <View style={{ gap: spacing.sm }} testID="branch-adviser">
                      <T variant="small">Your Adviser plan includes participant management at no extra cost.</T>
                      <Button label="Continue" testID="confirm-adviser-add" onPress={() => setStep("form")} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* FORM step */}
              {step === "form" ? (
                <View testID="add-form-step" style={{ gap: spacing.sm }}>
                  <Field label="First name" required testID="form-first-name" value={form.first_name} onChangeText={(v) => setForm({ ...form, first_name: v })} />
                  <Field label="Last name" required testID="form-last-name" value={form.last_name} onChangeText={(v) => setForm({ ...form, last_name: v })} />
                  <DateField label="Date of birth" optional testID="form-dob" value={form.date_of_birth} onChange={(iso) => setForm({ ...form, date_of_birth: iso })} />
                  <Select label="Classification" optional testID="form-classification" value={form.classification} onChange={(v) => setForm({ ...form, classification: v })} options={CLASSIFICATION_OPTIONS} placeholder="Not sure yet" />
                  <ProviderPicker value={form.provider_name} onChange={(v) => setForm({ ...form, provider_name: v })} existing={active.map((p) => p.provider_name || "").filter(Boolean)} />
                  <Field label="Provider email" optional testID="form-provider-email" value={form.provider_email} onChangeText={(v) => setForm({ ...form, provider_email: v })} placeholder="e.g. billing@theprovider.com.au" autoCapitalize="none" keyboardType="email-address" />
                  <Select label="Statement delivery" testID="form-statement-format" value={form.statement_format} onChange={(v) => setForm({ ...form, statement_format: v })} options={STATEMENT_FORMAT_OPTIONS} placeholder="Not sure yet" />
                  <Button label="Add participant" testID="form-submit-add" onPress={submitAdd} loading={saving} style={{ marginTop: spacing.sm }} />
                </View>
              ) : null}

              {/* DONE step */}
              {step === "done" && lastAdded?.participant ? (
                <View testID="add-done-step" style={{ gap: spacing.md, alignItems: "stretch" }}>
                  <CheckCircle2 size={40} color={colors.sage} style={{ alignSelf: "center" }} />
                  <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, textAlign: "center" }}>{lastAdded.participant.first_name} added!</T>
                  {lastAdded.participant.household_email ? (
                    <View style={{ backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md }}>
                      <T variant="label">THEIR FORWARDING EMAIL</T>
                      <T style={{ fontFamily: fonts.mono, fontSize: 13, marginTop: 4 }}>{lastAdded.participant.household_email}</T>
                      <Pressable onPress={() => copyText(lastAdded.participant!.household_email as string, () => Alert.alert("Copied"))} style={{ marginTop: 6 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.heading }}>Copy</T>
                      </Pressable>
                    </View>
                  ) : null}
                  <T variant="small" style={{ textAlign: "center" }}>Forward their monthly statements here and Wayly will decode them automatically.</T>
                  <Button label="Done" testID="add-done-btn" onPress={closeAdd} />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Remove participant modal (downgrade-aware — mirrors web) */}
      <Modal visible={!!removeTarget} transparent animationType="slide" onRequestClose={() => setRemoveTarget(null)}>
        <View style={[styles.modalWrap, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]} testID="remove-participant-modal">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Remove {removeTarget?.first_name}?</T>
              <Pressable onPress={() => setRemoveTarget(null)} hitSlop={10}><X size={20} color={colors.muted} /></Pressable>
            </View>
            <T variant="small">Their data is kept for 60 days. You can restore them or export their data anytime within that window.</T>
            <Button label="Confirm removal" testID="confirm-remove" onPress={confirmRemove} loading={busy} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RemoveOption({ label, active, onPress, colors, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
      </View>
      <T variant="small" style={{ flex: 1, color: colors.text }}>{label}</T>
    </Pressable>
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
  stepBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg },
});
