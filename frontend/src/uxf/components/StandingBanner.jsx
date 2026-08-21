/**
 * StandingBanner (spec 3.1).
 *
 * A persistent, dismissible-only-by-the-user inline notice. Replaces the
 * auto-dismissing toast for anything that (a) carries a reference number
 * or destination, (b) is a consequential state change, or (c) needs to
 * remain visible until acknowledged.
 *
 * Renders directly in the document flow above the primary result panel
 * of the surface that owns the event. Never absolutely positioned.
 *
 * Tone (spec Section 2):
 *   - present tense, active voice, second person
 *   - no em/en dashes
 *   - no stalling or self-praising language
 */
import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { announce } from "../primitives/LiveRegion";

const VARIANTS = {
    success: {
        icon: CheckCircle2,
        bg:   "var(--uxf-success-bg)",
        fg:   "var(--uxf-success)",
        text: "var(--uxf-text)",
        priority: "polite",
    },
    error: {
        icon: AlertCircle,
        bg:   "var(--uxf-error-bg)",
        fg:   "var(--uxf-error)",
        text: "var(--uxf-text)",
        priority: "assertive",
    },
    warning: {
        icon: AlertTriangle,
        bg:   "var(--uxf-warning-bg)",
        fg:   "var(--uxf-warning)",
        text: "var(--uxf-text)",
        priority: "polite",
    },
    info: {
        icon: Info,
        bg:   "var(--uxf-info-bg)",
        fg:   "var(--uxf-info)",
        text: "var(--uxf-text)",
        priority: "polite",
    },
};

export function StandingBanner({
    variant = "info",
    title,
    children,
    onDismiss,
    action,           // { label, onClick }
    announceOnMount = true,
    testId,
}) {
    const cfg = VARIANTS[variant] || VARIANTS.info;
    const Icon = cfg.icon;

    // Announce once when the banner mounts, so screen readers hear the
    // update without needing to scroll to the banner.
    useEffect(() => {
        if (!announceOnMount) return;
        const msg = [title, typeof children === "string" ? children : ""]
            .filter(Boolean)
            .join(". ");
        if (msg) announce({ message: msg, priority: cfg.priority });
    }, [announceOnMount, title, children, cfg.priority]);

    return (
        <div
            className="rounded-lg p-4 flex items-start gap-3"
            role={variant === "error" ? "alert" : "status"}
            data-testid={testId || `uxf-standing-banner-${variant}`}
            style={{
                backgroundColor: cfg.bg,
                border: "1px solid var(--uxf-border)",
                color: cfg.text,
            }}
        >
            <Icon
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                style={{ color: cfg.fg }}
                aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
                {title && (
                    <div className="font-semibold text-base mb-0.5" style={{ color: cfg.text }}>
                        {title}
                    </div>
                )}
                {children && (
                    <div className="text-sm leading-relaxed" style={{ color: "var(--uxf-muted)" }}>
                        {children}
                    </div>
                )}
                {action && (
                    <div className="mt-2">
                        <button
                            type="button"
                            onClick={action.onClick}
                            className="text-sm font-semibold underline underline-offset-2 hover:no-underline"
                            style={{ color: cfg.fg }}
                            data-testid={`${testId || "uxf-standing-banner"}-action`}
                        >
                            {action.label}
                        </button>
                    </div>
                )}
            </div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    className="flex-shrink-0 -mt-1 -mr-1 p-1 rounded hover:bg-black/5"
                    data-testid={`${testId || "uxf-standing-banner"}-dismiss`}
                    style={{ color: "var(--uxf-muted)" }}
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

export default StandingBanner;
