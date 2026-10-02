import React from "react";

/**
 * Inline embedded Calendly calendar.
 * We render a direct <iframe> (not the widget.js loader) because widget.js
 * dynamically shrinks the iframe to its measured content on some hosts,
 * leaving the surrounding container with dead whitespace. A plain iframe
 * with an explicit height always renders the full picker.
 *
 * primary_color=a5512b matches Wayly clay-500.
 * hide_landing_page_details / hide_gdpr_banner drop straight into the
 * calendar picker.
 */
const CALENDLY_BASE = "https://calendly.com/hello-wayly/30min";
const DEFAULT_PARAMS = new URLSearchParams({
    primary_color: "a5512b",
    hide_landing_page_details: "1",
    hide_gdpr_banner: "1",
    background_color: "fbf8f3",
    text_color: "0e4d52",
    embed_type: "Inline",
}).toString();

export default function CalendlyInline({
    url = `${CALENDLY_BASE}?${DEFAULT_PARAMS}`,
    height = 720,
    className = "",
}) {
    return (
        <iframe
            src={url}
            title="Book a 30 minute call with Wayly"
            data-testid="calendly-inline-widget"
            className={`w-full block border-0 ${className}`}
            style={{ height: `${height}px`, minHeight: `${height}px` }}
            allow="camera; microphone; autoplay; encrypted-media; fullscreen"
        />
    );
}
