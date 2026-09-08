import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RotateCw } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { streamSSE, SSEHandle } from "@/src/lib/sse";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing, Palette } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

type Line = { line_id: string; description: string; amount: number; confidence: number; note?: string };
type Alert = { level: string; text: string };

function confTone(c: number, colors: Palette): { label: string; color: string; bg: string } {
  if (c >= 0.85) return { label: `${Math.round(c * 100)}%`, color: colors.success, bg: colors.successSoft };
  if (c >= 0.6) return { label: `${Math.round(c * 100)}%`, color: colors.alert, bg: colors.alertSoft };
  return { label: `${Math.round(c * 100)}%`, color: colors.terracotta, bg: colors.errorSoft };
}

export default function DecodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [phase, setPhase] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [done, setDone] = useState<{ line_count: number; overall_confidence: number; model?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const handleRef = useRef<SSEHandle | null>(null);

  const run = useCallback(async () => {
    setLines([]);
    setAlerts([]);
    setDone(null);
    setError("");
    setPhase("Starting…");
    setRunning(true);
    handleRef.current = await streamSSE(
      `/sd3/statements/${id}/decode-v2/stream`,
      { force_fallback: false },
      {
        onEvent: (e) => {
          if (e.event === "phase") setPhase(e.note || phaseLabel(e.name));
          else if (e.event === "line")
            setLines((prev) => [
              ...prev,
              { line_id: e.line_id, description: e.description, amount: e.amount, confidence: e.confidence, note: e.note },
            ]);
          else if (e.event === "alert") setAlerts((prev) => [...prev, { level: e.level, text: e.text }]);
          else if (e.event === "done") {
            setDone({ line_count: e.line_count, overall_confidence: e.overall_confidence, model: e.model });
            setPhase("Done");
            setRunning(false);
          }
        },
        onError: (m) => {
          setError(m);
          setRunning(false);
        },
        onDone: () => setRunning(false),
      }
    );
  }, [id]);

  useEffect(() => {
    run();
    return () => handleRef.current?.abort();
  }, [run]);

  useEffect(() => {
    if (lines.length) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  }, [lines.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="AI Decode" subtitle="Powered by Claude Opus" onBack={() => router.back()} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
        {/* Live status */}
        <Card testID="decode-status" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Ionicons name={running ? "sync" : done ? "checkmark-circle" : "sparkles"} size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <T variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>
                {running ? "DECODING" : done ? "COMPLETE" : "STATUS"}
              </T>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: "#fff" }} numberOfLines={2}>
                {phase}
              </T>
            </View>
          </View>
          {done ? (
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.md }}>
              <View>
                <T variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>LINES</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff" }}>{done.line_count}</T>
              </View>
              <View>
                <T variant="label" style={{ color: "rgba(255,255,255,0.7)" }}>CONFIDENCE</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 22, color: "#fff" }}>
                  {Math.round((done.overall_confidence || 0) * 100)}%
                </T>
              </View>
            </View>
          ) : null}
        </Card>

        {/* Alerts */}
        {alerts.map((a, i) => {
          const c = a.level === "warning" ? colors.alert : a.level === "success" ? colors.success : colors.sage;
          const icon = a.level === "warning" ? "warning" : a.level === "success" ? "checkmark-circle" : "information-circle";
          return (
            <View key={`al-${i}`} testID={`decode-alert-${i}`} style={[styles.alert, { borderLeftColor: c }]}>
              <Ionicons name={icon as any} size={18} color={c} />
              <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text }}>{a.text}</T>
            </View>
          );
        })}

        {/* Streaming lines */}
        {lines.map((l, i) => {
          const ct = confTone(l.confidence, colors);
          return (
            <Card key={`${l.line_id}-${i}`} testID={`decode-line-${i}`} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <T style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={2}>
                  {l.description}
                </T>
                <View style={[styles.confPill, { backgroundColor: ct.bg }]}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: ct.color }}>{ct.label}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
                {l.note ? (
                  <T variant="small" style={{ flex: 1, marginRight: spacing.sm }}>
                    {l.note}
                  </T>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <T style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.text }}>{money(l.amount)}</T>
              </View>
            </Card>
          );
        })}

        {running && lines.length === 0 && !error ? (
          <T variant="bodyMuted" style={{ textAlign: "center", paddingVertical: spacing.lg }}>
            Reading your statement line by line…
          </T>
        ) : null}

        {error ? (
          <View testID="decode-error" style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
            <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>
              {error}
            </T>
          </View>
        ) : null}

        {!running ? (
          <Button label="Re-run decode" testID="decode-rerun-button" icon={RotateCw} variant="outline" onPress={run} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function phaseLabel(name?: string): string {
  const map: Record<string, string> = {
    extract: "Reading each line…",
    audit: "Checking for issues…",
    summarise: "Summarising…",
  };
  return map[name || ""] || "Working…";
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    alert: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    confPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      backgroundColor: colors.errorSoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
  });
