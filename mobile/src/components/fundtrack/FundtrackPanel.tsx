/**
 * FundtrackPanel (mobile) — compact FUNDTRACK-1 capture strip for the Today
 * dashboard and Budget Scenarios (parity with web FundtrackPanel). A prominent
 * teal header with an icon badge + a clear "Weekly View" button, then the
 * alerts and primary actions (Add a charge, What if I add care?). Hosts the
 * charge-entry + what-if sheets. Renders nothing when the feature is off.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, CalendarClock, Plus } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { FundtrackAlerts } from "./FundtrackAlerts";
import { ChargeEntrySheet } from "./ChargeEntrySheet";
import { WhatIfCareSheet } from "./WhatIfCareSheet";

export function FundtrackPanel({ participantId, onChanged }: { participantId?: string; onChanged?: () => void }) {
  const { colors, shadow } = useTheme();
  const [data, setData] = useState<any>(null);
  const [sheet, setSheet] = useState<null | "charge" | "whatif">(null);

  const load = useCallback(async () => {
    if (!participantId) return;
    try { const d = await apiFetch(`/fundtrack/participants/${participantId}/overview`); setData(d); }
    catch { setData(null); }
  }, [participantId]);
  useEffect(() => { load(); }, [load]);

  const handleSaved = () => { load(); onChanged?.(); };
  const onAlertAction = (action: string) => {
    if (action === "what_if") setSheet("whatif");
    else if (action === "weekly") router.push("/weekly-budget");
    else if (action === "upload") router.push("/upload");
    else if (action === "letter") router.push("/letters");
  };

  if (!data || !data.enabled) return null;

  return (
    <View testID="fundtrack-panel" style={[{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }, shadow.card]}>
      {/* prominent teal header */}
      <LinearGradient colors={["#0E4D52", "#13646A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <View style={{ width: 42, height: 42, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <CalendarClock size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.4, color: "rgba(255,255,255,0.72)" }}>TRACK THE SPEND</T>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 17, lineHeight: 22, color: "#fff" }}>Keep This Quarter's Figures Real</T>
            </View>
          </View>
          <Pressable testID="fundtrack-open-weekly" onPress={() => router.push("/weekly-budget")}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 }, pressed && { opacity: 0.9 }]}>
            <T style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary }}>Weekly View</T>
            <ArrowRight size={15} color={colors.primary} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* body */}
      <View style={{ backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md }}>
        {data.alerts && data.alerts.length > 0 ? <FundtrackAlerts alerts={data.alerts} onAction={onAlertAction} /> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Pressable testID="fundtrack-add-charge" onPress={() => setSheet("charge")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.cta, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 11 }}>
            <Plus size={16} color="#fff" />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" }}>Add a charge</T>
          </Pressable>
          <Pressable testID="fundtrack-whatif" onPress={() => setSheet("whatif")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 11 }}>
            <CalendarClock size={16} color={colors.heading} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.heading }}>What if I add care?</T>
          </Pressable>
        </View>

        {data.booked_unpriced_count > 0 ? (
          <T testID="fundtrack-unpriced-note" variant="small" style={{ fontSize: 11 }}>
            {data.booked_unpriced_count} unpriced visit{data.booked_unpriced_count === 1 ? "" : "s"} booked — add an amount to count {data.booked_unpriced_count === 1 ? "it" : "them"}.
          </T>
        ) : null}
      </View>

      <ChargeEntrySheet pid={participantId} savedServices={data.saved_services || []} visible={sheet === "charge"} onClose={() => setSheet(null)} onSaved={handleSaved} />
      <WhatIfCareSheet pid={participantId} savedServices={data.saved_services || []} visible={sheet === "whatif"} onClose={() => setSheet(null)} onSaved={handleSaved} />
    </View>
  );
}
