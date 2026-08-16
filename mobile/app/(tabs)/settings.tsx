import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { Sun, Moon, Smartphone, LogOut, User, CreditCard, Bell, Shield, Phone, Mail, ChevronRight, Users, Mailbox, Gauge, AlertTriangle, Pencil } from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { Button, Card, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme, ThemePref } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate, initials } from "@/src/utils/format";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const NOTIF_LABELS: { key: string; label: string; desc: string }[] = [
  { key: "anomaly_alerts", label: "Anomaly alerts", desc: "When Wayly flags unusual charges on a new statement." },
  { key: "wellbeing_concerns", label: "Wellbeing concerns", desc: "When the participant marks a hard day." },
  { key: "family_messages", label: "Family & invites", desc: "Member joined, family thread replies." },
  { key: "weekly_digest", label: "Weekly digest", desc: "Your Sunday summary email." },
  { key: "product_updates", label: "Product updates", desc: "Monthly notes on what's new. Rare." },
];

function NotificationsCard() {
  const { colors } = useTheme();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ prefs: Record<string, boolean> }>("/notifications/prefs")
      .then((d) => setPrefs(d?.prefs || {}))
      .catch(() => setPrefs({}));
  }, []);

  const toggle = useCallback(async (key: string) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    try { await apiFetch("/notifications/prefs", { method: "PUT", body: { prefs: next } }); }
    catch { setPrefs(prefs); }
    finally { setSaving(false); }
  }, [prefs]);

  return (
    <Card testID="settings-notifications">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
        <Bell size={18} color={colors.primary} />
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Notifications</T>
      </View>
      {NOTIF_LABELS.map((n, i) => (
        <View key={n.key} testID={`notif-row-${n.key}`} style={[styles.notifRow, i < NOTIF_LABELS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }}>{n.label}</T>
            <T variant="small" style={{ marginTop: 2 }}>{n.desc}</T>
          </View>
          <Switch
            testID={`notif-toggle-${n.key}`}
            value={!!prefs?.[n.key]}
            disabled={prefs === null || saving}
            onValueChange={() => toggle(n.key)}
            trackColor={{ true: colors.primary }}
          />
        </View>
      ))}
    </Card>
  );
}

function NavRow({ icon: Icon, label, desc, onPress, testID, danger, last }: { icon: any; label: string; desc?: string; onPress: () => void; testID: string; danger?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  const tint = danger ? colors.terracotta : colors.primary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.navRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
    >
      <View style={[styles.navIcon, { backgroundColor: colors.surface2 }]}>
        <Icon size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: danger ? colors.terracotta : colors.text }}>{label}</T>
        {desc ? <T variant="small" style={{ marginTop: 1 }}>{desc}</T> : null}
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, pref, setPref, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

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
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
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
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <View style={styles.acctRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Mail size={16} color={colors.muted} />
                <T variant="small">Email</T>
              </View>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, flexShrink: 1 }} numberOfLines={1}>{user?.email || "—"}</T>
            </View>
            <View style={styles.acctRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Phone size={16} color={colors.muted} />
                <T variant="small">Phone</T>
              </View>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>{(user as any)?.mobile || (user as any)?.phone_e164 || "Not set"}</T>
            </View>
            <View style={styles.acctRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <User size={16} color={colors.muted} />
                <T variant="small">Role</T>
              </View>
              <View style={[styles.rolePill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text }}>{(user?.role || "caregiver").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</T>
              </View>
            </View>
          </View>
          <Button label="Edit profile" testID="settings-edit-profile" variant="outline" icon={Pencil} onPress={() => router.push("/profile-edit")} style={{ marginTop: spacing.md }} />
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

        <Card testID="settings-manage" style={{ padding: 0 }}>
          <NavRow icon={CreditCard} label="Plan & Billing" desc="Your subscription, invoices, and payment method" testID="settings-nav-billing" onPress={() => router.push("/plan-billing")} />
          <NavRow icon={Users} label="Family Members" desc="Invite family and manage seats" testID="settings-nav-members" onPress={() => router.push("/family-members")} />
          <NavRow icon={Mailbox} label="Weekly Digest" desc="Your Sunday household summary" testID="settings-nav-digest" onPress={() => router.push("/weekly-digest")} />
          <NavRow icon={Gauge} label="Usage" desc="What you have done with Wayly" testID="settings-nav-usage" onPress={() => router.push("/usage")} />
          <NavRow icon={Shield} label="Security & Data" desc="Password, two-factor, and audit trail" testID="settings-nav-security" onPress={() => router.push("/security")} last />
        </Card>

        {/* Notifications */}
        <NotificationsCard />

        {/* Privacy & legal */}
        <Card testID="settings-privacy">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
            <Shield size={18} color={colors.primary} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Privacy & legal</T>
          </View>
          {[
            { label: "Privacy policy", path: "/privacy", tid: "privacy-link-privacy" },
            { label: "Terms of service", path: "/terms", tid: "privacy-link-terms" },
            { label: "Manage your data", path: "/settings/security", tid: "privacy-link-data" },
          ].map((l, i, arr) => (
            <Pressable key={l.path} testID={l.tid} onPress={() => Linking.openURL(`${SITE_BASE}${l.path}`)}
              style={[styles.linkRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15, flex: 1 }}>{l.label}</T>
              <ChevronRight size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Card>

        <Card testID="settings-danger" style={{ padding: 0 }}>
          <NavRow icon={AlertTriangle} label="Danger Zone" desc="Delete your account" testID="settings-nav-danger" danger last onPress={() => router.push("/danger-zone")} />
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
  acctRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rolePill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  notifRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  linkRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  navIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
