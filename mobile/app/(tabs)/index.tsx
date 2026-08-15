import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { ParticipantSwitcher } from "@/src/components/ParticipantSwitcher";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";
import { money, shortDate } from "@/src/utils/format";

type Statement = {
  id: string;
  filename: string;
  period_label?: string | null;
  uploaded_at: string;
  anomaly_dollar_impact_total?: number;
  anomalies?: any[];
  line_items?: any[];
};

export default function Dashboard() {
  const { user } = useAuth();
  const { activeId } = useParticipants();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [stmts, inv] = await Promise.all([
        apiFetch<Statement[]>("/statements"),
        apiFetch<{ count: number }>("/invoices").catch(() => ({ count: 0 })),
      ]);
      setStatements(Array.isArray(stmts) ? stmts : []);
      setInvoiceCount(inv?.count ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, activeId])
  );

  const firstName = user?.first_name || user?.name?.split(" ")[0] || "there";
  const totalAnomalies = statements.reduce((s, st) => s + (st.anomalies?.length || 0), 0);
  const totalImpact = statements.reduce((s, st) => s + (st.anomaly_dollar_impact_total || 0), 0);
  const latest = statements[0];

  const planLabel = (user?.plan || "free").replace(/^\w/, (c) => c.toUpperCase());
  const subTone =
    user?.subscription_status === "active"
      ? "success"
      : user?.subscription_status === "trialing"
      ? "alert"
      : "neutral";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        title={`Hi, ${firstName}`}
        subtitle="Here's your care overview"
        right={
          <View style={styles.planPill}>
            <Ionicons name="ribbon" size={14} color={colors.gold} />
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>{planLabel}</T>
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ParticipantSwitcher householdName={user?.name} />
        </View>

        {loading ? (
          <Loading label="Loading your dashboard…" />
        ) : error ? (
          <StatePanel
            testID="dashboard-error"
            icon="cloud-offline"
            title="Couldn't load your dashboard"
            message="Please check your connection and try again."
            actionLabel="Retry"
            onAction={load}
          />
        ) : (
          <>
            {/* Subscription status */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Card testID="plan-status-card" style={styles.planCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View>
                    <T variant="label">YOUR PLAN</T>
                    <T style={{ fontFamily: fonts.heading, fontSize: 24, color: "#fff", marginTop: 4 }}>
                      {planLabel}
                    </T>
                  </View>
                  <Badge
                    label={(user?.subscription_status || "free").toUpperCase()}
                    tone={subTone as any}
                    testID="subscription-badge"
                  />
                </View>
                {user?.trial_ends_at && user?.subscription_status === "trialing" ? (
                  <T variant="small" style={{ color: "rgba(255,255,255,0.8)", marginTop: spacing.sm }}>
                    Trial ends {shortDate(user.trial_ends_at)}
                  </T>
                ) : null}
              </Card>
            </View>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <StatTile
                testID="stat-statements"
                icon="document-text"
                value={String(statements.length)}
                label="Statements"
                onPress={() => router.push("/(tabs)/statements")}
              />
              <StatTile
                testID="stat-invoices"
                icon="receipt"
                value={invoiceCount === null ? "—" : String(invoiceCount)}
                label="Invoices"
                onPress={() => router.push("/invoices")}
              />
            </View>
            <View style={styles.statsRow}>
              <StatTile
                testID="stat-anomalies"
                icon="alert-circle"
                value={String(totalAnomalies)}
                label="Flags found"
                tint={colors.alert}
              />
              <StatTile
                testID="stat-impact"
                icon="cash"
                value={money(totalImpact)}
                label="$ impact"
                tint={colors.gold}
              />
            </View>

            {/* Quick actions */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>
                Quick actions
              </T>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <ActionTile
                  testID="action-upload"
                  icon="cloud-upload"
                  label="Upload a document"
                  onPress={() => router.push("/upload")}
                />
                <ActionTile
                  testID="action-ask"
                  icon="chatbubbles"
                  label="Ask Wayly"
                  onPress={() => router.push("/(tabs)/ask")}
                />
              </View>
            </View>

            {/* Latest statement */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>
                Latest statement
              </T>
              {latest ? (
                <Card
                  testID="latest-statement-card"
                  style={{ padding: spacing.md }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <View style={styles.docIcon}>
                      <Ionicons name="document-text" size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>
                        {latest.period_label || latest.filename}
                      </T>
                      <T variant="small">{shortDate(latest.uploaded_at)} · {latest.line_items?.length || 0} items</T>
                    </View>
                    <T
                      testID="latest-statement-open"
                      style={{ color: colors.gold, fontFamily: fonts.bodySemi }}
                      onPress={() => router.push(`/statement/${latest.id}`)}
                    >
                      View
                    </T>
                  </View>
                </Card>
              ) : (
                <StatePanel
                  testID="dashboard-empty-statements"
                  icon="document-text-outline"
                  title="No statements yet"
                  message="Upload your first Support at Home statement to see it decoded here."
                  actionLabel="Upload a statement"
                  onAction={() => router.push("/upload")}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatTile({
  icon,
  value,
  label,
  onPress,
  tint = colors.primary,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  onPress?: () => void;
  tint?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.statTile, styles.tileBase, pressed && onPress ? { opacity: 0.85 } : null]}
    >
      <Ionicons name={icon} size={22} color={tint} />
      <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text, marginTop: 6 }} numberOfLines={1}>
        {value}
      </T>
      <T variant="small">{label}</T>
    </Pressable>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, styles.tileBase, { alignItems: "flex-start" }, pressed ? { opacity: 0.85 } : null]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: spacing.sm }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  planCard: { backgroundColor: colors.primary, borderColor: colors.primary },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tileBase: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  statTile: { flex: 1, padding: spacing.md },
  actionTile: { flex: 1, padding: spacing.md },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.sageSoft,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
    shadowOpacity: 0,
    elevation: 0,
  },
});
