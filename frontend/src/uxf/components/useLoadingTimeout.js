/**
 * useLoadingTimeout hook (spec 3.5).
 *
 * Every async operation should have a documented ceiling. When the
 * ceiling is reached, the surface transitions from "still loading"
 * (StagedProgress) to a "still working on this" callout that offers a
 * primary retry + a secondary "come back later" affordance.
 *
 * Ceilings (spec Section 9 item C):
 *   discreteAction : 30 s (save, toggle, small POST)
 *   listLoad       : 20 s (dashboard, statements list)
 *   longAsyncJob   : 180 s (decoder, care plan, artifact)
 *   aiStreaming    : 90 s from last token
 */
import { useEffect, useRef, useState } from "react";

export const TIMEOUTS = {
    discreteAction: 30_000,
    listLoad:       20_000,
    longAsyncJob:   180_000,
    aiStreaming:    90_000,
};

/**
 * Hook returns `{ timedOut, reset }`. Start it when the operation begins,
 * call `reset()` on success or when a new attempt starts.
 *
 * @param {boolean} isLoading Whether the operation is currently in-flight.
 * @param {number}  ceilingMs How many milliseconds before we surface a timeout.
 */
export function useLoadingTimeout(isLoading, ceilingMs = TIMEOUTS.discreteAction) {
    const [timedOut, setTimedOut] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!isLoading) {
            setTimedOut(false);
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
            return undefined;
        }
        // Only arm the timer if we're not already timed-out
        if (timedOut) return undefined;
        timerRef.current = setTimeout(() => setTimedOut(true), ceilingMs);
        return () => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        };
    }, [isLoading, ceilingMs, timedOut]);

    return {
        timedOut,
        reset: () => {
            setTimedOut(false);
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        },
    };
}
