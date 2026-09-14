import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";

/**
 * Wayly-wide Automated Decision Making disclosure (PPC-1 v2 §WS14, extended to
 * be reusable across tools). Renders as an inline "How this flag works" link
 * that opens a modal with three sections:
 *
 *   1. What we compared, the specific inputs and reference data used.
 *   2. How the categorisation was computed, the deterministic rule.
 *   3. This is an automated categorisation, no human review, how to
 *      escalate via Report an issue.
 *
 * Consumers pass:
 *   - toolName         , human-readable name shown in the modal title.
 *   - inputSummary     , short line describing what was checked.
 *   - referenceLabel   , what the input was compared against.
 *   - computationRule  , the deterministic rule (plain language).
 *   - noHumanNote      , optional extra sentence on the "no human" claim.
 */
export default function ADMDisclosure({
    toolName,
    inputSummary,
    referenceLabel,
    computationRule,
    noHumanNote,
    open,
    onOpenChange,
    testIdPrefix = "adm",
}) {
    useEffect(() => {
        if (open) {
            try { track.ppc.admDisclosureOpened({ tool: toolName }); } catch (_) { /* noop */ }
        }
    }, [open, toolName]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid={`${testIdPrefix}-modal`}>
                <DialogHeader>
                    <DialogTitle>How this flag works</DialogTitle>
                    <DialogDescription>
                        Wayly is required to disclose when a substantially automated decision is being made about you. This modal explains what we compared, how the result was computed, and what to do if you disagree.
                    </DialogDescription>
                </DialogHeader>
                <div className="text-sm text-primary-k space-y-3 leading-relaxed">
                    <p>
                        <strong>What we compared.</strong>{" "}
                        {inputSummary} against {referenceLabel}.
                    </p>
                    <p>
                        <strong>How the categorisation was computed.</strong>{" "}
                        {computationRule}
                    </p>
                    <p>
                        <strong>This is an automated categorisation.</strong>{" "}
                        {"No human reviews individual results in "}{toolName}{". "}
                        {noHumanNote || 'If you disagree with the categorisation, use "Report an issue with this result" and a Wayly team member will respond within 3 business days.'}
                    </p>
                    <p className="text-xs text-muted-k">
                        {"Under the Privacy Act 2024 amendments (in force December 2026), we are required to disclose when a substantially automated decision is being made about you. This is one of those decisions."}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The inline text-button that triggers the disclosure modal. Kept separate so
 * consumers can position it beside a result rather than repeat markup.
 */
export function ADMDisclosureTrigger({ onClick, testId = "adm-link" }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-xs text-primary-k underline decoration-dotted underline-offset-2 hover:text-clay transition-colors"
            data-testid={testId}
        >
            How this flag works
        </button>
    );
}
