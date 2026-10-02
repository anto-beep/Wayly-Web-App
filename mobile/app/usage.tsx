import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Gauge } from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Usage = { plan?: string; since?: string; counts?: Record<string, number> };

const LABELS: Record<string, string> = {
  chat_questions: "Questions asked",
  statements_uploaded: "Statements uploaded",
  family_messages: "Family messages",
  wellbeing_checkins: "Wellbeing check-ins",
  digest_sends: "Digest emails sent",
  tool_emails_sent: "Tool results emailed",
};

export default function UsageScreen() {
  const { colors } = useTheme();
  const [data, setData] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await apiFetch<Usage>("/usage")); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const entries = Object.entries(data?.counts || {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Usage" subtitle="What you have done with Wayly" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Counting…" />
      ) : entries.length === 0 ? (
        <StatePanel icon={Gauge} title="No usage yet" message="Once you start using Wayly, your activity totals show up here." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {entries.map(([k, v]) => (
              <Card key={k} testID={`usage-${k}`} style={{ width: "47%" }}>
                <T variant="label">{(LABELS[k] || k).toUpperCase()}</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 30, marginTop: 6 }}>{v}</T>
              </Card>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
