import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Mail, ArrowUpRight, ArrowDownLeft } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Entry = {
  id: string;
  archetype?: string;
  direction?: string;
  recipient_type?: string;
  status?: string;
  created_at?: string;
  intake?: Record<string, any>;
};

const ARCHETYPE_LABEL: Record<string, string> = {
  dispute: "Fee dispute", reassessment: "Reassessment request", complaint: "Complaint",
  service_change: "Service change", hardship: "Hardship notification", care_plan_amendment: "Care plan amendment",
  general: "General letter", response: "Response to provider", safeguarding: "Safeguarding record",
};
const RECIPIENT_LABEL: Record<string, string> = {
  provider_cm: "Provider (Care Manager)", provider: "Provider", mac: "My Aged Care",
  acqsc: "ACQSC", ombudsman: "Ombudsman", services_australia: "Services Australia",
};
const STATUS_TONE: Record<string, "neutral" | "success" | "alert" | "brand"> = {
  draft: "brand", sent: "success", awaiting_response: "alert", responded: "success",
  escalated: "error" as any, closed: "neutral",
};

function pretty(s?: string, map?: Record<string, string>): string {
  if (!s) return "";
  return (map && map[s]) || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function CorrespondenceScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const q = activeId ? `?participant_id=${activeId}` : "";
      const data = await apiFetch<{ entries: Entry[] }>(`/lf1/correspondence${q}`);
      setEntries(data?.entries || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title="Correspondence"
        subtitle="Letters and replies, all in one log"
        onBack={() => router.back()}
      />
      {loading ? (
        <Loading label="Loading correspondence…" />
      ) : error ? (
        <StatePanel testID="correspondence-error" icon={Mail} title="Couldn't load correspondence" actionLabel="Retry" onAction={load} />
      ) : entries.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel
            testID="correspondence-empty"
            icon={Mail}
            title="No letters yet"
            message="Draft a letter with Letters & Follow-ups and it will be saved here with follow-up prompts."
            actionLabel="Draft a letter"
            onAction={() => router.push("/tool/letters-and-follow-ups")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {entries.map((e) => {
            const inbound = e.direction === "inbound";
            const DirIcon = inbound ? ArrowDownLeft : ArrowUpRight;
            return (
              <Card key={e.id} testID={`correspondence-${e.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                      <DirIcon size={18} color={colors.primary} />
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{pretty(e.archetype, ARCHETYPE_LABEL) || "Letter"}</T>
                  </View>
                  {e.status ? <Badge label={pretty(e.status).toUpperCase()} tone={STATUS_TONE[e.status] || "neutral"} /> : null}
                </View>
                <T variant="small" style={{ marginTop: 8 }}>
                  {inbound ? "From" : "To"} {pretty(e.recipient_type, RECIPIENT_LABEL) || "recipient"} · {fmt(e.created_at)}
                </T>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
