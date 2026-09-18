import React from "react";

/**
 * WaylyLoader — the sleek, on-brand loading animation. The Wayly "W" mark
 * draws itself with a soft breathing glow, replacing plain spinners on the
 * app-open and sign-in moments. Reduced-motion safe (falls back to a static
 * mark via the .wayly-loader-* rules in index.css).
 */
const MARK_PATH =
  "M 88 132 C 88 124, 96 116, 108 116 L 124 116 C 134 116, 142 122, 145 132 L 196 312 L 240 152 C 244 138, 254 130, 268 132 C 280 134, 290 142, 294 156 L 332 308 L 388 132 C 391 122, 400 116, 410 116 L 426 116 C 438 116, 446 124, 446 132";

export default function WaylyLoader({ size = 92, label = "", testId = "wayly-loader" }) {
  return (
    <div className="flex flex-col items-center gap-4" data-testid={testId}>
      <svg
        className="wayly-loader-mark"
        width={size}
        height={size}
        viewBox="0 0 512 512"
        role="img"
        aria-label="Loading"
      >
        <rect width="512" height="512" rx="112" fill="#FBF8F3" />
        <path
          className="wayly-loader-path"
          d={MARK_PATH}
          fill="none"
          stroke="#0E4D52"
          strokeWidth="38"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="wayly-loader-dot" cx="446" cy="132" r="22" fill="#A5512B" />
      </svg>
      {label ? <div className="text-sm text-muted-k tracking-wide wayly-fade-in">{label}</div> : null}
    </div>
  );
}
