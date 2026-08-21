import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardList, Sparkles, FileText, Search } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Plan = {
  id: string;
  title?: string | null;
  filename?: string | null;
  status?: string;
  uploaded_at?: string;
  classification_at_review?: number | null;
  services?: any[];
  summary?: string | null;
};

const STATUS_TONE: Record<string, "neutral" | "success" | "alert" | "brand"> = {
  active: "success", uploaded: "brand", superseded: "neutral", processing: "alert",
};

function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CarePlansScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const data = await apiFetch<{ care_plans: Plan[] }>(`/care-plans?participant_id=${activeId}`);
      setPlans(data?.care_plans || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading care plans…" />
      ) : error ? (
        <StatePanel testID="care-plans-error" icon={ClipboardList} title="Couldn't load care plans" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <PageIntro
            eyebrow="Care Plans"
            title="Every Care Plan, Reviewed"
            description="Every support plan you have uploaded through the Support Plan Reviewer, with the latest findings and rights checks. Upload a new plan to run a fresh review before your next meeting."
            whatItDoes="Stores each plan version, runs Statement-of-Rights checks against it, and surfaces the findings by severity so you know what to raise with the provider."
            howToUse={[
              "Upload a new plan using the button.",
              "Wayly runs a rights and quality-standard review.",
              "Open a plan to see the findings and take action.",
              "Compare two plans side-by-side to see what changed.",
            ]}
            whatYouGet={[
              "A rights-informed review of every plan you've received.",
              "Change tracking between plan versions.",
              "A quiet nudge if a plan is due for review.",
            ]}
          />
          {plans.length === 0 ? (
            <StatePanel
              testID="care-plans-empty"
              icon={ClipboardList}
              title="No care plans yet"
              message="Add your support plan and Wayly reads it in plain English, groups every service, and flags gaps to raise at your next review."
            />
          ) : (
            <>
            {/* B6 filter + search */}
            <View testID="cp-filters" style={{ gap: spacing.sm }}>
              <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Search size={16} color={colors.muted} />
                <TextInput
                  testID="cp-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search plan, provider or date…"
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text }}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.lg }}>
                {[null, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
                  const on = classFilter === c;
                  return (
                    <View key={c ?? "all"} testID={`cp-filter-class-${c ?? "all"}`} style={{ flexShrink: 0 }}>
                      <T
                        onPress={() => setClassFilter(c)}
                        style={{ fontFamily: fonts.bodyMedium, fontSize: 12, overflow: "hidden", color: on ? "#fff" : colors.text, backgroundColor: on ? colors.primary : "transparent", borderWidth: 1, borderColor: on ? colors.primary : colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
                      >
                        {c ? `Class ${c}` : "All"}
                      </T>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            {plans
              .filter((p) => {
                if (query) {
                  const q = query.toLowerCase();
                  const hay = `${p.title || ""} ${p.filename || ""} ${p.uploaded_at || ""}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                if (classFilter && p.classification_at_review !== classFilter) return false;
                return true;
              })
              .map((p) => (
              <Card key={p.id} testID={`care-plan-${p.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <FileText size={18} color={colors.primary} />
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }} numberOfLines={2}>{p.title || p.filename || "Care plan"}</T>
                  </View>
                  {p.status ? <Badge label={p.status.toUpperCase()} tone={STATUS_TONE[p.status] || "neutral"} /> : null}
                </View>
                <T variant="small" style={{ marginTop: 6 }}>
                  {fmt(p.uploaded_at)}
                  {p.services?.length ? ` · ${p.services.length} service${p.services.length > 1 ? "s" : ""}` : ""}
                  {p.classification_at_review ? ` · Class ${p.classification_at_review}` : ""}
                </T>
                {p.summary ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }} numberOfLines={4}>{p.summary}</T> : null}
              </Card>
            ))}
            </>
          )}

          <Button
            label="Review a care plan with AI"
            testID="care-plans-review-cta"
            icon={Sparkles}
            onPress={() => router.push("/tool/care-plan-reviewer")}
            style={{ marginTop: spacing.sm }}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
});
