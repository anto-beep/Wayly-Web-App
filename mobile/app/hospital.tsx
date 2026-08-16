import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { HeartPulse, Plus, X, Building2, CalendarDays } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Admission = {
  id: string;
  admission_date: string;
  discharge_date?: string | null;
  expected_discharge?: string | null;
  hospital_name: string;
  ward?: string | null;
  reason?: string | null;
  services_paused?: boolean;
  rcp_requested?: boolean;
  status: string;
  discharge_notes?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

function fmt(s?: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function HospitalScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [items, setItems] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ hospital_name: "", admission_date: today(), ward: "", reason: "", pause_services: true });

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ items: Admission[] }>(`/hospital/admissions?participant_id=${activeId}`);
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
    if (!form.hospital_name.trim() || !activeId) return;
    setSaving(true);
    try {
      await apiFetch(`/hospital/admissions`, { method: "POST", body: {
        participant_id: activeId,
        admission_date: form.admission_date || today(),
        hospital_name: form.hospital_name.trim(),
        ward: form.ward || null,
        reason: form.reason || null,
        pause_services: form.pause_services,
      } });
      setForm({ hospital_name: "", admission_date: today(), ward: "", reason: "", pause_services: true });
      setShowForm(false);
      load();
    } catch { /* leave form open */ } finally { setSaving(false); }
  };

  const requestRcp = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/hospital/admissions/${id}/request-rcp`, { method: "POST", body: {} }); load(); }
    catch { setBusyId(null); }
  };
  const discharge = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/hospital/admissions/${id}/discharge`, { method: "POST", body: { discharge_date: today() } }); load(); }
    catch { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Hospital Mode"
        subtitle={active?.name ? `${active.name}'s admissions` : "Admissions & discharge"}
        onBack={() => router.back()}
        right={
          <Button label={showForm ? "Close" : "Log"} testID="hospital-toggle-form" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
        }
      />
      {loading ? (
        <Loading label="Loading admissions…" />
      ) : error ? (
        <StatePanel testID="hospital-error" icon={HeartPulse} title="Couldn't load admissions" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={{ backgroundColor: colors.alertSoft, borderColor: colors.alertSoft }}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
              When someone goes into hospital, log it here to pause services and start the Restorative Care Pathway (RCP) conversation so funding is protected while they recover.
            </T>
          </Card>

          {showForm ? (
            <Card testID="hospital-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Log a hospital admission</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Hospital name" testID="hospital-name" value={form.hospital_name} onChangeText={(v) => setForm({ ...form, hospital_name: v })} placeholder="e.g. Royal Melbourne" />
                <Field label="Admission date (YYYY-MM-DD)" testID="hospital-date" value={form.admission_date} onChangeText={(v) => setForm({ ...form, admission_date: v })} placeholder="2026-06-01" />
                <Field label="Ward (optional)" value={form.ward} onChangeText={(v) => setForm({ ...form, ward: v })} placeholder="e.g. Ward 4B" />
                <Field label="Reason (optional)" value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} placeholder="e.g. Fall, fractured hip" />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }}>Pause home care services</T>
                  <Switch value={form.pause_services} onValueChange={(v) => setForm({ ...form, pause_services: v })} trackColor={{ true: colors.primary }} testID="hospital-pause" />
                </View>
                <Button label="Log admission" testID="hospital-save" icon={Plus} onPress={save} loading={saving} disabled={!form.hospital_name.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="hospital-empty" icon={HeartPulse} title="No admissions logged" message="If someone is admitted to hospital, log it here to protect their funding and plan the return home." actionLabel="Log an admission" onAction={() => setShowForm(true)} />
          ) : (
            items.map((a) => {
              const active_stay = a.status !== "discharged";
              return (
                <Card key={a.id} testID={`hospital-item-${a.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Building2 size={18} color={colors.primary} />
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>{a.hospital_name}{a.ward ? ` · ${a.ward}` : ""}</T>
                    </View>
                    <Badge label={active_stay ? "IN HOSPITAL" : "DISCHARGED"} tone={active_stay ? "alert" : "success"} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <CalendarDays size={14} color={colors.muted} />
                    <T variant="small">
                      Admitted {fmt(a.admission_date)}{a.discharge_date ? ` · discharged ${fmt(a.discharge_date)}` : ""}
                    </T>
                  </View>
                  {a.reason ? <T variant="small" style={{ marginTop: 4 }}>{a.reason}</T> : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm, flexWrap: "wrap" }}>
                    {a.services_paused ? <Badge label="Services paused" tone="brand" /> : null}
                    {a.rcp_requested ? <Badge label="RCP requested" tone="brand" /> : null}
                  </View>
                  {active_stay ? (
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                      {!a.rcp_requested ? (
                        <Button label="Request RCP" testID={`hospital-rcp-${a.id}`} variant="outline" onPress={() => requestRcp(a.id)} loading={busyId === a.id} style={{ flex: 1, minHeight: 44 }} />
                      ) : null}
                      <Button label="Mark discharged" testID={`hospital-discharge-${a.id}`} onPress={() => discharge(a.id)} loading={busyId === a.id} style={{ flex: 1, minHeight: 44 }} />
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
