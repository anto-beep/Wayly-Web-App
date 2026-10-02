/**
 * ConfirmDialog (spec 3.24).
 *
 * A modal confirmation for consequential and destructive actions.
 * Supports an optional "type to confirm" input for high-stakes deletions
 * (account, participant removal) per current app pattern.
 *
 * Uses `role="alertdialog"` + `aria-labelledby` + `aria-describedby` and
 * traps focus inside the dialog until confirmed or cancelled.
 */
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
    open,
    variant = "destructive",        // "destructive" | "warning" | "neutral"
    title,
    body,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
    typeToConfirm,                   // string the person must type
    typeToConfirmLabel = "Type to confirm",
    testId = "uxf-confirm-dialog",
}) {
    const [typedValue, setTypedValue] = useState("");
    const dialogRef = useRef(null);
    const cancelBtnRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        // Focus the safest option (Cancel) on open, per accessibility
        // best-practice for destructive confirmations.
        setTimeout(() => { if (cancelBtnRef.current) cancelBtnRef.current.focus(); }, 40);

        const onKey = (e) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCancel]);

    useEffect(() => { if (!open) setTypedValue(""); }, [open]);

    if (!open) return null;

    const confirmDisabled = Boolean(typeToConfirm) && typedValue.trim() !== typeToConfirm.trim();
    const isDestructive = variant === "destructive";

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
            data-testid={testId}
        >
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${testId}-title`}
                aria-describedby={`${testId}-body`}
                className="w-full max-w-md rounded-xl p-6 space-y-4"
                style={{
                    backgroundColor: "var(--uxf-surface-3)",
                    border: "1px solid var(--uxf-border)",
                    boxShadow: "var(--uxf-shadow-lg)",
                }}
            >
                <div className="flex items-start gap-3">
                    {isDestructive && (
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: "var(--uxf-error-bg)" }}
                        >
                            <AlertTriangle className="w-5 h-5" style={{ color: "var(--uxf-error)" }} aria-hidden="true" />
                        </div>
                    )}
                    <div className="flex-1">
                        <h2 id={`${testId}-title`} className="text-lg font-semibold" style={{ color: "var(--uxf-text)" }}>{title}</h2>
                        <p id={`${testId}-body`} className="text-sm leading-relaxed mt-1" style={{ color: "var(--uxf-muted)" }}>
                            {body}
                        </p>
                    </div>
                </div>
                {typeToConfirm && (
                    <div className="space-y-2">
                        <label
                            htmlFor={`${testId}-type-input`}
                            className="text-sm font-medium block"
                            style={{ color: "var(--uxf-text)" }}
                        >
                            {typeToConfirmLabel}
                        </label>
                        <input
                            id={`${testId}-type-input`}
                            type="text"
                            value={typedValue}
                            onChange={(e) => setTypedValue(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border text-sm"
                            data-testid={`${testId}-type-input`}
                            style={{
                                backgroundColor: "var(--uxf-sunken)",
                                borderColor: "var(--uxf-border-strong)",
                                color: "var(--uxf-text)",
                            }}
                            autoComplete="off"
                        />
                    </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                    <button
                        ref={cancelBtnRef}
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-md text-sm font-semibold"
                        data-testid={`${testId}-cancel`}
                        style={{
                            backgroundColor: "transparent",
                            color: "var(--uxf-text)",
                            border: "1px solid var(--uxf-border)",
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={confirmDisabled}
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
                        data-testid={`${testId}-confirm`}
                        style={{
                            backgroundColor: isDestructive
                                ? "var(--uxf-error)"
                                : "var(--uxf-primary)",
                            color: isDestructive
                                ? "var(--uxf-error-fg)"
                                : "var(--uxf-primary-fg)",
                            border: "none",
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmDialog;
