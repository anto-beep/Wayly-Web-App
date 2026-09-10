import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AlertCircle, ArrowRight, X } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type P = { id: string; first_name?: string; preferred_name?: string; requires_completion?: boolean };

const DISMISS_KEY = "wayly_missing_details_banner_dismissed_at";
const DISMISS_MS = 24 * 60 * 60 * 1000; // 24h

// Mirrors web ProfileCompletionBanner. Shows when a participant still needs
// details. Dismissible; once closed it stays hidden for 24 hours.
export function MissingDetailsBanner() {
  const { colors } = useTheme();
  const [items, setItems] = useState<P[]>([]);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [res, dismissedAt] = await Promise.all([
        apiFetch<{ items?: P[] }>("/participants").catch(() => null),
        AsyncStorage.getItem(DISMISS_KEY),
      ]);
      if (!mounted) return;
      const incomplete = (res?.items || []).filter((p) => p.requires_completion);
      setItems(incomplete);
      const recentlyDismissed = dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_MS;
      setHidden(!!recentlyDismissed);
    })();
    return () => { mounted = false; };
  }, []);

  const dismiss = useCallback(async () => {
    setHidden(true);
    try { await AsyncStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  if (hidden || items.length === 0) return null;
  const first = items[0];
  const displayName = first.preferred_name || first.first_name || "your participant";

  return (
    <View
      testID="profile-completion-banner"
      style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.terracotta, backgroundColor: colors.errorSoft, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}
    >
      <AlertCircle size={18} color={colors.terracotta} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
          {`To keep using Wayly's accuracy guarantees, we need a few extra details about `}
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{displayName}</T>
          {`. This takes about a minute.`}
        </T>
        {items.length > 1 ? (
          <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 }}>{items.length - 1} other participant(s) also need details.</T>
        ) : null}
        <Pressable testID="profile-completion-cta" onPress={() => router.push(`/onboarding?pid=${first.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.terracotta }}>Complete now</T>
          <ArrowRight size={13} color={colors.terracotta} />
        </Pressable>
      </View>
      <Pressable testID="profile-completion-dismiss" hitSlop={10} onPress={dismiss}>
        <X size={16} color={colors.terracotta} />
      </Pressable>
    </View>
  );
}
