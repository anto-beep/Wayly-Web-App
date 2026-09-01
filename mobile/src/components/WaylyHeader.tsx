import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Menu } from "lucide-react-native";
import { useRouter } from "expo-router";

import { useDrawer } from "@/src/context/DrawerContext";
import { useAuth } from "@/src/context/AuthContext";
import { useNotifications } from "@/src/context/NotificationsContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { WaylyMark } from "@/src/components/WaylyMark";
import { NotificationsSheet } from "@/src/components/NotificationsSheet";
import { T } from "@/src/components/ui";
import { TrialBanner } from "@/src/components/TrialBanner";
import { EmailVerifyBanner } from "@/src/components/EmailVerifyBanner";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { initials } from "@/src/utils/format";

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

  return (
    <>
    <View style={[styles.bar, { backgroundColor: colors.bg, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
      <Pressable testID="header-logo" onPress={() => router.push("/(tabs)")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <WaylyMark size={30} white={isDark} />
        <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text, letterSpacing: -0.3 }}>Wayly</T>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
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
    </>
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
