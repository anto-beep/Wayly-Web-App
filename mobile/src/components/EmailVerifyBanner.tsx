import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MailWarning, X } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";

type Status = { email_verified?: boolean; days_remaining?: number; past_deadline?: boolean };

const DISMISS_KEY = "wayly_verify_banner_dismissed_at";
const DISMISS_MS = 24 * 60 * 60 * 1000; // 24h

let _cache: { at: number; data: Status | null } | null = null;
export function invalidateVerifyCache() { _cache = null; }

async function loadStatus(): Promise<Status | null> {
  if (_cache && Date.now() - _cache.at < 45000) return _cache.data;
  try {
    const data = await apiFetch<Status>("/auth/verification-status");
    _cache = { at: Date.now(), data };
    return data;
  } catch { return null; }
}

// Shows until the user confirms their email. Dismissible; once closed it stays
// hidden for 24 hours (mirrors keeping the nudge low-frequency).
export function EmailVerifyBanner() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [sent, setSent] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [st, dismissedAt] = await Promise.all([loadStatus(), AsyncStorage.getItem(DISMISS_KEY)]);
      if (!mounted) return;
      setStatus(st);
      const recentlyDismissed = dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_MS;
      setHidden(!!recentlyDismissed);
    })();
    return () => { mounted = false; };
  }, []);

  const resend = useCallback(async () => {
    setSent(true);
    try { await apiFetch("/auth/send-verification-email", { method: "POST", body: {} }); } catch { /* ignore */ }
  }, []);

  const dismiss = useCallback(async () => {
    setHidden(true);
    try { await AsyncStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  if (!status || status.email_verified || hidden) return null;
  const days = status.days_remaining ?? 0;

  return (
    <View
      testID="verify-email-banner"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: status.past_deadline ? colors.errorSoft : colors.alertSoft,
        paddingHorizontal: spacing.lg,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <MailWarning size={15} color={status.past_deadline ? colors.terracotta : colors.alert} />
      <Pressable style={{ flex: 1 }} onPress={resend} testID="verify-email-resend">
        <T variant="small" style={{ color: status.past_deadline ? colors.terracotta : colors.alert }}>
          {sent
            ? "Verification email sent, check your inbox."
            : status.past_deadline
              ? "Please verify your email to keep full access · tap to resend"
              : `Verify your email${days > 0 ? ` within ${days} day${days === 1 ? "" : "s"}` : ""} · tap to resend`}
        </T>
      </Pressable>
      <Pressable testID="verify-email-dismiss" hitSlop={10} onPress={dismiss}>
        <X size={16} color={status.past_deadline ? colors.terracotta : colors.alert} />
      </Pressable>
    </View>
  );
}
