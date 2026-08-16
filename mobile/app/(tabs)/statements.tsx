import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import { FileText, Plus, CloudOff, FileSearch, Search, StickyNote, Download, Archive } from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { PageIntro } from "@/src/components/PageIntro";
import { Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { shareTextFile } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, sanitizeAI } from "@/src/utils/format";
import {
  Stmt, periodCompact, providerName, grossTotal, closingBalance, decodeStatus, flagsCount, uploadedLabel, periodSortKey, STATUS_LABEL,
} from "@/src/lib/statementFields";

const STATUS_FILTERS = ["all", "clean", "flagged", "processing", "failed"] as const;

function StatusBadge({ status, count, hasNote }: { status: string; count: number; hasNote?: boolean }) {
  const { colors } = useTheme();
  const cfg: Record<string, { bg: string; fg: string }> = {
    clean: { bg: colors.success, fg: "#fff" },
    flagged: { bg: colors.gold, fg: "#fff" },
    processing: { bg: "transparent", fg: colors.primary },
    failed: { bg: colors.muted, fg: "#fff" },
  };
  const c = cfg[status] || cfg.processing;
  const label = STATUS_LABEL[status] + (status === "flagged" && count > 0 ? ` · ${count}` : "");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {hasNote ? <StickyNote size={13} color={colors.muted} /> : null}
      <View testID={`statement-status-${status}`} style={[styles.statusBadge, { backgroundColor: c.bg, borderWidth: status === "processing" ? 1 : 0, borderColor: colors.primary }]}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: c.fg }}>{label}</T>
      </View>
    </View>
  );
}

export default function StatementsScreen() {
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [items, setItems] = useState<Stmt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [insight, setInsight] = useState<string | null>(null);
  const [archivedCount, setArchivedCount] = useState(0);
  const listRef = useRef<FlatList>(null);
  useScrollToTop(listRef);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<Stmt[]>("/statements");
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setOffline(false);
      cacheSet(`statements:${activeId || "all"}`, list);
      if (list.length > 0) {
        apiFetch<{ summary?: string }>("/insights/summarise", { method: "POST", body: { page_key: "statements-list", context: { total_statements: list.length } } })
          .then((r) => setInsight(r?.summary || null))
          .catch(() => setInsight(null));
      }
    } catch {
      const cached = await cacheGet<Stmt[]>(`statements:${activeId || "all"}`);
      if (cached?.data?.length) { setItems(cached.data); setOffline(true); } else setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(useCallback(() => {
    apiFetch<any>("/statements/archived")
      .then((d) => setArchivedCount((Array.isArray(d) ? d : d?.items || []).length))
      .catch(() => setArchivedCount(0));
  }, []));

  const exportCsv = async () => {
    if (sorted.length === 0) return;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Period", "Provider", "Uploaded", "Gross Total", "Closing Balance", "Status"];
    const rows = sorted.map((s) => [
      periodCompact(s), providerName(s), uploadedLabel(s.uploaded_at || s.created_at),
      grossTotal(s).toFixed(2), (closingBalance(s) ?? "").toString(), STATUS_LABEL[decodeStatus(s)],
    ].map(esc).join(","));
    const csv = [header.map(esc).join(","), ...rows].join("\n");
    try { await shareTextFile("wayly-statements.csv", csv); } catch { /* ignore */ }
  };

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((s) => {
      if (q) {
        const hay = [providerName(s), s.filename || "", s.period_label || "", periodCompact(s)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== "all" && decodeStatus(s) !== status) return false;
      return true;
    });
    return filtered.sort((a, b) => periodSortKey(b) - periodSortKey(a));
  }, [items, search, status]);

  const renderItem = ({ item }: { item: Stmt }) => {
    const st = decodeStatus(item);
    const gross = grossTotal(item);
    const closing = closingBalance(item);
    return (
      <Pressable testID={`statement-row-${item.id}`} onPress={() => router.push(`/statement/${item.id}`)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>{periodCompact(item)}</T>
          <T variant="small" numberOfLines={1} style={{ marginTop: 2 }}>{providerName(item)}</T>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 8, flexWrap: "wrap" }}>
            <View>
              <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>GROSS TOTAL</T>
              <T style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.text }}>{money(gross)}</T>
            </View>
            <View>
              <T style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: colors.muted }}>CLOSING BALANCE</T>
              <T style={{ fontFamily: fonts.mono, fontSize: 14, color: closing == null ? colors.muted : colors.text }}>{closing == null ? "—" : money(closing)}</T>
            </View>
          </View>
          <T variant="small" style={{ marginTop: 8 }}>Uploaded {uploadedLabel(item.uploaded_at || item.created_at)}</T>
        </View>
        <StatusBadge status={st} count={flagsCount(item)} hasNote={item.has_note} />
      </Pressable>
    );
  };

  const Header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <PageIntro
        eyebrow="ALL STATEMENTS"
        title="Your Support at Home Statements"
        description="Every monthly statement your provider has sent, uploaded and decoded into plain English so nothing surprises you."
        whatItDoes="Stores each PDF, extracts every line item, and highlights anything unusual so you can query it before the next payment."
        howToUse={[
          "Upload a new monthly statement using the button.",
          "Open a statement to see the plain-English decode and flags.",
          "Compare two statements side-by-side to spot creeping charges.",
          "Archive statements once you've reviewed them.",
        ]}
        whatYouGet={[
          "Peace of mind that every dollar is accounted for.",
          "A searchable ledger of provider spend over time.",
          "An audit trail if you ever need to escalate a dispute.",
        ]}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Button label="Upload a Statement" testID="statements-upload-cta" icon={FileText} onPress={() => router.push("/upload")} style={{ flexGrow: 1 }} />
        <Button label="Export CSV" testID="statements-export-csv-btn" icon={Download} variant="outline" onPress={exportCsv} style={{ flexGrow: 1 }} />
        <Button label={archivedCount > 0 ? `Archived (${archivedCount})` : "Archived"} testID="statements-archived-link" icon={Archive} variant="outline" onPress={() => router.push("/statements-archived" as any)} style={{ flexGrow: 1 }} />
      </View>
      {insight ? (
        <Card testID="smart-ai-summary-statements-list" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.primary }}>SMART SUMMARY</T>
          <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 2, color: colors.primary }}>Your Wayly Insight</T>
          <T style={{ fontFamily: fonts.body, fontSize: 14, marginTop: 8, lineHeight: 22, color: colors.text }}>{sanitizeAI(insight)}</T>
        </Card>
      ) : null}
      {/* Search + status filter */}
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Search size={18} color={colors.muted} />
        <TextInput
          testID="statements-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search provider or period"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text }}
        />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => {
          const on = status === s;
          return (
            <Pressable key={s} testID={`statements-filter-${s}`} onPress={() => setStatus(s)} style={[styles.filterChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: on ? colors.primaryFg : colors.muted }}>{s === "all" ? "All" : STATUS_LABEL[s]}</T>
            </Pressable>
          );
        })}
      </View>
      <T variant="small" testID="statements-count">{sorted.length} shown</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader />
      {loading ? (
        <Loading label="Loading statements…" />
      ) : error ? (
        <StatePanel testID="statements-error" icon={CloudOff} title="We couldn't load your statements." message="Please check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : items.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null as any}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: spacing.lg }}>
              <StatePanel testID="statements-empty" icon={FileSearch} title="No statements yet." message="Upload a Support at Home statement (PDF or photo) and Wayly will decode the charges for you." />
              <Button label="Upload your first statement" testID="statements-empty-upload" onPress={() => router.push("/upload")} icon={Plus} />
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg }}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={sorted}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          ListHeaderComponentStyle={offline ? undefined : undefined}
          ListEmptyComponent={<T variant="small" testID="statements-no-results" style={{ paddingHorizontal: spacing.lg }}>No statements match these filters.</T>}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  addBtn: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, minHeight: 46 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
});
