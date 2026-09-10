import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Mail, Clock, AlertTriangle, PenLine, ArrowUpRight, ArrowDownLeft,
  Search, X, Trash2, Inbox, CheckCircle2, ChevronRight, TrendingUp,
} from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, Select, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Entry = {
  id: string; archetype?: string; direction?: string; recipient_type?: string;
  recipient_specific?: { entity_name?: string }; inbound_from_label?: string; inbound_source?: string;
  situation_label?: string; intake?: { subject?: string }; status?: string;
  created_at?: string; sent_at?: string; follow_up_date?: string;
};
type FollowUp = {
  id?: string; entry_id?: string; archetype?: string; situation_label?: string;
  due_at?: string; recipient_type?: string; label?: string;
  days_until_due?: number; suggested_next_action?: string;
};

const ARCHETYPE_LABEL: Record<string, string> = {
  request: "Request", dispute: "Dispute", complaint: "Complaint", escalation: "Escalation",
  notification: "Notification", response_draft: "Reply", guided_pathway: "Safeguarding",
};
const ARCHETYPE_ICON: Record<string, any> = {
  request: Mail, dispute: Mail, complaint: Mail, escalation: AlertTriangle,
  notification: Mail, response_draft: Mail, guided_pathway: AlertTriangle,
};
const STATUS_META: Record<string, { tone: "neutral" | "success" | "alert" | "brand" | "error"; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  sent: { tone: "brand", label: "Sent" },
  awaiting_response: { tone: "alert", label: "Awaiting response" },
  responded: { tone: "success", label: "Responded" },
  escalated: { tone: "error", label: "Escalated" },
  closed: { tone: "neutral", label: "Closed" },
};
const STATUS_FILTERS = [
  { key: "all", label: "All" }, { key: "draft", label: "Drafts" }, { key: "sent", label: "Sent" },
  { key: "awaiting_response", label: "Awaiting reply" }, { key: "responded", label: "Responded" },
  { key: "escalated", label: "Escalated" }, { key: "closed", label: "Closed" },
];
const TYPE_OPTIONS = [{ value: "all", label: "All types" }, ...Object.entries(ARCHETYPE_LABEL).map(([value, label]) => ({ value, label }))];

function recipientTypeLabel(rt?: string): string {
  return ({
    mac: "My Aged Care", acqsc: "Aged Care Quality and Safety Commission",
    complaints_commissioner: "Aged Care Complaints Commissioner", ombudsman: "Commonwealth Ombudsman",
    provider_cm: "Provider care manager", provider_senior: "Provider (senior)", provider: "Provider",
    services_australia_aged_care: "Services Australia, Aged Care", services_australia: "Services Australia",
    opan: "OPAN", other: "Other recipient",
  } as Record<string, string>)[rt || ""] || rt || "Recipient not set";
}
function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function LettersMailboxScreen() {
  const { colors } = useTheme();
  const { activeId } = useParticipants();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [overdue, setOverdue] = useState<FollowUp[]>([]);
  const [upcoming, setUpcoming] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const q = activeId ? `?participant_id=${activeId}` : "";
    try {
      const [c, f] = await Promise.all([
        apiFetch<{ entries: Entry[] }>(`/lf1/correspondence${q}`).catch(() => ({ entries: [] })),
        apiFetch<{ overdue: FollowUp[]; upcoming: FollowUp[] }>(`/lf1/follow-ups${q}`).catch(() => ({ overdue: [], upcoming: [] })),
      ]);
      setEntries(c?.entries || []);
      setOverdue(f?.overdue || []);
      setUpcoming(f?.upcoming || []);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    entries.forEach((e) => { const k = e.status || "draft"; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.archetype !== typeFilter) return false;
      if (qq) {
        const hay = [e.situation_label, e.archetype, e.recipient_type, e.recipient_specific?.entity_name, e.inbound_from_label, e.inbound_source, e.intake?.subject]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [entries, query, statusFilter, typeFilter]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await apiFetch(`/lf1/correspondence/${deleteTarget.id}`, { method: "DELETE" });
      setEntries((list) => list.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      load();
    } catch { /* keep modal on error */ } finally { setBusyDelete(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading your mailbox…" />
      ) : error ? (
        <StatePanel testID="letters-error" icon={Mail} title="Couldn't load your mailbox" actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          <PageIntro
            eyebrow="Letters And Follow-Ups"
            title="Your mailbox"
            description="Every letter you have drafted, sent, or received — in one place. Track follow-ups, escalate on time, and keep a case file for each situation."
            whatItDoes="Search, filter by status or type, chase overdue replies, and delete drafts you no longer need. Nothing is sent without your explicit click."
          />
          <Button label="Draft a new letter" testID="letters-new" icon={PenLine} onPress={() => router.push("/tool/letters-and-follow-ups")} />

          {entries.length > 0 || overdue.length > 0 || upcoming.length > 0 ? (
            <SmartAISummary
              pageKey="letters-mailbox"
              context={{
                entry_count: entries.length, overdue_followups: overdue.length, upcoming_followups: upcoming.length,
                by_status: statusCounts,
              }}
            />
          ) : null}

          {/* Follow-up + escalation panel */}
          {overdue.length > 0 || upcoming.length > 0 ? (
            <Card testID="lf1-follow-up-panel" style={{ borderColor: colors.gold }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TrendingUp size={18} color={colors.gold} />
                <T style={{ fontFamily: fonts.headingSemi, fontSize: 18 }}>Follow-ups</T>
              </View>
              {overdue.length > 0 ? (
                <View style={{ marginTop: spacing.sm }} testID="lf1-followups-overdue">
                  <T variant="small" style={{ color: colors.terracotta, letterSpacing: 0.5, marginBottom: 6 }}>OVERDUE ({overdue.length})</T>
                  {overdue.map((f) => <FollowUpRow key={f.id || f.entry_id} entry={f} isOverdue onEscalated={load} />)}
                </View>
              ) : null}
              {upcoming.length > 0 ? (
                <View style={{ marginTop: spacing.md }} testID="lf1-followups-upcoming">
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>DUE SOON ({upcoming.length})</T>
                  {upcoming.map((f) => <FollowUpRow key={f.id || f.entry_id} entry={f} onEscalated={load} />)}
                </View>
              ) : null}
            </Card>
          ) : null}

          {entries.length === 0 ? (
            <StatePanel testID="letters-empty" icon={Inbox} title="No letters yet" message="Start with the situation that fits and we will build the draft and track the response." actionLabel="Draft your first letter" onAction={() => router.push("/tool/letters-and-follow-ups")} />
          ) : (
            <>
              {/* Controls */}
              <View testID="lf1-log-controls" style={{ gap: spacing.sm }}>
                <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Search size={16} color={colors.muted} />
                  <TextInput
                    testID="lf1-log-search"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by subject, recipient, or type…"
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text, paddingVertical: 0 }}
                  />
                  {query ? <Pressable testID="lf1-log-search-clear" onPress={() => setQuery("")} hitSlop={8}><X size={16} color={colors.muted} /></Pressable> : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }} testID="lf1-log-status-filters">
                  {STATUS_FILTERS.map((f) => {
                    const count = f.key === "all" ? entries.length : (statusCounts[f.key] || 0);
                    if (f.key !== "all" && count === 0) return null;
                    const on = statusFilter === f.key;
                    return (
                      <Pressable key={f.key} testID={`lf1-log-filter-${f.key}`} onPress={() => setStatusFilter(f.key)}
                        style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
                        <T variant="small" style={{ color: on ? "#fff" : colors.text, fontFamily: fonts.bodySemi }}>{f.label} {count}</T>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Select testID="lf1-log-type-filter" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
              </View>

              {filtered.length === 0 ? (
                <Card testID="lf1-log-no-matches" style={{ alignItems: "center" }}>
                  <T variant="small" style={{ color: colors.muted }}>No letters match your filters.</T>
                </Card>
              ) : (
                <View testID="lf1-log-list" style={{ gap: spacing.sm }}>
                  {filtered.map((e) => <MailboxRow key={e.id} entry={e} onDelete={() => setDeleteTarget(e)} />)}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Delete confirm */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={[styles.modalBg, { backgroundColor: colors.overlay }]} onPress={() => setDeleteTarget(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()} testID="lf1-log-delete-modal">
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20 }}>Delete this entry?</T>
            <T variant="small" style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>This removes the entry from your mailbox. A deletion record is kept for audit purposes.</T>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button label="Keep it" variant="outline" onPress={() => setDeleteTarget(null)} style={{ flex: 1 }} />
              <Button label={busyDelete ? "Deleting…" : "Delete"} testID="lf1-log-delete-confirm" icon={Trash2} loading={busyDelete} onPress={doDelete} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function FollowUpRow({ entry, isOverdue = false, onEscalated }: { entry: FollowUp; isOverdue?: boolean; onEscalated: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const id = entry.id || entry.entry_id || "";
  const canEscalate = !!entry.recipient_type && ["provider_cm", "provider_senior", "mac", "acqsc"].includes(entry.recipient_type);
  const daysCopy = () => {
    const d = entry.days_until_due;
    if (d === undefined) return entry.due_at ? `Due ${fmt(entry.due_at)}` : "";
    if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
    if (d === 0) return "Due today";
    return `Due in ${d} day${d === 1 ? "" : "s"}`;
  };
  const escalate = async () => {
    setBusy(true);
    try { await apiFetch(`/lf1/correspondence/${id}/escalate`, { method: "POST" }); onEscalated(); }
    catch { /* silent */ } finally { setBusy(false); }
  };
  return (
    <View style={[styles.fuRow, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Clock size={16} color={isOverdue ? colors.terracotta : colors.muted} style={{ marginTop: 2 }} />
      <Pressable style={{ flex: 1 }} testID={`lf1-followup-open-${id}`} onPress={() => router.push(`/letters/${id}` as any)}>
        <T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>{entry.situation_label || ARCHETYPE_LABEL[entry.archetype || ""] || entry.archetype || "Follow-up"}</T>
        <T variant="small" style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{daysCopy()}{entry.suggested_next_action ? ` · ${entry.suggested_next_action}` : ""}</T>
      </Pressable>
      {canEscalate ? (
        <Pressable testID={`lf1-followup-escalate-${id}`} disabled={busy} onPress={escalate}
          style={[styles.escalate, { borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
          <ArrowUpRight size={13} color={colors.primary} />
          <T variant="small" style={{ color: colors.primary, fontSize: 12, fontFamily: fonts.bodySemi }}>Escalate</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function MailboxRow({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const { colors } = useTheme();
  const inbound = entry.direction === "inbound";
  const DirIcon = inbound ? ArrowDownLeft : (ARCHETYPE_ICON[entry.archetype || ""] || ArrowUpRight);
  const status = STATUS_META[entry.status || "draft"] || STATUS_META.draft;
  const typeLabel = ARCHETYPE_LABEL[entry.archetype || ""] || "Letter";
  const recipient = inbound
    ? `From ${entry.inbound_from_label || entry.inbound_source || "sender"}`
    : `To ${entry.recipient_specific?.entity_name || recipientTypeLabel(entry.recipient_type)}`;
  const canDelete = entry.status !== "sent";
  return (
    <Card testID={`lf1-log-entry-${entry.id}`} style={{ padding: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}><DirIcon size={17} color={colors.primary} /></View>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/letters/${entry.id}` as any)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{entry.intake?.subject || entry.situation_label || typeLabel}</T>
            <Badge testID={`lf1-log-entry-status-${entry.id}`} label={status.label} tone={status.tone} />
          </View>
          <T variant="small" style={{ color: colors.muted, marginTop: 4 }} numberOfLines={1}>
            {typeLabel.toUpperCase()} · {recipient}
            {entry.follow_up_date && entry.status !== "responded" && entry.status !== "closed" ? ` · follow up by ${fmt(entry.follow_up_date)}` : ""}
            {entry.sent_at ? ` · sent ${fmt(entry.sent_at)}` : ""}
          </T>
        </Pressable>
        {canDelete ? (
          <Pressable testID={`lf1-log-delete-${entry.id}`} onPress={onDelete} hitSlop={8}><Trash2 size={16} color={colors.muted} /></Pressable>
        ) : null}
        <ChevronRight size={16} color={colors.muted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 46 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  fuRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: 6 },
  escalate: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  modalBg: { flex: 1, justifyContent: "center", padding: spacing.lg },
  modalCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
});
