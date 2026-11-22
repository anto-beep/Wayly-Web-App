// Barrel for theme tokens. Prefer `useTheme()` (from ./ThemeContext) inside
// components for live light/dark colours. The static `colors`/`type` exports
// are the LIGHT palette, kept only for non-themed/module-scope needs.
export * from "@/src/theme/tokens";
export { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";

import { Platform } from "react-native";
import { lightColors, typeScale } from "@/src/theme/tokens";

export const colors = lightColors;

// Backwards-compatible light-coloured type styles.
export const type = {
  h1: { ...typeScale.h1, color: lightColors.text },
  h2: { ...typeScale.h2, color: lightColors.text },
  h3: { ...typeScale.h3, color: lightColors.text },
  body: { ...typeScale.body, color: lightColors.text },
  bodyMuted: { ...typeScale.bodyMuted, color: lightColors.muted },
  small: { ...typeScale.small, color: lightColors.muted },
  label: { ...typeScale.label, color: lightColors.muted },
  mono: { ...typeScale.mono, color: lightColors.text },
} as const;

export const shadow = {
  card: Platform.select({
    web: { boxShadow: "0px 6px 16px rgba(14,77,82,0.08)" },
    default: { shadowColor: "#0E4D52", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  }) as Record<string, unknown>,
};
