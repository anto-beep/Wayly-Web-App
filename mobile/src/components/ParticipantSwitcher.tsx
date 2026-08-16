import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown, CheckCircle2 } from "lucide-react-native";

import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { T } from "@/src/components/ui";
import { initials } from "@/src/utils/format";

export function ParticipantSwitcher({ householdName }: { householdName?: string | null }) {
  const { participants, active, setActive } = useParticipants();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const label = active?.display_name || householdName || "Your household";
  const hasList = participants.length > 1;

  return (
    <>
      <Pressable
        testID="participant-switcher"
        onPress={() => hasList && setOpen(true)}
        style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <T style={[styles.avatarText]}>{initials(label).toUpperCase()}</T>
        </View>
        <View style={{ flexShrink: 1 }}>
          <T variant="small">{hasList ? "Viewing" : "Household"}</T>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>
            {label}
          </T>
        </View>
        {hasList ? <ChevronDown size={18} color={colors.primary} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
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
                      setOpen(false);
                      if (p.id !== active?.id) {
                        await setActive(p.id);
                        // Re-scope every screen with the new participant's data.
                        router.replace("/(tabs)");
                      }
                    }}
                    style={[styles.row, isActive && { backgroundColor: colors.sageSoft }]}
                  >
                    <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                      <T style={styles.avatarText}>{initials(p.display_name).toUpperCase()}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{p.display_name}</T>
                      {p.provider_name ? <T variant="small">{p.provider_name}</T> : null}
                    </View>
                    {isActive ? <CheckCircle2 size={22} color={colors.primary} /> : null}
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
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 14 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "70%" },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md },
});
