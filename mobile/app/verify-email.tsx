import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ArrowLeft, MailCheck } from "lucide-react-native";

import { Button, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { CodeInput } from "@/src/components/CodeInput";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { invalidateVerifyCache } from "@/src/components/EmailVerifyBanner";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export default function VerifyEmailScreen() {
  const { colors, isDark } = useTheme();
  const { user, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ email?: string; send?: string; next?: string }>();
  const email = ((typeof params.email === "string" && params.email) || user?.email || "").toLowerCase();
  const authed = !!user;
  const nextIsLogin = params.next === "login";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [verified, setVerified] = useState(false);
  const sendGuard = useRef(false);

  const send = useCallback(async (silent = false) => {
    setError("");
    try {
      const res = await apiFetch<any>(
        authed ? "/auth/send-verification-email" : "/auth/resend-verification-email",
        { method: "POST", body: authed ? {} : { email }, auth: authed },
      );
      if (res?.resend_available_in) setCooldown(res.resend_available_in);
      if (res?.debug_code) setDebugCode(res.debug_code);
      if (!silent) setNotice(`We sent a fresh 6-digit code to ${email}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const m = /(\d+)\s*seconds/.exec(e.message || "");
        if (m) setCooldown(Number(m[1]));
        if (!silent) setNotice(`A code was already sent to ${email}. Check your inbox.`);
      } else if (!silent) {
        setError(e instanceof ApiError ? e.message : "Could not send a code. Please try again.");
      }
    }
  }, [authed, email]);

  useEffect(() => {
    (async () => {
      if (authed) {
        try {
          const st = await apiFetch<any>("/auth/verification-status");
          if (st?.email_verified) { router.replace("/(tabs)"); return; }
          if (typeof st?.resend_available_in === "number") setCooldown(st.resend_available_in);
          if (st?.debug_code) setDebugCode(st.debug_code);
        } catch { /* ignore */ }
      }
      if (params.send === "1" && !sendGuard.current && (authed || email)) {
        sendGuard.current = true;
        await send(true);
      }
    })();
    // Re-runs once auth hydrates (user is null on first mount) so the status
    // fetch, debug hint and initial send fire with the right identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const verify = useCallback(async (full: string) => {
    setBusy(true); setError("");
    try {
      await apiFetch("/auth/verify-code", { method: "POST", body: { email, code: full }, auth: false });
      invalidateVerifyCache();
      setVerified(true);
      if (authed) await refreshUser();
      setTimeout(() => {
        if (nextIsLogin) router.replace("/login");
        else if (authed) router.replace("/(tabs)");
        else router.replace("/login");
      }, 900);
    } catch (e) {
      setCode("");
      setError(e instanceof ApiError ? e.message : "That code didn't work. Please try again.");
    } finally { setBusy(false); }
  }, [email, authed, nextIsLogin, refreshUser]);

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Pressable testID="verify-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} hitSlop={10} style={{ alignSelf: "flex-start", marginBottom: spacing.md }}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>

          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: "center", marginBottom: spacing.xl }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
              <MailCheck size={30} color={colors.primary} />
            </View>
            <WaylyMark size={30} white={isDark} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)}>
            <T style={{ fontFamily: fonts.heading, fontSize: 28, textAlign: "center" }}>Verify your email</T>
            <T variant="small" style={{ textAlign: "center", marginTop: 6, marginBottom: spacing.xl }}>
              Enter the 6-digit code we sent to{"\n"}
              <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>{email}</T>
            </T>

            {verified ? (
              <View testID="verify-success" style={{ alignItems: "center", gap: 8, paddingVertical: spacing.lg }}>
                <MailCheck size={28} color={colors.sage} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.sage }}>Email verified</T>
                <T variant="small" style={{ textAlign: "center" }}>{nextIsLogin ? "You can sign in now." : "Taking you back…"}</T>
              </View>
            ) : (
              <>
                <CodeInput value={code} onChange={setCode} onComplete={verify} autoFocus disabled={busy} testID="verify-code-input" />

                {error ? (
                  <T testID="verify-error" variant="small" style={{ color: colors.terracotta, marginTop: spacing.md, textAlign: "center" }}>{error}</T>
                ) : notice ? (
                  <T testID="verify-notice" variant="small" style={{ color: colors.muted, marginTop: spacing.md, textAlign: "center" }}>{notice}</T>
                ) : null}

                {debugCode ? (
                  <T testID="verify-debug-code" variant="small" style={{ marginTop: spacing.sm, textAlign: "center", color: colors.gold }}>
                    Preview code: {debugCode}
                  </T>
                ) : null}

                <Button
                  label="Verify"
                  testID="verify-submit"
                  onPress={() => verify(code)}
                  loading={busy}
                  disabled={code.length < 6}
                  style={{ marginTop: spacing.xl }}
                />

                <Pressable
                  testID="verify-resend"
                  onPress={() => send(false)}
                  disabled={cooldown > 0}
                  style={{ marginTop: spacing.lg, alignItems: "center" }}
                >
                  <T variant="small" style={{ color: cooldown > 0 ? colors.muted : colors.gold, fontFamily: fonts.bodySemi }}>
                    {cooldown > 0 ? `Resend code in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}` : "Resend code"}
                  </T>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
