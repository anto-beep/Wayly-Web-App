import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useParticipants } from "@/src/context/ParticipantContext";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { T } from "@/src/components/ui";
import { initials } from "@/src/utils/format";

// A compact chip that opens a bottom-sheet participant switcher. Falls back to
// a "Your household" label when the account has no explicit participant records.
export function ParticipantSwitcher({ householdName }: { householdName?: string | null }) {
  const { participants, active, setActive } = useParticipants();
  const [open, setOpen] = useState(false);

  const label = active?.display_name || householdName || "Your household";
  const hasList = participants.length > 1;

  return (
    <>
      <Pressable
        testID="participant-switcher"
        onPress={() => hasList && setOpen(true)}
        style={styles.chip}
      >
        <View style={styles.avatar}>
          <T style={styles.avatarText}>{initials(label).toUpperCase()}</T>
        </View>
        <View style={{ flexShrink: 1 }}>
          <T variant="small" style={{ color: colors.muted }}>
            {hasList ? "Viewing" : "Household"}
          </T>
          <T style={styles.chipLabel} numberOfLines={1}>
            {label}
          </T>
        </View>
        {hasList ? <Ionicons name="chevron-down" size={18} color={colors.primary} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <T variant="h3" style={{ marginBottom: spacing.md }}>
              Switch participant
            </T>
            <ScrollView>
              {participants.map((p) => {
                const isActive = p.id === active?.id;
                return (
                  <Pressable
                    key={p.id}
                    testID={`participant-option-${p.id}`}
                    onPress={async () => {
                      await setActive(p.id);
                      setOpen(false);
                    }}
                    style={[styles.row, isActive && styles.rowActive]}
                  >
                    <View style={styles.avatar}>
                      <T style={styles.avatarText}>{initials(p.display_name).toUpperCase()}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text }}>
                        {p.display_name}
                      </T>
                      {p.provider_name ? (
                        <T variant="small">{p.provider_name}</T>
                      ) : null}
                    </View>
                    {isActive ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 14 },
  chipLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "70%",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.sageSoft },
});
