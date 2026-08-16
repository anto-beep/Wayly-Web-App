import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LogIn } from "lucide-react-native";

import { Button, Field, Loading, Screen, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function LoginScreen() {
  const { login, loginWithGoogle, loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user]);

  if (authLoading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Loading />
      </Screen>
    );
  }

  const onLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setError(msg);
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
      const msg = e instanceof ApiError ? e.message : "Google sign-in was cancelled or failed.";
      setError(msg);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandMark}>
            <T variant="h1" style={{ fontSize: 40, color: colors.primary }}>
              Wayly
            </T>
            <T variant="bodyMuted" style={{ marginTop: 4 }}>
              Calm, clear aged-care support
            </T>
          </View>

          <View style={styles.form}>
            <T variant="h2">Welcome back</T>
            <T variant="bodyMuted" style={{ marginTop: 4, marginBottom: spacing.lg }}>
              Sign in to your Wayly account
            </T>

            <Field
              label="Email"
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              style={{ marginBottom: spacing.md }}
            />

            <View style={{ marginBottom: spacing.sm }}>
              <T variant="label" style={{ color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 }}>
                Password
              </T>
              <View style={styles.pwWrap}>
                <Field
                  testID="login-password-input"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  placeholder="Your password"
                  style={{ flex: 1 }}
                />
                <Pressable
                  testID="login-toggle-password"
                  onPress={() => setShowPw((s) => !s)}
                  hitSlop={10}
                  style={styles.pwToggle}
                >
                  <Ionicons name={showPw ? "eye-off" : "eye"} size={22} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View testID="login-error" style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
                <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>
                  {error}
                </T>
              </View>
            ) : null}

            <Button
              label="Sign In"
              testID="login-submit-button"
              onPress={onLogin}
              loading={busy}
              style={{ marginTop: spacing.md }}
            />

            <View style={styles.divider}>
              <View style={styles.line} />
              <T variant="small">or</T>
              <View style={styles.line} />
            </View>

            <Button
              label="Continue with Google"
              testID="login-google-button"
              onPress={onGoogle}
              loading={googleBusy}
              variant="outline"
              icon={LogIn}
            />

            <Pressable
              testID="login-goto-signup"
              onPress={() => router.push("/signup")}
              style={{ marginTop: spacing.xl, alignItems: "center" }}
            >
              <T variant="body">
                New to Wayly? <T variant="body" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Create an account</T>
              </T>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  brandMark: { alignItems: "center", marginBottom: spacing.xl },
  form: {},
  pwWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  pwToggle: {
    position: "absolute",
    right: spacing.md,
    height: 52,
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#FBE6E4",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
