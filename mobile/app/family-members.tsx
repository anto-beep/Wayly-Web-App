import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Crown, Mail, Trash2, UserPlus, Users } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDate } from "@/src/utils/format";

type Member = { user_id?: string; email: string; name?: string; role: string; status: string };
type Invite = { token: string; email: string; role: string; expires_at?: string };
type MembersData = { members: Member[]; invites: Invite[] };

function fmtDate(s?: string): string {
  return formatDate(s);
}

const ROLES = [
  { key: "family_member", label: "Family member" },
  { key: "advisor", label: "Advisor / GP (read-only)" },
];

export default function FamilyMembersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const onFamily = (user?.plan || "").toLowerCase() === "family";

  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("family_member");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");

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
      await apiFetch("/household/invite", { method: "POST", body: { email: email.trim().toLowerCase(), role, note: note.trim() || undefined } });
      setFormOk(`Invitation sent to ${email.trim()}.`);
      setEmail(""); setNote(""); setRole("family_member");
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not send the invite. Please try again.");
    } finally { setSending(false); }
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
                <T variant="small" style={{ marginTop: 6 }}>Family plan adds up to 5 seats, role based permissions, and the Sunday digest for everyone.</T>
                <Button label="See plans" testID="members-upgrade-cta" onPress={() => router.push("/plan-select")} style={{ marginTop: spacing.md }} />
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
                        {m.role === "primary" ? <Crown size={14} color={colors.gold} /> : null}
                      </View>
                      <T variant="small" numberOfLines={1}>{m.email}</T>
                    </View>
                    <Badge label={(m.role || "").replace(/_/g, " ").toUpperCase()} tone={m.role === "primary" ? "brand" : "neutral"} />
                    {m.role !== "primary" && m.user_id ? (
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
                <Field label="Email" testID="invite-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sister@example.com" />
                <T variant="label" style={{ marginTop: spacing.md, marginBottom: 6 }}>ROLE</T>
                <View style={{ gap: spacing.sm }}>
                  {ROLES.map((r) => {
                    const active = role === r.key;
                    return (
                      <Pressable key={r.key} testID={`invite-role-${r.key}`} onPress={() => setRole(r.key)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center" }}>
                          {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                        </View>
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{r.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
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
                  <View key={inv.token} testID={`invite-pending-${i}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: i < (data!.invites.length - 1) ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{inv.email}</T>
                      <T variant="small">{(inv.role || "").replace(/_/g, " ")} · expires {fmtDate(inv.expires_at)}</T>
                    </View>
                    <Badge label="PENDING" tone="alert" />
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
