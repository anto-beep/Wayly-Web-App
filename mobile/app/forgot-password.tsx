import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react-native";

import { Button, Field, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export default function ForgotPasswordScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async () => {
    if (!email.trim()) { setError("Please enter your email."); return; }
    setSubmitting(true); setError("");
    try {
      // Enumeration-safe: the backend always returns ok, we never reveal whether the email exists.
      await apiFetch("/auth/forgot", { method: "POST", body: { email: email.trim().toLowerCase() } });
      setSent(true);
      setCooldown(60);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the reset link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="forgot-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))} hitSlop={8} style={styles.back}>
            <ArrowLeft size={16} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted }}>Back to Sign In</T>
          </Pressable>

          <View style={styles.brandMark}>
            <WaylyMark size={64} white={isDark} />
          </View>

          <View style={styles.card}>
            {sent ? (
              <>
                <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                  <CheckCircle2 size={28} color={colors.sage} />
                </View>
                <T variant="h2" testID="forgot-title" style={{ marginTop: spacing.md }}>Check your email</T>
                <T variant="bodyMuted" style={{ marginTop: spacing.sm, lineHeight: 21 }}>
                  If an account with that email exists, you&apos;ll receive a reset link within 2 minutes. Check your spam folder too.
                </T>
                <Button
                  label={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend reset link"}
                  testID="forgot-resend"
                  onPress={submit}
                  loading={submitting}
                  disabled={cooldown > 0}
                  style={{ marginTop: spacing.lg }}
                />
                <Pressable testID="forgot-goto-login" onPress={() => router.replace("/login")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
                  <T variant="body" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Back to Sign In</T>
                </Pressable>
              </>
            ) : (
              <>
                <T variant="h2" testID="forgot-title">Forgot your password?</T>
                <T variant="bodyMuted" style={{ marginTop: spacing.sm }}>
                  Enter your email and we&apos;ll send a link to reset it.
                </T>
                <Field
                  label="Email"
                  testID="forgot-email-input"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                  style={{ marginTop: spacing.md }}
                />
                {error ? (
                  <View testID="forgot-error" style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
                    <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
                    <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T>
                  </View>
                ) : null}
                <Button
                  label="Send reset link"
                  testID="forgot-submit"
                  icon={Mail}
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
