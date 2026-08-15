// Wayly brand design tokens — mirrors the web palette (teal-ink / sage / clay)
// so web and mobile read as one product. Audience skews 60+: generous spacing,
// large touch targets, high-contrast text.

export const colors = {
  bg: "#FBF8F3", // warm off-white app shell
  surface: "#FFFFFF",
  surface2: "#F4EFE7", // sunken/inset
  primary: "#0E4D52", // teal-ink 600 — primary brand
  primaryFg: "#FFFFFF",
  gold: "#A5512B", // clay 500 — accent / CTA (AA on white)
  goldSoft: "#F3E7DE",
  sage: "#425F47", // body-safe sage
  sage400: "#6B8F71",
  sageSoft: "#EEF3EE",
  terracotta: "#C0392B", // error base
  text: "#1C2B2D", // warm ink
  muted: "#524B42", // muted body text
  border: "#E7E0D5",
  success: "#1B5733",
  successSoft: "#E4F0E8",
  alert: "#B7791F",
  alertSoft: "#FBEFD8",
  overlay: "rgba(14,77,82,0.45)",
} as const;

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const type = {
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 40, color: colors.text },
  h2: { fontFamily: fonts.headingSemi, fontSize: 24, lineHeight: 32, color: colors.text },
  h3: { fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 26, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
  bodyMuted: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.muted, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.text },
} as const;

export const shadow = {
  card: {
    shadowColor: "#0E4D52",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;
