import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Sparkles, CheckCircle2, Circle, ChevronRight, Compass } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Step = { status: string; source?: string | null; timestamp?: string | null };
type Journey = { persona?: string; status?: string; steps?: Record<string, Step> };

// Ordered onboarding journey steps and where each one lives in the app.
const STEP_META: { key: string; label: string; blurb: string; route?: string }[] = [
  { key: "persona", label: "Your situation", blurb: "Tell us who you're caring for so Wayly tailors everything." },
  { key: "csc", label: "Classification Self-Check", blurb: "Get a sense of the likely classification level.", route: "/tool/classification-self-check" },
  { key: "ce2", label: "Contribution Estimator", blurb: "Estimate what you'd contribute towards services.", route: "/tool/contribution-estimator" },
  { key: "budget", label: "Budget Calculator", blurb: "See your quarterly budget and lifetime cap.", route: "/tool/budget-calculator" },
  { key: "cpr", label: "Care Plan Review", blurb: "Read your care plan in plain English.", route: "/tool/care-plan-reviewer" },
];

const MORE_JOURNEYS = [
  { label: "Ask Wayly", blurb: "Plain-English answers about Support at Home.", route: "/(tabs)/ask" },
  { label: "Care Plan Review", blurb: "Find gaps and questions to raise.", route: "/tool/care-plan-reviewer" },
  { label: "Letters & Follow-ups", blurb: "Draft letters and track responses.", route: "/tool/letters-and-follow-ups" },
];

export default function JourneysScreen() {
  const { colors } = useTheme();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ journey: Journey | null }>("/journeys/current");
      setJourney(data?.journey || null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const steps = journey?.steps || {};
  const done = STEP_META.filter((s) => steps[s.key]?.status === "complete").length;
  const pct = Math.round((done / STEP_META.length) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Guided Journeys" subtitle="Step-by-step through Support at Home" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your journey…" />
      ) : error ? (
        <StatePanel testID="journeys-error" icon={Compass} title="Couldn't load your journey" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card testID="journeys-progress" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
            <T variant="label" style={{ color: colors.sage }}>YOUR SETUP JOURNEY</T>
            <T style={{ fontFamily: fonts.heading, fontSize: 26, color: colors.text, marginTop: 2 }}>{done} of {STEP_META.length} done</T>
            <View style={[styles.bar, { backgroundColor: colors.surface }]}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.sage, borderRadius: radius.pill }} />
            </View>
          </Card>

          {STEP_META.map((s) => {
            const complete = steps[s.key]?.status === "complete";
            const Icon = complete ? CheckCircle2 : Circle;
            return (
              <Card
                key={s.key}
                testID={`journey-step-${s.key}`}
                style={{ padding: spacing.md }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                >
                  <Icon size={26} color={complete ? colors.sage : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <T
                      onPress={s.route ? () => router.push(s.route as any) : undefined}
                      style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text }}
                    >
                      {s.label}
                    </T>
                    <T variant="small" style={{ marginTop: 2 }}>{complete ? "Completed" : s.blurb}</T>
                  </View>
                  {s.route && !complete ? <ChevronRight size={20} color={colors.muted} onPress={() => router.push(s.route as any)} /> : null}
                </View>
              </Card>
            );
          })}

          <T variant="h3" style={{ marginTop: spacing.md }}>Explore more journeys</T>
          {MORE_JOURNEYS.map((m) => (
            <Card key={m.label} testID={`journey-more-${m.label.replace(/\s+/g, "-").toLowerCase()}`} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                  <Sparkles size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T onPress={() => router.push(m.route as any)} style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{m.label}</T>
                  <T variant="small" style={{ marginTop: 2 }}>{m.blurb}</T>
                </View>
                <ChevronRight size={20} color={colors.muted} onPress={() => router.push(m.route as any)} />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, borderRadius: radius.pill, marginTop: spacing.sm, overflow: "hidden" },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
