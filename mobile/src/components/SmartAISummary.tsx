import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  const { colors, shadow } = useTheme();
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
    if (level === "warning") return { bg: colors.alertSoft, border: colors.alert, icon: AlertTriangle, iconColor: colors.alert };
    if (level === "success") return { bg: colors.successSoft, border: colors.success, icon: CheckCircle2, iconColor: colors.success };
    return { bg: colors.sageSoft, border: colors.primary, icon: Info, iconColor: colors.primary };
  };

  return (
    <View
      testID={`smart-ai-summary-${pageKey}`}
      style={[styles.card, { backgroundColor: colors.sageSoft, borderColor: colors.border }, shadow.card, style]}
    >
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary }]}>
          <Sparkles size={18} color={colors.primaryFg} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              {eyebrow ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.primary }}>{eyebrow}</T> : null}
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.primary }}>{title}</T>
            </View>
            {refreshable ? (
              <Pressable
                testID={`smart-ai-summary-refresh-${pageKey}`}
                onPress={() => run(true)}
                disabled={isLoading}
                style={[styles.refreshBtn, { borderColor: colors.primary, opacity: isLoading ? 0.5 : 1 }]}
              >
                <RefreshCw size={13} color={colors.primary} />
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary }}>{isLoading ? "Thinking" : "Refresh"}</T>
              </Pressable>
            ) : null}
          </View>

          <T
            testID={`smart-ai-summary-body-${pageKey}`}
            style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 8, lineHeight: 22, color: colors.text, opacity: isLoading ? 0.7 : 1 }}
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
                    style={[styles.alert, { backgroundColor: tone.bg, borderColor: tone.border }]}
                  >
                    <Icon size={16} color={tone.iconColor} style={{ marginTop: 1 }} />
                    <T style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text, flex: 1 }}>{sanitizeAI(a.text)}</T>
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
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  iconWrap: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  alert: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
});
