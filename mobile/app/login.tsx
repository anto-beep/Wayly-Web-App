import React, { useEffect, useState } from "react";
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
import * as AppleAuthentication from "expo-apple-authentication";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button, Field, Loading, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { WaylyLoader } from "@/src/components/WaylyLoader";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { ApiError } from "@/src/lib/api";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { BRAND_TAGLINE } from "@/src/config/brand";

function formatLockout(detail: any): string {
  const secs = Number(detail?.retry_after_seconds) || 0;
  const mins = Math.max(1, Math.ceil(secs / 60));
  let whenStr = "";
  try {
    if (detail?.locked_until) {
      const d = new Date(detail.locked_until);
      const t = new Intl.DateTimeFormat(undefined, {
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }).format(d);
      whenStr = ` (around ${t})`;
    }
  } catch { /* fall back to the server message */ }
  if (!whenStr && detail?.message) return String(detail.message);
  return `Too many failed sign-in attempts, so this account is locked for a short while. Try again in about ${mins} minute${mins !== 1 ? "s" : ""}${whenStr} or reset your password.`;
}

// Map a login failure to a clear, specific message for the inline error box.
function friendlyLoginError(e: unknown): string {
  if (e instanceof ApiError) {
    const detail = e.data?.detail;
    if (detail && typeof detail === "object" && detail.code === "account_locked") {
      return formatLockout(detail);
    }
    if (e.status === 401) return "That email or password doesn't match. Please double-check and try again.";
    if (e.status === 429) return e.message || "Too many attempts just now. Please wait a minute and try again.";
    if (e.status >= 500) return "Something went wrong on our end. Please try again in a moment.";
    return e.message || "Could not sign in. Please try again.";
  }
  return "We couldn't reach Wayly. Check your internet connection and try again.";
}

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login, loginWithGoogle, loginWithApple, loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);
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
      if (
        e instanceof ApiError &&
        e.status === 403 &&
        (e.data as any)?.detail?.code === "email_verification_required"
      ) {
        const to = ((e.data as any)?.detail?.email || email).trim().toLowerCase();
        router.push(`/verify-email?email=${encodeURIComponent(to)}&next=login&send=1`);
        return;
      }
      setError(friendlyLoginError(e));
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    setError("");
    try {
      await loginWithApple();
      router.replace("/(tabs)");
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return; // user dismissed the sheet
      const msg = e instanceof ApiError ? e.message : "Apple sign-in was cancelled or failed.";
      setError(msg);
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
          <Animated.View entering={FadeInDown.duration(650)} style={styles.brandMark}>
            <WaylyMark size={78} white={isDark} />
            <T
              testID="brand-tagline"
              style={{ fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: 1, color: colors.gold, marginTop: 14, textAlign: "center" }}
            >
              {BRAND_TAGLINE}
            </T>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(650)} style={styles.form}>
            <Field
              label="Email"
              required
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <T variant="label" style={{ color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 }}>
                  Password
                </T>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</T>
              </View>
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

            <Pressable
              testID="login-forgot-password"
              onPress={() => router.push("/forgot-password")}
              hitSlop={8}
              style={{ alignSelf: "flex-end", marginBottom: spacing.xs }}
            >
              <T variant="small" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>
                Forgot Password?
              </T>
            </Pressable>

            {error ? (
              <View testID="login-error" style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
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
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <T variant="small">or</T>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
            </View>

            <Button
              label="Continue with Google"
              testID="login-google-button"
              onPress={onGoogle}
              loading={googleBusy}
              variant="outline"
              icon={LogIn}
            />

            {Platform.OS === "ios" && appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                testID="login-apple-button"
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.pill}
                style={{ height: 50, marginTop: spacing.md }}
                onPress={onApple}
              />
            ) : null}

            <Pressable
              testID="login-goto-signup"
              onPress={() => router.push("/signup")}
              style={{ marginTop: spacing.xl, alignItems: "center" }}
            >
              <T variant="body">
                New to Wayly? <T variant="body" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Create an account</T>
              </T>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      {busy || googleBusy ? (
        <Animated.View
          entering={FadeInDown.duration(300)}
          testID="login-signing-overlay"
          style={[styles.overlay, { backgroundColor: colors.bg }]}
        >
          <WaylyLoader size={110} white={isDark} />
          <T style={{ fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: spacing.lg, letterSpacing: 0.3 }}>
            Signing you in…
          </T>
        </Animated.View>
      ) : null}
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
  line: { flex: 1, height: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
