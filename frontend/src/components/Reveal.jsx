import React, { useEffect, useRef, useState } from "react";

/**
 * Reveal
 *
 * Lightweight scroll-reveal wrapper used across the marketing frontend to give
 * a premium, high-quality feel. Fades and lifts children into view the first
 * time they enter the viewport. Fully respects prefers-reduced-motion (content
 * shows instantly, no transform). Works in light and dark mode.
 *
 * Props:
 *  - as: element/tag to render (default "div")
 *  - delay: ms stagger before the reveal (default 0)
 *  - y: initial translateY in px (default 24)
 *  - once: only animate the first time (default true)
 */
export default function Reveal({
    as: Tag = "div",
    delay = 0,
    y = 24,
    once = true,
    className = "",
    children,
    ...rest
}) {
    const ref = useRef(null);
    const [shown, setShown] = useState(false);
    const reduced = typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    useEffect(() => {
        if (reduced) {
            setShown(true);
            return;
        }
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        setShown(true);
                        if (once) io.disconnect();
                    } else if (!once) {
                        setShown(false);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [once, reduced]);

    const style = reduced
        ? undefined
        : {
              transition: "opacity 620ms cubic-bezier(0.16,1,0.3,1), transform 620ms cubic-bezier(0.16,1,0.3,1)",
              transitionDelay: `${delay}ms`,
              opacity: shown ? 1 : 0,
              transform: shown ? "translateY(0)" : `translateY(${y}px)`,
              willChange: "opacity, transform",
          };

    return (
        <Tag ref={ref} className={className} style={style} {...rest}>
            {children}
        </Tag>
    );
}
