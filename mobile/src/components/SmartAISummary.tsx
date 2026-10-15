import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

type Alert = { level?: "warning" | "success" | "info"; text: string };
type InsightResponse = { summary?: string; alerts?: Alert[] };

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

  // Nothing to show yet and no data — stay invisible (matches the "no empty card" rule).
  if (status === "error" && !data) return null;
  if (status === "idle" && !data) return null;
  if (!summary && !isLoading) return null;

  const toneFor = (level?: string) => {
    if (level === "warning") return { color: colors.alert, bg: isDark ? "rgba(232,180,95,0.14)" : "rgba(183,121,31,0.08)", icon: AlertTriangle };
    if (level === "success") return { color: colors.sage, bg: isDark ? "rgba(168,199,171,0.14)" : "rgba(66,95,71,0.08)", icon: CheckCircle2 };
    return { color: colors.primary, bg: isDark ? "rgba(79,168,174,0.14)" : "rgba(14,77,82,0.06)", icon: Info };
  };

  // Light: web's teal→cream 135° wash. Dark: a faint teal glow over the surface.
  const gradColors: [string, string] = isDark
    ? ["rgba(79,168,174,0.10)", "transparent"]
    : ["rgba(14,77,82,0.06)", "rgba(244,239,231,0.55)"];
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
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: headText }}>{title}</T>
            </View>
            {refreshable ? (
              <Pressable
                testID={`smart-ai-summary-refresh-${pageKey}`}
                onPress={() => run(true)}
                disabled={isLoading}
                style={[styles.refreshBtn, { borderColor: colors.primary + "4D", backgroundColor: colors.surface, opacity: isLoading ? 0.5 : 1 }]}
              >
                <RefreshCw size={13} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary }}>{isLoading ? "Thinking" : "Refresh"}</T>
              </Pressable>
            ) : null}
          </View>

          <T
            testID={`smart-ai-summary-body-${pageKey}`}
            style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 8, lineHeight: 22, color: headText, opacity: isLoading ? 0.7 : 1 }}
          >
            {summary || "Looking at your latest data. One moment while we pull the highlights together."}
          </T>

          {alerts.length > 0 ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {alerts.slice(0, 3).map((a, i) => {
                const tone = toneFor(a.level);
                const Icon = tone.icon;
                return (
                  <View
                    key={i}
                    testID={`smart-ai-summary-alert-${pageKey}-${i}`}
                    style={[styles.alert, { borderColor: colors.border, borderLeftColor: tone.color, backgroundColor: tone.bg }]}
                  >
                    <Icon size={16} color={tone.color} style={{ marginTop: 1 }} />
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text, flex: 1 }}>{sanitizeAI(a.text)}</T>
                  </View>
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
