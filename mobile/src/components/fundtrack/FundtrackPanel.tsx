/**
 * FundtrackPanel (mobile) — compact FUNDTRACK-1 capture strip for the Today
 * dashboard and Budget Scenarios (parity with web FundtrackPanel). Shows the
 * alerts and the primary actions (Add a charge, What if I add care?, open the
 * weekly view). Hosts the charge-entry + what-if sheets. Renders nothing when
 * the feature is off for the household.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, CalendarClock, Plus } from "lucide-react-native";

import { Card, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { FundtrackAlerts } from "./FundtrackAlerts";
import { ChargeEntrySheet } from "./ChargeEntrySheet";
import { WhatIfCareSheet } from "./WhatIfCareSheet";

export function FundtrackPanel({ participantId, onChanged }: { participantId?: string; onChanged?: () => void }) {
  const { colors } = useTheme();
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
    <Card testID="fundtrack-panel">
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1, color: colors.gold }}>TRACK THE SPEND</T>
          <T style={{ fontFamily: fonts.headingSemi, fontSize: 17, color: colors.heading, marginTop: 2 }}>Keep this quarter's figures real</T>
        </View>
        <Pressable testID="fundtrack-open-weekly" onPress={() => router.push("/weekly-budget")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>Weekly view</T>
          <ArrowRight size={15} color={colors.primary} />
        </Pressable>
      </View>

      {data.alerts && data.alerts.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <FundtrackAlerts alerts={data.alerts} onAction={onAlertAction} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
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
        <T testID="fundtrack-unpriced-note" variant="small" style={{ fontSize: 11, marginTop: spacing.sm }}>
          {data.booked_unpriced_count} unpriced visit{data.booked_unpriced_count === 1 ? "" : "s"} booked — add an amount to count {data.booked_unpriced_count === 1 ? "it" : "them"}.
        </T>
      ) : null}

      <ChargeEntrySheet pid={participantId} savedServices={data.saved_services || []} visible={sheet === "charge"} onClose={() => setSheet(null)} onSaved={handleSaved} />
      <WhatIfCareSheet pid={participantId} savedServices={data.saved_services || []} visible={sheet === "whatif"} onClose={() => setSheet(null)} onSaved={handleSaved} />
    </Card>
  );
}
