import React, { useEffect, useRef, useState } from "react";

/**
 * Wraps children with an Intersection-Observer reveal animation.
 * - Default: fade + translate up
 * - mode="wipe": clip-path wipe-in from left
 *
 * Respects prefers-reduced-motion.
 */
export default function RevealOnScroll({ children, mode = "fade", rotate = 0, delay = 0, className = "" }) {
    const ref = useRef(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setShown(true);
            return;
        }
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) { setShown(true); obs.disconnect(); }
            },
            { threshold: 0.2 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const baseStyle = {
        transition: `opacity 500ms ease-out ${delay}ms, transform 500ms ease-out ${delay}ms, clip-path 800ms ease-out ${delay}ms`,
        willChange: "opacity, transform, clip-path",
    };
    const fade = shown
        ? { opacity: 1, transform: `translateY(0) rotate(${rotate}deg)` }
        : { opacity: 0, transform: `translateY(24px) rotate(${rotate}deg)` };
    const wipe = shown
        ? { clipPath: "inset(0 0% 0 0)" }
        : { clipPath: "inset(0 100% 0 0)" };

    return (
        <div ref={ref} className={className} style={{ ...baseStyle, ...(mode === "wipe" ? wipe : fade) }}>
            {children}
        </div>
    );
}
