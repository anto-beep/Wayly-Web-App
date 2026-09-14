import React from "react";

/**
 * Shared, image-free brand visual primitives (SVG + CSS only).
 * Used by the Features and Landing marketing pages to give a premium,
 * colour-blocked, high-quality feel. Palette: Teal #0E4D52, Clay #A5512B,
 * Sage #4E6E54. Animations live in index.css (.wayly-float / .wayly-draw…)
 * and respect prefers-reduced-motion.
 */

// Soft dotted-grid texture for coloured sections.
export function DotField({ className = "", color = "rgba(255,255,255,0.14)" }) {
    const id = `dots-${color.replace(/\W/g, "")}`;
    return (
        <svg className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true">
            <defs>
                <pattern id={id} width="26" height="26" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.6" fill={color} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${id})`} />
        </svg>
    );
}

// Floating gradient orb for soft depth behind sections.
export function Orb({ style, className = "", from = "#1A696E", to = "#0E4D52" }) {
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-full blur-3xl opacity-40 ${className}`}
            style={{ backgroundImage: `radial-gradient(circle at 30% 30%, ${from}, ${to})`, ...style }}
        />
    );
}

// Animated progress ring (draws on mount).
export function GaugeRing({ pct = 74, size = 132, stroke = 12, track = "rgba(255,255,255,0.18)", bar = "#F0B267", label, sub }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (pct / 100) * c;
    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bar} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c}
                    className="wayly-draw"
                    style={{ "--wy-dash": c, "--wy-off": off, strokeDashoffset: off }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="font-heading text-2xl text-white leading-none">{label}</span>
                {sub && <span className="text-[10px] uppercase tracking-[0.14em] text-white/70 mt-1">{sub}</span>}
            </div>
        </div>
    );
}

// Labelled comparison bar with a grow-in animation.
export function CompareRow({ label, value, pct, tone = "#F0B267" }) {
    return (
        <div>
            <div className="flex items-center justify-between text-[11px] text-white/80">
                <span>{label}</span>
                <span className="tabular-nums font-medium text-white">{value}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full rounded-full wayly-grow-bar" style={{ width: `${pct}%`, backgroundColor: tone }} />
            </div>
        </div>
    );
}
