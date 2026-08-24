import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FilePenLine, Plus, X, Sparkles } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

type ChangeItem = { service_name: string; change_type: string; reason: string };
type Amendment = {
  id: string;
  items?: ChangeItem[];
  provider_name?: string;
  generated_letter?: string;
  status?: string;
  created_at?: string;
};

const CHANGE_TYPES = [
  { key: "add", label: "Add" }, { key: "increase", label: "Increase" },
  { key: "decrease", label: "Decrease" }, { key: "remove", label: "Remove" }, { key: "swap", label: "Swap" },
];
const CHANGE_LABEL = Object.fromEntries(CHANGE_TYPES.map((c) => [c.key, c.label]));
const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "alert"> = {
  draft: "brand", sent: "success", acknowledged: "success", pending: "alert",
};

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CarePlanChangesScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const { user } = useAuth();
  const [items, setItems] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({ service_name: "", change_type: "increase", reason: "", provider_name: "" });

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ items: Amendment[] }>(`/amendments?participant_id=${activeId}`);
      setItems(data?.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.service_name.trim() || !form.reason.trim() || !activeId) return;
    setSaving(true); setSaveError("");
    try {
      await apiFetch("/amendments/generate", { method: "POST", body: {
        participant_id: activeId,
        sender_name: user?.name || "Primary caregiver",
        sender_role: "primary caregiver",
        provider_name: form.provider_name || null,
        items: [{ service_name: form.service_name.trim(), change_type: form.change_type, reason: form.reason.trim() }],
      } });
      setForm({ service_name: "", change_type: "increase", reason: "", provider_name: "" });
      setShowForm(false);
      load();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Couldn't generate the request. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Care-Plan Changes"
        subtitle="Request changes to the plan"
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "New"} testID="amend-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading change requests…" />
      ) : error ? (
        <StatePanel testID="amend-error" icon={FilePenLine} title="Couldn't load change requests" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
              Need a service added, increased, or removed? Draft a plain-English change request to your provider. Wayly writes the letter; you review and send it.
            </T>
          </Card>

          {showForm ? (
            <Card testID="amend-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>New change request</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Service" testID="amend-service" value={form.service_name} onChangeText={(v) => setForm({ ...form, service_name: v })} placeholder="e.g. Physiotherapy" />
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>Change type</T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {CHANGE_TYPES.map((c) => {
                      const active = form.change_type === c.key;
                      return (
                        <Pressable key={c.key} testID={`amend-type-${c.key}`} onPress={() => setForm({ ...form, change_type: c.key })}
                          style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{c.label}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Field label="Reason" testID="amend-reason" value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} placeholder="Why is this change needed?" multiline />
                <Field label="Provider (optional)" value={form.provider_name} onChangeText={(v) => setForm({ ...form, provider_name: v })} placeholder="e.g. Blue Care" />
                {saveError ? <T variant="small" style={{ color: colors.terracotta }}>{saveError}</T> : null}
                <Button label="Generate request" testID="amend-save" icon={Sparkles} onPress={save} loading={saving} disabled={!form.service_name.trim() || !form.reason.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="amend-empty" icon={FilePenLine} title="No change requests yet" message="When something in the care plan needs to change, draft a request here." actionLabel="New request" onAction={() => setShowForm(true)} />
          ) : (
            items.map((a) => (
              <Card key={a.id} testID={`amend-${a.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{a.provider_name || "Change request"}</T>
                  {a.status ? <Badge label={a.status.toUpperCase()} tone={STATUS_TONE[a.status] || "neutral"} /> : null}
                </View>
                <T variant="small" style={{ marginTop: 4 }}>{fmt(a.created_at)}</T>
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {(a.items || []).map((it, i) => (
                    <T key={i} variant="small" style={{ color: colors.text }}>
                      • {CHANGE_LABEL[it.change_type] || it.change_type}: {it.service_name} ({it.reason})
                    </T>
                  ))}
                </View>
                {a.generated_letter ? (
                  <View style={[styles.letter, { backgroundColor: colors.surface2 }]}>
                    <T variant="small" style={{ lineHeight: 20 }} numberOfLines={6}>{sanitizeAI(a.generated_letter)}</T>
                  </View>
                ) : null}
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  letter: { marginTop: spacing.sm, borderRadius: radius.md, padding: spacing.md },
});
