/**
 * useInvalidateOnParticipantChange, listener hook.
 *
 * Subscribes to the `wayly:participant-changed` custom event emitted by
 * `ParticipantsContext.setActiveId`. The callback is invoked synchronously
 * whenever the active participant switches, pages use it to drop their
 * participant-scoped local state caches.
 *
 * Usage:
 *   useInvalidateOnParticipantChange(() => {
 *       setStatements([]); setLoading(true); fetchAgain();
 *   });
 */
import { useEffect, useRef } from "react";

export default function useInvalidateOnParticipantChange(onChange) {
    const ref = useRef(onChange);
    useEffect(() => { ref.current = onChange; }, [onChange]);
    useEffect(() => {
        const handler = (ev) => {
            try { ref.current?.(ev?.detail || {}); } catch { /* ignore */ }
        };
        window.addEventListener("wayly:participant-changed", handler);
        return () => window.removeEventListener("wayly:participant-changed", handler);
    }, []);
}
