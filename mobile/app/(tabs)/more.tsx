import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { initials } from "@/src/utils/format";

type Item = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
};

export default function MoreScreen() {
  const { user, logout } = useAuth();

  const items: Item[] = [
    {
      key: "invoices",
      icon: "receipt",
      label: "Invoices",
      hint: "Checked care invoices & findings",
      onPress: () => router.push("/invoices"),
    },
    {
      key: "participants",
      icon: "people",
      label: "Family & participants",
      hint: "Switch and view the people you care for",
      onPress: () => router.push("/participants"),
    },
    {
      key: "upload",
      icon: "cloud-upload",
      label: "Upload a document",
      hint: "Add a statement or invoice",
      onPress: () => router.push("/upload"),
    },
    {
      key: "settings",
      icon: "card",
      label: "Plan & billing",
      hint: "View your plan and manage subscription",
      onPress: () => router.push("/settings"),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card testID="account-card" style={styles.account}>
          <View style={styles.avatar}>
            <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {initials(user?.name).toUpperCase()}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20 }} numberOfLines={1}>
              {user?.name || "Your account"}
            </T>
            <T variant="small" numberOfLines={1}>
              {user?.email}
            </T>
          </View>
        </Card>

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              testID={`more-${it.key}`}
              onPress={it.onPress}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={it.icon} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{it.label}</T>
                <T variant="small">{it.hint}</T>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Button
            label="Log out"
            testID="logout-button"
            variant="outline"
            icon="log-out-outline"
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
          />
        </View>

        <T variant="small" style={{ textAlign: "center", marginTop: spacing.lg }}>
          Wayly · Support at Home made clear
        </T>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.sageSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
