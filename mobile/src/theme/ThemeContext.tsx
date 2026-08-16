import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { storage } from "@/src/utils/storage";
import { darkColors, lightColors, Palette, shadowFor } from "@/src/theme/tokens";

export type ThemePref = "light" | "dark" | "system";

type ThemeState = {
  colors: Palette;
  isDark: boolean;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  shadow: ReturnType<typeof shadowFor>;
};

const ThemeContext = createContext<ThemeState | undefined>(undefined);
const PREF_KEY = "wayly_theme_pref";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(PREF_KEY, "");
      if (saved === "light" || saved === "dark" || saved === "system") setPrefState(saved);
    })();
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    storage.setItem(PREF_KEY, p);
  }, []);

  const isDark = pref === "system" ? system === "dark" : pref === "dark";
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(
    () => ({ colors, isDark, pref, setPref, shadow: shadowFor(isDark) }),
    [colors, isDark, pref, setPref]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
