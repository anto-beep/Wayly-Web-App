import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { MailWarning } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";

type Status = { email_verified?: boolean; days_remaining?: number; past_deadline?: boolean };

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

// Shows across the app until the user confirms their email (mirrors the web
// EmailVerificationBanner). Tapping resends the verification email.
export function EmailVerifyBanner() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadStatus().then((d) => { if (mounted) setStatus(d); });
    return () => { mounted = false; };
  }, []);

  const resend = useCallback(async () => {
    setSending(true);
    try { await apiFetch("/auth/send-verification-email", { method: "POST", body: {} }); setSent(true); }
    catch { setSent(true); }
    finally { setSending(false); }
  }, []);

  if (!status || status.email_verified) return null;
  const days = status.days_remaining ?? 0;

  return (
    <Pressable
      testID="verify-email-banner"
      onPress={resend}
      disabled={sending}
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
      <T variant="small" style={{ flex: 1, color: status.past_deadline ? colors.terracotta : colors.alert }}>
        {sent
          ? "Verification email sent, check your inbox."
          : status.past_deadline
            ? "Please verify your email to keep full access · tap to resend"
            : `Verify your email${days > 0 ? ` within ${days} day${days === 1 ? "" : "s"}` : ""} · tap to resend`}
      </T>
    </Pressable>
  );
}
