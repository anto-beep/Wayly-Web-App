import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Sparkles, CheckCircle2, ChevronRight, Compass, ListChecks, Receipt, Wallet, ClipboardCheck, MessageCircle, FileEdit } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Step = { status: string; source?: string | null; timestamp?: string | null };
type Journey = { persona?: string; status?: string; steps?: Record<string, Step> };

// Ordered onboarding steps, each with its own brand colour + icon so the
// walk-through feels alive and colourful.
const STEP_META: { key: string; label: string; blurb: string; route?: string; color: string; Icon: any }[] = [
  { key: "csc", label: "Classification Self-Check", blurb: "Get a sense of the likely classification level.", route: "/tool/classification-self-check", color: "#0E4D52", Icon: ListChecks },
  { key: "ce2", label: "Contribution Estimator", blurb: "Estimate what you'd contribute towards services.", route: "/tool/contribution-estimator", color: "#A5512B", Icon: Receipt },
  { key: "budget", label: "Budget Calculator", blurb: "See your quarterly budget and lifetime cap.", route: "/tool/budget-calculator", color: "#4E6E54", Icon: Wallet },
  { key: "cpr", label: "Care Plan Review", blurb: "Read your care plan in plain English.", route: "/tool/care-plan-reviewer", color: "#1A696E", Icon: ClipboardCheck },
];

const MORE_JOURNEYS: { label: string; blurb: string; route: string; color: string; Icon: any }[] = [
  { label: "Ask Wayly", blurb: "Plain-English answers about Support at Home.", route: "/(tabs)/ask", color: "#0E4D52", Icon: MessageCircle },
  { label: "Care Plan Review", blurb: "Find gaps and questions to raise.", route: "/tool/care-plan-reviewer", color: "#4E6E54", Icon: ClipboardCheck },
  { label: "Letters & Follow-ups", blurb: "Draft letters and track responses.", route: "/tool/letters-and-follow-ups", color: "#A5512B", Icon: FileEdit },
];

function ProgressRing({ pct, size = 108, stroke = 11 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#F0B267" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={off} />
      </Svg>
      <T style={{ fontFamily: fonts.heading, fontSize: 26, color: "#fff" }}>{pct}%</T>
    </View>
  );
}

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
          {/* Colourful gradient hero with a live progress ring */}
          <Animated.View entering={FadeInDown.duration(420)}>
            <LinearGradient
              colors={["#0E4D52", "#10363A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
              testID="journeys-progress"
            >
              <ProgressRing pct={pct} />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: "rgba(255,255,255,0.72)", letterSpacing: 0.6 }}>YOUR SETUP JOURNEY</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 24, color: "#fff", marginTop: 4 }}>{done} of {STEP_META.length} done</T>
                <T style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.82)", marginTop: 6, lineHeight: 19 }}>
                  {pct === 100 ? "All set. Explore more journeys below." : "A few short stops to get Wayly set up for you."}
                </T>
              </View>
            </LinearGradient>
          </Animated.View>

          {STEP_META.map((s, idx) => {
            const complete = steps[s.key]?.status === "complete";
            return (
              <Animated.View key={s.key} entering={FadeInDown.delay(120 + idx * 80).duration(420)}>
                <Card testID={`journey-step-${s.key}`} style={{ padding: 0, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 6, alignSelf: "stretch", backgroundColor: complete ? colors.sage400 : s.color }} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, flex: 1 }}>
                      <View style={[styles.tile, { backgroundColor: complete ? colors.sage400 : s.color }]}>
                        {complete ? <CheckCircle2 size={22} color="#fff" /> : <s.Icon size={22} color="#fff" />}
                      </View>
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
                  </View>
                </Card>
              </Animated.View>
            );
          })}

          <T variant="h3" style={{ marginTop: spacing.md }}>Explore more journeys</T>
          {MORE_JOURNEYS.map((m, idx) => (
            <Animated.View key={m.label} entering={FadeInDown.delay(420 + idx * 80).duration(420)}>
              <Card testID={`journey-more-${m.label.replace(/\s+/g, "-").toLowerCase()}`} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View style={[styles.tile, { backgroundColor: m.color }]}>
                    <m.Icon size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T onPress={() => router.push(m.route as any)} style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{m.label}</T>
                    <T variant="small" style={{ marginTop: 2 }}>{m.blurb}</T>
                  </View>
                  <ChevronRight size={20} color={colors.muted} onPress={() => router.push(m.route as any)} />
                </View>
              </Card>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  tile: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
