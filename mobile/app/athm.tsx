import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Wrench, Plus, X, Home } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

type Item = {
  id: string;
  kind: "AT" | "HM";
  name: string;
  status: string;
  cost_aud?: number | null;
  supplier?: string | null;
  notes?: string | null;
};

const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "alert" | "error"> = {
  proposed: "brand", approved: "success", ordered: "alert", installed: "success", declined: "error",
};
const STATUSES = ["proposed", "approved", "ordered", "installed", "declined"];

export default function AthmScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ kind: "AT" as "AT" | "HM", name: "", cost_aud: "", supplier: "", notes: "" });

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Item[]>("/athm");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/athm", { method: "POST", body: {
        kind: form.kind, name: form.name.trim(), status: "proposed",
        cost_aud: form.cost_aud ? Number(form.cost_aud) : null,
        supplier: form.supplier || null, notes: form.notes || null,
      } });
      setForm({ kind: "AT", name: "", cost_aud: "", supplier: "", notes: "" });
      setShowForm(false);
      load();
    } catch { /* keep form */ } finally { setSaving(false); }
  };

  const advance = async (it: Item) => {
    const i = STATUSES.indexOf(it.status);
    const next = STATUSES[Math.min(i + 1, 3)];
    if (next === it.status) return;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: next } : x)));
    try { await apiFetch(`/athm/${it.id}`, { method: "PUT", body: { kind: it.kind, name: it.name, status: next, cost_aud: it.cost_aud ?? null, supplier: it.supplier ?? null, notes: it.notes ?? null } }); }
    catch { load(); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="AT & HM Projects"
        subtitle="Equipment & home modifications"
        onBack={() => router.back()}
        right={<Button label={showForm ? "Close" : "New"} testID="athm-toggle" variant={showForm ? "outline" : "secondary"} icon={showForm ? X : Plus} onPress={() => setShowForm((s) => !s)} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading projects…" />
      ) : error ? (
        <StatePanel testID="athm-error" icon={Wrench} title="Couldn't load projects" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>
              Assistive technology (AT) and home modifications (HM) are funded separately from your quarterly budget. Track each project from proposed through to installed.
            </T>
          </Card>

          {showForm ? (
            <Card testID="athm-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>New project</T>
              <View style={{ gap: spacing.sm }}>
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>Type</T>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["AT", "HM"] as const).map((k) => {
                      const active = form.kind === k;
                      return (
                        <Pressable key={k} testID={`athm-kind-${k}`} onPress={() => setForm({ ...form, kind: k })}
                          style={[styles.chip, { flex: 1, alignItems: "center", borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{k === "AT" ? "Assistive tech" : "Home mod"}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Field label="Name" testID="athm-name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Bathroom rails" />
                <Field label="Estimated cost (optional)" value={form.cost_aud} onChangeText={(v) => setForm({ ...form, cost_aud: v })} keyboardType="numeric" placeholder="e.g. 450" />
                <Field label="Supplier (optional)" value={form.supplier} onChangeText={(v) => setForm({ ...form, supplier: v })} placeholder="e.g. Independent Living" />
                <Field label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Anything to remember" multiline />
                <Button label="Add project" testID="athm-save" icon={Plus} onPress={save} loading={saving} disabled={!form.name.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="athm-empty" icon={Wrench} title="No projects yet" message="Track equipment and home modifications here, from a quote through to installation." actionLabel="Add a project" onAction={() => setShowForm(true)} />
          ) : (
            items.map((it) => (
              <Card key={it.id} testID={`athm-${it.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    {it.kind === "HM" ? <Home size={18} color={colors.primary} /> : <Wrench size={18} color={colors.primary} />}
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{it.name}</T>
                  </View>
                  <Badge label={it.status.toUpperCase()} tone={STATUS_TONE[it.status] || "neutral"} />
                </View>
                <T variant="small" style={{ marginTop: 6 }}>
                  {it.kind === "AT" ? "Assistive technology" : "Home modification"}
                  {it.cost_aud ? ` · ${money(it.cost_aud)}` : ""}{it.supplier ? ` · ${it.supplier}` : ""}
                </T>
                {it.notes ? <T variant="small" style={{ marginTop: 4 }}>{it.notes}</T> : null}
                {it.status !== "installed" && it.status !== "declined" ? (
                  <Button label="Advance status" testID={`athm-advance-${it.id}`} variant="outline" onPress={() => advance(it)} style={{ marginTop: spacing.sm, minHeight: 40 }} />
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
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
