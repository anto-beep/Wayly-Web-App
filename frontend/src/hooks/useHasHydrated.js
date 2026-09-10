import { useEffect, useState } from "react";

/**
 * useHasHydrated — returns false during server/prerender and on the very first
 * client render, then flips to true after mount.
 *
 * Use it to gate any UI whose value is non-deterministic between the react-snap
 * prerender snapshot (build time) and client hydration (view time) — e.g.
 * date-based "New" badges or auth/plan-dependent chips. Rendering the same
 * default on the first client paint as the prerendered HTML avoids React
 * hydration-mismatch errors (#418); the real value is applied one tick later.
 */
export function useHasHydrated() {
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        setHydrated(true);
    }, []);
    return hydrated;
}

export default useHasHydrated;
