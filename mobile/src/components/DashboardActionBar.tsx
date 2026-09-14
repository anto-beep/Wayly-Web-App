import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Search, ArrowRight } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { DASHBOARD_QUICK_ACTIONS, searchDestinations } from "@/src/config/dashboardDestinations";

/**
 * DashboardActionBar — "What would you like to do?" (mobile).
 *
 * Mirrors the web navigator: a search that jumps to the right tool or page,
 * plus a grid of large clay shortcut tiles for the most common tasks. Built
 * for older users — big touch targets, plain labels, one clear question.
 */
export function DashboardActionBar() {
  const { colors, shadow } = useTheme();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDestinations(query), [query]);
  const showResults = query.trim().length > 0;

  const go = (route: string) => {
    setQuery("");
    router.push(route as any);
  };

  return (
    <View
      testID="dashboard-action-bar"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.gold }, shadow.card]}
    >
      {/* Search */}
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.bg }]}>
        <Search size={18} color={colors.gold} />
        <TextInput
          testID="dashboard-action-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Try 'check my invoice'"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
          onSubmitEditing={() => { if (results.length > 0) go(results[0].route); }}
        />
      </View>

      {showResults ? (
        <View testID="dashboard-action-results" style={{ marginTop: spacing.sm }}>
          {results.length === 0 ? (
            <T variant="small" style={{ paddingVertical: spacing.sm }}>
              No match. Try words like invoice, budget, letter or provider.
            </T>
          ) : (
            results.map((d, i) => {
              const Icon = d.icon;
              return (
                <Pressable
                  key={d.route}
                  testID={`dashboard-action-result-${i}`}
                  onPress={() => go(d.route)}
                  style={({ pressed }) => [styles.resultRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: colors.goldSoft }]}>
                    <Icon size={17} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{d.label}</T>
                    <T variant="small" numberOfLines={1}>{d.hint}</T>
                  </View>
                  <ArrowRight size={16} color={colors.muted} />
                </Pressable>
              );
            })
          )}
        </View>
      ) : (
        <View style={styles.grid} testID="dashboard-quick-actions">
          {DASHBOARD_QUICK_ACTIONS.map((a, i) => {
            const Icon = a.icon;
            const tones = ["#0E4D52", "#A5512B", "#3E6A4C", "#0B3B3E", "#B5623A", "#2E5540"];
            const tone = tones[i % tones.length];
            return (
              <Pressable
                key={a.route}
                testID={`dashboard-quick-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                onPress={() => go(a.route)}
                style={({ pressed }) => [styles.tile, { backgroundColor: tone }, pressed && { opacity: 0.9 }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                  <Icon size={20} color="#fff" />
                </View>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" }} numberOfLines={2}>{a.label}</T>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default DashboardActionBar;

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 2, padding: spacing.lg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.md, marginTop: spacing.md, minHeight: 50 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 10 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  resultIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tile: { width: "31%", minHeight: 96, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, justifyContent: "flex-start" },
  tileIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
