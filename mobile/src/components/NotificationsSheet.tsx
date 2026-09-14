import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Bell, CheckCheck, ChevronRight, X } from "lucide-react-native";

import { useNotifications, Notification } from "@/src/context/NotificationsContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { T } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/format";

// Bottom-sheet list of the user's notifications. Tapping a notification marks it
// read (which decrements the bell badge) and, when it carries a link, navigates.
export function NotificationsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { items, unread, loading, markAllRead, markRead } = useNotifications();
  const { colors } = useTheme();

  const openOne = async (n: Notification) => {
    await markRead(n.id);
    if (n.link && n.link.startsWith("/")) {
      onClose();
      try {
        router.push(n.link as any);
      } catch {
        /* link may not map to a mobile route; badge is already decremented */
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>Notifications</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              {unread > 0 ? (
                <Pressable testID="notifications-mark-all-read" onPress={markAllRead} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <CheckCheck size={16} color={colors.primary} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>Mark all read</T>
                </Pressable>
              ) : null}
              <Pressable testID="notifications-close" onPress={onClose} hitSlop={10}>
                <X size={22} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {loading && items.length === 0 ? (
              <T variant="small" style={{ textAlign: "center", padding: spacing.xl, color: colors.muted }}>Loading…</T>
            ) : items.length === 0 ? (
              <View testID="notifications-empty" style={{ alignItems: "center", padding: spacing.xl, gap: spacing.sm }}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.sageSoft }]}>
                  <Bell size={26} color={colors.sage} />
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>You are all caught up</T>
                <T variant="small" style={{ color: colors.muted }}>We will let you know when something needs your attention.</T>
              </View>
            ) : (
              items.map((n) => (
                <Pressable
                  key={n.id}
                  testID={`notification-item-${n.id}`}
                  onPress={() => openOne(n)}
                  style={[styles.row, { borderBottomColor: colors.border }, !n.read && { backgroundColor: colors.sageSoft }]}
                >
                  {!n.read ? <View style={[styles.dot, { backgroundColor: colors.gold }]} /> : <View style={styles.dotSpacer} />}
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{n.title}</T>
                    {n.body ? <T variant="small" style={{ marginTop: 2, lineHeight: 19 }}>{n.body}</T> : null}
                    {n.created_at ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.6, color: colors.muted, marginTop: 6 }}>{formatDateTime(n.created_at).toUpperCase()}</T> : null}
                  </View>
                  {n.link ? <ChevronRight size={18} color={colors.muted} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "80%" },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderRadius: radius.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotSpacer: { width: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
});
