import { useEffect, useRef } from "react";

/**
 * Brings a freshly-rendered result block to the top of the viewport.
 *
 * Attach the returned ref to the result container and give that container
 * `scroll-mt-20` (or similar) so the sticky marketing header (h-16) doesn't
 * cover it. The scroll fires whenever `trigger` changes to a truthy value
 * (pass the result object/id so re-runs also scroll).
 */
export default function useScrollToResult(trigger) {
    const ref = useRef(null);
    useEffect(() => {
        if (!trigger) return undefined;
        // Two rAFs + a short delay so the conditionally-mounted result has laid
        // out (and any tall quiz above it has unmounted) before we scroll.
        let inner;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => {
                ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
        return () => {
            cancelAnimationFrame(outer);
            if (inner) cancelAnimationFrame(inner);
        };
    }, [trigger]);
    return ref;
}
