/**
 * Global live regions (Workstream B, spec 3.19).
 *
 * Screen-reader announcements are broadcast into two aria-live containers
 * mounted once at the root of the app:
 *
 *   - `role="status"` polite: routine confirmations, save state, autosave
 *     ticks, retry-succeeded messages.
 *   - `role="alert"` assertive: session expiry, connection lost, hard
 *     errors, destructive-action confirmations.
 *
 * Call `announce({ message, priority })` from anywhere to push a new
 * announcement. The region debounces same-message announcements so we
 * don't spam the reader.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

const _subscribers = new Set();
let _lastMessage = { polite: "", assertive: "", ts: 0 };

/**
 * Push an announcement into the appropriate live region.
 *
 * @param {Object} args
 * @param {string} args.message Text to speak. Kept short (< 12 words).
 * @param {"polite"|"assertive"} [args.priority="polite"]
 */
export function announce({ message, priority = "polite" }) {
    if (!message) return;
    // Debounce same message inside a 400 ms window so a rapid re-render
    // doesn't cause the reader to repeat itself.
    const now = Date.now();
    if (_lastMessage[priority] === message && now - _lastMessage.ts < 400) return;
    _lastMessage[priority] = message;
    _lastMessage.ts = now;
    _subscribers.forEach((fn) => fn({ message, priority, ts: now }));
}

/**
 * Mount once at the top of the tree.
 */
export function LiveRegionHost() {
    const [polite, setPolite] = useState("");
    const [assertive, setAssertive] = useState("");
    const politeTimer = useRef(null);
    const assertiveTimer = useRef(null);

    useEffect(() => {
        const handler = ({ message, priority }) => {
            if (priority === "assertive") {
                // Clear then set so the same message re-fires if repeated.
                setAssertive("");
                if (assertiveTimer.current) clearTimeout(assertiveTimer.current);
                assertiveTimer.current = setTimeout(() => setAssertive(message), 40);
            } else {
                setPolite("");
                if (politeTimer.current) clearTimeout(politeTimer.current);
                politeTimer.current = setTimeout(() => setPolite(message), 40);
            }
        };
        _subscribers.add(handler);
        return () => {
            _subscribers.delete(handler);
            if (politeTimer.current) clearTimeout(politeTimer.current);
            if (assertiveTimer.current) clearTimeout(assertiveTimer.current);
        };
    }, []);

    return (
        <>
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                data-testid="uxf-live-polite"
                style={{
                    position: "absolute",
                    width: 1, height: 1, padding: 0, margin: -1,
                    overflow: "hidden", clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap", border: 0,
                }}
            >
                {polite}
            </div>
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                data-testid="uxf-live-assertive"
                style={{
                    position: "absolute",
                    width: 1, height: 1, padding: 0, margin: -1,
                    overflow: "hidden", clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap", border: 0,
                }}
            >
                {assertive}
            </div>
        </>
    );
}

/**
 * Hook variant when a component wants a stable callback.
 */
export function useAnnounce() {
    return useCallback((args) => announce(args), []);
}
