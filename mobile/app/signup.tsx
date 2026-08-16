import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LogIn } from "lucide-react-native";

import { AppHeader, Button, Field, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { ApiError } from "@/src/lib/api";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const PW_RULES = [
  { id: "len", label: "8+ characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "An uppercase letter (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { id: "num", label: "A number (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { id: "sym", label: "A symbol (!@#$)", test: (p: string) => /[!@#$%^&*()_+\-=[\]{}|;':".<>?/]/.test(p) },
];
function evaluatePassword(password: string, email: string, name: string) {
  const passed = PW_RULES.filter((r) => r.test(password));
  const lower = password.toLowerCase();
  const containsIdentity = Boolean(
    (email && lower.includes(email.toLowerCase().split("@")[0])) ||
    (name && name.trim().length > 2 && lower.includes(name.toLowerCase().split(" ")[0]))
  );
  return { valid: passed.length === PW_RULES.length && !containsIdentity, containsIdentity, rules: PW_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) })) };
}

export default function SignupScreen() {
  const { colors, isDark } = useTheme();
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
    const mobileClean = mobile.replace(/\s+/g, "");
    if (mobileClean && !/^(\+614\d{8}|04\d{8})$/.test(mobileClean)) {
      setError("Enter an Australian mobile (04XXXXXXXX or +614XXXXXXXX), or leave blank.");
      return;
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const pw = evaluatePassword(password, email, fullName);
    if (!pw.valid) {
      setError(pw.containsIdentity ? "Password should not include your name or email." : "Password needs 8+ characters with an uppercase, a lowercase, a number, and a symbol.");
      return;
    }
    setBusy(true);
    try {
      await signup({
        email,
        password,
        name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        mobile: mobileClean || undefined,
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
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <WaylyMark size={64} white={isDark} />
            <T style={{ fontFamily: fonts.heading, fontSize: 30, color: colors.primary, marginTop: 8 }}>Wayly</T>
            <T testID="brand-tagline" style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: 1, color: colors.gold, marginTop: 10, textAlign: "center" }}>
              AGED CARE, MADE EASY
            </T>
          </View>
          <T variant="bodyMuted" style={{ marginBottom: spacing.lg, textAlign: "center" }}>
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

          {password ? (
            <View testID="signup-password-rules" style={{ marginTop: spacing.sm, gap: 4 }}>
              {evaluatePassword(password, email, `${firstName} ${lastName}`.trim()).rules.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name={r.ok ? "checkmark-circle" : "ellipse-outline"} size={15} color={r.ok ? colors.sage : colors.muted} />
                  <T variant="small" style={{ color: r.ok ? colors.text : colors.muted }}>{r.label}</T>
                </View>
              ))}
            </View>
          ) : null}

          {error ? (
            <View testID="signup-error" style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
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
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <T variant="small">or</T>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <Button
            label="Continue with Google"
            testID="signup-google-button"
            onPress={onGoogle}
            loading={googleBusy}
            variant="outline"
            icon={LogIn}
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
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1 },
});
