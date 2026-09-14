import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardList, Plus, X, FileDown, ShieldAlert, Clock, Info, Stethoscope, Check } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Pack = {
  id: string;
  my_routines?: string | null;
  my_key_information?: string | null;
  emergency_priorities?: string | null;
  my_medical_needs?: string | null;
  last_generated_at?: string | null;
  created_at?: string;
};

function fmt(s?: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

const OPTIONAL_SECTIONS = [
  { key: "routines", label: "Daily Routines", Icon: Clock },
  { key: "key_info", label: "Key Information", Icon: Info },
  { key: "medical", label: "Medical Needs", Icon: Stethoscope },
] as const;

export default function HandoverPackScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dlError, setDlError] = useState("");
  const [include, setInclude] = useState({ routines: false, key_info: false, medical: false });
  const [form, setForm] = useState({ my_routines: "", my_key_information: "", emergency_priorities: "", my_medical_needs: "", opt_in_medical: false });

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ packs?: Pack[]; handover_packs?: Pack[] }>("/cs1/handover-packs");
      setPacks(data?.packs || data?.handover_packs || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setForm({ my_routines: "", my_key_information: "", emergency_priorities: "", my_medical_needs: "", opt_in_medical: false });
    setInclude({ routines: false, key_info: false, medical: false });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/cs1/handover-packs", { method: "POST", body: {
        participant_context_id: activeId,
        my_routines: include.routines ? (form.my_routines || null) : null,
        my_key_information: include.key_info ? (form.my_key_information || null) : null,
        emergency_priorities: form.emergency_priorities || null,
        my_medical_needs: include.medical && form.opt_in_medical ? (form.my_medical_needs || null) : null,
        opt_in_medical: include.medical && form.opt_in_medical,
        backup_contacts: [],
        who_can_help_with_what: [],
      } });
      resetForm();
      setShowForm(false);
      load();
    } catch { /* keep form */ } finally { setSaving(false); }
  };

  const exportPdf = async (id: string) => {
    setBusyId(id); setDlError("");
    try { await downloadAndShare(`/cs1/handover-packs/${id}/export.pdf`, `handover-pack-${id}.pdf`); }
    catch { setDlError("Couldn't export the pack. Please try again."); }
    finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "New"} testID="handover-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => { if (showForm) resetForm(); setShowForm((s) => !s); }} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading handover packs…" />
      ) : error ? (
        <StatePanel testID="handover-error" icon={ClipboardList} title="Couldn't load handover packs" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <PageIntro
            eyebrow="Carer Support"
            title="Carer Handover Pack"
            description="Choose what a backup carer needs to know, fill in only those parts, then download it as a one-page PDF."
            whatItDoes="Captures the essentials, emergency plan, routines, key info, in one place, ready to hand over."
          />

          {showForm ? (
            <>
              {/* Emergency — always included, required */}
              <Card testID="handover-form" style={{ backgroundColor: colors.goldSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                  <ShieldAlert size={18} color={colors.gold} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>If Something Goes Wrong, Do This First</T>
                </View>
                <Field label="The most important thing a backup carer should know" required testID="handover-emergency" value={form.emergency_priorities} onChangeText={(v) => setForm({ ...form, emergency_priorities: v })} placeholder="Who to call first, what matters most in a crisis…" multiline />
              </Card>

              {/* Include picker */}
              <Card testID="handover-include-picker">
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>What would you like to include?</T>
                <T variant="small" style={{ color: colors.muted, marginTop: 2, marginBottom: spacing.sm }}>Tap the parts that matter. Only what you pick goes into the PDF.</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {OPTIONAL_SECTIONS.map((s) => {
                    const on = (include as any)[s.key];
                    return (
                      <Pressable key={s.key} testID={`handover-include-${s.key}`} onPress={() => setInclude((st) => ({ ...st, [s.key]: !(st as any)[s.key] }))}
                        style={[styles.incChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                        {on ? <Check size={14} color="#fff" /> : <s.Icon size={14} color={colors.muted} />}
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? "#fff" : colors.text }}>{s.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              {include.routines ? (
                <Card testID="handover-section-routines" style={{ backgroundColor: colors.primarySoft }}>
                  <Field label="Daily Routines" testID="handover-routines" value={form.my_routines} onChangeText={(v) => setForm({ ...form, my_routines: v })} placeholder="Morning, meals, medications, evening…" multiline />
                </Card>
              ) : null}

              {include.key_info ? (
                <Card testID="handover-section-keyinfo" style={{ backgroundColor: colors.sageSoft }}>
                  <Field label="Key Information" testID="handover-key-info" value={form.my_key_information} onChangeText={(v) => setForm({ ...form, my_key_information: v })} placeholder="Where things are, GP details, house access…" multiline />
                </Card>
              ) : null}

              {include.medical ? (
                <Card testID="handover-section-medical" style={{ backgroundColor: colors.goldSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }}>Include medical details in the pack</T>
                    <Switch value={form.opt_in_medical} onValueChange={(v) => setForm({ ...form, opt_in_medical: v })} trackColor={{ true: colors.primary }} testID="handover-opt-medical" />
                  </View>
                  {form.opt_in_medical ? (
                    <Field label="Medical Needs" value={form.my_medical_needs} onChangeText={(v) => setForm({ ...form, my_medical_needs: v })} placeholder="Conditions, medications, allergies…" multiline style={{ marginTop: spacing.sm }} />
                  ) : null}
                </Card>
              ) : null}

              <Button label="Save Handover Pack" testID="handover-save" icon={Plus} onPress={save} loading={saving} disabled={!form.emergency_priorities.trim()} />
            </>
          ) : null}

          {dlError ? <T variant="small" style={{ color: colors.terracotta }}>{dlError}</T> : null}

          {packs.length === 0 && !showForm ? (
            <StatePanel testID="handover-empty" icon={ClipboardList} title="No handover packs yet" message="Build a pack so anyone stepping in knows the routines and what matters most." actionLabel="Create a Handover Pack" onAction={() => setShowForm(true)} />
          ) : (
            packs.map((p) => (
              <Card key={p.id} testID={`handover-pack-${p.id}`} style={{ backgroundColor: colors.primarySoft }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Handover Pack</T>
                <T variant="small" style={{ marginTop: 4 }}>Created {fmt(p.created_at)}{p.last_generated_at ? ` · PDF generated ${fmt(p.last_generated_at)}` : ""}</T>
                {p.emergency_priorities ? <T variant="small" style={{ marginTop: 8, lineHeight: 20 }} numberOfLines={3}>{p.emergency_priorities}</T> : null}
                <Button label="Export PDF" testID={`handover-export-${p.id}`} variant="outline" icon={FileDown} onPress={() => exportPdf(p.id)} loading={busyId === p.id} style={{ marginTop: spacing.md }} />
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  incChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
