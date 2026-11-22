/**
 * EmptyStateFirstUse + NoResultsWithRefinements (spec 3.13, 3.14).
 *
 * Two visually distinct empty states so the person's mental model is
 * accurate: "I haven't used this yet" is different from "my search
 * has no matches". Same underlying shell, different copy + CTA.
 */
import React from "react";

/**
 * First-use empty state. Shown when the person has never engaged with
 * this feature. Copy is welcoming, CTA is the primary onboarding action.
 */
export function EmptyStateFirstUse({ icon: Icon, title, body, primaryCta, testId }) {
    return (
        <div
            className="rounded-xl p-10 text-center flex flex-col items-center gap-4"
            data-testid={testId || "uxf-empty-first-use"}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            {Icon && (
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--uxf-info-bg)" }}
                >
                    <Icon className="w-6 h-6" style={{ color: "var(--uxf-primary)" }} aria-hidden="true" />
                </div>
            )}
            <div className="max-w-md space-y-2">
                <h3 className="text-lg font-semibold" style={{ color: "var(--uxf-text)" }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--uxf-muted)" }}>{body}</p>
            </div>
            {primaryCta && (
                <button
                    type="button"
                    onClick={primaryCta.onClick}
                    className="mt-2 px-5 py-2.5 rounded-full text-sm font-semibold"
                    data-testid={`${testId || "uxf-empty-first-use"}-cta`}
                    style={{
                        backgroundColor: "var(--uxf-primary)",
                        color: "var(--uxf-primary-fg)",
                    }}
                >
                    {primaryCta.label}
                </button>
            )}
        </div>
    );
}

/**
 * No-results state. Shown when a filter or search returned nothing.
 * Primary action is always "clear filters".
 */
export function NoResultsWithRefinements({ title, body, onClear, testId }) {
    return (
        <div
            className="rounded-xl p-10 text-center flex flex-col items-center gap-4"
            data-testid={testId || "uxf-no-results"}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px dashed var(--uxf-border)",
            }}
        >
            <div className="max-w-md space-y-2">
                <h3 className="text-base font-semibold" style={{ color: "var(--uxf-text)" }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--uxf-muted)" }}>{body}</p>
            </div>
            {onClear && (
                <button
                    type="button"
                    onClick={onClear}
                    className="mt-1 text-sm font-semibold underline underline-offset-2 hover:no-underline"
                    data-testid={`${testId || "uxf-no-results"}-clear`}
                    style={{ color: "var(--uxf-primary)" }}
                >
                    Clear filters
                </button>
            )}
        </div>
    );
}

export default EmptyStateFirstUse;
