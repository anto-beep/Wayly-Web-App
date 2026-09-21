import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AlertTriangle, ArrowRight } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

type CheckType = { code: string; title: string; count: number };
type Alert = {
  provider_name: string;
  invoice_count: number;
  total_invoices: number;
  total_amount: number;
  check_types: CheckType[];
};

// Phase G — surfaces providers who overcharged on MORE THAN ONE invoice.
export function OverchargeAlerts({ onViewProvider }: { onViewProvider?: (p: string) => void }) {
  const { colors } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ alerts: Alert[] }>("/invoices/overcharge-alerts")
      .then((d) => { if (!cancelled) setAlerts(d?.alerts || []); })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <View testID="overcharge-alerts" style={{ borderWidth: 2, borderColor: colors.terracotta, backgroundColor: colors.errorSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <AlertTriangle size={20} color={colors.terracotta} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.text }}>Repeated overcharges detected</T>
          <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>
            The same provider has billed questionable charges on more than one invoice. A repeated pattern is worth raising as a formal complaint or refund request.
          </T>
        </View>
      </View>

      {alerts.map((a, idx) => (
        <View key={a.provider_name || idx} testID={`overcharge-alert-${idx}`} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }} numberOfLines={1}>{a.provider_name}</T>
              <T variant="small" testID={`overcharge-count-${idx}`} style={{ color: colors.terracotta, marginTop: 2 }}>
                {`Flagged on ${a.invoice_count} of your ${a.total_invoices} invoice${a.total_invoices === 1 ? "" : "s"}${a.total_amount > 0 ? ` · about ${money(a.total_amount)}` : ""}`}
              </T>
            </View>
            {onViewProvider ? (
              <Pressable testID={`overcharge-view-${idx}`} onPress={() => onViewProvider(a.provider_name)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
                <T style={{ color: "#fff", fontSize: 12, fontFamily: fonts.bodySemi }}>Show</T>
                <ArrowRight size={14} color="#fff" />
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm }}>
            {(a.check_types || []).map((c) => (
              <View key={c.code} style={{ backgroundColor: colors.errorSoft, borderWidth: 1, borderColor: colors.terracotta, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <T style={{ fontSize: 11, color: colors.terracotta }}>{`${c.title}${c.count > 1 ? ` \u00d7${c.count}` : ""}`}</T>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default OverchargeAlerts;
