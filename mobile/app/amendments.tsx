import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FilePenLine, Plus, X, Sparkles, Pencil, Trash2, FileText } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
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
  sender_name?: string;
  sender_role?: string;
  generated_letter?: string;
  status?: string;
  created_at?: string;
};

const CUSTOM = "__custom__";
const CHANGE_OPTIONS: [string, string][] = [
  ["add", "Add a New Service"], ["increase", "Increase Frequency / Hours"], ["decrease", "Decrease Frequency / Hours"],
  ["remove", "Remove a Service"], ["swap", "Swap One Service for Another"], ["change_provider", "Change Provider"],
  ["change_schedule", "Change Schedule / Timing"], ["pause", "Pause a Service"], ["resume", "Resume a Service"], ["update_goal", "Update a Goal"],
];
const CHANGE_KEYS = CHANGE_OPTIONS.map(([k]) => k);
const SMALL = new Set(["a", "an", "and", "or", "the", "of", "for", "to", "in", "on", "at", "by", "with"]);
function titleCase(s?: string): string {
  return String(s || "").toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ").trim();
}
const changeLabel = (v: string) => CHANGE_OPTIONS.find(([k]) => k === v)?.[1] || titleCase((v || "").replace(/_/g, " "));
const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "alert"> = {
  draft: "brand", sent: "success", accepted: "success", rejected: "alert", acknowledged: "success", pending: "alert",
};

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

const EMPTY_FORM = { id: "", service_name: "", service_custom: false, change_type: "increase", change_custom: false, reason: "", provider_name: "" };

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
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ services: { service: string }[] }>("/ppc/services")
      .then((d) => {
        const names = Array.from(new Set((d?.services || []).map((r) => titleCase(r.service)).filter(Boolean))).sort();
        setServiceOptions(names);
      })
      .catch(() => setServiceOptions([]));
  }, []);

  const setStatus = async (id: string, status: string) => {
    setStatusBusy(id);
    try {
      await apiFetch(`/amendments/${id}/status`, { method: "POST", body: { status } });
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch { /* ignore */ } finally { setStatusBusy(null); }
  };

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

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setSaveError(""); };

  const buildItemsPayload = () => [{
    service_name: form.service_name.trim(),
    change_type: form.change_type.trim(),
    reason: form.reason.trim(),
  }];

  const save = async () => {
    if (!form.service_name.trim() || !form.change_type.trim() || !form.reason.trim() || !activeId) return;
    setSaving(true); setSaveError("");
    try {
      if (form.id) {
        await apiFetch(`/amendments/${form.id}`, { method: "PATCH", body: {
          items: buildItemsPayload(),
          sender_name: user?.name || "Primary Caregiver",
          provider_name: form.provider_name || null,
        } });
      } else {
        await apiFetch("/amendments/generate", { method: "POST", body: {
          participant_id: activeId,
          sender_name: user?.name || "Primary Caregiver",
          sender_role: "Primary Caregiver",
          provider_name: form.provider_name || null,
          items: buildItemsPayload(),
        } });
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Couldn't generate the request. Please try again.");
    } finally { setSaving(false); }
  };

  const saveDraft = async () => {
    if (!activeId) return;
    setSavingDraft(true); setSaveError("");
    try {
      const data: any = await apiFetch("/amendments/save-draft", { method: "POST", body: {
        id: form.id || undefined,
        participant_id: activeId,
        sender_name: user?.name || "Primary Caregiver",
        sender_role: "Primary Caregiver",
        provider_name: form.provider_name || null,
        items: buildItemsPayload(),
      } });
      setForm((f) => ({ ...f, id: data?.id || f.id }));
      load();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Couldn't save the draft. Please try again.");
    } finally { setSavingDraft(false); }
  };

  const editRecord = (a: Amendment) => {
    const it = (a.items || [])[0] || { service_name: "", change_type: "increase", reason: "" };
    setForm({
      id: a.id,
      service_name: it.service_name || "",
      service_custom: !!it.service_name && !serviceOptions.includes(it.service_name),
      change_type: it.change_type || "increase",
      change_custom: !!it.change_type && !CHANGE_KEYS.includes(it.change_type),
      reason: it.reason || "",
      provider_name: a.provider_name || "",
    });
    setShowForm(true);
  };

  const deleteRecord = async (id: string) => {
    try {
      await apiFetch(`/amendments/${id}`, { method: "DELETE" });
      if (form.id === id) { resetForm(); setShowForm(false); }
      load();
    } catch { /* ignore */ }
  };

  const serviceSelectValue = form.service_custom ? CUSTOM : (serviceOptions.includes(form.service_name) ? form.service_name : (form.service_name ? CUSTOM : ""));
  const changeSelectValue = form.change_custom ? CUSTOM : (CHANGE_KEYS.includes(form.change_type) ? form.change_type : (form.change_type ? CUSTOM : ""));
  const canGenerate = !!form.service_name.trim() && !!form.change_type.trim() && !!form.reason.trim();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Care-Plan Changes"
        subtitle="Request changes to the plan"
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "New"} testID="amend-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => { if (showForm) resetForm(); setShowForm((s) => !s); }} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
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
            <Card testID="amend-form" style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>{form.id ? "Edit Change Request" : "New Change Request"}</T>
              <View style={{ gap: spacing.sm }}>
                <Select
                  label="Service" required testID="amend-service-select"
                  value={serviceSelectValue}
                  placeholder="Choose a service…"
                  options={[...serviceOptions.map((s) => ({ value: s, label: s })), { value: CUSTOM, label: "Other (type your own)" }]}
                  onChange={(v) => { if (v === CUSTOM) setForm({ ...form, service_custom: true, service_name: "" }); else setForm({ ...form, service_custom: false, service_name: v }); }}
                />
                {(form.service_custom || (!!form.service_name && !serviceOptions.includes(form.service_name))) ? (
                  <Field testID="amend-service" value={form.service_name} onChangeText={(v) => setForm({ ...form, service_name: v, service_custom: true })} placeholder="e.g. Physiotherapy" />
                ) : null}

                <Select
                  label="Change Type" required testID="amend-change-select"
                  value={changeSelectValue}
                  placeholder="Choose a change type…"
                  options={[...CHANGE_OPTIONS.map(([v, l]) => ({ value: v, label: l })), { value: CUSTOM, label: "Add a New Change Type…" }]}
                  onChange={(v) => { if (v === CUSTOM) setForm({ ...form, change_custom: true, change_type: "" }); else setForm({ ...form, change_custom: false, change_type: v }); }}
                />
                {(form.change_custom || (!!form.change_type && !CHANGE_KEYS.includes(form.change_type))) ? (
                  <Field testID="amend-change-custom" value={form.change_type} onChangeText={(v) => setForm({ ...form, change_type: v, change_custom: true })} placeholder="e.g. Change appointment day" />
                ) : null}

                <Field label="Why This Change?" required testID="amend-reason" value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} placeholder="Why is this change needed?" multiline />
                <Field label="Provider" optional value={form.provider_name} onChangeText={(v) => setForm({ ...form, provider_name: v })} placeholder="e.g. Blue Care" />
                {saveError ? <T variant="small" style={{ color: colors.terracotta }}>{saveError}</T> : null}
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Button label="Save as Draft" testID="amend-save-draft" variant="outline" icon={FileText} onPress={saveDraft} loading={savingDraft} style={{ flex: 1 }} />
                  <Button label={form.id ? "Update Letter" : "Generate Request"} testID="amend-save" icon={Sparkles} onPress={save} loading={saving} disabled={!canGenerate} style={{ flex: 1 }} />
                </View>
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="amend-empty" icon={FilePenLine} title="No change requests yet" message="When something in the care plan needs to change, draft a request here." actionLabel="New Request" onAction={() => setShowForm(true)} />
          ) : (
            items.map((a) => (
              <Card key={a.id} testID={`amend-${a.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{titleCase(a.provider_name || "Change Request")}</T>
                  {a.status ? <Badge label={a.status.toUpperCase()} tone={STATUS_TONE[a.status] || "neutral"} /> : null}
                </View>
                <T variant="small" style={{ marginTop: 4 }}>{fmt(a.created_at)}</T>
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {(a.items || []).map((it, i) => (
                    <T key={i} variant="small" style={{ color: colors.text }}>
                      • {changeLabel(it.change_type)}: {titleCase(it.service_name)} ({it.reason})
                    </T>
                  ))}
                </View>
                {a.generated_letter ? (
                  <View style={[styles.letter, { backgroundColor: colors.surface2 }]}>
                    <T variant="small" style={{ lineHeight: 20 }} numberOfLines={6}>{sanitizeAI(a.generated_letter)}</T>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
                  <Button label="Edit" testID={`amend-edit-${a.id}`} variant="outline" icon={Pencil} onPress={() => editRecord(a)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                  <Button label="Delete" testID={`amend-delete-${a.id}`} variant="outline" icon={Trash2} onPress={() => deleteRecord(a.id)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                  {(a.status || "draft") === "draft" ? (
                    <Button label="Mark as Sent" testID={`amend-mark-sent-${a.id}`} variant="outline" onPress={() => setStatus(a.id, "sent")} loading={statusBusy === a.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                  ) : null}
                  {a.status === "sent" ? (
                    <>
                      <Button label="Mark Accepted" testID={`amend-mark-accepted-${a.id}`} variant="outline" onPress={() => setStatus(a.id, "accepted")} loading={statusBusy === a.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                      <Button label="Mark Rejected" testID={`amend-mark-rejected-${a.id}`} variant="outline" onPress={() => setStatus(a.id, "rejected")} loading={statusBusy === a.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                    </>
                  ) : null}
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
  letter: { marginTop: spacing.sm, borderRadius: radius.md, padding: spacing.md },
});
