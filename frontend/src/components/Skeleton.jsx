import React from "react";

/**
 * Skeleton — shimmering placeholder bars/cards while data loads.
 *
 * Variants:
 *   "card"   — rounded card with 3 shimmering lines (Default)
 *   "list"   — repeating row pattern (count via `rows` prop)
 *   "grid"   — N cards in a 3-column grid
 *   "stat"   — short label + tall number bar
 */
export default function Skeleton({ variant = "card", rows = 3, count = 3, className = "" }) {
    if (variant === "list") {
        return (
            <ul className={`space-y-2 ${className}`} aria-hidden="true" data-testid="skeleton-list">
                {Array.from({ length: rows }).map((_, i) => (
                    <li key={i} className="rounded-lg bg-surface-2 border border-kindred p-3 flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                            <div className="h-3 bg-kindred/40 rounded w-1/3 animate-pulse" />
                            <div className="h-2.5 bg-kindred/30 rounded w-1/2 animate-pulse" />
                        </div>
                        <div className="h-6 w-16 bg-kindred/30 rounded animate-pulse" />
                    </li>
                ))}
            </ul>
        );
    }
    if (variant === "grid") {
        return (
            <div className={`grid md:grid-cols-3 gap-4 ${className}`} aria-hidden="true" data-testid="skeleton-grid">
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-kindred bg-surface p-5 space-y-3">
                        <div className="h-4 bg-kindred/40 rounded w-1/2 animate-pulse" />
                        <div className="h-7 bg-kindred/40 rounded w-3/4 animate-pulse" />
                        <div className="h-9 bg-kindred/30 rounded w-full animate-pulse" />
                    </div>
                ))}
            </div>
        );
    }
    if (variant === "stat") {
        return (
            <div className={`bg-surface border border-kindred rounded-xl p-4 space-y-2 ${className}`} aria-hidden="true" data-testid="skeleton-stat">
                <div className="h-2.5 bg-kindred/40 rounded w-2/3 animate-pulse" />
                <div className="h-6 bg-kindred/40 rounded w-1/3 animate-pulse" />
            </div>
        );
    }
    // default: card
    return (
        <div className={`bg-surface border border-kindred rounded-2xl p-6 space-y-3 ${className}`} aria-hidden="true" data-testid="skeleton-card">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={`h-3 bg-kindred/40 rounded animate-pulse ${i === 0 ? "w-1/3" : i === rows - 1 ? "w-2/3" : "w-full"}`} />
            ))}
        </div>
    );
}
