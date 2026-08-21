import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ArrowRight, Plus, TimerReset, AlertTriangle, FileText, Trash2, Paperclip } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, Select, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { PROJECT_TYPES } from "../athm";

const STATUS_STEPS = [
  "initiating", "ot_referral_needed", "ot_assessment_scheduled", "ot_assessment_complete",
  "quoting", "quote_review", "funding_confirmed", "purchasing_or_contracting",
  "installing_or_delivering", "trialling", "in_use", "completed", "declined", "cancelled",
];
const AT_CATEGORIES = [
  { value: "mobility_aid", label: "Mobility aid" }, { value: "communication_device", label: "Communication device" },
  { value: "personal_care", label: "Personal care" }, { value: "vision_hearing", label: "Vision / hearing" },
  { value: "other", label: "Other" },
];
const HM_CATEGORIES = [
  { value: "bathroom", label: "Bathroom" }, { value: "access_ramps", label: "Access / ramps" },
  { value: "kitchen", label: "Kitchen" }, { value: "bedroom", label: "Bedroom" }, { value: "other", label: "Other" },
];

function daysBetween(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function AthmProjectDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useParticipants();
  const pid = active?.id;
  const [project, setProject] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [mods, setMods] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showModForm, setShowModForm] = useState(false);
  const [newItem, setNewItem] = useState({ item_category: "mobility_aid", item_name: "", item_description: "" });
  const [newMod, setNewMod] = useState({ modification_category: "bathroom", modification_name: "", location_in_home: "", description: "" });

  const refreshAll = useCallback(async () => {
    if (!pid || !id) return;
    try {
      const projRes = await apiFetch<any>(`/athm1/participants/${pid}/projects`);
      const p = (projRes.projects || []).find((x: any) => x.id === id);
      setProject(p || null);
      if (p) {
        const its = await Promise.all((p.at_item_ids || []).map((iid: string) => apiFetch<any>(`/athm1/items/${iid}`).then((r) => r.item).catch(() => null)));
        setItems(its.filter(Boolean));
        const ms = await Promise.all((p.hm_modification_ids || []).map((mid: string) => apiFetch<any>(`/athm1/modifications/${mid}`).then((r) => r.modification).catch(() => null)));
        setMods(ms.filter(Boolean));
      }
      const refRes = await apiFetch<any>(`/athm1/projects/${id}/ot-referrals`).catch(() => null);
      setReferrals(refRes?.referrals || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [pid, id]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const advance = async () => {
    const idx = STATUS_STEPS.indexOf(project.status);
    const next = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 3)];
    if (!next || next === project.status) return;
    setAdvancing(true);
    try { await apiFetch(`/athm1/projects/${id}/advance-status`, { method: "POST", body: { to_status: next } }); await refreshAll(); }
    catch { /* ignore */ } finally { setAdvancing(false); }
  };

  const addItem = async () => {
    if (!newItem.item_name.trim()) return;
    try { await apiFetch(`/athm1/projects/${id}/items`, { method: "POST", body: newItem }); setNewItem({ item_category: "mobility_aid", item_name: "", item_description: "" }); setShowItemForm(false); await refreshAll(); }
    catch { /* ignore */ }
  };
  const addMod = async () => {
    if (!newMod.modification_name.trim() || !newMod.location_in_home.trim()) return;
    try { await apiFetch(`/athm1/projects/${id}/modifications`, { method: "POST", body: newMod }); setNewMod({ modification_category: "bathroom", modification_name: "", location_in_home: "", description: "" }); setShowModForm(false); await refreshAll(); }
    catch { /* ignore */ }
  };
  const startTrial = async (itemId: string, days: string) => {
    try { await apiFetch(`/athm1/items/${itemId}/start-trial`, { method: "POST", body: { trial_start_date: new Date().toISOString().slice(0, 10), trial_period_days: Number(days) || 30 } }); await refreshAll(); }
    catch { /* ignore */ }
  };

  const uploadReferral = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setUploading(true);
      const form = new FormData();
      form.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
      form.append("category", "ot_referral");
      form.append("title", a.name);
      const up = await apiFetch<any>("/documents", { method: "POST", body: form, isForm: true });
      if (up?.id) {
        const attached = await apiFetch<any>(`/athm1/projects/${id}/ot-referrals/attach`, { method: "POST", body: { document_id: up.id, notes: "" } });
        setReferrals(attached.referrals || []);
      }
    } catch { /* ignore */ } finally { setUploading(false); }
  };
  const detachReferral = async (docId: string) => {
    try { const r = await apiFetch<any>(`/athm1/projects/${id}/ot-referrals/${docId}`, { method: "DELETE" }); setReferrals(r.referrals || []); }
    catch { /* ignore */ }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><Loading label="Loading…" /></View>;
  if (!project) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader onBack={() => router.back()} /><T style={{ padding: spacing.lg, color: colors.muted }}>Project not found.</T></View>;

  const trialItems = items.filter((i) => i.trial_available && i.trial_end_date);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={PROJECT_TYPES[project.project_type]?.label || "Project"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID={`athm-project-detail-${project.id}`}>
        <Card>
          <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>{project.title}</T>
          <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>Status: {String(project.status || "").replace(/_/g, " ")}</T>
          <Button label="Advance stage" icon={ArrowRight} testID={`athm-advance-${project.id}`} variant="outline" loading={advancing} onPress={advance} style={{ marginTop: spacing.sm }} />
        </Card>

        {trialItems.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>TRIAL COUNTDOWN</T>
            {trialItems.map((item) => {
              const remaining = daysBetween(item.trial_end_date);
              const tone = remaining == null ? colors.surface2 : remaining <= 1 ? colors.errorSoft : remaining <= 3 ? colors.goldSoft : colors.sageSoft;
              return (
                <View key={item.id} testID={`trial-countdown-${item.id}`} style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: tone, borderRadius: radius.md, padding: spacing.sm }}>
                  <TimerReset size={18} color={colors.text} />
                  <View style={{ flex: 1 }}>
                    <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>{item.item_name} · trial ends {item.trial_end_date}</T>
                    <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{remaining == null ? "" : remaining < 0 ? `Trial ended ${Math.abs(remaining)} day(s) ago` : remaining === 0 ? "Trial ends today" : `${remaining} day(s) remaining to keep or return`}</T>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* OT referrals */}
        <Card testID={`athm-ot-referrals-${project.id}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
            <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11, flex: 1 }}>OT REFERRAL DOCUMENTS ({referrals.length})</T>
            <Button label={uploading ? "Uploading…" : "Upload"} icon={Plus} testID={`athm-ot-referral-upload-${project.id}`} loading={uploading} onPress={uploadReferral} variant="outline" style={{ minHeight: 38, paddingHorizontal: 12 }} />
          </View>
          {referrals.length === 0 ? (
            <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm, fontStyle: "italic" }}>No OT referrals attached yet.</T>
          ) : (
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              {referrals.map((r) => (
                <View key={r.document_id} testID={`athm-ot-referral-row-${r.document_id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
                  <FileText size={16} color={colors.primary} />
                  <T variant="small" style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{r.filename}</T>
                  <Pressable onPress={() => { const base = process.env.EXPO_PUBLIC_BACKEND_URL; if (base) Linking.openURL(`${base}/api/documents/${r.document_id}/download`); }}><T variant="small" style={{ color: colors.primary }}>Open</T></Pressable>
                  <Pressable testID={`athm-ot-referral-detach-${r.document_id}`} onPress={() => detachReferral(r.document_id)}><Trash2 size={15} color={colors.terracotta} /></Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* AT items */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>ASSISTIVE TECHNOLOGY ({items.length})</T>
            <Pressable testID={`athm-add-item-toggle-${project.id}`} onPress={() => setShowItemForm((s) => !s)} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}><Plus size={13} color={colors.primary} /><T variant="small" style={{ color: colors.primary }}>Add item</T></Pressable>
          </View>
          {showItemForm ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Select label="Category" value={newItem.item_category} onChange={(v: string) => setNewItem({ ...newItem, item_category: v })} options={AT_CATEGORIES} testID="athm-item-category" />
              <FieldLite label="Item name" value={newItem.item_name} onChangeText={(v: string) => setNewItem({ ...newItem, item_name: v })} testID="athm-item-name" colors={colors} />
              <FieldLite label="Description (optional)" value={newItem.item_description} onChangeText={(v: string) => setNewItem({ ...newItem, item_description: v })} testID="athm-item-description" colors={colors} />
              <Button label="Save item" testID="athm-item-save" onPress={addItem} />
            </View>
          ) : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {items.map((it) => (
              <View key={it.id} testID={`athm-item-${it.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
                <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>{it.item_name}</T>
                <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{String(it.item_category || "").replace(/_/g, " ")}{it.item_description ? ` · ${it.item_description}` : ""}</T>
                {!it.trial_available ? <TrialStarter itemId={it.id} onStart={startTrial} colors={colors} /> : <T variant="small" style={{ color: colors.sage, fontSize: 11, marginTop: 4 }}>Trial active{it.trial_end_date ? ` · ends ${it.trial_end_date}` : ""}</T>}
              </View>
            ))}
          </View>
        </Card>

        {/* HM modifications */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>HOME MODIFICATIONS ({mods.length})</T>
            <Pressable testID={`athm-add-mod-toggle-${project.id}`} onPress={() => setShowModForm((s) => !s)} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}><Plus size={13} color={colors.primary} /><T variant="small" style={{ color: colors.primary }}>Add modification</T></Pressable>
          </View>
          {showModForm ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Select label="Category" value={newMod.modification_category} onChange={(v: string) => setNewMod({ ...newMod, modification_category: v })} options={HM_CATEGORIES} testID="athm-mod-category" />
              <FieldLite label="Name (e.g. Walk-in shower)" value={newMod.modification_name} onChangeText={(v: string) => setNewMod({ ...newMod, modification_name: v })} testID="athm-mod-name" colors={colors} />
              <FieldLite label="Location (e.g. Bathroom)" value={newMod.location_in_home} onChangeText={(v: string) => setNewMod({ ...newMod, location_in_home: v })} testID="athm-mod-location" colors={colors} />
              <Button label="Save modification" testID="athm-mod-save" onPress={addMod} />
            </View>
          ) : null}
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {mods.map((m) => <QuoteComparison key={m.id} mod={m} onRefresh={refreshAll} colors={colors} />)}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function TrialStarter({ itemId, onStart, colors }: any) {
  const [days, setDays] = useState("30");
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm }}>
      <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>Trial days</T>
      <TextInput testID={`athm-item-trial-days-${itemId}`} value={days} onChangeText={setDays} keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 36, width: 60, color: colors.text, fontFamily: fonts.body }} />
      <Button label="Start trial" testID={`athm-item-start-trial-${itemId}`} variant="outline" onPress={() => onStart(itemId, days)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
    </View>
  );
}

function FieldLite({ label, value, onChangeText, testID, colors }: any) {
  return (
    <View>
      <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</T>
      <TextInput testID={testID} value={value} onChangeText={onChangeText}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg }} />
    </View>
  );
}

function QuoteComparison({ mod, onRefresh, colors }: any) {
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const quotes = mod.quotes || [];
  const cheapest = mod.cheapest_quote_amount?.amount;
  const dearest = mod.most_expensive_quote_amount?.amount;
  const variance = mod.quote_variance_percentage;

  const add = async () => {
    if (!supplier.trim() || !amount) { setErr("Supplier and amount are required."); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch(`/athm1/modifications/${mod.id}/quotes`, { method: "POST", body: { supplier_name: supplier, quote_amount: Number(amount), quote_date: new Date().toISOString().slice(0, 10), quote_details_summary: details } });
      setSupplier(""); setAmount(""); setDetails(""); onRefresh?.();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not save quote."); }
    finally { setBusy(false); }
  };

  return (
    <View testID={`mod-quote-block-${mod.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <View style={{ flex: 1 }}>
          <T variant="small" style={{ fontFamily: fonts.bodySemi, color: colors.text }}>{mod.modification_name}</T>
          <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{mod.location_in_home}{mod.description ? ` · ${mod.description}` : ""}</T>
        </View>
        {variance != null && variance > 30 ? (
          <View style={{ flexDirection: "row", gap: 3, alignItems: "center", backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <AlertTriangle size={11} color={colors.gold} /><T style={{ fontSize: 9, color: colors.gold, fontFamily: fonts.bodySemi }}>HIGH VARIANCE {variance}%</T>
          </View>
        ) : null}
      </View>

      {quotes.length > 0 ? (
        <View style={{ marginTop: spacing.sm, gap: 4 }}>
          {quotes.map((q: any, i: number) => {
            const amt = q.quote_amount?.amount;
            const isLow = amt === cheapest, isHigh = amt === dearest && quotes.length > 1;
            return (
              <View key={i} testID={`mod-quote-row-${mod.id}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <T variant="small" style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{q.supplier_name}</T>
                <T variant="small" style={{ fontFamily: fonts.mono, color: isLow ? colors.sage : isHigh ? colors.terracotta : colors.text }}>${amt?.toLocaleString?.() || amt}{isLow ? " ·cheapest" : ""}{isHigh ? " ·dearest" : ""}</T>
              </View>
            );
          })}
          {quotes.length >= 2 && cheapest != null && dearest != null ? (
            <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Variance ${(dearest - cheapest).toLocaleString()} ({variance}%) between cheapest and dearest.</T>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
        <TextInput testID={`mod-add-supplier-${mod.id}`} value={supplier} onChangeText={setSupplier} placeholder="Supplier" placeholderTextColor={colors.muted} style={qInput(colors)} />
        <TextInput testID={`mod-add-amount-${mod.id}`} value={amount} onChangeText={setAmount} placeholder="Amount (AUD)" keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={qInput(colors)} />
        <TextInput testID={`mod-add-notes-${mod.id}`} value={details} onChangeText={setDetails} placeholder="Notes (optional)" placeholderTextColor={colors.muted} style={qInput(colors)} />
        {err ? <T variant="small" style={{ color: colors.terracotta }}>{err}</T> : null}
        <Button label="Add quote" icon={Plus} testID={`mod-add-quote-${mod.id}`} loading={busy} onPress={add} style={{ minHeight: 40 }} />
      </View>
    </View>
  );
}

const qInput = (colors: any) => ({ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, minHeight: 40, color: colors.text, fontFamily: fonts.body, backgroundColor: colors.bg });
