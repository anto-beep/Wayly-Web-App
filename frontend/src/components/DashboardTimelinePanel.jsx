import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
    Activity, AlertTriangle, MessageSquare, ShieldAlert, ArrowRight,
} from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

/**
 * Compact timeline panel for the caregiver dashboard.
 *
 * Renders the 5 most recent timeline items (events, alerts, state changes)
 * with a "View full timeline" deep-link. Pulled in alongside the existing
 * stat cards and "Things to know" panel — same calm visual language.
 */
export default function DashboardTimelinePanel() {
    const { active } = useParticipants();
    const [items, setItems] = useState(null);  // null = loading, [] = empty

    useEffect(() => {
        if (!active?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await api.get(`/scenario/participants/${active.id}/timeline?limit=5`);
                if (!cancelled) setItems(r.data?.items || []);
            } catch (_e) {
                if (!cancelled) setItems([]);
            }
        })();
        return () => { cancelled = true; };
    }, [active?.id]);

    if (!active?.id) return null;
    const loading = items === null;

    return (
        <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="dashboard-timeline-panel">
            <div className="flex items-center justify-between">
                <span className="overline flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Recent activity
                </span>
                <Link
                    to={`/app/participants/${active.id}/timeline`}
                    className="text-xs text-primary-k underline"
                    data-testid="dashboard-timeline-view-all"
                >
                    View full timeline <ArrowRight className="inline h-3 w-3" />
                </Link>
            </div>

            {loading ? (
                <div className="mt-4 space-y-2 animate-pulse">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-10 bg-surface-2 rounded-md" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="mt-4 text-sm text-muted-k" data-testid="dashboard-timeline-empty">
                    Nothing logged yet. {" "}
                    <Link to="/app/scenarios" className="text-primary-k underline">Log a scenario</Link>{" "}
                    to start the journey.
                </div>
            ) : (
                <ul className="mt-4 space-y-2.5" data-testid="dashboard-timeline-list">
                    {items.map((it, i) => <CompactTimelineRow key={i} item={it} />)}
                </ul>
            )}
        </div>
    );
}

function CompactTimelineRow({ item }) {
    const at = item.at ? new Date(item.at) : null;
    const when = at ? at.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";

    if (item.type === "event") {
        const ev = item.data || {};
        return (
            <li className="flex items-start gap-2.5 text-sm" data-testid="dashboard-timeline-row-event">
                <MessageSquare className="h-3.5 w-3.5 text-primary-k mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-primary-k font-medium truncate">
                        {(ev.event_type || "").replaceAll("_", " ")}
                    </div>
                    {ev.note && <div className="text-xs text-muted-k truncate">{ev.note}</div>}
                </div>
                <span className="text-xs text-muted-k whitespace-nowrap">{when}</span>
            </li>
        );
    }
    if (item.type === "alert") {
        const a = item.data || {};
        const isCrit = a.severity === "critical";
        return (
            <li className="flex items-start gap-2.5 text-sm" data-testid="dashboard-timeline-row-alert">
                {isCrit
                    ? <ShieldAlert className="h-3.5 w-3.5 text-terracotta mt-0.5 flex-shrink-0" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-gold mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                    <div className="text-primary-k font-medium truncate">{a.title || "Alert"}</div>
                    <div className="text-xs text-muted-k truncate">{a.body}</div>
                </div>
                <span className="text-xs text-muted-k whitespace-nowrap">{when}</span>
            </li>
        );
    }
    if (item.type === "state") {
        const s = item.data || {};
        return (
            <li className="flex items-start gap-2.5 text-sm" data-testid="dashboard-timeline-row-state">
                <Activity className="h-3.5 w-3.5 text-muted-k mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-muted-k truncate">{(s.kind || "").replaceAll("_", " ")}</div>
                </div>
                <span className="text-xs text-muted-k whitespace-nowrap">{when}</span>
            </li>
        );
    }
    return null;
}
