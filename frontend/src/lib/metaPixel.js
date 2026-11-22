// Meta Pixel event helpers.
//
// The pixel is bootstrapped (with consent REVOKED) on public pages only, by
// components/analytics/GoogleAds.jsx, and only starts sending once the visitor
// grants advertising consent via the cookie banner. These helpers are safe
// no-ops until window.fbq exists.
//
// PRIVACY: never pass statement contents, dollar amounts, classification
// levels, names, emails or service details into any event. The event names
// below are fixed and must match the approved set exactly.

export function fbqTrack(...args) {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq(...args);
    }
}

// Fire once when a free tool finishes showing its result. No parameters.
export function trackToolComplete() {
    fbqTrack("trackCustom", "ToolComplete");
}
