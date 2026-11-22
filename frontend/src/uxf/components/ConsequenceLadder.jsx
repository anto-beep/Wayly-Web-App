/**
 * ConsequenceLadder.jsx  ·  UXF-1 four-tier result renderer (INV-1 v1.2 spec §8, §12).
 *
 * Renders a single INV-1 :class:`Finding` with tier-appropriate styling:
 *
 *   Tier 1 · informational          → sage tint, muted heading
 *   Tier 2 · worth noting           → gold tint
 *   Tier 3 · worth a question       → clay tint
 *   Tier 4 · check before you pay   → terracotta tint + ACQSC escalation
 *
 * The tier vocabulary is INV-1's. Statement Decoder (DEC-1) still emits
 * a three-band `high/medium/low` severity map; the shared mapper in
 * :func:`severityToTier` converts on the fly so DEC-1 does not need a
 * migration.
 */
import React from "react";
import { AlertTriangle, HelpCircle, Info, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/formatDate";

const TIER_META = {
    1: {
        label: "Informational",
        Icon: Info,
        chip: "bg-sage/15 text-[#0F5648] border-sage/30",
        card: "border-sage/30 bg-sage/5",
        headingTone: "text-primary-k",
    },
    2: {
        label: "Worth noting",
        Icon: Info,
        chip: "bg-gold/20 text-primary-k border-gold/40",
        card: "border-gold/30 bg-gold/5",
        headingTone: "text-primary-k",
    },
    3: {
        label: "Worth a question",
        Icon: HelpCircle,
        chip: "bg-clay/15 text-clay border-clay/30",
        card: "border-clay/30 bg-clay/5",
        headingTone: "text-primary-k",
    },
    4: {
        label: "Check before you pay",
        Icon: AlertTriangle,
        chip: "bg-red-100 text-red-700 border-red-200",
        card: "border-red-200 bg-red-50",
        headingTone: "text-red-700",
    },
};

/** Map DEC-1 severity to an INV-1 tier for shared rendering. */
export function severityToTier(severity) {
    switch ((severity || "low").toLowerCase()) {
        case "high": return 4;
        case "medium": return 3;
        case "low": return 2;
        case "advisory": return 1;
        default: return 1;
    }
}

export default function ConsequenceLadder({ finding, onDraftLetter }) {
    if (!finding) return null;
    const meta = TIER_META[finding.tier] || TIER_META[2];
    const Icon = meta.Icon;
    const canDraftLetter = onDraftLetter && (finding.tier === 3 || finding.tier === 4);
    return (
        <div
            className={`rounded-xl border p-4 ${meta.card}`}
            data-testid={`inv1-finding-${finding.check_id}`}
            data-tier={finding.tier}
        >
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${meta.headingTone}`} />
                    <div className="min-w-0">
                        <div className={`font-heading text-base leading-tight ${meta.headingTone}`}>
                            {finding.suggested_question}
                        </div>
                        {finding.narrative ? (
                            <p className="mt-1 text-sm text-muted-k leading-relaxed">
                                {finding.narrative}
                            </p>
                        ) : null}
                    </div>
                </div>
                <div className="text-right flex flex-col gap-1 items-end shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 border ${meta.chip}`}>
                        Tier {finding.tier} · {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-k">
                        {finding.check_id} · {finding.confidence} confidence
                    </span>
                </div>
            </div>

            {finding.escalation === "acqsc" && (
                <div className="mt-3 rounded-lg bg-red-100/60 border border-red-200 px-3 py-2 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">
                        If your provider does not resolve this, you can contact the Aged Care Quality and Safety Commission on <span className="font-semibold">1800 951 822</span>.
                    </div>
                </div>
            )}

            {finding.rule_effective_from && (
                <div className="mt-2 text-[11px] text-muted-k">
                    Rule effective from {formatDate(finding.rule_effective_from) || finding.rule_effective_from}
                </div>
            )}

            {canDraftLetter && (
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onDraftLetter(finding)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border border-primary-k text-primary-k px-3 py-1.5 hover:bg-surface-2 transition-colors"
                        data-testid={`inv1-draft-letter-${finding.check_id}`}
                    >
                        Draft a letter about this →
                    </button>
                </div>
            )}
        </div>
    );
}

/** Render an array of findings, sorted highest-tier first. */
export function ConsequenceLadderList({ findings, onDraftLetter }) {
    if (!findings || findings.length === 0) return null;
    const sorted = [...findings]
        .map((f, i) => ({ ...f, _index: i }))
        .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0));
    return (
        <div className="space-y-3" data-testid="inv1-finding-list">
            {sorted.map((f) => (
                <ConsequenceLadder
                    key={`${f.check_id}-${f._index}`}
                    finding={f}
                    onDraftLetter={onDraftLetter ? () => onDraftLetter(f._index, f) : undefined}
                />
            ))}
        </div>
    );
}
