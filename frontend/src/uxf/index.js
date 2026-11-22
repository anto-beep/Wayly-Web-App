/**
 * UXF-1 v3 public API surface.
 *
 * Import from `@/uxf` (or `frontend/src/uxf`) anywhere in the codebase.
 * Individual surfaces adopt these behind their `uxf_v3.<surface>` flag.
 */

// ---------- Tokens + theme ----------
export { ThemeProvider, useTheme } from "./theme.jsx";

// ---------- Feature flags ----------
export { isEnabled, flags, _setFlagForTest } from "./flags.js";

// ---------- Copy library ----------
export { default as COPY, interpolate } from "./copy.js";

// ---------- Primitives ----------
export { LiveRegionHost, announce, useAnnounce } from "./primitives/LiveRegion.jsx";
export { useRouteFocus } from "./primitives/useRouteFocus.js";

// ---------- Canonical components (Workstream A) ----------
export { StandingBanner } from "./components/StandingBanner.jsx";
export { StagedProgress } from "./components/StagedProgress.jsx";
export {
    Skeleton,
    SkeletonListRow,
    SkeletonToolPage,
    SkeletonDetailCard,
} from "./components/Skeleton.jsx";
export { useLoadingTimeout, TIMEOUTS } from "./components/useLoadingTimeout.js";
export { InlineFieldError } from "./components/InlineFieldError.jsx";
export { EmptyStateFirstUse, NoResultsWithRefinements } from "./components/EmptyState.jsx";
export { ConfirmDialog } from "./components/ConfirmDialog.jsx";
export { DataFreshnessIndicator } from "./components/DataFreshnessIndicator.jsx";
export { CrossToolSourceIndicator } from "./components/CrossToolSourceIndicator.jsx";
export { AutomatedDecisionDisclosure } from "./components/AutomatedDecisionDisclosure.jsx";

// ---------- Wave 3 additions ----------
export { SessionExpiryWarning } from "./components/SessionExpiryWarning.jsx";
export { ArtifactGeneration } from "./components/ArtifactGeneration.jsx";
export { GlobalStandingBannerHost } from "./GlobalStandingBannerHost.jsx";
export {
    useBlockedActionQueue,
    enqueueBlockedAction,
    flushBlockedActionQueue,
} from "./components/BlockedActionQueue.js";

// ---------- Wave 4 mobile parity ----------
export { haptic } from "./haptics.js";

// ---------- One-time side effect: inject shimmer keyframes ----------
// Kept alongside the barrel so any consumer that imports from `@/uxf`
// gets the keyframe registered exactly once.
if (typeof document !== "undefined" && !document.getElementById("uxf-keyframes")) {
    const style = document.createElement("style");
    style.id = "uxf-keyframes";
    style.textContent = `
        @keyframes uxf-shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    `;
    document.head.appendChild(style);
}
