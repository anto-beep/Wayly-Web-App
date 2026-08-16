import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Users } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { initials } from "@/src/utils/format";

export default function ParticipantsScreen() {
  const { user } = useAuth();
  const { participants, active, setActive, loading } = useParticipants();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Family & participants" subtitle="People you care for" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading participants…" />
      ) : participants.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <Card testID="household-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.avatar}>
                <Ionicons name="home" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 20 }}>Your household</T>
                <T variant="small">{user?.email}</T>
              </View>
            </View>
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <StatePanel
              testID="participants-empty"
              icon={Users}
              title="No participants added yet"
              message="Participants (the people you care for) appear here once added to your household. Statements and invoices you upload apply to your household."
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <T variant="bodyMuted" style={{ marginBottom: spacing.xs }}>
            Tap a person to switch what you’re viewing across the app.
          </T>
          {participants.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <Pressable
                key={p.id}
                testID={`participant-card-${p.id}`}
                onPress={() => setActive(p.id)}
                style={({ pressed }) => [
                  styles.card,
                  isActive && { borderColor: colors.primary, borderWidth: 2 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={styles.avatar}>
                  <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 18 }}>
                    {initials(p.display_name).toUpperCase()}
                  </T>
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 17 }}>{p.display_name}</T>
                  {p.provider_name ? <T variant="small">{p.provider_name}</T> : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {p.is_primary ? <Badge label="Primary" tone="brand" /> : null}
                    {p.classification_level ? <Badge label={`Level ${p.classification_level}`} tone="neutral" /> : null}
                  </View>
                </View>
                {isActive ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
