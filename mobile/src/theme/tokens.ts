// Wayly design tokens. Light + dark palettes mirror the web CSS custom
// properties (:root and html.theme-dark) so web and mobile read identically.
import { Platform } from "react-native";


export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  sunken: string;
  primary: string; // brand teal — headings, icons, accents
  primaryFg: string;
  cta: string; // primary button fill (teal on light, clay on dark — matches web)
  gold: string; // clay accent
  goldSoft: string;
  sage: string;
  sage400: string;
  sageSoft: string;
  terracotta: string; // error
  errorSoft: string;
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  success: string;
  successSoft: string;
  alert: string;
  alertSoft: string;
  overlay: string;
};

export const lightColors: Palette = {
  bg: "#FBF8F3",
  surface: "#FFFFFF",
  surface2: "#F4EFE7",
  sunken: "#F1EADD",
  primary: "#0E4D52",
  primaryFg: "#FFFFFF",
  cta: "#0E4D52",
  gold: "#A5512B",
  goldSoft: "#F3E7DE",
  sage: "#425F47",
  sage400: "#6B8F71",
  sageSoft: "#EEF3EE",
  terracotta: "#C0392B",
  errorSoft: "#FBE6E4",
  text: "#1C2B2D",
  textSecondary: "#524B42",
  muted: "#524B42",
  border: "#E7E0D5",
  success: "#1B5733",
  successSoft: "#E4F0E8",
  alert: "#B7791F",
  alertSoft: "#FBEFD8",
  overlay: "rgba(14,77,82,0.45)",
};

export const darkColors: Palette = {
  bg: "#0B1416",
  surface: "#152425",
  surface2: "#1C2F31",
  sunken: "#060B0C",
  primary: "#4FA8AE",
  primaryFg: "#FFFFFF",
  cta: "#A5512B",
  gold: "#E89A6F",
  goldSoft: "rgba(232,154,111,0.16)",
  sage: "#A8C7AB",
  sage400: "#A8C7AB",
  sageSoft: "rgba(168,199,171,0.12)",
  terracotta: "#F0857A",
  errorSoft: "rgba(240,133,122,0.14)",
  text: "#FFFFFF",
  textSecondary: "#E5E5E5",
  muted: "#C7C2B8",
  border: "#2A3A3C",
  success: "#7FC8A0",
  successSoft: "rgba(127,200,160,0.12)",
  alert: "#E8B45F",
  alertSoft: "rgba(232,180,95,0.12)",
  overlay: "rgba(0,0,0,0.62)",
};

export const fonts = {
  heading: "PlayfairDisplay-Bold",
  headingSemi: "PlayfairDisplay-SemiBold",
  body: "IBMPlexSans-Regular",
  bodyMedium: "IBMPlexSans-Medium",
  bodySemi: "IBMPlexSans-SemiBold",
  bodyBold: "IBMPlexSans-Bold",
  mono: "IBMPlexMono-Regular",
  monoMedium: "IBMPlexMono-Medium",
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

// Font-size/weight scale only (no colour — colour comes from the active theme).
export const typeScale = {
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 40 },
  h2: { fontFamily: fonts.headingSemi, fontSize: 24, lineHeight: 32 },
  h3: { fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyMuted: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.monoMedium, fontSize: 15 },
} as const;

export const shadowFor = (isDark: boolean) => ({
  card: Platform.select({
    web: { boxShadow: isDark ? "0px 6px 16px rgba(0,0,0,0.4)" : "0px 6px 16px rgba(17,24,26,0.08)" },
    default: {
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
  }) as Record<string, unknown>,
});
