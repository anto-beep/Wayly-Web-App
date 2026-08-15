import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Button, Field, Screen, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function SignupScreen() {
  const { signup, loginWithGoogle } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  const onSignup = async () => {
    setError("");
    if (!firstName.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await signup({
        email,
        password,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        mobile: mobile.trim() || undefined,
      });
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Google sign-in was cancelled or failed.");
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <AppHeader title="Create account" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <T variant="bodyMuted" style={{ marginBottom: spacing.lg }}>
            Join Wayly to make sense of Support at Home statements, invoices and budgets.
          </T>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Field
              label="First name"
              testID="signup-first-name-input"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Jane"
              style={{ flex: 1, marginBottom: spacing.md }}
            />
            <Field
              label="Last name"
              testID="signup-last-name-input"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Doe"
              style={{ flex: 1, marginBottom: spacing.md }}
            />
          </View>

          <Field
            label="Email"
            testID="signup-email-input"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            style={{ marginBottom: spacing.md }}
          />
          <Field
            label="Mobile (optional)"
            testID="signup-mobile-input"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="04xx xxx xxx"
            style={{ marginBottom: spacing.md }}
          />

          <T variant="label" style={{ color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>
            Password
          </T>
          <View style={styles.pwWrap}>
            <Field
              testID="signup-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              placeholder="At least 8 characters"
              style={{ flex: 1 }}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} style={styles.pwToggle}>
              <Ionicons name={showPw ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>

          {error ? (
            <View testID="signup-error" style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>
                {error}
              </T>
            </View>
          ) : null}

          <Button
            label="Create Account"
            testID="signup-submit-button"
            onPress={onSignup}
            loading={busy}
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.divider}>
            <View style={styles.line} />
            <T variant="small">or</T>
            <View style={styles.line} />
          </View>

          <Button
            label="Continue with Google"
            testID="signup-google-button"
            onPress={onGoogle}
            loading={googleBusy}
            variant="outline"
            icon="logo-google"
          />

          <Pressable onPress={() => router.replace("/login")} style={{ marginTop: spacing.xl, alignItems: "center" }}>
            <T variant="body">
              Already have an account?{" "}
              <T variant="body" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Sign in</T>
            </T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pwWrap: { flexDirection: "row", alignItems: "center" },
  pwToggle: { position: "absolute", right: spacing.md, height: 52, justifyContent: "center" },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#FBE6E4",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
