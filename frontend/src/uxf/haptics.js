/**
 * Haptics helper (spec 3 Wave 4, mobile parity).
 *
 * Small wrapper around `navigator.vibrate` that honours the user's
 * `prefers-reduced-motion` preference (also a proxy for
 * `prefers-reduced-vibrations`, since browsers do not expose the
 * dedicated media query yet). Passing an unsupported vibration
 * silently no-ops so the same call sites work on desktop.
 */

const REDUCED = () => {
    try {
        return typeof window !== "undefined"
            && window.matchMedia
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch { return false; }
};

const PATTERNS = {
    // Very light single click, on-tap of a low-consequence CTA.
    tap:      [8],
    // Two short pulses, confirm-before-destroy click.
    warn:     [12, 40, 12],
    // Ascending double-tap, action succeeded.
    success:  [10, 30, 20],
    // Long single pulse, action failed.
    error:    [30],
};

/**
 * Fire a haptic pattern.
 *
 * @param {"tap"|"warn"|"success"|"error"} kind
 */
export function haptic(kind = "tap") {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (REDUCED()) return;
    const pattern = PATTERNS[kind] || PATTERNS.tap;
    try { navigator.vibrate(pattern); } catch { /* older browsers throw on missing gesture */ }
}
