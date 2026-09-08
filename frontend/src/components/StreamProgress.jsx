import React from "react";
import { formatAUD } from "@/lib/api";

// Each spending stream gets its own colour so the three cards read as clearly
// distinct blocks (not blended white boxes): teal, sage, clay.
const TONES = {
    Clinical: { solid: "#0F5648", soft: "rgba(15,86,72,0.12)" },
    Independence: { solid: "#5E7E63", soft: "rgba(94,126,99,0.15)" },
    "Everyday Living": { solid: "#A05545", soft: "rgba(160,85,69,0.14)" },
};

export default function StreamProgress({ stream }) {
    const pct = Math.min(100, Math.max(0, stream.pct || 0));
    const tone = TONES[stream.stream] || { solid: "#0E4D52", soft: "rgba(14,77,82,0.12)" };
    return (
        <div
            className="rounded-xl p-5"
            style={{ backgroundColor: tone.soft, border: `1px solid ${tone.soft}`, borderLeft: `4px solid ${tone.solid}` }}
            data-testid={`stream-${stream.stream.toLowerCase().replace(/\s/g, "-")}`}
        >
            <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-[0.14em] font-semibold" style={{ color: tone.solid }}>{stream.stream}</span>
                <span className="text-xs tabular-nums font-semibold" style={{ color: tone.solid }}>{pct.toFixed(0)}%</span>
            </div>
            <div className="mt-2 font-heading text-2xl" style={{ color: tone.solid }}>
                {formatAUD(stream.remaining)} <span className="text-sm text-muted-k font-sans">left</span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.06)" }}>
                <div className="h-full transition-all rounded-full" style={{ width: `${pct}%`, backgroundColor: tone.solid }} />
            </div>
            <div className="mt-2 text-xs text-muted-k">
                {formatAUD(stream.spent)} of {formatAUD(stream.allocated)} this quarter
            </div>
        </div>
    );
}
