import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Menu } from "lucide-react-native";

import { useDrawer } from "@/src/context/DrawerContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { WaylyMark } from "@/src/components/WaylyMark";
import { T } from "@/src/components/ui";
import { TrialBanner } from "@/src/components/TrialBanner";
import { EmailVerifyBanner } from "@/src/components/EmailVerifyBanner";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { initials } from "@/src/utils/format";

// Top app bar matching the web mobile header: logo + wordmark, notification
// bell, avatar, and a hamburger that opens the grouped drawer.
export function WaylyHeader({ notifications = 0 }: { notifications?: number }) {
  const { openDrawer } = useDrawer();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <>
    <View style={[styles.bar, { backgroundColor: colors.bg, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <WaylyMark size={30} white={isDark} />
        <T style={{ fontFamily: fonts.heading, fontSize: 22 }}>Wayly</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Pressable testID="header-notifications" hitSlop={8} style={{ position: "relative" }}>
          <Bell size={22} color={colors.text} />
          {notifications > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.gold }]}>
              <T style={styles.badgeTxt}>{notifications > 9 ? "9+" : String(notifications)}</T>
            </View>
          ) : null}
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 13 }}>
            {initials(user?.name).toUpperCase()}
          </T>
        </View>
        <Pressable testID="header-menu" onPress={openDrawer} hitSlop={8}>
          <Menu size={26} color={colors.text} />
        </Pressable>
      </View>
    </View>
    <TrialBanner />
    <EmailVerifyBanner />
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
