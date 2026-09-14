import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  Activity, HeartHandshake, Sparkles, ShieldCheck, CheckCircle2, CalendarDays,
  HelpCircle, ArrowRight, RotateCcw, UserRound, LucideIcon,
} from "lucide-react-native";

import { AppHeader, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { moneyWhole } from "@/src/utils/format";

type KeyFact = { label: string; value_aud?: number; value_text?: string };
type Pathway = {
  id: string;
  title: string;
  tagline: string;
  section_ref: string;
  who_its_for: string;
  separate_from_quarterly_budget: boolean;
  covers: string[];
  eligibility_signals: string[];
  provider_questions: string[];
  key_facts: KeyFact[];
  confidence?: string;
  eligibility_note?: string;
};
type Result = { headline: string; results: Pathway[]; disclaimer: string };

const SITUATIONS: { v: string; label: string; desc: string; Icon: LucideIcon }[] = [
  { v: "recovering", label: "Recovering after a hospital stay, fall or illness", desc: "Focused therapy to help regain independence", Icon: Activity },
  { v: "end_of_life", label: "Approaching the end of life, wanting to stay at home", desc: "Extra support for comfort in the final months", Icon: HeartHandshake },
  { v: "exploring", label: "Just exploring what is available", desc: "See both short-term pathways side by side", Icon: Sparkles },
];

// Accent colour used sparingly on a light surface.
const ACCENT: Record<string, { color: string; soft: string; Icon: LucideIcon }> = {
  restorative_care: { color: "#0E4D52", soft: "#E9F2F2", Icon: Activity },
  end_of_life: { color: "#A5512B", soft: "#FBEEE7", Icon: HeartHandshake },
};
const SAGE = { color: "#425F47", soft: "#EEF3EE" };

const CONF_LABEL: Record<string, string> = {
  likely: "Looks like a strong fit",
  possible: "May apply",
  explore: "Worth exploring",
};

export default function ShortTermPathways() {
  const { colors } = useTheme();
  const [situation, setSituation] = useState("recovering");
  const [recentEvent, setRecentEvent] = useState<boolean | null>(null);
  const [prognosisShort, setPrognosisShort] = useState<boolean | null>(null);
  const [stayHome, setStayHome] = useState<boolean | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await apiFetch<Result>("/public/short-term-pathways/check", {
        method: "POST",
        body: {
          situation,
          recent_event: situation === "recovering" ? recentEvent : null,
          prognosis_short: situation === "end_of_life" ? prognosisShort : null,
          stay_at_home: situation === "end_of_life" ? stayHome : null,
        },
      });
      setResult(data);
    } catch (e) {
      setError("Could not check the pathways just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="stp-page">
      <AppHeader title="Short-Term Pathways" subtitle="Restorative Care & End-of-Life" onBack={() => router.back()} />
      <ScrollView testID="stp-form" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <T variant="bodyMuted" style={{ lineHeight: 23 }}>
          Support at Home has two short-term pathways that sit alongside your ongoing quarterly budget, so they do not come out of it. Answer a couple of questions to see which one fits.
        </T>

        {/* Situation */}
        <T variant="small" style={{ marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.6, color: colors.muted }}>
          What is the situation?
        </T>
        <View style={{ gap: spacing.sm }}>
          {SITUATIONS.map((s) => {
            const active = situation === s.v;
            const Icon = s.Icon;
            return (
              <Pressable
                key={s.v}
                testID={`stp-situation-${s.v}`}
                onPress={() => { setSituation(s.v); setResult(null); }}
                style={[styles.optRow, { backgroundColor: active ? "#E9F2F2" : colors.surface, borderColor: active ? colors.primary : colors.border }]}
              >
                <View style={[styles.optIcon, { backgroundColor: active ? colors.primary : "#E9F2F2" }]}>
                  <Icon size={18} color={active ? "#FFFFFF" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{s.label}</T>
                  <T variant="small" style={{ marginTop: 2, color: colors.muted, lineHeight: 18 }}>{s.desc}</T>
                </View>
              </Pressable>
            );
          })}
        </View>

        {situation === "recovering" ? (
          <YesNo label="Has there been a recent hospital stay, fall, fracture or stroke?" value={recentEvent} onChange={setRecentEvent} testID="stp-q-recent" />
        ) : null}
        {situation === "end_of_life" ? (
          <>
            <YesNo label="Is there a prognosis of around three months or less?" value={prognosisShort} onChange={setPrognosisShort} testID="stp-q-prognosis" />
            <YesNo label="Is the wish to remain at home rather than move to hospital or a facility?" value={stayHome} onChange={setStayHome} testID="stp-q-stayhome" />
          </>
        ) : null}

        <Pressable testID="stp-submit" onPress={run} disabled={busy} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Sparkles size={16} color="#FFFFFF" />}
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: "#FFFFFF" }}>See what applies</T>
        </Pressable>
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.errorSoft, borderColor: colors.terracotta }]} testID="stp-error">
            <T variant="small" style={{ color: colors.text }}>{error}</T>
          </View>
        ) : null}

        {/* Result */}
        {result ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.md }} testID="stp-result">
            <ResultHeadline result={result} />
            {result.results.map((p) => (
              <PathwayCard key={p.id} p={p} />
            ))}

            <View style={[styles.nextStep, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="stp-next-step">
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Ready to ask your provider?</T>
              <T variant="small" style={{ marginTop: 4, color: colors.muted, lineHeight: 20 }}>
                Wayly can draft a letter to your provider or My Aged Care requesting one of these pathways.
              </T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md }}>
                <Pressable testID="stp-reset" onPress={() => setResult(null)} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <RotateCcw size={14} color={colors.primary} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>Start again</T>
                </Pressable>
                <Pressable testID="stp-draft-letter" onPress={() => router.push("/letters" as any)} style={[styles.ctaBtn, { backgroundColor: colors.primary }]}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#FFFFFF" }}>Draft a request letter</T>
                  <ArrowRight size={15} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>

            <T variant="small" style={{ color: colors.muted, lineHeight: 19 }} testID="stp-disclaimer">{result.disclaimer}</T>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ResultHeadline({ result }: { result: Result }) {
  const { colors } = useTheme();
  const first = result.results?.[0];
  const accent = ACCENT[first?.id || "restorative_care"] || ACCENT.restorative_care;
  return (
    <View style={[styles.headlineCard, { backgroundColor: accent.soft, borderColor: accent.color + "33" }]} testID="stp-result-headline">
      <View style={[styles.headlineIcon, { backgroundColor: accent.color }]}>
        <Sparkles size={18} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: accent.color, fontFamily: fonts.bodySemi }}>Your result</T>
        <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.primary, marginTop: 4, lineHeight: 26 }}>{result.headline}</T>
      </View>
    </View>
  );
}

function YesNo({ label, value, onChange, testID }: { label: string; value: boolean | null; onChange: (v: boolean) => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing.md }} testID={testID}>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{label}</T>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {([["Yes", true], ["No", false]] as [string, boolean][]).map(([lbl, v]) => {
          const active = value === v;
          return (
            <Pressable
              key={lbl}
              testID={`${testID}-${lbl.toLowerCase()}`}
              onPress={() => onChange(v)}
              style={[styles.ynBtn, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
            >
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: active ? "#FFFFFF" : colors.text }}>{lbl}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PathwayCard({ p }: { p: Pathway }) {
  const { colors } = useTheme();
  const accent = ACCENT[p.id] || ACCENT.restorative_care;
  const Icon = accent.Icon;
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID={`stp-card-${p.id}`}>
      {/* Accent strip */}
      <View style={{ height: 6, backgroundColor: accent.color }} />

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
          <View style={[styles.iconChip, { backgroundColor: accent.soft }]}><Icon size={22} color={accent.color} /></View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.primary, lineHeight: 26 }}>{p.title}</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>{p.tagline}</T>
          </View>
          {p.confidence ? (
            <View style={[styles.confPill, { backgroundColor: accent.soft }]} testID={`stp-confidence-${p.id}`}>
              <T style={{ fontSize: 10, color: accent.color, fontFamily: fonts.bodySemi }}>{CONF_LABEL[p.confidence] || "Worth exploring"}</T>
            </View>
          ) : null}
        </View>

        {/* Eligibility note */}
        {p.eligibility_note ? (
          <View style={[styles.noteBox, { backgroundColor: accent.soft, borderLeftColor: accent.color }]} testID={`stp-note-${p.id}`}>
            <T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{p.eligibility_note}</T>
          </View>
        ) : null}

        {/* Key facts */}
        <View style={styles.factsGrid} testID={`stp-keyfacts-${p.id}`}>
          {(p.key_facts || []).map((k, i) => (
            <View key={i} style={[styles.factCell, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <T style={{ fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: accent.color, lineHeight: 14, fontFamily: fonts.bodySemi }}>{k.label}</T>
              <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.primary, marginTop: 3 }}>
                {k.value_aud != null ? moneyWhole(k.value_aud) : k.value_text}
              </T>
            </View>
          ))}
        </View>

        {/* Funded separately */}
        {p.separate_from_quarterly_budget ? (
          <View style={[styles.sepPill, { backgroundColor: SAGE.soft }]} testID={`stp-separate-${p.id}`}>
            <ShieldCheck size={13} color={SAGE.color} />
            <T style={{ fontSize: 11, color: SAGE.color, flex: 1, fontFamily: fonts.bodySemi }}>Funded separately, so it does not reduce your quarterly budget</T>
          </View>
        ) : null}

        {/* Who it is for */}
        <View style={[styles.whoBox, { backgroundColor: colors.bg }]}>
          <UserRound size={16} color={accent.color} style={{ marginTop: 1 }} />
          <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>
            <T style={{ fontFamily: fonts.bodySemi, color: colors.text }}>Who it is for. </T>{p.who_its_for}
          </T>
        </View>

        {/* Covers */}
        <View>
          <SectionLabel>What it covers</SectionLabel>
          <View style={{ marginTop: 6, gap: 6 }}>
            {(p.covers || []).map((c, i) => (
              <View key={i} style={styles.bulletRow}>
                <CheckCircle2 size={15} color={SAGE.color} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>{c}</T>
              </View>
            ))}
          </View>
        </View>

        {/* Signs */}
        <View>
          <SectionLabel>Signs it may apply</SectionLabel>
          <View style={{ marginTop: 6, gap: 6 }}>
            {(p.eligibility_signals || []).map((c, i) => (
              <View key={i} style={styles.bulletRow}>
                <CalendarDays size={15} color={accent.color} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>{c}</T>
              </View>
            ))}
          </View>
        </View>

        {/* Questions */}
        <View style={[styles.qBox, { backgroundColor: accent.soft }]} testID={`stp-questions-${p.id}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <HelpCircle size={15} color={accent.color} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>Questions to ask your provider</T>
          </View>
          <View style={{ gap: 9 }}>
            {(p.provider_questions || []).map((q, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 9 }}>
                <View style={[styles.qBadge, { backgroundColor: accent.color }]}>
                  <T style={{ fontSize: 10, color: "#FFFFFF", fontFamily: fonts.bodySemi }}>{i + 1}</T>
                </View>
                <T variant="small" style={{ flex: 1, color: colors.text, lineHeight: 20 }}>{q}</T>
              </View>
            ))}
          </View>
        </View>

        <T style={{ fontSize: 11, color: colors.muted }}>{p.section_ref}</T>
      </View>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <T style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted, fontFamily: fonts.bodySemi }}>{children}</T>;
}

const styles = StyleSheet.create({
  optRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  optIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  ynBtn: { flex: 1, alignItems: "center", borderRadius: radius.pill, borderWidth: 1, paddingVertical: 11 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.pill, paddingVertical: 14, marginTop: spacing.lg },
  headlineCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  headlineIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  iconChip: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  confPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  noteBox: { borderRadius: radius.md, borderLeftWidth: 4, paddingVertical: 12, paddingHorizontal: 14 },
  factsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  factCell: { flexGrow: 1, flexBasis: "44%", borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  sepPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" },
  whoBox: { flexDirection: "row", gap: 10, borderRadius: radius.md, padding: spacing.md },
  bulletRow: { flexDirection: "row", gap: 8 },
  qBox: { borderRadius: radius.lg, padding: spacing.md },
  qBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  nextStep: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  ctaBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  errorBox: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
});
