/**
 * Lightweight app-wide toast for the mobile app (parity with the web `sonner`
 * API: `toast.success(msg)` / `toast.error(msg)` / `toast.info(msg)`).
 * A module-level singleton dispatches to the mounted <ToastHost/> so any screen
 * can confirm an action without threading a hook. Mounted once at the root.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react-native";

import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { T } from "@/src/components/ui";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; type: ToastType; message: string };

let _handler: ((t: { type: ToastType; message: string }) => void) | null = null;

export const toast = {
  success: (message: string) => _handler?.({ type: "success", message }),
  error: (message: string) => _handler?.({ type: "error", message }),
  info: (message: string) => _handler?.({ type: "info", message }),
  message: (message: string) => _handler?.({ type: "info", message }),
};

export function ToastHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  useEffect(() => {
    _handler = ({ type, message }) => {
      const id = ++idRef.current;
      setItems((xs) => [...xs.slice(-2), { id, type, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), 3600);
    };
    return () => {
      _handler = null;
    };
  }, [dismiss]);

  if (items.length === 0) return null;

  const tones: Record<ToastType, { bg: string; fg: string; Icon: typeof Info }> = {
    success: { bg: colors.successSoft, fg: colors.success, Icon: CheckCircle2 },
    error: { bg: colors.errorSoft, fg: colors.terracotta, Icon: AlertTriangle },
    info: { bg: colors.surface2, fg: colors.heading, Icon: Info },
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      {items.map((it) => {
        const t = tones[it.type];
        return (
          <Animated.View
            key={it.id}
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(180)}
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
              <t.Icon size={16} color={t.fg} />
            </View>
            <T style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 18, color: colors.heading }} numberOfLines={3}>
              {it.message}
            </T>
            <Pressable hitSlop={8} onPress={() => dismiss(it.id)}>
              <X size={16} color={colors.muted} />
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.md, right: spacing.md, gap: 8 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
