import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Clock } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { daysUntil } from "@/src/utils/format";
import { spacing } from "@/src/theme/tokens";

type Sub = { plan?: string; status?: string; trial_ends_at?: string | null };

// Lightweight session cache so every screen's header does not re-hit billing.
let _cache: { at: number; data: Sub | null } | null = null;
export function invalidateTrialCache() { _cache = null; }

async function loadSub(): Promise<Sub | null> {
  if (_cache && Date.now() - _cache.at < 45000) return _cache.data;
  try {
    const data = await apiFetch<Sub>("/billing/subscription");
    _cache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

// Subtle amber strip shown across the app while a free trial is active, so
// users convert before it lapses. Tapping jumps to Plan & Billing.
export function TrialBanner() {
  const { colors } = useTheme();
  const [sub, setSub] = useState<Sub | null>(null);

  useEffect(() => {
    let mounted = true;
    loadSub().then((d) => { if (mounted) setSub(d); });
    return () => { mounted = false; };
  }, []);

  const trialing = sub?.status === "trialing" || sub?.status === "trial";
  const days = daysUntil(sub?.trial_ends_at);
  if (!trialing || days === null) return null;

  return (
    <Pressable
      testID="trial-banner"
      onPress={() => router.push("/plan-billing")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.alertSoft,
        paddingHorizontal: spacing.lg,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Clock size={15} color={colors.alert} />
      <T variant="small" style={{ flex: 1, color: colors.alert }}>
        {days === 0 ? "Your free trial ends today" : `Free trial ends in ${days} day${days === 1 ? "" : "s"}`}
        {" · tap to manage"}
      </T>
      <ChevronRight size={16} color={colors.alert} />
    </Pressable>
  );
}
