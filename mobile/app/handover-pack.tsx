import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardList, Plus, X, FileDown } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

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

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/cs1/handover-packs", { method: "POST", body: {
        participant_context_id: activeId,
        my_routines: form.my_routines || null,
        my_key_information: form.my_key_information || null,
        emergency_priorities: form.emergency_priorities || null,
        my_medical_needs: form.opt_in_medical ? (form.my_medical_needs || null) : null,
        opt_in_medical: form.opt_in_medical,
        backup_contacts: [],
        who_can_help_with_what: [],
      } });
      setForm({ my_routines: "", my_key_information: "", emergency_priorities: "", my_medical_needs: "", opt_in_medical: false });
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
        right={<Button label={showForm ? "Close" : "New"} testID="handover-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
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
            eyebrow="Carer support"
            title="Carer Handover Pack"
            description="Write down everything a backup carer or respite provider needs to keep care running smoothly, then download it as a one-page PDF."
            whatItDoes="Captures routines, key information, emergency priorities and contacts in one place, ready to hand over."
          />

          {showForm ? (
            <Card testID="handover-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>New handover pack</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Daily routines" testID="handover-routines" value={form.my_routines} onChangeText={(v) => setForm({ ...form, my_routines: v })} placeholder="Morning, meals, medications, evening…" multiline />
                <Field label="Key information" testID="handover-key-info" value={form.my_key_information} onChangeText={(v) => setForm({ ...form, my_key_information: v })} placeholder="Where things are, passwords in the safe, GP details…" multiline />
                <Field label="Emergency priorities" testID="handover-emergency" value={form.emergency_priorities} onChangeText={(v) => setForm({ ...form, emergency_priorities: v })} placeholder="Who to call first, what matters most in a crisis…" multiline />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }}>Include medical needs</T>
                  <Switch value={form.opt_in_medical} onValueChange={(v) => setForm({ ...form, opt_in_medical: v })} trackColor={{ true: colors.primary }} testID="handover-opt-medical" />
                </View>
                {form.opt_in_medical ? (
                  <Field label="Medical needs" value={form.my_medical_needs} onChangeText={(v) => setForm({ ...form, my_medical_needs: v })} placeholder="Conditions, medications, allergies…" multiline />
                ) : null}
                <Button label="Save handover pack" testID="handover-save" icon={Plus} onPress={save} loading={saving} />
              </View>
            </Card>
          ) : null}

          {dlError ? <T variant="small" style={{ color: colors.terracotta }}>{dlError}</T> : null}

          {packs.length === 0 && !showForm ? (
            <StatePanel testID="handover-empty" icon={ClipboardList} title="No handover packs yet" message="Build a pack so anyone stepping in knows the routines and what matters most." actionLabel="Create a handover pack" onAction={() => setShowForm(true)} />
          ) : (
            packs.map((p) => (
              <Card key={p.id} testID={`handover-pack-${p.id}`}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>Handover pack</T>
                <T variant="small" style={{ marginTop: 4 }}>Created {fmt(p.created_at)}{p.last_generated_at ? ` · PDF generated ${fmt(p.last_generated_at)}` : ""}</T>
                {p.my_routines ? <T variant="small" style={{ marginTop: 8, lineHeight: 20 }} numberOfLines={3}>{p.my_routines}</T> : null}
                <Button label="Export PDF" testID={`handover-export-${p.id}`} variant="outline" icon={FileDown} onPress={() => exportPdf(p.id)} loading={busyId === p.id} style={{ marginTop: spacing.md }} />
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
