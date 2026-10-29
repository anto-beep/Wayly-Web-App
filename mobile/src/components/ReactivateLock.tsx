import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, Lock, Check, Sparkles } from "lucide-react-native";

import { Button, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const PERKS = [
  "Upload and decode your Support at Home statements",
  "Run every Wayly tool — invoice checks, letters, price checks",
  "Track budgets, anomalies and your lifetime cap",
];

/**
 * ReactivateLock — the single, premium, top-aligned lock surface shown whenever
 * an inactive (view-only) plan tries to open a run/create screen. One consistent
 * message + one clear Reactivate CTA across the whole app. No centred layout /
 * blank gap: content flows from the top inside a ScrollView.
 */
export function ReactivateLock({
  featureLabel = "this feature",
  onBack,
}: {
  featureLabel?: string;
  onBack?: () => void;
}) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const back = onBack || (() => router.back());
  const planName =
    user?.plan && user.plan !== "free" ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="reactivate-lock">
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          testID="reactivate-lock-back"
          onPress={back}
          hitSlop={12}
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ChevronLeft size={24} color={colors.heading} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.xl,
              padding: spacing.lg,
            },
            shadow.card,
          ]}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.pill,
              backgroundColor: colors.goldSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lock size={26} color={colors.gold} />
          </View>

          <T
            style={{
              fontFamily: fonts.heading,
              fontSize: 26,
              lineHeight: 32,
              color: colors.heading,
              marginTop: spacing.md,
            }}
          >
            Reactivate to unlock {featureLabel}
          </T>
          <T variant="bodyMuted" style={{ marginTop: spacing.sm, lineHeight: 22, color: colors.muted }}>
            Your {planName ? `${planName} ` : ""}plan is inactive, so this is paused. Everything you&apos;ve saved
            stays safe to view — reactivate to start using Wayly again.
          </T>

          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {PERKS.map((p) => (
              <View key={p} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.sageSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  <Check size={13} color={colors.sage} />
                </View>
                <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>
                  {p}
                </T>
              </View>
            ))}
          </View>

          <Button
            label="Reactivate my plan"
            testID="reactivate-lock-cta"
            icon={Sparkles}
            onPress={() => router.push("/plan-select")}
            style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
          />
          <Pressable
            testID="reactivate-lock-secondary"
            onPress={back}
            style={{ alignSelf: "center", marginTop: spacing.md, paddingVertical: 8 }}
          >
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>
              View my saved information
            </T>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export default ReactivateLock;
