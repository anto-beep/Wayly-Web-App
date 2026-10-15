import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, ChevronRight, LogOut, X, Settings as SettingsIcon } from "lucide-react-native";

import { NAV_GROUPS } from "@/src/config/navGroups";
import { useDrawer } from "@/src/context/DrawerContext";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { usePersona } from "@/src/hooks/usePersona";
import { useTheme } from "@/src/theme/ThemeContext";
import { T } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";

// expo-router pathnames drop the "(tabs)" group, so normalise the nav routes
// to compare against the live pathname for the active highlight.
const norm = (route: string) => route.replace("/(tabs)", "") || "/";

export function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { active } = useParticipants();
  const persona = usePersona();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const careLabel = persona === "caregiver" ? "Their Care" : "My Care";

  const isActive = (route: string) => {
    const n = norm(route);
    if (n === "/") return pathname === "/";
    return pathname === n || pathname.startsWith(n + "/");
  };

  // Mirror web: each group auto-opens if it holds the active route; reset every
  // time the drawer opens. Multiple groups may be open at once.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (open) {
      const init: Record<string, boolean> = {};
      NAV_GROUPS.forEach((g) => {
        init[g.key] = g.items.some((it) => isActive(it.route));
      });
      setOpenGroups(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (route: string) => {
    closeDrawer();
    setTimeout(() => router.push(route as any), 120);
  };

  const firstName = (user?.name || "Menu").split(" ")[0];
  const plan = (user?.plan || "free").toUpperCase();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeDrawer} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={closeDrawer}>
        <Pressable style={[styles.panel, { backgroundColor: colors.surface }]} onPress={() => {}}>
          {/* Header — user first name + plan */}
          <View style={[styles.head, { borderBottomColor: colors.border, paddingTop: insets.top + spacing.md }]}>
            <View style={{ flex: 1 }}>
              <T testID="drawer-name" style={{ fontFamily: fonts.heading, fontSize: 19, color: colors.primary }}>{firstName}</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.muted, marginTop: 2 }}>{plan} PLAN</T>
            </View>
            <Pressable testID="drawer-close" onPress={closeDrawer} hitSlop={10} style={styles.closeBtn}>
              <X size={22} color={colors.primary} />
            </Pressable>
          </View>

          {/* Caring for card */}
          {active ? (
            <View style={[styles.caringFor, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]} testID="drawer-caring-for">
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.muted }}>CARING FOR</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary, marginTop: 3 }}>{active.display_name}</T>
              {active.classification_level || active.provider_name ? (
                <T style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 }}>
                  {active.classification_level ? `Classification ${active.classification_level}` : ""}
                  {active.classification_level && active.provider_name ? " · " : ""}
                  {active.provider_name || ""}
                </T>
              ) : null}
            </View>
          ) : null}

          <ScrollView contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.lg }}>
            {NAV_GROUPS.map((group) => {
              const isOpen = !!openGroups[group.key];
              const label = group.key === "care" ? careLabel : group.label;
              return (
                <View key={group.key} style={[styles.group, { borderBottomColor: colors.border }]}>
                  <Pressable
                    testID={`drawer-group-${group.key}`}
                    onPress={() => setOpenGroups((s) => ({ ...s, [group.key]: !s[group.key] }))}
                    style={styles.groupHead}
                  >
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, color: colors.muted }}>{label.toUpperCase()}</T>
                    {isOpen ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                  </Pressable>
                  {isOpen ? (
                    <View style={{ gap: 2, paddingBottom: 4 }}>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const itemActive = isActive(item.route);
                        return (
                          <Pressable
                            key={item.label}
                            testID={`drawer-item-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                            onPress={() => go(item.route)}
                            style={({ pressed }) => [
                              styles.item,
                              itemActive ? { backgroundColor: colors.primary } : pressed ? { backgroundColor: colors.surface2 } : null,
                            ]}
                          >
                            <Icon size={18} color={itemActive ? "#fff" : colors.primary} />
                            <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: itemActive ? "#fff" : colors.primary }}>{item.label}</T>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer — Plan & Billing + Sign out */}
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable testID="drawer-billing" onPress={() => go("/(tabs)/settings")} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surface2 }]}>
              <SettingsIcon size={18} color={colors.primary} />
              <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.primary }}>Plan &amp; Billing</T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: colors.muted }}>{plan}</T>
            </Pressable>
            <Pressable
              testID="drawer-logout"
              onPress={async () => {
                closeDrawer();
                await logout();
                router.replace("/login");
              }}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.terracotta + "1A" }]}
            >
              <LogOut size={18} color={colors.terracotta} />
              <T style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.terracotta }}>Sign out</T>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, flexDirection: "row", justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  panel: { width: "86%", maxWidth: 324, height: "100%" },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  closeBtn: { padding: 6, borderRadius: radius.sm },
  caringFor: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  group: { borderBottomWidth: 1, paddingVertical: 2 },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.sm + 2, paddingVertical: 12, borderRadius: radius.md },
  footer: { borderTopWidth: 1, padding: spacing.sm },
});
