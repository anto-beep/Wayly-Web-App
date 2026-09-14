/**
 * InlineFieldError (spec 3.8, 3.9).
 *
 * Field-level validation shown directly under the input. Never wipes
 * the input value. Uses `role="status"` (polite) so screen readers hear
 * the error the moment it changes, without stealing focus.
 */
import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * @param {Object} props
 * @param {string|null} props.error  Error message, or falsy to hide.
 * @param {string}      [props.id]   `aria-describedby` linking id.
 * @param {string}      [props.testId]
 */
export function InlineFieldError({ error, id, testId }) {
    if (!error) return null;
    return (
        <div
            role="status"
            aria-live="polite"
            className="mt-1.5 flex items-start gap-1.5 text-sm"
            id={id}
            data-testid={testId || "uxf-inline-field-error"}
            style={{ color: "var(--uxf-error)" }}
        >
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
        </div>
    );
}

export default InlineFieldError;
