# Wayly Design System — Feb 2026 Brief

> Source of truth for the visual layer. Tokens live in `/app/frontend/tailwind.config.js` + `/app/frontend/src/index.css`. **Never hard-code hex values in components — reference tokens.**

## Strategy
Warmth over polish · Clarity over cleverness · Calm over urgent · Dignity over pity · Evidence over decoration.

## Palette (canonical)

| Role | Token | Hex | Usage |
|---|---|---|---|
| Primary | `wayly-teal-600` | `#0E4D52` | Buttons, primary brand surface · AAA contrast on white |
| Primary hover | `wayly-teal-700` | `#0A3E42` | |
| Primary active | `wayly-teal-800` | `#072E31` | |
| Secondary | `wayly-sage-400` | `#6B8F71` | Reassuring secondary surface |
| Secondary body-safe | `wayly-sage-600` | `#425F47` | Sage text on white — AA strong |
| Accent — focus ring + fills | `wayly-clay-400` | `#C2683D` | 3px focus ring with 2px offset |
| Accent — button fill | `wayly-clay-500` | `#A5512B` | White text on this passes AA |
| App background | `wayly-neutral-50` | `#FBF8F3` | Warm off-white shell |
| Card surface | `wayly-neutral-0` | `#FFFFFF` | |
| Sunken / inset | `wayly-neutral-100` | `#F4EFE7` | |
| Default border | `wayly-neutral-200` | `#E7E0D5` | |
| Body text | `wayly-neutral-900` | `#1C2B2D` | Warm ink — AAA on bg |
| Muted text | `wayly-neutral-700` | `#524B42` | AA on white |

### Semantic colours
| | Light | Base | Dark |
|---|---|---|---|
| Success | `#E4F0E6` | `#2E7D4F` | `#1B5733` |
| Warning | `#FBF0DA` | `#B7791F` | `#875A12` |
| Error | `#FBE7E4` | `#C0392B` | `#8E2A20` |
| Info | `#E5EFF4` | `#1F6F8B` | `#154E62` |

## Typography
- **Fraunces** (variable serif) — h1–h4 headings · 600 weight · letter-spacing -0.01 to -0.02em
- **Inter** (humanist sans) — h5/h6, body, UI, forms · 400 body / 600 emphasis
- **IBM Plex Mono** — money, budgets, statement tables · tabular figures

| | Desktop | Mobile |
|---|---|---|
| H1 | 3rem / 48px | 2.25rem / 36px |
| H2 | 2.25rem / 36px | 1.875rem / 30px |
| H3 | 1.75rem / 28px | 1.5rem / 24px |
| H4 | 1.375rem / 22px | same |
| Body Large | 1.1875rem / 19px | same |
| Body | 1.0625rem / 17px | same (never < 16px) |
| Body Small | 0.9375rem / 15px | same |
| Caption | 0.8125rem / 13px | same |

Body line-height 1.6. Reading content 720px (`.prose-spec` utility) at 19px line-height 1.7.

## Spacing
4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128.
- Card padding 24px (20px mobile)
- Modal padding 32px (24px mobile)
- Section spacing 80–96px desktop / 48–64px mobile

## Radii
- Buttons + inputs: 10px (`--radius`)
- Cards: 16px (`rounded-card`)
- Pills: 9999px (`rounded-pill`)

## Focus ring
Global `:focus-visible` → 3px `#C2683D` clay outline with 2px offset. Never the default blue, never removed. Applied via `index.css` (no per-component work).

## Touch targets
- Web: 48px min height
- Mobile primary: 56px (`.tap-primary`)
- Participant view: 60px (`.tap-participant`)

## Motion
- Easing: `cubic-bezier(0.2, 0, 0, 1)` (`ease-spec`)
- Durations: 150ms hover · 200–250ms state · 300ms modal · never slower than 400ms
- `prefers-reduced-motion` collapses to 1ms transitions globally

## Component conventions

### Buttons
- Primary: `bg-wayly-teal-600 text-white rounded-input min-h-12 px-6 font-semibold`
- Secondary: `bg-white border-1.5 border-wayly-teal-600 text-wayly-teal-600`
- Tertiary: text-only with `text-wayly-teal-600 underline-on-hover`
- Accent CTA: `.btn-accent` utility — Clay 500 fill, sparingly used for the SINGLE most important action on a page

### Cards
- `.card-spec` — `bg-white rounded-card p-6 shadow-card`
- `.card-callout` — `bg-wayly-teal-50` with 4px teal-600 left border for important inline content

### Bands (full-width CTA strips)
- `.band-primary` — Teal 50 wash
- `.band-sage` — Sage 50 wash

### Form inputs
- `border-1.5 border-wayly-neutral-300 rounded-input min-h-12 px-4 text-[17px]`
- Focus → 3px Clay ring (global) + Teal 600 border
- Error → red border + icon + `aria-invalid="true"`
- Labels ALWAYS visible above the field (never placeholder-as-label)

## Backward compatibility
Legacy tokens kept (mapped to spec equivalents):
- `--kindred-primary` → `#0E4D52` (teal-ink 600)
- `--kindred-gold` → `#A5512B` (clay 500)
- `--kindred-sage` → `#425F47` (sage 600)
- `--kindred-text` → `#1C2B2D` (warm ink)
- `wayly.navy` Tailwind class → teal-ink
- `wayly.cyan` Tailwind class → clay 500
- `.wayly-gradient-text` → solid teal-ink (no rainbow — spec rejects gradient overload)
- `.wayly-gradient-bg` → calm teal-only wash

This means 90% of existing components shift visually with zero code changes.

## What NOT to do
- Pure black on pure white (halation for ageing eyes — use warm ink on warm bg)
- Sans-serif everywhere (loses warmth — Fraunces headings are a differentiator)
- Generic medical blue / corporate cold blue (we are not a bank or hospital)
- Bupa orange / Medibank red / Anglicare green / MyGov navy — competitor palettes
- 3D illustrations · stock "hand on shoulder" elderly photos · emoji as design elements
- Gradients beyond a single subtle brand wash
- Body text below 16px · text contrast below AA

See `/app/frontend/src/index.css` for the implementation.
