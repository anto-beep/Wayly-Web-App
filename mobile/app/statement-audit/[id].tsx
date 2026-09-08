import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  History,
  FileWarning,
  Archive,
  Trash2,
  RotateCcw,
  Upload,
  CheckCircle2,
  LucideIcon,
} from "lucide-react-native";

import { AppHeader, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type AuditEvent = {
  id?: string;
  event_type: string;
  event_at: string;
  actor_kind?: string;
  prior_state?: string | null;
  new_state?: string | null;
  metadata?: { reason?: string; filename?: string; attempted_filename?: string };
};

const EVENT_META: Record<string, { icon: LucideIcon; label: string; tone: "brand" | "muted" | "error" }> = {
  uploaded: { icon: Upload, label: "Uploaded", tone: "brand" },
  accepted_as_active: { icon: CheckCircle2, label: "Accepted as active", tone: "brand" },
  superseded: { icon: Archive, label: "Superseded by new version", tone: "muted" },
  archived: { icon: Archive, label: "Archived", tone: "muted" },
  deleted_soft: { icon: Archive, label: "Soft deleted (archived)", tone: "muted" },
  restored: { icon: RotateCcw, label: "Restored to active", tone: "brand" },
  deleted_hard: { icon: Trash2, label: "Permanently deleted", tone: "error" },
  duplicate_rejected: { icon: FileWarning, label: "Duplicate upload rejected", tone: "muted" },
  manual_review_passed: { icon: CheckCircle2, label: "Manual review passed", tone: "brand" },
  manual_review_failed: { icon: FileWarning, label: "Manual review failed", tone: "error" },
};

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function StatementAuditLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ events: AuditEvent[] }>(`/statements/${id}/audit-log`);
      setEvents(data?.events || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toneColor = (tone: string) =>
    tone === "error" ? colors.terracotta : tone === "muted" ? colors.muted : colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Audit log" subtitle="Every change we've recorded" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading audit log…" />
      ) : error ? (
        <StatePanel testID="audit-log-error" icon={History} title="Couldn't load the audit log" actionLabel="Retry" onAction={load} />
      ) : events.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <StatePanel testID="audit-log-empty" icon={History} title="No events yet" message="Changes to this statement, uploads, edits, archiving, will appear here." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} testID="audit-log-timeline">
          {events.map((e, i) => {
            const meta = EVENT_META[e.event_type] || { icon: History, label: e.event_type, tone: "muted" as const };
            const Icon = meta.icon;
            const color = toneColor(meta.tone);
            const reason = e?.metadata?.reason;
            const filename = e?.metadata?.filename || e?.metadata?.attempted_filename;
            const actor =
              e.actor_kind === "user" ? "By you" : e.actor_kind === "retention_job" ? "By the retention sweep" : "By the system";
            return (
              <Card key={e.id || i} testID={`audit-event-${e.event_type}`}>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                    <Icon size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color, flex: 1 }}>{meta.label}</T>
                      <T variant="small">{fmtDate(e.event_at)}</T>
                    </View>
                    <T variant="small" style={{ marginTop: 2 }}>
                      {actor}
                      {e.prior_state && e.new_state ? ` · ${e.prior_state} to ${e.new_state}` : ""}
                    </T>
                    {reason || filename ? (
                      <View style={[styles.metaBox, { backgroundColor: colors.surface2 }]}>
                        {reason ? <T variant="small">Reason: {reason}</T> : null}
                        {filename ? <T variant="small">File: {filename}</T> : null}
                      </View>
                    ) : null}
                  </View>
                </View>
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
  metaBox: { marginTop: 8, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
});
