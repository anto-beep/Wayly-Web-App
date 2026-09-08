import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Menu, ArrowRight, CheckCircle2, ShieldCheck, X } from "lucide-react-native";
import { useRouter } from "expo-router";

import { useDrawer } from "@/src/context/DrawerContext";
import { useAuth } from "@/src/context/AuthContext";
import { useNotifications } from "@/src/context/NotificationsContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { WaylyMark } from "@/src/components/WaylyMark";
import { NotificationsSheet } from "@/src/components/NotificationsSheet";
import { HealthRing, useAccountHealth } from "@/src/components/AccountHealth";
import { T } from "@/src/components/ui";
import { TrialBanner } from "@/src/components/TrialBanner";
import { EmailVerifyBanner } from "@/src/components/EmailVerifyBanner";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { initials } from "@/src/utils/format";

// Map a web fix_route to the mobile route where the fix actually happens.
function mobileFixRoute(route: string): string {
  if (route.includes("verify") || route.includes("email")) return "/(tabs)/settings";
  return "/participants";
}

// Top app bar matching the web mobile header: logo + wordmark, notification
// bell, avatar, and a hamburger that opens the grouped drawer.
export function WaylyHeader() {
  const { openDrawer } = useDrawer();
  const router = useRouter();
  const { user } = useAuth();
  const { unread } = useNotifications();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [notifOpen, setNotifOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const health = useAccountHealth();

  return (
    <>
    <View style={[styles.bar, { backgroundColor: colors.bg, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
      <Pressable testID="header-logo" onPress={() => router.push("/(tabs)")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <WaylyMark size={30} white={isDark} />
        <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text, letterSpacing: -0.3 }}>Wayly</T>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        {health ? (
          <View style={{ position: "relative" }}>
            <HealthRing pct={health.score_pct} size={34} stroke={4} light onPress={() => setHealthOpen(true)} testID="header-health-ring" />
            {!health.complete && health.outstanding_count > 0 ? (
              <View testID="header-health-badge" style={[styles.badge, { backgroundColor: colors.terracotta }]} pointerEvents="none">
                <T style={styles.badgeTxt}>{health.outstanding_count}</T>
              </View>
            ) : null}
          </View>
        ) : null}
        <Pressable testID="header-notifications" onPress={() => setNotifOpen(true)} hitSlop={8} style={{ position: "relative" }}>
          <Bell size={22} color={colors.text} />
          {unread > 0 ? (
            <View testID="header-notifications-badge" style={[styles.badge, { backgroundColor: colors.gold }]}>
              <T style={styles.badgeTxt}>{unread > 9 ? "9+" : String(unread)}</T>
            </View>
          ) : null}
        </Pressable>
        <Pressable testID="header-avatar" onPress={() => router.push("/(tabs)/settings")} hitSlop={8} style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 13 }}>
            {initials(user?.name).toUpperCase()}
          </T>
        </Pressable>
        <Pressable testID="header-menu" onPress={openDrawer} hitSlop={8}>
          <Menu size={26} color={colors.text} />
        </Pressable>
      </View>
    </View>
    <TrialBanner />
    <EmailVerifyBanner />
    <NotificationsSheet visible={notifOpen} onClose={() => setNotifOpen(false)} />
    <AccountHealthSheet visible={healthOpen} onClose={() => setHealthOpen(false)} data={health} router={router} colors={colors} />
    </>
  );
}

function AccountHealthSheet({ visible, onClose, data, router, colors }: any) {
  if (!data) return null;
  const complete = data.complete;
  const outstanding = (data.items || []).filter((i: any) => !i.done);
  const done = (data.items || []).filter((i: any) => i.done);
  const go = (item: any) => { onClose(); router.push(mobileFixRoute(item.fix_route)); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "80%", overflow: "hidden" }} onPress={(e) => e.stopPropagation()} testID="account-health-menu">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.primary }}>
            <HealthRing pct={data.score_pct} size={56} stroke={6} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: "#fff" }}>{complete ? "Your account is all set" : "Finish setting up"}</T>
              <T style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
                {complete ? "Everything Wayly needs is in place." : `${data.outstanding_count} left for the most accurate results.`}
              </T>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="account-health-close"><X size={22} color="#fff" /></Pressable>
          </View>
          <ScrollView testID="account-health-list">
            {outstanding.map((item: any, i: number) => (
              <Pressable key={item.id} testID={`account-health-item-${item.id}`} onPress={() => go(item)}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 15, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <ArrowRight size={17} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 14, color: colors.text }}>{item.label}</T>
                  <T style={{ fontSize: 12, fontFamily: fonts.bodySemi, color: colors.primary, marginTop: 2 }}>{item.fix_label}</T>
                </View>
              </Pressable>
            ))}
            {complete ? (
              <View testID="account-health-complete" style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.lg }}>
                <ShieldCheck size={20} color={colors.sage} />
                <T style={{ fontSize: 14, color: colors.sage }}>Nothing left to do.</T>
              </View>
            ) : null}
            {done.map((item: any) => (
              <View key={item.id} testID={`account-health-item-${item.id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border, opacity: 0.55 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={16} color={colors.sage} />
                </View>
                <T style={{ flex: 1, fontSize: 14, color: colors.muted, textDecorationLine: "line-through" }}>{item.label}</T>
              </View>
            ))}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  avatar: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 9 },
});
