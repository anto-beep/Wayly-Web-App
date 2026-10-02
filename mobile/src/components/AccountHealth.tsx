import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react-native";

import { T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

export type HealthItem = { id: string; label: string; done: boolean; fix_route: string; fix_label: string };
export type HealthData = { score_pct: number; complete: boolean; outstanding_count: number; items: HealthItem[] };

export function useAccountHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const load = useCallback(async () => {
    try { setData(await apiFetch<HealthData>("/account/health")); } catch { /* keep last */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return data;
}

// Map a web fix_route to the mobile route where the fix actually happens.
function mobileFixRoute(route: string): string {
  if (route.includes("participant")) return "/participants";
  if (route.includes("verify") || route.includes("email")) return "/(tabs)/settings";
  return "/participants";
}

export function HealthRing({ pct, size = 46, stroke = 6, light = false, onPress, testID }: { pct: number; size?: number; stroke?: number; light?: boolean; onPress?: () => void; testID?: string; }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  const done = pct >= 100;
  const track = light ? "rgba(14,77,82,0.15)" : "rgba(255,255,255,0.25)";
  const progress = done ? "#6B8F71" : "#E8A15C";
  const textColor = light ? colors.primary : "#fff";
  const inner = (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={progress} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={off} />
      </Svg>
      <T style={{ fontFamily: fonts.headingSemi, fontSize: size > 60 ? 17 : 12, color: textColor }}>{pct}%</T>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} testID={testID} hitSlop={8}>{inner}</Pressable> : inner;
}

export function AccountHealthCard({ data }: { data: HealthData | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);

  // Weekly in-app nudge when setup is incomplete (at most once / 7 days).
  React.useEffect(() => {
    if (!data || data.complete) return;
    let cancelled = false;
    (async () => {
      const last = Number(await storage.getItem("health_nudge_ts", 0));
      if (!cancelled && Date.now() - last > 7 * 24 * 60 * 60 * 1000) {
        setNudge(true);
        await storage.setItem("health_nudge_ts", Date.now());
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  if (!data) return null;
  const complete = data.complete;
  const outstanding = (data.items || []).filter((i) => !i.done);

  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {nudge && !complete ? (
        <Pressable
          testID="account-health-nudge"
          onPress={() => { setNudge(false); setOpen(true); }}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.goldSoft, borderColor: colors.gold, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}
        >
          <T style={{ flex: 1, fontSize: 13, color: colors.text }}>
            You still have {data.outstanding_count} thing{data.outstanding_count === 1 ? "" : "s"} to finish setting up — tap to complete.
          </T>
          <ArrowRight size={16} color={colors.gold} />
        </Pressable>
      ) : null}
      <View style={{ borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border }} testID="account-health-card">
        <Pressable
          onPress={() => setOpen((o) => !o)}
          testID="account-health-toggle"
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.primary }}
        >
          <HealthRing pct={data.score_pct} size={68} stroke={7} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 17, color: "#fff" }}>{complete ? "Your account is all set" : "Finish setting up"}</T>
            <T style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginTop: 2 }}>
              {complete ? "Everything Wayly needs is in place." : `${data.outstanding_count} thing${data.outstanding_count === 1 ? "" : "s"} left to complete`}
            </T>
          </View>
          {complete ? <ShieldCheck size={26} color="#A8C7AB" /> : (open ? <ChevronUp size={22} color="#fff" /> : <ChevronDown size={22} color="#fff" />)}
        </Pressable>
        {open && !complete ? (
          <View style={{ backgroundColor: colors.surface }} testID="account-health-list">
            {outstanding.map((item, i) => (
              <Pressable
                key={item.id}
                testID={`account-health-item-${item.id}`}
                onPress={() => router.push(mobileFixRoute(item.fix_route) as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <ArrowRight size={16} color={colors.gold} />
                </View>
                <T style={{ flex: 1, fontSize: 14, color: colors.text }}>{item.label}</T>
                <T style={{ fontSize: 12, fontFamily: fonts.bodySemi, color: colors.primary }}>{item.fix_label}</T>
              </Pressable>
            ))}
            {(data.items || []).filter((i) => i.done).map((item) => (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, opacity: 0.55 }} testID={`account-health-item-${item.id}`}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={16} color={colors.sage} />
                </View>
                <T style={{ flex: 1, fontSize: 14, color: colors.muted, textDecorationLine: "line-through" }}>{item.label}</T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
