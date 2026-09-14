import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Plus, ArrowRight, ClipboardList, Wrench, Hammer, Package, Upload, FileText, Trash2 } from "lucide-react-native";

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

// Primary needs each carry a sensible default description the user can edit.
const PRIMARY_NEEDS = [
  { value: "", label: "Choose a need to pre-fill (optional)", desc: "" },
  { value: "reduce_falls_risk", label: "Reduce falls risk", desc: "The main goal is to reduce the risk of falls at home and keep the participant moving about safely." },
  { value: "improve_bathing_safety", label: "Improve bathing safety", desc: "The main goal is to make showering and bathing safer and easier, with less risk of slips." },
  { value: "support_mobility", label: "Support mobility around the home", desc: "The main goal is to help the participant move around the home more safely and independently." },
  { value: "safe_access", label: "Enable safe access and entry", desc: "The main goal is to make getting in and out of the home safe, including steps and thresholds." },
  { value: "support_transfers", label: "Support safe transfers", desc: "The main goal is to make transfers (bed, chair, toilet) safer for the participant and carer." },
  { value: "daily_independence", label: "Improve independence with daily tasks", desc: "The main goal is to help the participant carry out daily tasks more independently." },
  { value: "after_hospital", label: "Support recovery after hospital", desc: "The main goal is to support a safe recovery at home after a recent hospital stay." },
  { value: "continence_support", label: "Continence support", desc: "The main goal is to support continence needs with the right equipment." },
  { value: "sensory_support", label: "Communication or sensory support", desc: "The main goal is to support communication, vision or hearing needs." },
];

export default function AthmProjectsScreen() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const pid = active?.id;
  const [projects, setProjects] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
  const [needKey, setNeedKey] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = useCallback(async () => {
    if (!pid) { setProjects([]); return; }
    try {
      const data = await apiFetch<any>(`/athm1/participants/${pid}/projects`);
      setProjects(data?.projects || []);
    } catch { setProjects([]); }
  }, [pid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onNeedChange = (key: string) => {
    setNeedKey(key);
    const found = PRIMARY_NEEDS.find((n) => n.value === key);
    if (found && found.desc) setForm((f) => ({ ...f, primary_need_summary: found.desc }));
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true, multiple: true });
      if (res.canceled || !res.assets?.length) return;
      setFiles((list) => [...list, ...res.assets]);
    } catch { /* ignore */ }
  };

  const resetForm = () => {
    setForm({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
    setNeedKey(""); setFiles([]); setError("");
  };

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setBusy(true); setError("");
    try {
      const created = await apiFetch<any>(`/athm1/participants/${pid}/projects`, { method: "POST", body: form });
      const projectId = created?.project?.id;
      for (const a of files) {
        try {
          const fd = new FormData();
          fd.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
          fd.append("category", "ot_referral");
          fd.append("title", a.name);
          const up = await apiFetch<any>("/documents", { method: "POST", body: fd, isForm: true });
          if (up?.id && projectId) await apiFetch(`/athm1/projects/${projectId}/ot-referrals/attach`, { method: "POST", body: { document_id: up.id, notes: "" } });
        } catch { /* keep going */ }
      }
      resetForm();
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
            <T style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginBottom: spacing.sm }}>New Project</T>
            <View style={{ gap: spacing.sm }}>
              <Select label="Project type" required value={form.project_type} onChange={(v: string) => setForm({ ...form, project_type: v })} options={PROJECT_TYPE_OPTIONS} testID="athm-project-type" />
              <Field label="Project title" required testID="athm-project-title" value={form.title} onChangeText={(v: string) => setForm({ ...form, title: v })} placeholder="e.g. Bathroom safety upgrade" />
              <Select label="Primary need" optional value={needKey} onChange={onNeedChange} options={PRIMARY_NEEDS} testID="athm-project-need-select" />
              <Field label="Need summary (you can edit this)" optional testID="athm-project-need" value={form.primary_need_summary} onChangeText={(v: string) => setForm({ ...form, primary_need_summary: v })} placeholder="What problem are we solving?" multiline />
              <Field label="Description" optional testID="athm-project-description" value={form.description} onChangeText={(v: string) => setForm({ ...form, description: v })} multiline />

              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Invoices & documents</T>
                    <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>Attach quotes, invoices or an OT referral now.</T>
                  </View>
                  <Button label="Add file" icon={Upload} variant="outline" testID="athm-project-file-pick" onPress={pickFile} style={{ minHeight: 38, paddingHorizontal: 12 }} />
                </View>
                {files.length > 0 ? (
                  <View style={{ gap: spacing.xs }} testID="athm-project-file-list">
                    {files.map((f, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
                        <FileText size={14} color={colors.primary} />
                        <T variant="small" style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{f.name}</T>
                        <Pressable testID={`athm-project-file-remove-${i}`} onPress={() => setFiles((list) => list.filter((_, j) => j !== i))}><Trash2 size={14} color={colors.terracotta} /></Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {error ? <T variant="small" style={{ color: colors.terracotta }} testID="athm-project-error">{error}</T> : null}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Cancel" variant="outline" onPress={() => { setShowForm(false); resetForm(); }} style={{ flexGrow: 1 }} />
                <Button label="Create Project" testID="athm-project-save" loading={busy} onPress={submit} style={{ flexGrow: 1 }} />
              </View>
            </View>
          </Card>
        ) : (
          <Button label="New Project" icon={Plus} testID="athm-new-project" onPress={() => setShowForm(true)} disabled={!pid} />
        )}

        {projects.length === 0 ? (
          <Card testID="athm-empty" style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <ClipboardList size={28} color={colors.muted} />
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, textAlign: "center" }}>No projects yet. Start one to track OT assessment, quotes, and trials.</T>
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }} testID="athm-type-filter">
              {[{ value: "all", label: "All types" }, ...PROJECT_TYPE_OPTIONS].map((c) => {
                const on = typeFilter === c.value;
                return (
                  <Pressable key={c.value} testID={`athm-filter-type-${c.value}`} onPress={() => setTypeFilter(c.value)}
                    style={{ flexShrink: 0, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", borderRadius: radius.pill, paddingHorizontal: 14, height: 36, justifyContent: "center" }}>
                    <T variant="small" style={{ fontSize: 12, color: on ? "#fff" : colors.muted }}>{c.label}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ gap: spacing.sm }}>
              {projects.filter((p) => typeFilter === "all" || p.project_type === typeFilter).map((p) => {
                const meta = PROJECT_TYPES[p.project_type] || PROJECT_TYPES.combined_at_and_hm;
                const Icon = meta.icon;
                const closed = ["completed", "in_use", "declined", "cancelled"].includes(p.status);
                return (
                  <Pressable key={p.id} testID={`athm-project-card-${p.id}`} onPress={() => router.push(`/athm-project/${p.id}` as any)}>
                    <Card>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
                          <Icon size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }} numberOfLines={1}>{p.title}</T>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                            <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{meta.label}</T>
                            <View style={{ backgroundColor: closed ? colors.surface2 : colors.sageSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 }}>
                              <T style={{ fontSize: 10, color: closed ? colors.muted : colors.sage, fontFamily: fonts.bodySemi, textTransform: "capitalize" }}>{String(p.status || "").replace(/_/g, " ")}</T>
                            </View>
                          </View>
                        </View>
                        <ArrowRight size={16} color={colors.muted} />
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
