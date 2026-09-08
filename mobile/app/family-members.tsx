import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Crown, Mail, Trash2, UserPlus, Users, X } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

type Member = { user_id?: string; email: string; name?: string; role: string; status: string; relationship?: string };
type Invite = { token: string; email: string; relationship?: string; wayly_role?: string; expires_at?: string };
type PendingApproval = { id: string; name?: string; email?: string; relationship?: string };
type Capacity = { caregivers_used?: number; caregiver_spaces_remaining?: number; caregivers_included?: number };
type MembersData = {
  members: Member[];
  invites: Invite[];
  expired?: Invite[];
  capacity?: Capacity | null;
  pending_approvals?: PendingApproval[];
};

// PC-D3 relationship options (PERMS-CAREGIVER-1) — mirrors the web select.
const RELATIONSHIP_OPTIONS = [
  "Spouse or partner", "Adult child", "Parent", "Sibling", "Grandchild",
  "In-law", "Step-child", "Guardian (legal)", "Enduring Power of Attorney",
  "Trusted friend", "Neighbour", "Case worker", "Other",
];

export default function FamilyMembersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const onFamily = (user?.plan || "").toLowerCase() === "family";

  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("Adult child");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiFetch<MembersData>("/household/members")); }
    catch { setData({ members: [], invites: [] }); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async () => {
    setFormError(""); setFormOk("");
    if (!email.trim()) { setFormError("Enter an email address to invite."); return; }
    setSending(true);
    try {
      await apiFetch("/household/invite", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          wayly_role: "caregiver",
          relationship,
          note: note.trim() || undefined,
        },
      });
      setFormOk(`Invitation sent to ${email.trim()}.`);
      setEmail(""); setNote(""); setRelationship("Adult child");
      await load();
    } catch (e) {
      const detail = e instanceof ApiError ? (e.data as any)?.detail : null;
      const msg = (detail && typeof detail === "object" && detail.message) || (e instanceof ApiError ? e.message : "Could not send the invite. Please try again.");
      setFormError(msg);
    } finally { setSending(false); }
  };

  const approve = async (mid: string) => {
    setBusyId(mid);
    try { await apiFetch(`/household/memberships/${mid}/approve`, { method: "POST", body: {} }); await load(); }
    catch (e) { Alert.alert("Could not approve", e instanceof ApiError ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };

  const deny = (mid: string, who: string) => {
    Alert.alert("Deny access", `Deny ${who}'s access to this household?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deny", style: "destructive", onPress: async () => {
          setBusyId(mid);
          try { await apiFetch(`/household/memberships/${mid}/deny`, { method: "POST", body: {} }); await load(); }
          catch (e) { Alert.alert("Could not deny", e instanceof ApiError ? e.message : "Please try again."); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  const resend = async (token: string) => {
    setBusyId(token);
    try { await apiFetch(`/household/invite/${token}/resend`, { method: "POST", body: {} }); Alert.alert("Invitation resent"); await load(); }
    catch (e) { Alert.alert("Could not resend", e instanceof ApiError ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };

  const revoke = (token: string, who: string) => {
    Alert.alert("Revoke invitation", `Revoke the invitation to ${who}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke", style: "destructive", onPress: async () => {
          setBusyId(token);
          try { await apiFetch(`/household/invite/${token}`, { method: "DELETE" }); await load(); }
          catch (e) { Alert.alert("Could not revoke", e instanceof ApiError ? e.message : "Please try again."); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  const remove = (m: Member) => {
    if (!m.user_id) return;
    Alert.alert("Remove member", `Remove ${m.name || m.email} from your household?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try { await apiFetch(`/household/members/${m.user_id}`, { method: "DELETE" }); await load(); }
          catch (e) { Alert.alert("Could not remove", e instanceof ApiError ? e.message : "Please try again."); }
        },
      },
    ]);
  };

  const cap = data?.capacity;
  const pending = data?.pending_approvals || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Family Members" subtitle="Share the load with your household" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your household…" />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {!onFamily ? (
              <Card testID="members-upgrade-card">
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Family Members is on the Family plan</T>
                <T variant="small" style={{ marginTop: 6 }}>Family members see the Family Wall and can post updates, but not statements, tools, or billing.</T>
                <Button label="See plans" testID="members-upgrade-cta" onPress={() => router.push("/plan-select")} style={{ marginTop: spacing.md }} />
              </Card>
            ) : null}

            {onFamily && cap ? (
              <T variant="small" testID="members-seat-counter" style={{ color: colors.text }}>
                {cap.caregivers_used ?? 0} family member{(cap.caregivers_used ?? 0) === 1 ? "" : "s"} invited · {cap.caregiver_spaces_remaining ?? 0} {(cap.caregiver_spaces_remaining ?? 0) === 1 ? "space" : "spaces"} remaining.
              </T>
            ) : null}

            {/* Waiting for approval */}
            {pending.length > 0 ? (
              <Card testID="pending-approvals-card" style={{ borderColor: colors.gold, borderWidth: 2 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>Waiting for your approval</T>
                {pending.map((pa) => (
                  <View key={pa.id} testID={`pending-approval-${pa.email}`} style={{ paddingVertical: spacing.sm, borderBottomWidth: 0, gap: spacing.sm }}>
                    <View>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }} numberOfLines={1}>{pa.name || pa.email}</T>
                      <T variant="small" numberOfLines={1}>{pa.email} · {pa.relationship || "Family member"} · signed up, awaiting approval</T>
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Button label="Approve" testID={`approve-${pa.email}`} onPress={() => approve(pa.id)} loading={busyId === pa.id} style={{ flex: 1 }} />
                      <Button label="Deny" variant="outline" testID={`deny-${pa.email}`} onPress={() => deny(pa.id, pa.name || pa.email || "this person")} style={{ flex: 1 }} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Current members */}
            <Card testID="members-list">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                <Users size={18} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Members</T>
              </View>
              {(data?.members || []).length === 0 ? (
                <T variant="small">Just you for now.</T>
              ) : (
                (data?.members || []).map((m, i) => (
                  <View key={m.user_id || m.email} testID={`member-row-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: i < (data!.members.length - 1) ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }} numberOfLines={1}>{m.name || m.email}</T>
                        {m.role === "account_holder" || m.role === "primary" ? <Crown size={14} color={colors.gold} /> : null}
                      </View>
                      <T variant="small" numberOfLines={1}>{m.email}{m.relationship ? ` · ${m.relationship}` : ""}</T>
                    </View>
                    <Badge label={(m.role || "").replace(/_/g, " ").toUpperCase()} tone={m.role === "account_holder" || m.role === "primary" ? "brand" : "neutral"} />
                    {m.role !== "primary" && m.role !== "account_holder" && m.user_id ? (
                      <Pressable testID={`member-remove-${i}`} hitSlop={10} onPress={() => remove(m)}>
                        <Trash2 size={18} color={colors.terracotta} />
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </Card>

            {/* Invite form (Family only) */}
            {onFamily ? (
              <Card testID="invite-card">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                  <UserPlus size={18} color={colors.primary} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Invite someone</T>
                </View>
                <T variant="small" style={{ marginBottom: spacing.sm }}>Family members help coordinate your household. They see the Family Wall and can post updates. They cannot see statements, use tools, or manage billing.</T>
                <Field label="Email" testID="invite-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sister@example.com" />
                <T variant="label" style={{ marginTop: spacing.md, marginBottom: 6 }}>RELATIONSHIP</T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
                  {RELATIONSHIP_OPTIONS.map((r) => {
                    const active = relationship === r;
                    return (
                      <Pressable
                        key={r}
                        testID={`invite-relationship-${r}`}
                        onPress={() => setRelationship(r)}
                        style={{ flexShrink: 0, height: 36, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 18, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}
                      >
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? colors.primaryFg : colors.text }}>{r}</T>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Field label="Optional note" testID="invite-note-input" value={note} onChangeText={setNote} placeholder="Hey sis, looping you in…" style={{ marginTop: spacing.md }} />
                {formError ? <T variant="small" testID="invite-error" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{formError}</T> : null}
                {formOk ? <T variant="small" testID="invite-success" style={{ color: colors.success, marginTop: spacing.sm }}>{formOk}</T> : null}
                <Button label="Send invitation" testID="invite-submit-btn" icon={Mail} onPress={invite} loading={sending} style={{ marginTop: spacing.md }} />
              </Card>
            ) : null}

            {/* Pending invites */}
            {(data?.invites || []).length > 0 ? (
              <Card testID="invites-pending">
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>Pending invites</T>
                {(data?.invites || []).map((inv, i) => (
                  <View key={inv.token} testID={`invite-pending-${i}`} style={{ paddingVertical: spacing.sm, borderBottomWidth: i < (data!.invites.length - 1) ? 1 : 0, borderBottomColor: colors.border, gap: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{inv.email}</T>
                        <T variant="small">{inv.relationship || "Family member"} · expires {formatDate(inv.expires_at)}</T>
                      </View>
                      <Badge label="PENDING" tone="alert" />
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Button label="Resend" variant="outline" testID={`invite-resend-${i}`} onPress={() => resend(inv.token)} loading={busyId === inv.token} icon={Mail} style={{ flex: 1 }} />
                      <Button label="Revoke" variant="outline" testID={`invite-revoke-${i}`} onPress={() => revoke(inv.token, inv.email)} icon={X} style={{ flex: 1 }} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {(data?.members || []).length === 0 && !onFamily ? (
              <StatePanel icon={Users} title="No household yet" message="Complete onboarding to set up your household first." />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
