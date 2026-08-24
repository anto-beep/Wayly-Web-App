import React from "react";

/**
 * WS7, Snapshot selector. Ships as a compact <select> when at least one
 * snapshot exists. Hidden entirely if there's only one snapshot available
 * *and* no user has ever needed to switch, but per spec §4.7 we still
 * render a "DoH October 2025 · latest" tag so the user knows which dataset
 * they're comparing against.
 */
export default function SnapshotSelector({ snapshots, selected, onChange }) {
    if (!snapshots || snapshots.length === 0) return null;
    const active = snapshots.find((s) => s.snapshot_id === selected) || snapshots[0];
    const isSingle = snapshots.length === 1;

    return (
        <div
            className="mb-3 flex items-center gap-2 text-xs"
            data-testid="pc-snapshot-selector"
        >
            <span className="text-muted-k uppercase tracking-wider">DoH dataset:</span>
            {isSingle ? (
                <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-kindred text-primary-k"
                    data-testid="pc-snapshot-single"
                >
                    <span className="font-medium">{formatSnapshotLabel(active)}</span>
                    <span className="text-muted-k">· latest</span>
                </span>
            ) : (
                <select
                    value={selected}
                    onChange={(e) => onChange(e.target.value)}
                    className="rounded-md border border-kindred bg-surface px-2 py-1 text-primary-k"
                    data-testid="pc-snapshot-picker"
                >
                    {snapshots.map((s, i) => (
                        <option key={s.snapshot_id} value={s.snapshot_id}>
                            {formatSnapshotLabel(s)}{i === 0 ? " · latest" : ""}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}

function formatSnapshotLabel(s) {
    if (!s) return "";
    try {
        const d = new Date(s.source_date);
        return `DoH ${d.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}`;
    } catch {
        return s.snapshot_id;
    }
}
