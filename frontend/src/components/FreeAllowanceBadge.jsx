/**
 * FreeAllowanceBadge.jsx, CONV-1 v2 Workstream D2.
 *
 * Shows a free visitor / free-tier user where they stand BEFORE they spend a
 * use, in plain words ("This is 1 of your 2 free price checks"). Honest
 * scarcity, stated up front, never a counter hidden until the allowance is
 * spent. Reads the public /api/free-tool/usage endpoint.
 */
import React, { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { api } from "@/lib/api";

export default function FreeAllowanceBadge({ tool, noun = "check", nounPlural = "checks", refreshKey = 0 }) {
    const [usage, setUsage] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get(`/free-tool/usage?tool=${encodeURIComponent(tool)}`, { withCredentials: true });
                if (!cancelled) setUsage(data);
            } catch (_) { /* best-effort */ }
        })();
        return () => { cancelled = true; };
    }, [tool, refreshKey]);

    if (!usage) return null;
    const limit = usage.limit ?? 1;
    const remaining = Math.max(0, usage.remaining ?? 0);
    const used = Math.max(0, limit - remaining);
    const days = usage.days_until_next_use || 0;

    let text;
    if (remaining <= 0) {
        text = `You've used your free ${limit === 1 ? noun : `${limit} ${nounPlural}`}${days ? `, another is free in ${days} day${days === 1 ? "" : "s"}` : ""}. Start a free trial to use it as often as you need.`;
    } else if (limit === 1) {
        text = `This is your 1 free ${noun}. No account needed.`;
    } else {
        text = `This is ${noun} ${used + 1} of your ${limit} free ${nounPlural}.`;
    }

    return (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-2 border border-kindred px-3 py-2.5" data-testid={`free-allowance-${tool.toLowerCase()}`}>
            <Gauge className="h-4 w-4 text-primary-k mt-0.5 shrink-0" />
            <span className="text-xs text-primary-k leading-relaxed">{text}</span>
        </div>
    );
}
