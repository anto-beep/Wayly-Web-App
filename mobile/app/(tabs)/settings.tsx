import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Sun, Moon, Smartphone, ExternalLink, LogOut, User, CreditCard, Info } from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { Button, Card, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme, ThemePref } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate, initials } from "@/src/utils/format";

const BILLING_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/settings/billing`;

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, pref, setPref, isDark } = useTheme();

  const plan = (user?.plan || "free").toLowerCase();
  const planLabel = plan.replace(/^\w/, (c) => c.toUpperCase());
  const status = (user?.subscription_status || "free").toUpperCase();

  const options: { key: ThemePref; label: string; icon: any }[] = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Smartphone },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        <T style={{ fontFamily: fonts.heading, fontSize: 30, marginBottom: spacing.xs }}>Settings</T>

        {/* Account */}
        <Card testID="settings-account">
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 18 }}>{initials(user?.name).toUpperCase()}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }} numberOfLines={1}>{user?.name || "Your account"}</T>
              <T variant="small" numberOfLines={1}>{user?.email}</T>
            </View>
            <User size={20} color={colors.muted} />
          </View>
        </Card>

        {/* Appearance / theme */}
        <Card testID="settings-appearance">
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>Appearance</T>
          <View style={styles.segment}>
            {options.map((o) => {
              const active = pref === o.key;
              const Icon = o.icon;
              return (
                <Pressable
                  key={o.key}
                  testID={`theme-${o.key}`}
                  onPress={() => setPref(o.key)}
                  style={[styles.segBtn, { borderColor: colors.border }, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  <Icon size={18} color={active ? "#fff" : colors.muted} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: active ? "#fff" : colors.muted }}>{o.label}</T>
                </Pressable>
              );
            })}
          </View>
          <T variant="small" style={{ marginTop: spacing.sm }}>
            Currently showing {isDark ? "dark" : "light"} mode.
          </T>
        </Card>

        {/* Plan */}
        <Card testID="settings-plan" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <T style={{ fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>CURRENT PLAN</T>
              <T style={{ fontFamily: fonts.heading, fontSize: 26, color: "#fff", marginTop: 2 }}>{planLabel}</T>
            </View>
            <CreditCard size={26} color="rgba(255,255,255,0.9)" />
          </View>
          <T style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body, fontSize: 13, marginTop: 4 }}>Status: {status}</T>
          {user?.trial_ends_at && (user?.subscription_status === "trialing") ? (
            <T style={{ color: "rgba(255,255,255,0.75)", fontFamily: fonts.body, fontSize: 13, marginTop: 2 }}>
              Trial ends {shortDate(user.trial_ends_at)}
            </T>
          ) : null}
        </Card>

        <Card testID="settings-manage-plan">
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
            <Info size={20} color={colors.sage} />
            <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text }}>
              Plan changes and payment details are handled on the web. We will open your Wayly billing page in your browser.
            </T>
          </View>
          <Button label="Manage plan in browser" testID="settings-manage-plan-button" icon={ExternalLink} onPress={() => Linking.openURL(BILLING_URL)} style={{ marginTop: spacing.md }} />
        </Card>

        <Button
          label="Log out"
          testID="settings-logout"
          variant="outline"
          icon={LogOut}
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", gap: spacing.sm },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5 },
});
