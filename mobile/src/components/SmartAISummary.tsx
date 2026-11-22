import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Info, Volume2, Square, ChevronRight } from "lucide-react-native";
import * as Speech from "expo-speech";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

type Alert = { level?: "warning" | "success" | "info"; text: string };
type InsightResponse = { summary?: string; alerts?: Alert[] };

// Highlight money ($1,234.56), percentages (58%) and plain numbers so the key
// figures in every summary pop out of the prose (applied across all summaries).
const FIG_SPLIT = /(\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%|\d[\d,]*(?:\.\d+)?)/g;
const FIG_TEST = /^(?:\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%|\d[\d,]*(?:\.\d+)?)$/;
function highlightFigures(text: string, boldStyle: any) {
  const str = String(text || "");
  if (!str) return str;
  return str.split(FIG_SPLIT).map((part, i) =>
    FIG_TEST.test(part) ? <Text key={i} style={boldStyle}>{part}</Text> : <Text key={i}>{part}</Text>
  );
}

// Map an alert's wording to the most relevant mobile screen. Returns null when
// nothing clearly matches (then the alert stays non-clickable, no dead-end).
function inferAlertRoute(text?: string): string | null {
  const t = String(text || "").toLowerCase();
  if (/invoice/.test(t)) return "/invoices";
  if (/statement/.test(t)) return "/(tabs)/statements";
  if (/\b(cap|lifetime|contribution)\b/.test(t)) return "/contribution-position";
  if (/care plan|support plan/.test(t)) return "/care-plans";
  if (/\b(provider|price|compare)\b/.test(t)) return "/compare-providers";
  if (/letter|complaint/.test(t)) return "/letters";
  if (/budget|forfeit|shortfall|overspend|underspend|spend|quarter|funding|left for care/.test(t)) return "/budget-scenarios";
  return null;
}

// Explanatory title + one-line blurb per screen, so people can see at a glance
// what the summary is actually about (applied across every Wayly Summary).
const SUMMARY_META: Record<string, { title: string; blurb: string }> = {
  "dashboard": { title: "Your Budget Summary", blurb: "A plain-English snapshot of this quarter's funding and anything worth a look." },
  "budget-scenarios": { title: "Your Budget Forecast Summary", blurb: "What your budget looks like now and after any changes you're weighing up." },
  "statement-detail": { title: "Your Statement Summary", blurb: "What this statement means, explained in plain English." },
  "statements-list": { title: "Your Statements Summary", blurb: "An overview across your recent statements." },
  "statement-decoder-run": { title: "Your Statement Summary", blurb: "What your decoded statement means, explained in plain English." },
  "invoices-list": { title: "Your Invoices Summary", blurb: "An overview across your recent invoices." },
  "invoice-detail": { title: "Your Invoice Summary", blurb: "What this invoice means, explained in plain English." },
  "audit-log": { title: "Your Activity Summary", blurb: "A plain-English overview of recent account activity." },
  "complaints-list": { title: "Your Complaints Summary", blurb: "Where your complaints are up to, in plain English." },
  "provider-comparison": { title: "Your Price Comparison Summary", blurb: "How these provider prices compare, in plain English." },
  "provider-switches": { title: "Your Provider Switch Summary", blurb: "Where your provider switch is up to, in plain English." },
  "letters-mailbox": { title: "Your Correspondence Summary", blurb: "An overview of your letters and follow-ups." },
};
function summaryMeta(pageKey: string) {
  return SUMMARY_META[pageKey] || { title: "Wayly Summary", blurb: "A plain-English overview of what's on this page." };
}

/**
 * SmartAISummary — mobile mirror of web `components/SmartAISummary.jsx`.
 *
 * Posts a compact context payload to /api/insights/summarise and renders the
 * warm "Your Wayly Insight" overview plus zero-to-three severity-tinted alerts,
 * with a refresh control. Theme-aware (light + dark). Renders nothing until the
 * first successful load (avoids empty cards on data-light screens).
 */
export function SmartAISummary({
  pageKey,
  context = {},
  title = "Wayly Summary",
  eyebrow = "",
  refreshable = true,
  style,
}: {
  pageKey: string;
  context?: Record<string, unknown>;
  title?: string;
  eyebrow?: string;
  refreshable?: boolean;
  style?: any;
}) {
  const { colors, isDark, shadow } = useTheme();
  const [data, setData] = useState<InsightResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const ctxKey = JSON.stringify(context);
  const mounted = useRef(true);

  const run = useCallback(
    async (refresh = false) => {
      if (!pageKey) return;
      setStatus((s) => (data && !refresh ? "ready" : "loading"));
      try {
        const r = await apiFetch<InsightResponse>("/insights/summarise", {
          method: "POST",
          body: { page_key: pageKey, context, refresh },
        });
        if (!mounted.current) return;
        setData(r || {});
        setStatus("ready");
      } catch {
        if (!mounted.current) return;
        setStatus((s) => (data ? "ready" : "error"));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageKey, ctxKey]
  );

  useEffect(() => {
    mounted.current = true;
    run(false);
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, ctxKey]);

  const summary = data?.summary ? sanitizeAI(data.summary) : null;
  const alerts = data?.alerts || [];
  const isLoading = status === "loading";
  const meta = summaryMeta(pageKey);
  const resolvedTitle = title && title !== "Wayly Summary" ? title : meta.title;

  // Read-aloud: uses the device's built-in voice (no network, no cost, no key).
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Speech.getAvailableVoicesAsync()
      .then((vs) => {
        if (!alive || !Array.isArray(vs) || !vs.length) return;
        const score = (v: any) => {
          const id = `${v.identifier || ""} ${v.name || ""}`.toLowerCase();
          const lang = (v.language || "").toLowerCase();
          let s = 0;
          if (lang.startsWith("en-au")) s += 100;
          else if (lang.startsWith("en-gb")) s += 45;
          else if (lang.startsWith("en")) s += 10;
          if (/enhanced|premium|neural|siri/.test(id)) s += 30;
          if (/karen|catherine|natasha|aria|libby/.test(id)) s += 20;
          if ((v as any).quality === Speech.VoiceQuality?.Enhanced) s += 25;
          return s;
        };
        const best = vs.slice().sort((a, b) => score(b) - score(a))[0];
        if (best && (best.language || "").toLowerCase().startsWith("en")) voiceRef.current = best.identifier;
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggleSpeak = useCallback(() => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!summary) return;
    setSpeaking(true);
    Speech.speak(summary, {
      language: "en-AU",
      voice: voiceRef.current,
      pitch: 1.1,
      rate: 0.96,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [speaking, summary]);
  useEffect(() => () => { Speech.stop(); }, []);

  // Nothing to show yet and no data — stay invisible (matches the "no empty card" rule).
  if (status === "error" && !data) return null;
  if (status === "idle" && !data) return null;
  if (!summary && !isLoading) return null;

  const toneFor = (level?: string) => {
    if (level === "warning") return { color: colors.alert, bg: isDark ? "rgba(232,180,95,0.14)" : "rgba(183,121,31,0.08)", icon: AlertTriangle };
    if (level === "success") return { color: colors.sage, bg: isDark ? "rgba(168,199,171,0.14)" : "rgba(66,95,71,0.08)", icon: CheckCircle2 };
    return { color: colors.heading, bg: isDark ? "rgba(79,168,174,0.14)" : "rgba(14,77,82,0.06)", icon: Info };
  };

  // Light: near-white (card surface shows through). Dark: a faint teal glow over the surface.
  const gradColors: [string, string] = isDark
    ? ["rgba(79,168,174,0.10)", "transparent"]
    : ["rgba(255,255,255,0.0)", "rgba(255,255,255,0.0)"];
  const headText = colors.heading;

  return (
    <View
      testID={`smart-ai-summary-${pageKey}`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary + "26", borderLeftColor: colors.primary }, shadow.card, style]}
    >
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary }]}>
          <Sparkles size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" }}>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              {eyebrow ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.muted }}>{eyebrow}</T> : null}
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: headText }}>{resolvedTitle}</T>
              <T style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: 2 }}>{meta.blurb}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              {summary ? (
                <Pressable
                  testID={`smart-ai-summary-listen-${pageKey}`}
                  onPress={toggleSpeak}
                  style={[styles.refreshBtn, { borderColor: colors.primary + "4D", backgroundColor: colors.surface }]}
                >
                  {speaking ? <Square size={13} color={colors.heading} /> : <Volume2 size={13} color={colors.heading} />}
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.heading }}>{speaking ? "Stop" : "Listen"}</T>
                </Pressable>
              ) : null}
              {refreshable ? (
                <Pressable
                  testID={`smart-ai-summary-refresh-${pageKey}`}
                  onPress={() => run(true)}
                  disabled={isLoading}
                  style={[styles.refreshBtn, { borderColor: colors.primary + "4D", backgroundColor: colors.surface, opacity: isLoading ? 0.5 : 1 }]}
                >
                  <RefreshCw size={13} color={colors.heading} />
                  <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.heading }}>{isLoading ? "Thinking" : "Refresh"}</T>
                </Pressable>
              ) : null}
            </View>
          </View>

          <T
            testID={`smart-ai-summary-body-${pageKey}`}
            style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 8, lineHeight: 22, color: headText, opacity: isLoading ? 0.7 : 1 }}
          >
            {summary
              ? highlightFigures(summary, { fontFamily: fonts.bodySemi, color: colors.heading })
              : "Looking at your latest data. One moment while we pull the highlights together."}
          </T>

          {alerts.length > 0 ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {alerts.slice(0, 3).map((a, i) => {
                const tone = toneFor(a.level);
                const Icon = tone.icon;
                const route = inferAlertRoute(a.text);
                return (
                  <Pressable
                    key={i}
                    testID={`smart-ai-summary-alert-${pageKey}-${i}`}
                    onPress={route ? () => router.push(route as any) : undefined}
                    disabled={!route}
                    style={({ pressed }) => [styles.alert, { borderColor: colors.border, borderLeftColor: tone.color, backgroundColor: tone.bg }, pressed && route ? { opacity: 0.85 } : null]}
                  >
                    <Icon size={16} color={tone.color} style={{ marginTop: 1 }} />
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text, flex: 1 }}>
                      {highlightFigures(sanitizeAI(a.text), { fontFamily: fonts.bodyBold, color: colors.heading })}
                    </T>
                    {route ? <ChevronRight size={16} color={tone.color} style={{ marginTop: 1 }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default SmartAISummary;

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, borderLeftWidth: 4, padding: spacing.lg, overflow: "hidden" },
  iconWrap: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  refreshBtn: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  alert: { flexDirection: "row", gap: 8, borderWidth: 1, borderLeftWidth: 3, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
});
