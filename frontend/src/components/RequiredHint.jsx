import React from "react";

/**
 * Wayly, accessible "required field" indicator system.
 *
 * The Product decision (Feb 2026): every required field must be *clearly*
 * marked. A single red `*` is not enough, we surface the word "Required"
 * in a subdued clay chip on the right of the field label.
 *
 * Usage:
 *   <FieldLabel htmlFor="first-name" required>First name</FieldLabel>
 *   <input id="first-name" required aria-required="true" ... />
 *
 * Or, when you already have your own <label>:
 *   <label className="...">
 *     <FieldLabelText required>First name</FieldLabelText>
 *     <input ... />
 *   </label>
 */
export function RequiredBadge({ className = "" }) {
    return (
        <span
            className={`inline-flex items-center rounded-full bg-terracotta/10 text-terracotta text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${className}`}
            aria-hidden="true"
            data-testid="required-badge"
        >
            Required
        </span>
    );
}

export function OptionalBadge({ className = "" }) {
    return (
        <span
            className={`inline-flex items-center rounded-full bg-primary-k/5 text-muted-k text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 ${className}`}
            aria-hidden="true"
            data-testid="optional-badge"
        >
            Optional
        </span>
    );
}

/**
 * A full <label> that renders "Field name        Required".
 * `htmlFor` optional, falls back to a plain span if not passed.
 */
export function FieldLabel({
    htmlFor,
    children,
    required = false,
    optional = false,
    className = "",
    hint,
}) {
    const Component = htmlFor ? "label" : "div";
    return (
        <Component
            {...(htmlFor ? { htmlFor } : {})}
            className={`flex items-center justify-between gap-2 text-sm text-muted-k ${className}`}
        >
            <span className="text-primary-k font-medium">
                {children}
                {required && <span className="sr-only"> (required)</span>}
                {optional && <span className="sr-only"> (optional)</span>}
            </span>
            <span className="flex items-center gap-2">
                {hint && <span className="text-xs text-muted-k">{hint}</span>}
                {required && <RequiredBadge />}
                {optional && !required && <OptionalBadge />}
            </span>
        </Component>
    );
}

/**
 * Inline label text that only renders the "Required" badge inline with the
 * label text, useful when you're already inside a <label> and just want the
 * text portion.
 */
export function FieldLabelText({ children, required = false, optional = false }) {
    return (
        <span className="flex items-center justify-between gap-2">
            <span className="text-primary-k font-medium text-sm">
                {children}
                {required && <span className="sr-only"> (required)</span>}
            </span>
            {required && <RequiredBadge />}
            {optional && !required && <OptionalBadge />}
        </span>
    );
}

export default FieldLabel;
