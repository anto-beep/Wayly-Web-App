import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle } from "lucide-react-native";

import { AppHeader, Button, Card, Field, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const CONFIRM = "delete my account";

export default function DangerZoneScreen() {
  const { logout } = useAuth();
  const { colors } = useTheme();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async () => {
    setError("");
    if (confirmText !== CONFIRM) { setError(`Type "${CONFIRM}" exactly to confirm.`); return; }
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>("/auth/account", { method: "DELETE", body: { confirm: confirmText } });
      setDone(res?.message || "Your account has been deactivated.");
      setTimeout(async () => { await logout(); router.replace("/login"); }, 2200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete your account. Please try again.");
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Danger Zone" subtitle="Actions here cannot be reversed" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Card testID="danger-delete-card" style={{ borderColor: colors.terracotta, borderWidth: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={20} color={colors.terracotta} />
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.terracotta }}>Delete your account</T>
            </View>
            <T variant="small" style={{ marginTop: spacing.sm }}>
              We will anonymise your email and name, cancel your plan, and remove you from your household. The audit trail stays (legally required) but shows Deleted user. Your data is permanently removed after 60 days.
            </T>

            {done ? (
              <View testID="danger-done" style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                <T variant="small" style={{ color: colors.text }}>{done}</T>
              </View>
            ) : (
              <>
                <T variant="small" style={{ marginTop: spacing.md }}>
                  Type <T style={{ fontFamily: fonts.mono }}>{CONFIRM}</T> to confirm.
                </T>
                <Field testID="danger-confirm-input" value={confirmText} onChangeText={setConfirmText} autoCapitalize="none" placeholder={CONFIRM} style={{ marginTop: spacing.sm }} />
                {error ? <T variant="small" testID="danger-error" style={{ color: colors.terracotta, marginTop: spacing.sm }}>{error}</T> : null}
                <Button label="Delete account permanently" testID="danger-delete-btn" variant="secondary" onPress={submit} loading={busy} disabled={confirmText !== CONFIRM} style={{ marginTop: spacing.md, backgroundColor: colors.terracotta }} />
              </>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
