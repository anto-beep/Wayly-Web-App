/**
 * Skeleton primitives (spec 3.4).
 *
 * Every route MUST reserve layout before real content arrives, using a
 * skeleton that mirrors the final structure so nothing shifts once data
 * lands. Skeleton opacity + shimmer read from token variables so light
 * and dark modes automatically pick the right base + shimmer intensity.
 */
import React from "react";

/**
 * A single grey block with subtle shimmer. Compose these to mock the
 * final layout at approximately the right dimensions.
 */
export function Skeleton({
    className = "",
    width = "100%",
    height = 12,
    radius = "var(--uxf-radius-md)",
    testId,
}) {
    return (
        <div
            className={`uxf-skeleton ${className}`}
            data-testid={testId || "uxf-skeleton"}
            aria-hidden="true"
            style={{
                width,
                height,
                borderRadius: radius,
                background: "var(--uxf-skeleton-base)",
                backgroundImage:
                    "linear-gradient(90deg, var(--uxf-skeleton-base) 0%, var(--uxf-skeleton-shimmer) 50%, var(--uxf-skeleton-base) 100%)",
                backgroundSize: "200% 100%",
                animation: "uxf-shimmer 1.4s ease-in-out infinite",
            }}
        />
    );
}

/**
 * Skeleton row for list-style views (statements register, correspondence
 * log, care-plan store).
 */
export function SkeletonListRow({ testId }) {
    return (
        <div
            className="flex items-center gap-4 p-4 rounded-lg"
            data-testid={testId || "uxf-skeleton-list-row"}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            <Skeleton width={44} height={44} radius="999px" />
            <div className="flex-1 space-y-2">
                <Skeleton width="60%" height={12} />
                <Skeleton width="40%" height={10} />
            </div>
            <Skeleton width={80} height={28} radius="var(--uxf-radius-sm)" />
        </div>
    );
}

/**
 * Skeleton for a tool page (hero title + body paragraph + result block).
 */
export function SkeletonToolPage({ testId }) {
    return (
        <div className="space-y-6" data-testid={testId || "uxf-skeleton-tool-page"}>
            <div className="space-y-3">
                <Skeleton width="35%" height={14} />
                <Skeleton width="70%" height={28} />
                <Skeleton width="80%" height={12} />
            </div>
            <div className="space-y-3">
                <Skeleton width="100%" height={44} />
                <Skeleton width="100%" height={44} />
                <Skeleton width="100%" height={44} />
            </div>
            <Skeleton width={180} height={44} radius="999px" />
        </div>
    );
}

/**
 * Skeleton for a detail card (dashboard insight, statement summary).
 */
export function SkeletonDetailCard({ testId }) {
    return (
        <div
            className="p-6 rounded-lg space-y-3"
            data-testid={testId || "uxf-skeleton-detail-card"}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            <Skeleton width="45%" height={14} />
            <Skeleton width="80%" height={24} />
            <div className="space-y-2 pt-2">
                <Skeleton width="100%" height={10} />
                <Skeleton width="95%" height={10} />
                <Skeleton width="60%" height={10} />
            </div>
        </div>
    );
}

// Global keyframes injected once by the app root via the tokens CSS. We
// export the keyframe name for clarity; the animation is declared in
// tokens.css via a `@keyframes uxf-shimmer` block appended at import
// time (see uxf/index.js).
export const SHIMMER_KEYFRAME = "uxf-shimmer";

export default Skeleton;
