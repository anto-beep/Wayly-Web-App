import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Check, Mail, X } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type EmailStatus = { pending: boolean; new_email?: string; expires_at?: string };

function EmailChangeCard({ currentEmail }: { currentEmail: string }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<EmailStatus>("/auth/email/change-status"));
    } catch {
      setStatus({ pending: false });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setError(""); setSuccess("");
    if (!newEmail.trim() || !password) { setError("Enter your new email and current password."); return; }
    setBusy(true);
    try {
      await apiFetch("/auth/email/change-request", { method: "POST", body: { new_email: newEmail.trim().toLowerCase(), password } });
      setSuccess("We sent a confirmation link to your new address. You stay signed in with your current email until you click it.");
      setEditing(false); setNewEmail(""); setPassword("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the email change. Please try again.");
    } finally { setBusy(false); }
  };

  const cancelPending = async () => {
    setBusy(true);
    try { await apiFetch("/auth/email/change-request", { method: "DELETE" }); await load(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };

  return (
    <Card testID="profile-email-card">
      <T variant="label">EMAIL</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        <Mail size={16} color={colors.muted} />
        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15, flex: 1 }} numberOfLines={1}>{currentEmail}</T>
      </View>

      {status?.pending ? (
        <View testID="email-change-pending" style={{ marginTop: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.alertSoft }}>
          <T variant="small" style={{ color: colors.alert }}>
            Verification pending for {status.new_email}. Check that inbox for the confirmation link.
          </T>
          <Button label="Cancel change" testID="email-change-cancel" variant="ghost" onPress={cancelPending} loading={busy} style={{ marginTop: 4, alignSelf: "flex-start" }} />
        </View>
      ) : !editing ? (
        <Button label="Change email" testID="email-change-open" variant="outline" onPress={() => { setEditing(true); setSuccess(""); }} style={{ marginTop: spacing.md, alignSelf: "flex-start" }} />
      ) : (
        <View testID="email-change-form" style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Field label="New email address" testID="email-change-new-input" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          <Field label="Confirm your password" testID="email-change-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="Current password" />
          {error ? <T variant="small" testID="email-change-error" style={{ color: colors.terracotta }}>{error}</T> : null}
          <T variant="small">We will send a confirmation link to the new address. You stay signed in with your current email until you click it.</T>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Cancel" testID="email-change-cancel-form" variant="ghost" icon={X} onPress={() => { setEditing(false); setError(""); setNewEmail(""); setPassword(""); }} style={{ flex: 1 }} />
            <Button label="Send link" testID="email-change-submit" icon={Check} onPress={submit} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      )}
      {success ? <T variant="small" testID="email-change-success" style={{ marginTop: spacing.sm, color: colors.success }}>{success}</T> : null}
    </Card>
  );
}

export default function ProfileEditScreen() {
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [phone, setPhone] = useState("");
  const [phoneLoaded, setPhoneLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fallback = (user as any)?.phone_e164 || (user as any)?.mobile || "";
      try {
        const data = await apiFetch<{ phone_e164?: string }>("/me/contacts");
        if (!cancelled) { setPhone(data?.phone_e164 || fallback); setPhoneLoaded(true); }
      } catch {
        if (!cancelled) { setPhone(fallback); setPhoneLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const savePhone = async () => {
    setMsg(""); setErr("");
    const trimmed = phone.trim();
    setSaving(true);
    try {
      await apiFetch("/me/contacts", { method: "PUT", body: { phone_e164: trimmed || null } });
      await refreshUser();
      setMsg("Saved.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Enter your phone in international format, for example +61412345678.");
    } finally { setSaving(false); }
  };

  const roleLabel = (user?.role || "caregiver").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Your Profile" subtitle="How Wayly greets you across the app" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Card testID="profile-name-card">
            <T variant="label">FULL NAME</T>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, marginTop: 4 }} testID="profile-name-value">{user?.name || "—"}</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }}>
              <T variant="label">ROLE</T>
              <Badge label={roleLabel} tone="brand" testID="profile-role-badge" />
            </View>
          </Card>

          <EmailChangeCard currentEmail={user?.email || ""} />

          <Card testID="profile-phone-card">
            <Field
              label="Phone number"
              testID="profile-phone-input"
              value={phone}
              onChangeText={setPhone}
              editable={phoneLoaded}
              keyboardType="phone-pad"
              placeholder={phoneLoaded ? "Add phone, for example +61412345678" : "Loading…"}
            />
            <T variant="small" style={{ marginTop: 6 }}>Used for urgent alerts about your participant. We only contact you about their care.</T>
            {err ? <T variant="small" testID="profile-phone-error" style={{ color: colors.terracotta, marginTop: 6 }}>{err}</T> : null}
            {msg ? <T variant="small" testID="profile-phone-success" style={{ color: colors.success, marginTop: 6 }}>{msg}</T> : null}
            <Button label="Save changes" testID="profile-save-btn" onPress={savePhone} loading={saving} disabled={!phoneLoaded} style={{ marginTop: spacing.md }} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
