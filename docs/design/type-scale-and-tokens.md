# Wayly Type Scale & Design Tokens

**Source of truth**: `/app/frontend/tailwind.config.js` under `theme.extend`.
This README documents which utility class maps to which semantic role in
UI copy so anyone touching a page uses the right one.

## Font families

| Semantic role | Tailwind class | CSS family | Notes |
|---|---|---|---|
| Editorial headings | `font-heading` | Fraunces (400/500/600/700), fallback Georgia | Optical sizing 9..144. Used for h1..h4 and section headings on marketing + app. |
| UI body copy | `font-sans` (default) | Inter (400/500/600/700), fallback -apple-system | All paragraph, button, tab, label text. |
| Numbers / currency | `font-mono` | IBM Plex Mono (400/500/600), fallback ui-monospace | Every dollar amount, every table figure, every tabular number. |

The three families are preloaded from Google Fonts in `public/index.html`. No new families may be introduced without updating this file.

## Type scale

Reference size is the `/app/calendar` subheading:
`text-sm sm:text-base text-muted-k leading-relaxed`.

| Semantic role | Class(es) | Where to use it |
|---|---|---|
| `display-lg` | `text-5xl sm:text-6xl font-heading tracking-tight` | Landing hero only. |
| `display` | `text-4xl sm:text-5xl font-heading` | Marketing page heroes (Features, Pricing, About). |
| `heading-1` | `text-3xl sm:text-4xl font-heading text-primary-k tracking-tight` | Every app page title (`h1`). |
| `heading-2` | `text-2xl sm:text-3xl font-heading text-primary-k` | Section headings inside pages. |
| `heading-3` | `text-xl font-heading text-primary-k` | Card titles, tool result section headings. |
| `heading-4` | `text-lg font-semibold text-primary-k` | Sub-cards, form group headings. |
| `subheading` | `text-sm sm:text-base text-muted-k leading-relaxed` | Every page subheading — matches `/app/calendar`. |
| `body` | `text-sm sm:text-base text-primary-k leading-relaxed` | Default paragraph copy in app. |
| `body-large` | `text-base sm:text-lg text-primary-k leading-relaxed` | Marketing paragraph copy. |
| `caption` | `text-xs text-muted-k` | Timestamps, meta info, footnotes. |
| `overline` | `text-[11px] uppercase tracking-[0.18em] text-muted-k` | Above-heading category labels. |
| `mono-number` | `font-mono text-base tabular-nums text-primary-k` | Currency amounts, table figures. |

## Rules

1. **One family per role.** Do not use Fraunces for body or Inter for currency figures. If you find a divergence, fix it in place, do not add a new class.
2. **No hard-coded `text-[13px]` / `text-[15px]`.** Use the scale above. If a design genuinely needs a size not in the scale, propose an addition to this document before shipping.
3. **Consistent subheading.** Every page subheading uses the `subheading` class combo. The `/app/calendar` subheading is the reference. `/app/documents` is the reference for card and body typography.
4. **Marketing and app match.** A user cannot tell they crossed from marketing to app based on font, size or colour — only from chrome (nav, footer).

## Palette

| Token | Hex | Use |
|---|---|---|
| `primary-k` (Teal-Ink) | `#0E4D52` | Headings, primary buttons, prominent copy. |
| `sage` | `#6B8F71` | Success states, secondary accents. |
| `clay` / `terracotta` | `#C2683D` | Warnings, destructive-secondary. |
| `gold` | `#C99A47` | Featured badges, conversion CTAs. |
| `surface` | `#FBF8F3` | Warm off-white app background. |
| `surface-2` | Slightly darker warm off-white | Card interior. |
| `kindred` | Warm neutral border | Card borders. |
| `muted-k` | Muted teal-ink | Body-secondary + captions. |

No new colours may be introduced in UI-2. Any ad-hoc hex found in the app is a bug to raise, not to ship.
