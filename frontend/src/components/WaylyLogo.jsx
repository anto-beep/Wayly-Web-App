import React from "react";

/**
 * Wayly mark — the official square logo. Renders the SVG from /branding/svg/
 * so a single source-of-truth file ships everywhere. Drop-in replacement for
 * the old `<div className="h-7 w-7 ..."><HeartHandshake /></div>` pattern.
 *
 *   <WaylyLogo size={28} />              // standard navy mark
 *   <WaylyLogo size={32} variant="light" />  // cream square + gold heart
 *   <WaylyLogo size={20} variant="mono-white" />  // white-on-transparent
 *
 * The mark already includes its own rounded-square background, so no
 * surrounding box is needed.
 */
export function WaylyLogo({ size = 28, variant = "default", className = "", title = "", decorative = true }) {
    const src = {
        default: "/branding/svg/wayly-mark.svg",
        light: "/branding/svg/wayly-mark-light.svg",
        "mono-navy": "/branding/svg/wayly-mark-mono-navy.svg",
        "mono-white": "/branding/svg/wayly-mark-mono-white.svg",
    }[variant] || "/branding/svg/wayly-mark.svg";
    // When the logo sits next to a visible "Wayly" wordmark (the common case),
    // pass decorative=true (default) so the image is hidden from assistive tech
    // and the wordmark provides the accessible name. Pass decorative={false}
    // and a `title` to surface a stand-alone label.
    return (
        <img
            src={src}
            width={size}
            height={size}
            alt={decorative ? "" : (title || "Wayly")}
            aria-hidden={decorative || undefined}
            className={`inline-block shrink-0 select-none ${className}`}
            draggable={false}
        />
    );
}

export default WaylyLogo;
