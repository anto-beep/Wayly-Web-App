import React from "react";
import { formatAUD } from "@/lib/api";

const COLORS = {
    Clinical: "bg-[#3A5A40]",
    Independence: "bg-[#8B9B82]",
    "Everyday Living": "bg-[#A05545]",
};

export default function StreamProgress({ stream }) {
    const pct = Math.min(100, Math.max(0, stream.pct || 0));
    const color = COLORS[stream.stream] || "bg-primary-k";
    return (
        <div className="bg-surface border border-kindred rounded-xl p-5" data-testid={`stream-${stream.stream.toLowerCase().replace(/\s/g, "-")}`}>
            <div className="flex items-baseline justify-between">
                <span className="overline">{stream.stream}</span>
                <span className="text-xs text-muted-k">{pct.toFixed(0)}%</span>
            </div>
            <div className="mt-2 font-heading text-2xl text-primary-k">
                {formatAUD(stream.remaining)} <span className="text-sm text-muted-k font-sans">left</span>
            </div>
            <div className="mt-3 h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-k">
                {formatAUD(stream.spent)} of {formatAUD(stream.allocated)} this quarter
            </div>
        </div>
    );
}
