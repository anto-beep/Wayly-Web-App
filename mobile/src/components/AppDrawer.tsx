import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown, ChevronRight, LogOut, X } from "lucide-react-native";

import { NAV_GROUPS } from "@/src/config/navGroups";
import { useDrawer } from "@/src/context/DrawerContext";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { WaylyMark } from "@/src/components/WaylyMark";
import { T } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { colors, isDark } = useTheme();
  const { logout } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ today: true });

  const go = (route: string) => {
    closeDrawer();
    setTimeout(() => router.push(route as any), 120);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={closeDrawer}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={closeDrawer}>
        <Pressable style={[styles.panel, { backgroundColor: colors.bg }]} onPress={() => {}}>
          <View style={[styles.head, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <WaylyMark size={30} white={isDark} />
              <T style={{ fontFamily: fonts.heading, fontSize: 22 }}>Wayly</T>
            </View>
            <Pressable testID="drawer-close" onPress={closeDrawer} hitSlop={10}>
              <X size={24} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            {NAV_GROUPS.map((group) => {
              const isOpen = openGroups[group.key];
              return (
                <View key={group.key} style={[styles.group, { borderBottomColor: colors.border }]}>
                  <Pressable
                    testID={`drawer-group-${group.key}`}
                    onPress={() => setOpenGroups((s) => ({ ...s, [group.key]: !s[group.key] }))}
                    style={styles.groupHead}
                  >
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, letterSpacing: 0.5 }}>
                      {group.label.toUpperCase()}
                    </T>
                    {isOpen ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
                  </Pressable>
                  {isOpen
                    ? group.items.map((item) => {
                        const Icon = item.icon;
                        const disabled = !item.implemented;
                        return (
                          <Pressable
                            key={item.label}
                            testID={`drawer-item-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                            disabled={disabled}
                            onPress={() => go(item.route)}
                            style={({ pressed }) => [styles.item, pressed && !disabled && { backgroundColor: colors.surface2 }]}
                          >
                            <Icon size={20} color={disabled ? colors.border : colors.primary} />
                            <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: disabled ? colors.muted : colors.text }}>
                              {item.label}
                            </T>
                            {disabled ? (
                              <T style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>Soon</T>
                            ) : null}
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              );
            })}

            <Pressable
              testID="drawer-logout"
              onPress={async () => {
                closeDrawer();
                await logout();
                router.replace("/login");
              }}
              style={[styles.item, { marginTop: spacing.md }]}
            >
              <LogOut size={20} color={colors.terracotta} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.terracotta }}>Log out</T>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, flexDirection: "row" },
  panel: { width: "84%", maxWidth: 360, height: "100%" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  group: { borderBottomWidth: 1, paddingVertical: spacing.xs },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13, borderRadius: radius.sm },
});
