import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Repeat, Plus, X, Building2 } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Switch = {
  id: string;
  current_provider_name?: string;
  new_provider_name?: string | null;
  initial_reason_for_switch?: string;
  reason_notes?: string | null;
  switch_stage?: string;
  status?: string;
  created_at?: string;
};

const REASONS = [
  { key: "billing_disputes_unresolved", label: "Billing disputes unresolved" },
  { key: "care_quality_declined", label: "Care quality declined" },
  { key: "worker_experience_issues", label: "Worker experience issues" },
  { key: "provider_communication_breakdown", label: "Communication breakdown" },
  { key: "financial_reasons", label: "Financial reasons" },
  { key: "location_change", label: "Location change" },
  { key: "care_manager_concerns", label: "Care manager concerns" },
  { key: "care_plan_alignment_issues", label: "Care plan alignment issues" },
  { key: "other", label: "Other" },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.key, r.label]));

const STAGE_TONE: Record<string, "neutral" | "brand" | "success" | "alert"> = {
  considering: "brand", deciding: "brand", decision_confirmed: "brand",
  notice_given: "alert", transitioning: "alert", settled: "success", completed: "success",
};

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function ProviderSwitchScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [items, setItems] = useState<Switch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({ current_provider_name: "", initial_reason_for_switch: "care_quality_declined", reason_notes: "" });

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<any>(`/psw1/participants/${activeId}/switches`);
      setItems(Array.isArray(data) ? data : (data?.switches || []));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.current_provider_name.trim() || !activeId) return;
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch(`/psw1/participants/${activeId}/switches`, { method: "POST", body: {
        current_provider_name: form.current_provider_name.trim(),
        initial_reason_for_switch: form.initial_reason_for_switch,
        reason_notes: form.reason_notes || null,
      } });
      setForm({ current_provider_name: "", initial_reason_for_switch: "care_quality_declined", reason_notes: "" });
      setShowForm(false);
      load();
    } catch { setSaveError("Couldn't start the switch. Please try again."); } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Switch Provider"
        subtitle="Track a move to a new provider"
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "Start"} testID="switch-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading provider switches…" />
      ) : error ? (
        <StatePanel testID="switch-error" icon={Repeat} title="Couldn't load provider switches" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
              Changing provider is your right, and your funding follows you. Start a switch to track each stage, from giving notice to settling in with the new provider.
            </T>
          </Card>

          {showForm ? (
            <Card testID="switch-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Start a provider switch</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Current provider" testID="switch-current-provider" value={form.current_provider_name} onChangeText={(v) => setForm({ ...form, current_provider_name: v })} placeholder="e.g. Blue Care" />
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>Reason for switching</T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {REASONS.map((r) => {
                      const active = form.initial_reason_for_switch === r.key;
                      return (
                        <Pressable key={r.key} testID={`switch-reason-${r.key}`} onPress={() => setForm({ ...form, initial_reason_for_switch: r.key })}
                          style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: active ? "#fff" : colors.text }}>{r.label}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Field label="Notes (optional)" value={form.reason_notes} onChangeText={(v) => setForm({ ...form, reason_notes: v })} placeholder="Anything you want to remember about why…" multiline />
                {saveError ? <T variant="small" style={{ color: colors.terracotta }}>{saveError}</T> : null}
                <Button label="Start switch" testID="switch-save" icon={Plus} onPress={save} loading={saving} disabled={!form.current_provider_name.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="switch-empty" icon={Repeat} title="No switches in progress" message="If you're thinking about changing provider, start a switch to keep every step organised." actionLabel="Start a switch" onAction={() => setShowForm(true)} />
          ) : (
            items.map((s) => {
              const stage = s.switch_stage || s.status || "considering";
              return (
                <Card key={s.id} testID={`switch-${s.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Building2 size={18} color={colors.primary} />
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>{s.current_provider_name || "Current provider"}</T>
                    </View>
                    <Badge label={stage.replace(/_/g, " ").toUpperCase()} tone={STAGE_TONE[stage] || "neutral"} />
                  </View>
                  {s.new_provider_name ? <T variant="small" style={{ marginTop: 6 }}>Moving to {s.new_provider_name}</T> : null}
                  <T variant="small" style={{ marginTop: 6 }}>
                    Reason: {REASON_LABEL[s.initial_reason_for_switch || ""] || "Not set"}{s.created_at ? ` · started ${fmt(s.created_at)}` : ""}
                  </T>
                  {s.reason_notes ? <T variant="small" style={{ marginTop: 4, lineHeight: 20 }}>{s.reason_notes}</T> : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
});
