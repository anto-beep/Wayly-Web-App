/**
 * FundtrackAlerts (mobile) — FUNDTRACK-1 alerts, parity with the web card.
 */
import React from "react";
import { Pressable, View } from "react-native";
import { AlertTriangle, Clock, HelpCircle, Receipt } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const ICON: Record<string, any> = {
  forfeit_risk: AlertTriangle, shortfall_risk: AlertTriangle,
  statement_overdue: Clock, possible_billing_difference: HelpCircle,
};

export function FundtrackAlerts({ alerts, onAction }: { alerts?: any[]; onAction?: (a: string) => void }) {
  const { colors } = useTheme();
  if (!alerts || alerts.length === 0) return null;
  const toneFor = (sev: string) =>
    sev === "danger" ? { bg: colors.errorSoft, accent: colors.terracotta }
    : sev === "warning" ? { bg: colors.alertSoft, accent: colors.alert }
    : { bg: colors.surface2, accent: colors.primary };
  return (
    <View style={{ gap: spacing.sm }} testID="fundtrack-alerts">
      {alerts.map((a) => {
        const Icon = ICON[a.kind] || Receipt;
        const t = toneFor(a.severity);
        return (
          <View key={a.id} testID={`ft-alert-${a.kind}`} style={{ backgroundColor: t.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: t.accent + "55", padding: spacing.md, flexDirection: "row", gap: spacing.sm }}>
            <Icon size={18} color={t.accent} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: t.accent }}>{a.title}</T>
              <T style={{ fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 19 }}>{a.body}</T>
              {(a.actions || []).length > 0 && onAction ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  {a.actions.map((act: any, i: number) => (
                    <Pressable key={i} testID={`ft-alert-action-${act.action}`} onPress={() => onAction(act.action)}
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.heading }}>{act.label}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
