import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
    Activity, FileText, ReceiptText, MessageCircle, HeartPulse,
    ClipboardList, Mail, Bell, Calendar as CalendarIcon, ArrowRight,
} from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

/**
 * Recent activity panel for the caregiver dashboard.
 *
 * Reads the unified CORE-1 timeline (same source as the full timeline page and
 * mobile), so it only ever shows high-level, plain-English events — no raw
 * enum labels or technical state changes. Renders a compact, colour-coded
 * connected timeline of the 6 most recent items.
 */

const ICONS = {
    statement_decoded: FileText, statement_uploaded: FileText,
    invoice_checked: ReceiptText, invoice_uploaded: ReceiptText,
    chat: MessageCircle, question_asked: MessageCircle,
    hospital_admission: HeartPulse, hospital_discharge: HeartPulse,
    care_plan_reviewed: ClipboardList, care_plan_uploaded: ClipboardList,
    letter_sent: Mail, correspondence: Mail,
    alert: Bell, budget_alert: Bell,
    calendar_entry: CalendarIcon, visit: CalendarIcon,
};

// Brand tint per event category — colours the dot + left accent.
const TINT = {
    statement_decoded: "#0E4D52", statement_uploaded: "#0E4D52",
    invoice_checked: "#A5512B", invoice_uploaded: "#A5512B",
    chat: "#6B8F71", question_asked: "#6B8F71",
    hospital_admission: "#B4462B", hospital_discharge: "#B4462B",
    care_plan_reviewed: "#6B8F71", care_plan_uploaded: "#6B8F71",
    letter_sent: "#6B8F71", correspondence: "#6B8F71",
    alert: "#B4462B", budget_alert: "#B7791F",
    calendar_entry: "#0E4D52", visit: "#0E4D52",
};

const ARTEFACT_ROUTE = {
    statement: (id) => `/app/statements/${id}`,
    invoice: (id) => `/app/invoices/${id}`,
};

function whenLabel(s) {
    if (!s) return "";
    try {
        return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    } catch { return ""; }
}

// Trim any raw result dump so summaries stay plain-English.
function cleanSummary(s, evType) {
    let t = (s || "").trim();
    const cut = t.search(/\s*Result:|\s*\{/);
    if (cut > 0) t = t.slice(0, cut).replace(/[\s:.,-]+$/, "").trim() + ".";
    return t || (evType || "").replace(/_/g, " ");
}

export default function DashboardTimelinePanel() {
    const { active } = useParticipants();
    const [items, setItems] = useState(null);  // null = loading, [] = empty

    useEffect(() => {
        if (!active?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await api.get(`/core/participants/${active.id}/timeline?limit=6`);
                if (!cancelled) setItems(r.data?.events || []);
            } catch (_e) {
                if (!cancelled) setItems([]);
            }
        })();
        return () => { cancelled = true; };
    }, [active?.id]);

    if (!active?.id) return null;
    const loading = items === null;

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5 md:p-6 shadow-sm" data-testid="dashboard-timeline-panel">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-muted-k">
                    <Activity className="h-4 w-4" />
                    <span className="overline">Recent activity</span>
                </div>
                <Link
                    to={`/app/participants/${active.id}/timeline`}
                    className="text-xs text-primary-k inline-flex items-center gap-1 hover:underline"
                    data-testid="dashboard-timeline-view-all"
                >
                    View full timeline <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            {loading ? (
                <div className="mt-5 space-y-3 animate-pulse">
                    {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-surface-2 rounded-lg" />)}
                </div>
            ) : items.length === 0 ? (
                <div className="mt-5 text-sm text-muted-k" data-testid="dashboard-timeline-empty">
                    Nothing logged yet.{" "}
                    <Link to="/app/scenarios" className="text-primary-k underline">Log a scenario</Link>{" "}
                    to start the journey.
                </div>
            ) : (
                <ul className="mt-5 space-y-0" data-testid="dashboard-timeline-list">
                    {items.map((it, i) => {
                        const Icon = ICONS[it.event_type] || Activity;
                        const tint = TINT[it.event_type] || "#0E4D52";
                        const route = ARTEFACT_ROUTE[it.linked_artefact_type];
                        const tappable = !!(route && it.linked_artefact_id);
                        const isLast = i === items.length - 1;
                        const body = (
                            <div className="flex-1 min-w-0 pb-4">
                                <div className="text-sm text-primary-k font-medium leading-snug">
                                    {cleanSummary(it.summary, it.event_type)}
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">{whenLabel(it.event_timestamp)}</div>
                            </div>
                        );
                        return (
                            <li key={it.id || i} className="flex gap-3" data-testid={`dashboard-timeline-row-${i}`}>
                                {/* Rail: dot + connector */}
                                <div className="flex flex-col items-center w-9 flex-none">
                                    <span
                                        className="flex h-9 w-9 items-center justify-center rounded-full border"
                                        style={{ backgroundColor: `${tint}1A`, borderColor: `${tint}66` }}
                                    >
                                        <Icon className="h-4 w-4" style={{ color: tint }} />
                                    </span>
                                    {!isLast && <span className="w-0.5 flex-1 my-1 bg-kindred" />}
                                </div>
                                {tappable ? (
                                    <Link to={route(it.linked_artefact_id)} className="flex-1 min-w-0 rounded-lg -mx-1 px-1 hover:bg-surface-2 transition-colors">
                                        {body}
                                    </Link>
                                ) : body}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
