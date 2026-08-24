import React, { useCallback, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Mail, Phone, Plus, Trash2, Star, X, Building2 } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export type Contact = {
  id: string;
  name: string;
  kind?: string;
  role_or_title?: string | null;
  organisation?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_primary?: boolean;
};

const KIND_LABEL: Record<string, string> = {
  care_manager: "Care Manager", case_manager: "Case Manager", coordinator: "Coordinator",
  provider: "Provider", support_worker: "Support Worker", nurse: "Nurse", gp: "GP",
  allied_health: "Allied Health", pharmacy: "Pharmacy",
  family: "Family", friend: "Friend", emergency: "Emergency", next_of_kin: "Next of Kin",
  poa: "Power of Attorney", advocate: "Advocate", other: "Other",
};

export const CARE_KINDS = new Set([
  "care_manager", "case_manager", "coordinator", "provider", "support_worker",
  "nurse", "gp", "allied_health", "pharmacy",
]);

export default function ContactsView({
  variant, title, subtitle, kindOptions, testPrefix,
}: {
  variant: "care" | "personal";
  title: string;
  subtitle: string;
  kindOptions: { label: string; value: string }[];
  testPrefix: string;
}) {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [all, setAll] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", kind: kindOptions[0]?.value || "other", role_or_title: "", organisation: "", phone: "", email: "" });

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ contacts: Contact[] }>(`/participants/${activeId}/contacts`);
      setAll(data?.contacts || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = all.filter((c) => (variant === "care") === CARE_KINDS.has(c.kind || "other"));

  const save = async () => {
    if (!form.name.trim() || !activeId) return;
    setSaving(true);
    try {
      await apiFetch(`/participants/${activeId}/contacts`, { method: "POST", body: {
        name: form.name.trim(), kind: form.kind,
        role_or_title: form.role_or_title || null, organisation: form.organisation || null,
        phone: form.phone || null, email: form.email || null,
      } });
      setForm({ name: "", kind: kindOptions[0]?.value || "other", role_or_title: "", organisation: "", phone: "", email: "" });
      setShowForm(false);
      load();
    } catch {
      /* keep form open on failure */
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setAll((prev) => prev.filter((c) => c.id !== id));
    try { await apiFetch(`/participants/${activeId}/contacts/${id}`, { method: "DELETE" }); } catch { load(); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        right={
          <Pressable testID={`${testPrefix}-add`} onPress={() => setShowForm((s) => !s)} style={[styles.addBtn, { backgroundColor: colors.gold }]}>
            {showForm ? <X size={24} color="#fff" /> : <Plus size={24} color="#fff" />}
          </Pressable>
        }
      />
      {loading ? (
        <Loading label="Loading contacts…" />
      ) : error ? (
        <StatePanel testID={`${testPrefix}-error`} icon={Phone} title="Couldn't load contacts" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {showForm ? (
            <Card testID={`${testPrefix}-form`}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Add a contact</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Name" testID={`${testPrefix}-name`} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Full name" />
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>Role</T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {kindOptions.map((o) => {
                      const active = form.kind === o.value;
                      return (
                        <T key={o.value} testID={`${testPrefix}-kind-${o.value}`} onPress={() => setForm({ ...form, kind: o.value })}
                          style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent", color: active ? "#fff" : colors.text }]}>
                          {o.label}
                        </T>
                      );
                    })}
                  </View>
                </View>
                <Field label="Organisation (optional)" value={form.organisation} onChangeText={(v) => setForm({ ...form, organisation: v })} placeholder="e.g. Blue Care" />
                <Field label="Phone (optional)" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholder="Phone" />
                <Field label="Email (optional)" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" placeholder="Email" />
                <Button label="Save contact" testID={`${testPrefix}-save`} icon={Plus} onPress={save} loading={saving} disabled={!form.name.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID={`${testPrefix}-empty`} icon={Phone} title="No contacts yet" message={subtitle + ". Tap + to add one."} actionLabel="Add a contact" onAction={() => setShowForm(true)} />
          ) : (
            items.map((c) => (
              <Card key={c.id} testID={`${testPrefix}-item-${c.id}`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
                  <View style={[styles.avatar, { backgroundColor: colors.sageSoft }]}>
                    <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.primary }}>{(c.name || "?").charAt(0).toUpperCase()}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{c.name}</T>
                      {c.is_primary ? <Star size={14} color={colors.gold} fill={colors.gold} /> : null}
                    </View>
                    {c.role_or_title || c.kind ? <Badge label={c.role_or_title || KIND_LABEL[c.kind || "other"] || "Contact"} tone="brand" /> : null}
                    {c.organisation ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <Building2 size={14} color={colors.muted} />
                        <T variant="small">{c.organisation}</T>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
                      {c.phone ? (
                        <Pressable testID={`${testPrefix}-call-${c.id}`} onPress={() => Linking.openURL(`tel:${c.phone}`)} style={[styles.action, { borderColor: colors.border }]}>
                          <Phone size={16} color={colors.primary} />
                          <T variant="small" style={{ color: colors.primary }}>Call</T>
                        </Pressable>
                      ) : null}
                      {c.email ? (
                        <Pressable testID={`${testPrefix}-email-${c.id}`} onPress={() => Linking.openURL(`mailto:${c.email}`)} style={[styles.action, { borderColor: colors.border }]}>
                          <Mail size={16} color={colors.primary} />
                          <T variant="small" style={{ color: colors.primary }}>Email</T>
                        </Pressable>
                      ) : null}
                      <Pressable testID={`${testPrefix}-delete-${c.id}`} onPress={() => remove(c.id)} style={[styles.action, { borderColor: colors.border }]}>
                        <Trash2 size={16} color={colors.terracotta} />
                        <T variant="small" style={{ color: colors.terracotta }}>Remove</T>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  action: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, fontFamily: fonts.bodySemi, fontSize: 13, overflow: "hidden" },
});
