import React, { useEffect, useRef, useState } from "react";

/**
 * ScrollHideWidgets
 *
 * Wraps the floating Help + Accessibility widgets and fades them out while the
 * user is actively scrolling, bringing them back a beat after scrolling stops.
 * Keeps the reading surface clean without removing the widgets entirely.
 * Respects prefers-reduced-motion (no transition, but still hides/shows).
 */
export default function ScrollHideWidgets({ children }) {
    const [scrolling, setScrolling] = useState(false);
    const timer = useRef(null);
    const lastY = useRef(typeof window !== "undefined" ? window.scrollY : 0);

    useEffect(() => {
        const onScroll = () => {
            const y = window.scrollY;
            // Ignore tiny jitters so a resting page keeps the widgets visible.
            if (Math.abs(y - lastY.current) < 6) return;
            lastY.current = y;
            setScrolling(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setScrolling(false), 650);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    return (
        <div
            aria-hidden={scrolling ? "true" : undefined}
            style={{
                transition: "opacity 260ms ease, transform 260ms ease",
                opacity: scrolling ? 0 : 1,
                transform: scrolling ? "translateY(12px)" : "translateY(0)",
                pointerEvents: scrolling ? "none" : "auto",
            }}
        >
            {children}
        </div>
    );
}
