# UXF-1 v3 — Unified Feedback States System

This directory is the **single source of truth** for every UXF-1 v3 component, primitive, token, and copy string. Nothing outside `src/uxf/` may define its own semantic colour, its own loading spinner, its own destructive-confirm pattern, or its own "toast".

Spec: `/app/docs/UXF-1-v3-spec.md`
Phase 0 audit: `/app/docs/audits/UXF-1-v3-phase-0-audit.md`

## Quick start

```jsx
import {
    ThemeProvider, LiveRegionHost, useRouteFocus,
    StandingBanner, StagedProgress, Skeleton, SkeletonToolPage,
    InlineFieldError, EmptyStateFirstUse, NoResultsWithRefinements,
    ConfirmDialog, DataFreshnessIndicator, CrossToolSourceIndicator,
    AutomatedDecisionDisclosure,
    useLoadingTimeout, TIMEOUTS,
    announce, useAnnounce,
    isEnabled, COPY, interpolate,
} from "@/uxf";
```

## Rollout status

Every surface adopts UXF-1 v3 behind a per-surface feature flag
(`uxf_v3.<surface>`). See `flags.js` for defaults + rollout order.

Flip a flag locally:

```js
localStorage.setItem("uxf_flags", JSON.stringify({ "uxf_v3.decoder": true }));
```

## Editorial rules (spec Section 2)

- Present tense, active voice, second person.
- No em dashes (—) or en dashes (–). Use a comma or a full stop.
- No stalling language ("please wait", "one moment") — say what is happening.
- No self-praise ("your beautiful dashboard is loading").
- Copy lives in `copy.js` so translators + editors work from one file.

## QA lint

Run the UXF QA lint from `frontend/`:

```
yarn uxf-lint          # warn only
yarn uxf-lint:strict   # exit 1 on any warning
```

Flags:
- **[hex]** — hardcoded `#RRGGBB` in components.
- **[toast]** — sonner `toast(` calls in files that also import from `@/uxf`.
- **[contrast]** — Tailwind opacity modifiers (`bg-primary-k/10`) that
  can drop below AAA.

## Dark mode

Toggle via the manual switch in `Settings.jsx` (writes
`localStorage.wayly:app:appearance`). System preference is honoured
until the person picks manually. See `theme.jsx` for the ThemeProvider
API.

Tokens live in `tokens.css`. All 40 pairings verify to WCAG 2.1 AAA;
see audit Section 16 for the contrast matrix.

## Testing

```
yarn test --testPathPattern=uxf
```

Twelve pure-logic tests exercise `copy.js`, `interpolate()`, and the
`useLoadingTimeout` ceilings.
