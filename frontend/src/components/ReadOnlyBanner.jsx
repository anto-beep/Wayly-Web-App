/**
 * ReadOnlyBanner, Wave 2 §4.5 pinned Clay banner.
 *
 * Appears at the top of every authenticated page when the user's trial has
 * expired and they are not subscribed. Copy and CTA are verbatim from the
 * Dec 2026 refit brief.
 */
import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

export default function ReadOnlyBanner() {
    const isExpired = useExpiredTrial();
    if (!isExpired) return null;
    return (
        <div
            data-testid="read-only-banner"
            role="status"
            className="w-full px-4 py-3 bg-wayly-clay-500 text-white flex items-center gap-3"
        >
            <Lock className="h-4 w-4 flex-none" aria-hidden="true" />
            <p className="flex-1 text-sm leading-relaxed font-medium">
                Your trial has ended. Subscribe to add or change anything. You can still view your existing data.
            </p>
            <Link
                to="/settings/billing"
                data-testid="read-only-banner-subscribe"
                className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#1C2B2D] font-semibold text-xs px-3.5 py-1.5 hover:bg-kindred focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-wayly-clay-500"
            >
                Subscribe
            </Link>
        </div>
    );
}
