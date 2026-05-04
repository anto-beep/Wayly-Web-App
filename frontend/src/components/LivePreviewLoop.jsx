import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Auto-playing 6-second loop showing what happens after a Statement Decoder
 * decode: line items fade in one by one, anomaly card flashes in.
 *
 * Uses pure CSS keyframes (defined in index.css). Pauses for users with
 * prefers-reduced-motion via the @media block in CSS. ARIA-hidden because
 * the static text is already covered by the gate's main heading.
 */
export default function LivePreviewLoop() {
    return (
        <div className="bg-[#FAF7F2] p-6 w-full max-w-3xl mx-auto" aria-hidden="true">
            <div className="overline-tiny text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">November 2025 statement</div>
            <h3 className="font-heading text-[20px] text-[#1F3A5F] tracking-tight mt-1">Bluebell Care · Dorothy</h3>

            <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                    { l: "Clinical", t: "$195.00", c: "#7A9B7E", d: 0 },
                    { l: "Independence", t: "$570.00", c: "#1F3A5F", d: 0.6 },
                    { l: "Everyday Living", t: "$337.50", c: "#D4A24E", d: 1.2 },
                ].map((s) => (
                    <div
                        key={s.l}
                        className="bg-white border border-[#E8E2D6] rounded-xl p-3 kindred-fadein"
                        style={{ animationDelay: `${s.d}s` }}
                    >
                        <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.c }} />
                            <span className="text-[9px] uppercase tracking-[0.16em] text-[#5C6878]">{s.l}</span>
                        </div>
                        <div className="mt-1.5 font-heading text-[16px] text-[#1F3A5F] tabular-nums">{s.t}</div>
                    </div>
                ))}
            </div>

            <div
                className="mt-4 bg-white border-l-[3px] border-[#C5734D] rounded-r-md p-3 shadow-[0_2px_12px_rgba(197,115,77,0.18)] kindred-anomaly-flash"
            >
                <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-[#C5734D] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="text-[9px] uppercase tracking-[0.16em] text-[#C5734D] font-semibold">Anomaly · Possible overcharge</div>
                        <div className="text-[12px] text-[#1F3A5F] font-medium mt-0.5">Cleaning charged at $75/hr — published price is $68/hr.</div>
                        <div className="text-[10px] text-[#5C6878] mt-0.5">Possible overcharge: <span className="font-semibold text-[#1F3A5F]">$14.00</span></div>
                        <button type="button" tabIndex={-1} className="mt-2 text-[10px] bg-[#1F3A5F] text-white rounded px-2.5 py-1 inline-flex items-center gap-1 pointer-events-none">
                            Draft a message <ArrowRight className="h-2.5 w-2.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
