import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Plus, ArrowRight, ClipboardList, Wrench, Hammer, Package } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, Select, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export const PROJECT_TYPES: Record<string, { label: string; icon: any }> = {
  assistive_technology_only: { label: "Assistive Technology", icon: Wrench },
  home_modification_only: { label: "Home Modifications", icon: Hammer },
  combined_at_and_hm: { label: "Combined AT & HM", icon: Package },
};
const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([value, v]) => ({ value, label: v.label }));

export default function AthmProjectsScreen() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const pid = active?.id;
  const [projects, setProjects] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!pid) { setProjects([]); return; }
    try {
      const data = await apiFetch<any>(`/athm1/participants/${pid}/projects`);
      setProjects(data?.projects || []);
    } catch { setProjects([]); }
  }, [pid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setBusy(true); setError("");
    try {
      await apiFetch(`/athm1/participants/${pid}/projects`, { method: "POST", body: form });
      setForm({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
      setShowForm(false);
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not create project."); }
    finally { setBusy(false); }
  };

  if (projects === null) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading projects…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="AT & HM Projects" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="athm-projects-root">
        <PageIntro
          eyebrow="Assistive Technology & Home Modifications"
          title="AT & HM Projects"
          description="Track every step of buying assistive technology or modifying the home, from OT referral through quotes, funding, delivery, and trial period. Nothing important slips through the cracks."
          whatItDoes="Groups related AT items and HM modifications into a single project. Compares supplier quotes side-by-side. Counts down each trial period so you never miss a return window."
        />

        {showForm ? (
          <Card testID="athm-new-project-form">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginBottom: spacing.sm }}>Start a new AT / HM project</T>
            <View style={{ gap: spacing.sm }}>
              <Select label="Type" value={form.project_type} onChange={(v: string) => setForm({ ...form, project_type: v })} options={PROJECT_TYPE_OPTIONS} testID="athm-project-type" />
              <Field label="Title" testID="athm-project-title" value={form.title} onChangeText={(v: string) => setForm({ ...form, title: v })} placeholder="e.g. Bathroom safety upgrade" />
              <Field label="Primary need" testID="athm-project-need" value={form.primary_need_summary} onChangeText={(v: string) => setForm({ ...form, primary_need_summary: v })} placeholder="What problem are we solving?" />
              <Field label="Description (optional)" testID="athm-project-description" value={form.description} onChangeText={(v: string) => setForm({ ...form, description: v })} multiline />
              {error ? <T variant="small" style={{ color: colors.terracotta }} testID="athm-project-error">{error}</T> : null}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Cancel" variant="outline" onPress={() => { setShowForm(false); setError(""); }} style={{ flexGrow: 1 }} />
                <Button label="Create" testID="athm-project-save" loading={busy} onPress={submit} style={{ flexGrow: 1 }} />
              </View>
            </View>
          </Card>
        ) : (
          <Button label="New project" icon={Plus} testID="athm-new-project" onPress={() => setShowForm(true)} disabled={!pid} />
        )}

        {projects.length === 0 ? (
          <Card testID="athm-empty" style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <ClipboardList size={28} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, textAlign: "center" }}>No projects yet. Start one to track OT assessment, quotes, and trials.</T>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {projects.map((p) => {
              const meta = PROJECT_TYPES[p.project_type] || PROJECT_TYPES.combined_at_and_hm;
              const Icon = meta.icon;
              return (
                <Pressable key={p.id} testID={`athm-project-card-${p.id}`} onPress={() => router.push(`/athm-project/${p.id}` as any)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
                        <Icon size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }} numberOfLines={1}>{p.title}</T>
                        <T variant="small" style={{ color: colors.muted }}>{meta.label} · {String(p.status || "").replace(/_/g, " ")}</T>
                      </View>
                      <ArrowRight size={16} color={colors.muted} />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
