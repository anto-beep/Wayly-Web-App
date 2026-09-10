import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ClipboardList, Sparkles, FileText, Search, Trash2, RotateCcw, GitCompare, Check } from "lucide-react-native";

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
  try { return new Date(s).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CarePlansScreen() {
  const { colors } = useTheme();
  const { activeId, active } = useParticipants();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [archived, setArchived] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeId) return;
    setError(false);
    try {
      const [act, arch] = await Promise.all([
        apiFetch<{ care_plans: Plan[] }>(`/care-plans?participant_id=${activeId}`),
        apiFetch<{ care_plans: Plan[] }>(`/care-plans/archived/list`).catch(() => ({ care_plans: [] })),
      ]);
      setPlans(act?.care_plans || []);
      setArchived(arch?.care_plans || []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const softDelete = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/care-plans/${id}`, { method: "DELETE" }); await load(); }
    catch { setError(true); } finally { setBusyId(null); }
  };
  const restore = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/care-plans/${id}/restore`, { method: "POST", body: {} }); await load(); }
    catch { setError(true); } finally { setBusyId(null); }
  };
  const hardDelete = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/care-plans/${id}?hard=true`, { method: "DELETE" }); await load(); }
    catch { setError(true); } finally { setBusyId(null); }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev);
  };
  const runCompare = () => {
    if (selected.length === 2) router.push(`/care-plan-compare/${selected[0]}/${selected[1]}` as any);
  };

  const source = showArchived ? archived : plans;
  const list = source.filter((p) => {
    if (query) {
      const q = query.toLowerCase();
      if (!`${p.title || ""} ${p.filename || ""} ${p.uploaded_at || ""}`.toLowerCase().includes(q)) return false;
    }
    if (classFilter && p.classification_at_review !== classFilter) return false;
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Care Plans" subtitle={active?.name ? `${active.name}'s support plans` : "Support plans"} onBack={() => router.back()} />
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
            description="Every support plan you have uploaded through the Support Plan Reviewer, with the latest findings and rights checks."
            whatItDoes="Stores each plan version, runs Statement-of-Rights checks, and surfaces findings by severity so you know what to raise."
            howToUse={[
              "Upload a new plan using the button.",
              "Open a plan to see the findings and take action.",
              "Compare two plans side-by-side to see what changed.",
              "Move old plans to trash; restore within 30 days.",
            ]}
            whatYouGet={[
              "A rights-informed review of every plan you've received.",
              "Change tracking between plan versions.",
              "A quiet nudge if a plan is due for review.",
            ]}
          />

          {/* Tabs + compare toggle */}
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", alignItems: "center" }}>
            <Pressable testID="cp-tab-active" onPress={() => { setShowArchived(false); setSelected([]); }} style={[styles.tab, { borderColor: !showArchived ? colors.primary : colors.border, backgroundColor: !showArchived ? colors.primary : "transparent" }]}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: !showArchived ? "#fff" : colors.text }}>Active ({plans.length})</T>
            </Pressable>
            <Pressable testID="cp-tab-archived" onPress={() => { setShowArchived(true); setCompareMode(false); setSelected([]); }} style={[styles.tab, { borderColor: showArchived ? colors.primary : colors.border, backgroundColor: showArchived ? colors.primary : "transparent" }]}>
              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: showArchived ? "#fff" : colors.text }}>Trash ({archived.length})</T>
            </Pressable>
            {!showArchived && plans.length >= 2 ? (
              <Pressable testID="cp-compare-toggle" onPress={() => { setCompareMode((m) => !m); setSelected([]); }} style={[styles.tab, { flexDirection: "row", gap: 6, borderColor: compareMode ? colors.primary : colors.border, backgroundColor: compareMode ? colors.primary : "transparent" }]}>
                <GitCompare size={14} color={compareMode ? "#fff" : colors.text} />
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: compareMode ? "#fff" : colors.text }}>{compareMode ? "Cancel compare" : "Compare plans"}</T>
              </Pressable>
            ) : null}
          </View>

          {compareMode ? (
            <Card style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <T variant="small" style={{ color: colors.text }}>Select two plans to compare ({selected.length}/2).</T>
              {selected.length === 2 ? (
                <Button label="Compare selected" testID="cp-compare-run" icon={GitCompare} onPress={runCompare} style={{ marginTop: spacing.sm }} />
              ) : null}
            </Card>
          ) : null}

          {/* Search + class filter */}
          {source.length > 0 ? (
            <View testID="cp-filters" style={{ gap: spacing.sm }}>
              <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Search size={16} color={colors.muted} />
                <TextInput testID="cp-search" value={query} onChangeText={setQuery} placeholder="Search plan, provider or date…" placeholderTextColor={colors.muted} style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text }} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.lg }}>
                {[null, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
                  const on = classFilter === c;
                  return (
                    <View key={c ?? "all"} testID={`cp-filter-class-${c ?? "all"}`} style={{ flexShrink: 0 }}>
                      <T onPress={() => setClassFilter(c)} style={{ fontFamily: fonts.bodyMedium, fontSize: 12, overflow: "hidden", color: on ? "#fff" : colors.text, backgroundColor: on ? colors.primary : "transparent", borderWidth: 1, borderColor: on ? colors.primary : colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                        {c ? `Class ${c}` : "All"}
                      </T>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {list.length === 0 ? (
            <StatePanel
              testID={showArchived ? "care-plans-trash-empty" : "care-plans-empty"}
              icon={ClipboardList}
              title={showArchived ? "Trash is empty" : "No care plans yet"}
              message={showArchived ? "Plans you move to trash appear here and can be restored within 30 days." : "Add your support plan and Wayly reads it in plain English, groups every service, and flags gaps to raise at your next review."}
            />
          ) : (
            list.map((p) => {
              const isSel = selected.includes(p.id);
              return (
                <Card key={p.id} testID={`care-plan-${p.id}`} style={compareMode && isSel ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                  <Pressable
                    testID={compareMode ? `care-plan-select-${p.id}` : `care-plan-open-${p.id}`}
                    onPress={() => compareMode ? toggleSelect(p.id) : router.push(`/care-plan/${p.id}` as any)}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        {compareMode ? (
                          <View style={[styles.checkbox, { borderColor: isSel ? colors.primary : colors.border, backgroundColor: isSel ? colors.primary : "transparent" }]}>
                            {isSel ? <Check size={14} color="#fff" /> : null}
                          </View>
                        ) : <FileText size={18} color={colors.primary} />}
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }} numberOfLines={2}>{p.title || p.filename || "Care plan"}</T>
                      </View>
                      {p.status ? <Badge label={p.status.toUpperCase()} tone={STATUS_TONE[p.status] || "neutral"} /> : null}
                    </View>
                    <T variant="small" style={{ marginTop: 6 }}>
                      {fmt(p.uploaded_at)}
                      {p.services?.length ? ` · ${p.services.length} service${p.services.length > 1 ? "s" : ""}` : ""}
                      {p.classification_at_review ? ` · Class ${p.classification_at_review}` : ""}
                    </T>
                    {p.summary ? <T variant="small" style={{ marginTop: 6, lineHeight: 20 }} numberOfLines={3}>{p.summary}</T> : null}
                  </Pressable>

                  {!compareMode ? (
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
                      {showArchived ? (
                        <>
                          <Button label="Restore" testID={`cp-restore-${p.id}`} variant="outline" icon={RotateCcw} onPress={() => restore(p.id)} loading={busyId === p.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                          <Button label="Delete permanently" testID={`cp-harddelete-${p.id}`} variant="outline" icon={Trash2} onPress={() => hardDelete(p.id)} loading={busyId === p.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                        </>
                      ) : (
                        <Button label="Move to trash" testID={`cp-trash-${p.id}`} variant="outline" icon={Trash2} onPress={() => softDelete(p.id)} loading={busyId === p.id} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                      )}
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}

          {!showArchived ? (
            <Button label="Review a care plan with AI" testID="care-plans-review-cta" icon={Sparkles} onPress={() => router.push("/tool/care-plan-reviewer")} style={{ marginTop: spacing.sm }} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
