/** @type {import('tailwindcss').Config} */
// Wayly Design System tokens (Feb 2026 brief — teal-ink / sage / clay).
// Source: /app/docs/wayly-design-system.md
// Never hard-code hex values in components — reference these tokens.
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
    theme: {
        extend: {
            fontFamily: {
                // Serif heading face — warm, editorial, trustworthy.
                heading: ['"Fraunces"', "Georgia", '"Times New Roman"', "serif"],
                // Humanist sans for body + UI — large x-height, open counters.
                sans: ['"Inter"', "-apple-system", '"Segoe UI"', "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
                // Tabular figures for money + budgets.
                mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "monospace"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                // Spec-specific
                card: "16px",
                input: "10px",
                pill: "9999px",
            },
            spacing: {
                // 4px base; spec scale 4/8/12/16/20/24/32/40/48/64/80/96/128
                // Tailwind already covers these — leaving for documentation.
            },
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
                popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
                primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
                secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
                muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
                accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
                destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",

                // Legacy `kindred.*` token surface — kept so existing components
                // shift automatically. Values now map to the new spec.
                kindred: {
                    bg: "#FBF8F3",            // neutral 50 — warm off-white
                    surface: "#FFFFFF",
                    surface2: "#F4EFE7",      // neutral 100
                    primary: "#0E4D52",       // teal-ink 600
                    gold: "#A5512B",          // clay 500 — accent (AA on white)
                    sage: "#425F47",          // sage 600 — body-safe sage
                    terracotta: "#C0392B",    // error base
                    text: "#1C2B2D",          // warm ink
                    muted: "#524B42",         // neutral 700
                    border: "#E7E0D5",        // neutral 200
                },

                // New spec primitives — use these in fresh components.
                wayly: {
                    // Legacy aliases — point to the closest spec equivalent so
                    // pre-existing utilities keep working.
                    navy: "#0E4D52",          // was navy → teal-ink primary
                    blue: "#1A696E",          // was blue → teal 500
                    cyan: "#A5512B",          // was cyan → clay 500 (accent)
                    mint: "#6B8F71",          // was mint → sage 400
                    sky: "#E9F2F2",           // was sky → teal 50
                    skyLight: "#FBF8F3",      // was skyLight → neutral 50
                    wave: "#3D8488",          // was wave → teal 400
                    indigo: "#6B8F71",        // was indigo → sage 400
                    lavender: "#94B397",      // was lavender → sage 300
                    coral: "#A5512B",         // was coral → clay 500
                    teal: "#6B8F71",          // was teal → sage 400

                    // Spec-canonical names — prefer in new code.
                    "teal-50":  "#E9F2F2",
                    "teal-100": "#C9E0E1",
                    "teal-200": "#A3CBCC",
                    "teal-300": "#6FAAAC",
                    "teal-400": "#3D8488",
                    "teal-500": "#1A696E",
                    "teal-600": "#0E4D52",
                    "teal-700": "#0A3E42",
                    "teal-800": "#072E31",
                    "teal-900": "#041E20",

                    "sage-50":  "#EEF3EE",
                    "sage-100": "#D6E3D7",
                    "sage-200": "#B9CEBB",
                    "sage-300": "#94B397",
                    "sage-400": "#6B8F71",
                    "sage-500": "#54775A",
                    "sage-600": "#425F47",
                    "sage-700": "#344C39",
                    "sage-800": "#26382A",
                    "sage-900": "#18241B",

                    "clay-50":  "#FBEEE7",
                    "clay-100": "#F4D6C5",
                    "clay-200": "#EBB89E",
                    "clay-300": "#DD9069",
                    "clay-400": "#C2683D",
                    "clay-500": "#A5512B",
                    "clay-600": "#874021",
                    "clay-700": "#6A3219",
                    "clay-800": "#4D2412",
                    "clay-900": "#31170B",

                    "neutral-0":   "#FFFFFF",
                    "neutral-50":  "#FBF8F3",
                    "neutral-100": "#F4EFE7",
                    "neutral-200": "#E7E0D5",
                    "neutral-300": "#D3C9BB",
                    "neutral-400": "#B3A899",
                    "neutral-500": "#8C8275",
                    "neutral-600": "#6E6559",
                    "neutral-700": "#524B42",
                    "neutral-800": "#37322C",
                    "neutral-850": "#28241F",
                    "neutral-900": "#1C2B2D",
                    "neutral-950": "#11181A",

                    "success-light": "#E4F0E6",
                    "success":       "#2E7D4F",
                    "success-dark":  "#1B5733",
                    "warning-light": "#FBF0DA",
                    "warning":       "#B7791F",
                    "warning-dark":  "#875A12",
                    "error-light":   "#FBE7E4",
                    "error":         "#C0392B",
                    "error-dark":    "#8E2A20",
                    "info-light":    "#E5EFF4",
                    "info":          "#1F6F8B",
                    "info-dark":     "#154E62",
                },
            },
            boxShadow: {
                "card": "0 1px 3px rgba(17,24,26,0.08), 0 1px 2px rgba(17,24,26,0.06)",
                "card-lift": "0 6px 16px rgba(17,24,26,0.10), 0 2px 6px rgba(17,24,26,0.08)",
                "modal": "0 24px 48px rgba(17,24,26,0.18), 0 12px 24px rgba(17,24,26,0.12)",
            },
            keyframes: {
                "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
                "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
                "fade-up": {
                    "0%": { opacity: "0", transform: "translateY(8px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s cubic-bezier(0.2, 0, 0, 1)",
                "accordion-up": "accordion-up 0.2s cubic-bezier(0.2, 0, 0, 1)",
                "fade-up": "fade-up 0.25s cubic-bezier(0.2, 0, 0, 1) both",
            },
            transitionTimingFunction: {
                "spec": "cubic-bezier(0.2, 0, 0, 1)",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
