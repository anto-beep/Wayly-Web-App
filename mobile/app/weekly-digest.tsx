import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, Mailbox, Send } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Digest = {
  household_name?: string;
  caregiver_first_name?: string;
  week_label?: string;
  wellbeing?: { counts?: Record<string, number>; total?: number };
  anomalies?: { count?: number; new_spend?: number; statements_uploaded?: number; top?: { severity?: string; title?: string; detail?: string; period?: string }[] };
  family_thread_recent?: { author?: string; body?: string }[];
  chat_questions_asked?: number;
};
type HistoryItem = { id?: string; sent_at?: string; recipients?: string[]; recipient_count?: number };

function fmtDate(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}
function money(n?: number): string {
  try { return `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  catch { return "$0.00"; }
}

const MOOD_TONE: Record<string, "success" | "alert" | "error"> = { good: "success", okay: "alert", not_great: "error" };
const MOOD_LABEL: Record<string, string> = { good: "Good", okay: "Okay", not_great: "Not great" };

export default function WeeklyDigestScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const onFamily = (user?.plan || "").toLowerCase() === "family";

  const [digest, setDigest] = useState<Digest | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");
  const [sendError, setSendError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.allSettled([
        apiFetch<Digest>("/digest/preview"),
        apiFetch<{ items: HistoryItem[] }>("/digest/history"),
      ]);
      setDigest(d.status === "fulfilled" ? d.value : null);
      setHistory(h.status === "fulfilled" ? (h.value.items || []) : []);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendNow = async () => {
    setSendResult(""); setSendError("");
    setSending(true);
    try {
      const res = await apiFetch<{ ok: boolean; recipients?: string[]; reason?: string }>("/digest/send", { method: "POST", body: {} });
      if (res?.ok) { setSendResult(`Digest sent to ${(res.recipients || []).length} recipient(s).`); await load(); }
      else setSendError(res?.reason || "No recipients opted in for the digest.");
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Could not send the digest right now. Please try again.");
    } finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Weekly Digest" subtitle="Your Sunday household summary" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Building this week…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          {!onFamily ? (
            <Card testID="digest-upgrade-card">
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Sending digests is on the Family plan</T>
              <T variant="small" style={{ marginTop: 6 }}>You can still preview it below. Upgrade to Family to email the Sunday digest to your whole household.</T>
              <Button label="See plans" testID="digest-upgrade-cta" onPress={() => router.push("/plan-select")} style={{ marginTop: spacing.md }} />
            </Card>
          ) : null}

          {!digest ? (
            <StatePanel icon={Mailbox} title="Nothing to summarise yet" message="Create a household and add some activity, then your weekly digest appears here." />
          ) : (
            <Card testID="digest-preview-card">
              <T variant="label">PREVIEW</T>
              <T style={{ fontFamily: fonts.heading, fontSize: 22, marginTop: 4 }}>The week at {digest.household_name || "home"}</T>
              <T variant="small" style={{ marginTop: 2 }}>{digest.week_label}</T>

              {/* Wellbeing */}
              <View testID="digest-wellbeing" style={{ marginTop: spacing.md }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>How {digest.household_name || "they"} has been</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  {Object.entries(digest.wellbeing?.counts || {}).filter(([, c]) => (c || 0) > 0).map(([m, c]) => (
                    <Badge key={m} testID={`digest-mood-${m}`} label={`${MOOD_LABEL[m] || m}: ${c}`} tone={MOOD_TONE[m] || "neutral"} />
                  ))}
                  {(digest.wellbeing?.total || 0) === 0 ? <T variant="small">No check-ins this week.</T> : null}
                </View>
              </View>

              {/* Anomalies */}
              <View testID="digest-anomalies" style={{ marginTop: spacing.lg }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>What {digest.caregiver_first_name || "you"} paid attention to</T>
                <T variant="small" style={{ marginTop: 4 }}>
                  {money(digest.anomalies?.new_spend)} across {digest.anomalies?.statements_uploaded || 0} new statement{(digest.anomalies?.statements_uploaded || 0) !== 1 ? "s" : ""}.
                </T>
                {(digest.anomalies?.count || 0) === 0 ? (
                  <T variant="small" style={{ marginTop: 4 }}>No anomalies caught this week. Looking good.</T>
                ) : (
                  <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    {(digest.anomalies?.top || []).map((a, i) => (
                      <View key={i} style={{ padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface2 }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13 }}>[{(a.severity || "info").toUpperCase()}] {a.title}</T>
                        {a.detail ? <T variant="small" style={{ marginTop: 2 }} numberOfLines={3}>{a.detail}</T> : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Family thread */}
              {(digest.family_thread_recent || []).length > 0 ? (
                <View style={{ marginTop: spacing.lg }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Family thread</T>
                  <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    {(digest.family_thread_recent || []).map((m, i) => (
                      <View key={i} style={{ padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface2 }}>
                        <T variant="label">{(m.author || "").toUpperCase()}</T>
                        <T variant="small" style={{ marginTop: 2 }} numberOfLines={3}>{m.body}</T>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {(digest.chat_questions_asked || 0) > 0 ? (
                <T variant="small" style={{ marginTop: spacing.md, fontStyle: "italic" }}>
                  {digest.caregiver_first_name || "You"} asked Wayly {digest.chat_questions_asked} question{(digest.chat_questions_asked || 0) !== 1 ? "s" : ""} this week.
                </T>
              ) : null}
            </Card>
          )}

          {sendError ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={16} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{sendError}</T>
            </View>
          ) : null}
          {sendResult ? <T variant="small" testID="digest-send-result" style={{ color: colors.success }}>{sendResult}</T> : null}

          {digest ? (
            <Button label="Send this digest now" testID="digest-send-btn" icon={Send} variant="secondary" onPress={sendNow} loading={sending} disabled={!onFamily} />
          ) : null}

          {/* History */}
          <Card testID="digest-history">
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: spacing.sm }}>Recently sent</T>
            {history.length === 0 ? (
              <T variant="small">No digests have been sent yet.</T>
            ) : (
              history.map((h, i) => (
                <View key={h.id || i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <T variant="small">{fmtDate(h.sent_at)}</T>
                  <T variant="small">{(h.recipients?.length ?? h.recipient_count ?? 0)} recipient(s)</T>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
