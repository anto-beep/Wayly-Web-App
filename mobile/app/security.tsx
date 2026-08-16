import React, { useCallback, useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { KeyRound, Shield, ShieldCheck } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

function MfaCard() {
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const enabled = !!(user as any)?.totp_enabled;
  const [step, setStep] = useState<"idle" | "setup" | "enabled">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const startSetup = async () => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch<{ qr_data_uri: string; secret: string; setup_token: string }>("/auth/mfa/setup", { method: "POST", body: {} });
      setQr(data.qr_data_uri); setSecret(data.secret); setSetupToken(data.setup_token); setStep("setup");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not start 2FA setup."); }
    finally { setBusy(false); }
  };

  const confirmSetup = async () => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch<{ backup_codes: string[] }>("/auth/mfa/enable", { method: "POST", body: { setup_token: setupToken, code: code.trim() } });
      setBackupCodes(data.backup_codes || []); setStep("enabled"); setCode("");
      await refreshUser();
    } catch (e) { setError(e instanceof ApiError ? e.message : "That code did not match. Try the latest 6 digits."); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setError("");
    try {
      await apiFetch("/auth/mfa/disable", { method: "POST", body: { password: disablePassword, code: disableCode || undefined } });
      setDisablePassword(""); setDisableCode(""); setStep("idle"); setBackupCodes(null);
      await refreshUser();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not disable 2FA."); }
    finally { setBusy(false); }
  };

  return (
    <Card testID="security-mfa-panel">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <ShieldCheck size={18} color={colors.primary} />
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>Two-factor authentication</T>
        </View>
        <Badge testID="security-mfa-status" label={enabled ? "ENABLED" : "DISABLED"} tone={enabled ? "success" : "alert"} />
      </View>
      <T variant="small" style={{ marginTop: 6 }}>Add a 6-digit code from your authenticator app to every sign-in.</T>

      {error ? <T variant="small" testID="security-mfa-error" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}

      {!enabled && step === "idle" ? (
        <Button label="Enable two-factor" testID="security-mfa-enable-btn" onPress={startSetup} loading={busy} style={{ marginTop: spacing.md }} />
      ) : null}

      {step === "setup" ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <T variant="small">1. Scan this QR code with your authenticator app.</T>
          {qr ? <Image source={{ uri: qr }} style={{ width: 176, height: 176, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} /> : null}
          {secret ? <T variant="small" style={{ fontFamily: fonts.mono }} testID="security-mfa-secret">Or enter manually: {secret}</T> : null}
          <Field label="2. Enter the 6-digit code" testID="security-mfa-verify-input" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" maxLength={6} />
          <Button label="Verify and enable" testID="security-mfa-verify-btn" onPress={confirmSetup} loading={busy} disabled={code.length < 6} />
        </View>
      ) : null}

      {step === "enabled" && backupCodes ? (
        <View style={{ marginTop: spacing.md }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Backup codes, save these now.</T>
          <T variant="small" style={{ marginTop: 4 }}>Each works once if you lose your authenticator. They will not be shown again.</T>
          <View testID="security-mfa-backup-codes" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
            {backupCodes.map((c) => <T key={c} style={{ fontFamily: fonts.mono, width: "45%" }}>{c}</T>)}
          </View>
        </View>
      ) : null}

      {enabled ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <T variant="small">Disable 2FA (not recommended). Requires your current password.</T>
          <Field testID="security-mfa-disable-password" value={disablePassword} onChangeText={setDisablePassword} secureTextEntry placeholder="Current password" />
          <Field testID="security-mfa-disable-code" value={disableCode} onChangeText={setDisableCode} keyboardType="number-pad" placeholder="Current 6-digit code (optional)" />
          <Button label="Disable two-factor" testID="security-mfa-disable-btn" variant="outline" onPress={disable} loading={busy} disabled={!disablePassword} />
        </View>
      ) : null}
    </Card>
  );
}

export default function SecurityScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [sending, setSending] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [latestStmtId, setLatestStmtId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<any[]>("/statements");
        if (Array.isArray(data) && data.length > 0) setLatestStmtId(data[0].id);
      } catch { /* silent */ }
    })();
  }, []);

  const sendReset = async () => {
    setSending(true); setResetMsg("");
    try { await apiFetch("/auth/forgot", { method: "POST", auth: false, body: { email: user?.email } }); setResetMsg("Password reset link sent. Check your inbox."); }
    catch { setResetMsg("Password reset link sent. Check your inbox."); }
    finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Security and Data" subtitle="Password, sign-in, and your records" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Card testID="security-password">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <KeyRound size={18} color={colors.primary} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Password</T>
            </View>
            <T variant="small" style={{ marginTop: 6 }}>We will email you a secure link to set a new password.</T>
            {resetMsg ? <T variant="small" testID="security-reset-msg" style={{ color: colors.success, marginTop: spacing.sm }}>{resetMsg}</T> : null}
            <Button label="Send me a reset link" testID="security-send-reset-btn" onPress={sendReset} loading={sending} style={{ marginTop: spacing.md }} />
          </Card>

          <MfaCard />

          <Card testID="security-audit-trail-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Shield size={18} color={colors.primary} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Your data audit trail</T>
            </View>
            <T variant="small" style={{ marginTop: 6 }}>
              Every time we accept, supersede, archive, or delete one of your statements, we write an immutable row to your audit log. You can see it any time.
            </T>
            {latestStmtId ? (
              <Button label="See your latest audit log" testID="security-view-audit-log" variant="outline" onPress={() => router.push(`/statement-audit/${latestStmtId}`)} style={{ marginTop: spacing.md }} />
            ) : (
              <T variant="small" style={{ marginTop: spacing.sm, fontStyle: "italic" }}>Upload a statement to see your first audit trail.</T>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
