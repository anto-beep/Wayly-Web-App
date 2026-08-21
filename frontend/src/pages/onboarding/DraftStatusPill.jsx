/**
 * Draft-status pill for the onboarding wizard header.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React from "react";
import { Loader2, Cloud, CloudOff } from "lucide-react";
import { relativeTime } from "./helpers";

export default function DraftStatusPill({ status }) {
    if (!status || status.state === "idle") return null;
    if (status.state === "saving") {
        return (
            <span
                className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-muted-k"
                data-testid="onboarding-draft-status"
                data-state="saving"
            >
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving draft…
            </span>
        );
    }
    if (status.state === "error") {
        return (
            <span
                className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-terracotta"
                data-testid="onboarding-draft-status"
                data-state="error"
            >
                <CloudOff className="h-3.5 w-3.5" /> Draft not saved
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-muted-k"
            data-testid="onboarding-draft-status"
            data-state="saved"
        >
            <Cloud className="h-3.5 w-3.5 text-sage" />
            Draft saved{status.savedAt ? ` · ${relativeTime(status.savedAt)}` : ""}
        </span>
    );
}
