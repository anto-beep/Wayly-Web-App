/**
 * AutomatedDecisionDisclosure (spec 3.23).
 *
 * Sits directly below the primary result of any tool that produces an
 * automated determination (CE-2, Decoder, Support Plan Reviewer, PPC,
 * Classification, LF-1, Ask Wayly). Copy default is the ACL/solicitor-
 * approved default in COPY.disclosure.default; per-tool callers may
 * pass a `body` override once a tool-specific string is signed off.
 */
import React from "react";
import { Info } from "lucide-react";
import COPY from "../copy";

export function AutomatedDecisionDisclosure({
    body,
    contactUrl,
    testId,
}) {
    return (
        <div
            className="rounded-lg p-4 flex items-start gap-3"
            data-testid={testId || "uxf-automated-decision-disclosure"}
            role="note"
            style={{
                backgroundColor: "var(--uxf-info-bg)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            <Info
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                aria-hidden="true"
                style={{ color: "var(--uxf-info)" }}
            />
            <div className="flex-1 text-sm leading-relaxed" style={{ color: "var(--uxf-text)" }}>
                <p>{body || COPY.disclosure.default}</p>
                {contactUrl && (
                    <p className="mt-1">
                        <a
                            href={contactUrl}
                            className="font-semibold underline underline-offset-2 hover:no-underline"
                            style={{ color: "var(--uxf-primary)" }}
                            data-testid={`${testId || "uxf-automated-decision-disclosure"}-contact`}
                        >
                            Contact our team
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
}

export default AutomatedDecisionDisclosure;
