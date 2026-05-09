import React from "react";
import { AlertTriangle } from "lucide-react";

const DEFAULT_TEXT = "Wayly's AI tools are designed to help you understand your Support at Home funding — but they are not always accurate. Results may contain errors, omissions, or misinterpretations. Always verify important figures with your provider or My Aged Care before taking action. This is not financial, legal, or clinical advice.";

/**
 * AIAccuracyBanner
 * Persistent compliance banner displayed above every AI tool input and
 * inside every dashboard view that surfaces AI-generated output.
 *
 * Variant:
 *   - "default": full disclaimer text from the spec
 *   - "tool":    tool-specific override via `text` prop
 *   - "anomaly": short "AI-generated. May be incorrect." inline tag
 */
export default function AIAccuracyBanner({ text, variant = "default", className = "" }) {
    if (variant === "anomaly") {
        return (
            <span
                className={`inline-flex items-center gap-1.5 text-xs ${className}`}
                style={{ color: "#92400E" }}
                data-testid="ai-anomaly-disclaimer"
            >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                This flag is AI-generated and may be incorrect. Verify before acting.
            </span>
        );
    }
    return (
        <div
            className={`flex items-start gap-3 rounded-lg border p-3.5 ${className}`}
            style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }}
            data-testid="ai-accuracy-banner"
            role="note"
        >
            <AlertTriangle
                className="h-5 w-5 flex-shrink-0 mt-0.5"
                style={{ color: "#B45309" }}
                aria-hidden="true"
            />
            <p className="text-sm leading-relaxed" style={{ color: "#78350F", fontSize: "14px" }}>
                {text || DEFAULT_TEXT}
            </p>
        </div>
    );
}

export const TOOL_DISCLAIMERS = {
    "statement-decoder": "This tool is powered by AI. Results may contain errors, omissions, or misinterpretations. Dollar figures, stream classifications, and anomaly flags should be verified against your original statement before raising them with your provider. This is not financial, legal, or clinical advice.",
    "budget-calculator": "This calculator produces estimates based on current Support at Home program rates. Figures are indicative only and may not reflect your exact entitlements. Verify with your provider or My Aged Care. Not financial advice.",
    "provider-price-checker": "Price comparisons are based on available published data and may not reflect a provider's most current price schedule. Prices listed are indicative. Contact your provider directly to confirm current rates. Not financial advice.",
    "classification-self-check": "This tool provides an indicative classification estimate only. Only My Aged Care and the Independent Assessment Tool can assign a formal classification. This tool does not replace an official assessment. Results are for information purposes only.",
    "reassessment-letter": "This tool drafts letters for your review. Always read the full draft before sending. The AI may make errors — check all dates, names, and facts against your own records. Sending a letter is your decision. Wayly does not send anything on your behalf without your explicit review and action.",
    "contribution-estimator": "Contribution estimates are based on current program rates and the pension status you have entered. Your actual contribution depends on your exact income assessment, which only Services Australia can determine. These figures are indicative only. Not financial advice.",
    "care-plan-reviewer": "This tool checks your care plan against program guidelines and is for information only. It does not constitute clinical advice. Decisions about your care should be made in consultation with your care manager and healthcare providers.",
    "family-coordinator": "This AI assistant answers questions about the Support at Home program based on publicly available information. It may make errors or be out of date. For urgent issues contact My Aged Care on 1800 200 422. For advocacy support contact OPAN on 1800 700 600. This is not legal, financial, or clinical advice.",
};
