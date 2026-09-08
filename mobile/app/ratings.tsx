import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Star, Plus, X, Trash2, ThumbsUp } from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export type Rating = {
  id: string;
  provider_name: string;
  stars: number;
  comment?: string | null;
  would_recommend?: boolean | null;
  created_at?: string;
};

function Stars({ value, size = 18, color, muted, onPress }: { value: number; size?: number; color: string; muted: string; onPress?: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= value ? color : muted}
          fill={n <= value ? color : "transparent"}
          onPress={onPress ? () => onPress(n) : undefined}
        />
      ))}
    </View>
  );
}

export default function RatingsScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ provider_name: "", stars: 5, comment: "", would_recommend: true });

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Rating[]>("/provider-ratings");
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
    if (!form.provider_name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/provider-ratings", { method: "POST", body: {
        provider_name: form.provider_name.trim(), stars: form.stars,
        comment: form.comment || null, would_recommend: form.would_recommend,
      } });
      setForm({ provider_name: "", stars: 5, comment: "", would_recommend: true });
      setShowForm(false);
      load();
    } catch { /* leave form open */ } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
    try { await apiFetch(`/provider-ratings/${id}`, { method: "DELETE" }); } catch { load(); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Ratings"
        subtitle="Your provider reviews"
        onBack={() => router.back()}
        right={
          <Pressable testID="ratings-add" onPress={() => setShowForm((s) => !s)} style={[styles.addBtn, { backgroundColor: colors.gold }]}>
            {showForm ? <X size={24} color="#fff" /> : <Plus size={24} color="#fff" />}
          </Pressable>
        }
      />
      {loading ? (
        <Loading label="Loading ratings…" />
      ) : error ? (
        <StatePanel testID="ratings-error" icon={Star} title="Couldn't load ratings" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Button label="Compare providers" testID="ratings-compare-link" variant="outline" icon={Star} onPress={() => router.push("/compare-providers")} />

          {showForm ? (
            <Card testID="ratings-form">
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Rate a provider</T>
              <View style={{ gap: spacing.sm }}>
                <Field label="Provider name" testID="ratings-provider" value={form.provider_name} onChangeText={(v) => setForm({ ...form, provider_name: v })} placeholder="e.g. Blue Care" />
                <View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 }}>Stars</T>
                  <Stars value={form.stars} size={30} color={colors.gold} muted={colors.border} onPress={(n) => setForm({ ...form, stars: n })} />
                </View>
                <Field label="Comment (optional)" value={form.comment} onChangeText={(v) => setForm({ ...form, comment: v })} placeholder="What was your experience?" multiline />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>Would recommend</T>
                  <Switch value={form.would_recommend} onValueChange={(v) => setForm({ ...form, would_recommend: v })} trackColor={{ true: colors.primary }} testID="ratings-recommend" />
                </View>
                <Button label="Save rating" testID="ratings-save" icon={Plus} onPress={save} loading={saving} disabled={!form.provider_name.trim()} />
              </View>
            </Card>
          ) : null}

          {items.length === 0 && !showForm ? (
            <StatePanel testID="ratings-empty" icon={Star} title="No ratings yet" message="Rate the providers you deal with to build a picture over time and help compare options." actionLabel="Add a rating" onAction={() => setShowForm(true)} />
          ) : (
            items.map((r) => (
              <Card key={r.id} testID={`rating-${r.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, flex: 1 }}>{r.provider_name}</T>
                  <Stars value={r.stars} color={colors.gold} muted={colors.border} />
                </View>
                {r.comment ? <T variant="small" style={{ marginTop: 8, lineHeight: 20 }}>{r.comment}</T> : null}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                  {r.would_recommend ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <ThumbsUp size={15} color={colors.sage} />
                      <T variant="small" style={{ color: colors.sage }}>Would recommend</T>
                    </View>
                  ) : <View />}
                  <Pressable testID={`rating-delete-${r.id}`} onPress={() => remove(r.id)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Trash2 size={16} color={colors.terracotta} />
                    <T variant="small" style={{ color: colors.terracotta }}>Remove</T>
                  </Pressable>
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
  addBtn: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
