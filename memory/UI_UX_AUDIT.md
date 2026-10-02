# Wayly UI/UX Overhaul — Completion Audit (Jun 2026)

Status of every item from the original system-wide UI/UX request, across **Web** and **Mobile**.
Legend: ✅ Done · 🟡 Partial · ⛔ Outstanding

## Global
| Item | Web | Mobile |
|---|---|---|
| No plain white/brown backgrounds; use brand colours (Clay/Teal/Sage/Terracotta) for panels | ✅ | ✅ |
| Dates formatted DD/MM/YYYY | ✅ | ✅ |
| White text on coloured backgrounds (light + dark) | ✅ global rule now auto-whitens all `panel-solid-teal/clay/sage` panels; dark-mode verified on About/AI Tools/Settings | 🟡 explicit on redesigned screens |
| Remove AI-like em-dashes from greetings | ✅ (About & tools) — global greeting sweep not re-verified | 🟡 |
| Widen screens for AI tools & Guided Journeys | ✅ | ✅ |

## Functional
| Item | Web | Mobile |
|---|---|---|
| Duplicate file check for Invoices (SHA, like statements) | ✅ | ✅ |

## Tool redesigns
| Tool | Web | Mobile |
|---|---|---|
| Classification Self-Check (prefill, plain-English summary, bands, comparison graphic) | ✅ | ✅ |
| Provider Price Checker (colour-coded stat cards, median comparison graphic) | ✅ | ✅ |
| Contribution Estimator (colour-coded, less text, clearer graphics) | ✅ | ✅ |
| Support Plan Reviewer (prefill classification/budget, block attachments while running, clear summaries/goals; mobile async polling) | ✅ | ✅ |

## Screen redesigns
| Screen | Web | Mobile |
|---|---|---|
| Statement Details (distinct colours: Private Note, Ask Wayly, Stream Breakdown) | ✅ | ✅ |
| Caregiver Dashboard | ✅ | ✅ |
| Settings (incl. latest teal card + strong-clay participant rows) | ✅ | 🟡 verify parity |
| Participant Profile (solid brand panels, white text, timeline) | ✅ | 🟡 verify parity |
| **About Page** (less text, visual graphics, white font) | ✅ rewritten | ✅ new native screen |
| **Landing Page** (bold brand-panel treatment + visual graphics + white text) | ⛔ only agentic tweaks so far | ⛔ (no mobile marketing Landing) |
| **Resources** (icons + coloured cards to match About) | 🟡 backgrounds only | ⛔ |

## New requests (this session)
| Item | Status |
|---|---|
| Accessibility widget present on frontend | ✅ fixed (was hidden by a `transform` containing-block bug in ScrollHideWidgets) |
| Change dark↔light from the frontend (no backend) | ✅ via accessibility widget toggle |
| Default LIGHT on new session; reset to light on logout | ✅ |
| AI Tools "Open tool" link invisible in dark mode | ✅ fixed (force-white on tiles overrides the global dark `a` rule) |
| More visual graphics (not just coloured cards) — illustrations/iconography/motion | ⛔ outstanding across pages |
| Dark-mode sweep of every redesigned page (white/legible on panels) | 🟡 AI Tools verified; About/Settings/Participant Profile/Landing/Resources pending |

## Outstanding queue (recommended order)
1. **Dark-mode sweep** of About (web), Settings, Participant Profile — confirm white/legible on the new solid panels.
2. **Landing refresh** (web) — bold brand-panel sections + real visual graphics + white text.
3. **Resources visuals** (web) — icons + coloured cards matching About; mirror to mobile.
4. **More visual graphics** — add illustration/graphic elements (not just colour) to About, Landing, Resources, dashboards.
5. **Mobile parity** re-verification for Settings + Participant Profile.
