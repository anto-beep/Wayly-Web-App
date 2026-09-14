import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Mail, ArrowUpRight, ArrowDownLeft, Plus, X, Trash2 } from "lucide-react-native";

import { AppHeader, Button, Card, DateField, Field, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Entry = {
  id: string;
  direction?: string;
  channel?: string;
  counterparty?: string;
  subject?: string;
  body_summary?: string | null;
  occurred_at?: string;
};

const DIRECTION_OPTS = [{ value: "in", label: "Inbound" }, { value: "out", label: "Outbound" }];
const CHANNEL_OPTS = [
  { value: "email", label: "Email" }, { value: "letter", label: "Letter" }, { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" }, { value: "in_person", label: "In person" },
];
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNEL_OPTS.map((o) => [o.value, o.label]));

const emptyForm = () => ({ direction: "in", channel: "email", counterparty: "", subject: "", body_summary: "", occurred_at: new Date().toISOString().slice(0, 10) });

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CorrespondenceScreen() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Entry[]>(`/correspondence`);
      setEntries(Array.isArray(data) ? data : []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!form || !form.counterparty.trim() || !form.subject.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/correspondence`, { method: "POST", body: {
        direction: form.direction,
        channel: form.channel,
        counterparty: form.counterparty.trim(),
        subject: form.subject.trim(),
        body_summary: form.body_summary.trim() || null,
        occurred_at: `${form.occurred_at}T00:00:00`,
      } });
      setForm(null);
      await load();
    } catch { /* keep form open */ } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/correspondence/${id}`, { method: "DELETE" }); await load(); }
    catch { /* ignore */ } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Correspondence"
        subtitle="A record of every conversation"
        onBack={() => router.back()}
        right={<Button label={form ? "Close" : "Log"} testID="corr-add-btn" variant={form ? "outline" : "secondary"} icon={form ? X : Plus} onPress={() => setForm(form ? null : emptyForm())} style={{ minHeight: 40, paddingHorizontal: 14 }} />}
      />
      {loading ? (
        <Loading label="Loading correspondence…" />
      ) : error ? (
        <StatePanel testID="correspondence-error" icon={Mail} title="Couldn't load correspondence" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {form ? (
            <Card testID="corr-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Log correspondence</T>
              <View style={{ gap: spacing.sm }}>
                <Select label="Direction" testID="corr-form-direction" value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={DIRECTION_OPTS} />
                <Select label="Channel" testID="corr-form-channel" value={form.channel} onChange={(v) => setForm({ ...form, channel: v })} options={CHANNEL_OPTS} />
                <Field label="From / to" required testID="corr-form-counterparty" value={form.counterparty} onChangeText={(v) => setForm({ ...form, counterparty: v })} placeholder="e.g. My Aged Care" />
                <Field label="Subject" required testID="corr-form-subject" value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} placeholder="What was it about" />
                <DateField label="When" testID="corr-form-when" value={form.occurred_at} onChange={(iso) => setForm({ ...form, occurred_at: iso })} />
                <Field label="Summary or notes" optional testID="corr-form-notes" value={form.body_summary} onChangeText={(v) => setForm({ ...form, body_summary: v })} placeholder="Anything to remember" multiline style={{ minHeight: 72 } as any} />
                <Button label="Log" testID="corr-form-submit" icon={Plus} onPress={add} loading={saving} disabled={!form.counterparty.trim() || !form.subject.trim()} />
              </View>
            </Card>
          ) : null}

          {entries.length === 0 && !form ? (
            <StatePanel
              testID="correspondence-empty"
              icon={Mail}
              title="No correspondence logged"
              message="Log letters, emails, phone calls and SMS in one timeline so nothing slips between the cracks during a complaint or review."
              actionLabel="Log correspondence"
              onAction={() => setForm(emptyForm())}
            />
          ) : (
            entries.map((e) => {
              const inbound = e.direction === "in";
              const DirIcon = inbound ? ArrowDownLeft : ArrowUpRight;
              return (
                <Card key={e.id} testID={`corr-row-${e.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                        <DirIcon size={18} color={colors.primary} />
                      </View>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{e.subject || "Correspondence"}</T>
                    </View>
                    <Pressable testID={`corr-del-${e.id}`} onPress={() => del(e.id)} disabled={busyId === e.id} hitSlop={8}>
                      <Trash2 size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                  <T variant="small" style={{ marginTop: 8, color: colors.muted }}>
                    {CHANNEL_LABEL[e.channel || ""] || e.channel} · {inbound ? "from" : "to"} {e.counterparty} · {fmt(e.occurred_at)}
                  </T>
                  {e.body_summary ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>{e.body_summary}</T> : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = {
  iconWrap: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center" as const, justifyContent: "center" as const },
};
