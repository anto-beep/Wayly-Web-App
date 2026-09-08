import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react-native";

import { Button, Field, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing } from "@/src/theme/tokens";

// Deep-link: mobile://reset?token=... or wayly://reset?token=...
// Opened from the "Open in app" button on the web /reset page.
export default function ResetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const strongEnough = pw.length >= 8;

  const submit = async () => {
    if (!token) { setError("This reset link is missing its token. Request a new one."); return; }
    if (!strongEnough) { setError("Password must be at least 8 characters."); return; }
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true); setError("");
    try {
      await apiFetch("/auth/reset", { method: "POST", body: { token, new_password: pw } });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1600);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update your password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="reset-back" onPress={() => router.replace("/login")} hitSlop={8} style={styles.back}>
            <ArrowLeft size={16} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted }}>Back to Sign In</T>
          </Pressable>

          <View style={styles.brandMark}>
            <WaylyMark size={64} white={isDark} />
          </View>

          <View style={styles.card}>
            {done ? (
              <>
                <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                  <CheckCircle2 size={28} color={colors.sage} />
                </View>
                <T variant="h2" testID="reset-title" style={{ marginTop: spacing.md }}>Password updated</T>
                <T variant="bodyMuted" style={{ marginTop: spacing.sm, lineHeight: 21 }}>
                  You&apos;re all set. Taking you to sign in&hellip;
                </T>
              </>
            ) : (
              <>
                <T variant="h2" testID="reset-title">Choose a new password</T>
                <T variant="bodyMuted" style={{ marginTop: spacing.sm }}>
                  Enter a new password for your Wayly account.
                </T>
                <Field
                  label="New password"
                  testID="reset-pw-input"
                  value={pw}
                  onChangeText={setPw}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="At least 8 characters"
                  style={{ marginTop: spacing.md }}
                />
                <Field
                  label="Confirm password"
                  testID="reset-confirm-input"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="Re-enter your password"
                  style={{ marginTop: spacing.md }}
                />
                {error ? (
                  <View testID="reset-error" style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
                    <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
                  </View>
                ) : null}
                <Button
                  label="Update password"
                  testID="reset-submit"
                  icon={KeyRound}
                  onPress={submit}
                  loading={submitting}
                  style={{ marginTop: spacing.md }}
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.lg },
  brandMark: { alignItems: "center", marginBottom: spacing.lg },
  card: {},
  iconWrap: { width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  errorBox: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
});
