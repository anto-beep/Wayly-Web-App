import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader2, Activity, AlertTriangle, MessageSquare, ShieldAlert, Phone, ArrowLeft } from "lucide-react";

/**
 * Participant timeline — Phase 6.
 *
 * Renders a single chronological feed merging events, lifecycle changes, and
 * alerts. Works in two modes:
 *   - /app/timeline                       → uses the active participant
 *   - /app/participants/:id/timeline      → pinned to that participant
 */
export default function ParticipantTimeline() {
    const { id: pidFromRoute } = useParams();
    const [tl, setTl] = useState(null);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                let pid = pidFromRoute;
                if (!pid) {
                    const acct = await api.get("/account");
                    const p = acct.data?.participants?.find((x) => x.status === "ACTIVE")
                              || acct.data?.participants?.[0];
                    pid = p?.id;
                }
                if (cancelled) return;
                if (!pid) { setErrored(true); return; }
                const r = await api.get(`/scenario/participants/${pid}/timeline?limit=80`);
                if (!cancelled) setTl(r.data);
            } catch (_e) {
                if (!cancelled) setErrored(true);
            }
        })();
        return () => { cancelled = true; };
    }, [pidFromRoute]);

    if (!tl && !errored) return <div className="p-6 text-sm text-muted-k flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…</div>;
    if (!tl) return <div className="p-6 text-sm text-muted-k">No timeline available — add a participant first.</div>;

    return (
        <div className="mx-auto max-w-3xl p-6 space-y-5" data-testid="timeline-page">
            <header>
                {pidFromRoute && (
                    <Link
                        to="/app/participants"
                        className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k mb-2"
                        data-testid="timeline-back-link"
                    >
                        <ArrowLeft className="h-3 w-3" /> All participants
                    </Link>
                )}
                <h1 className="font-heading text-3xl text-primary-k">{tl.first_name}&apos;s timeline</h1>
                <p className="mt-2 text-sm text-muted-k">
                    Everything that&apos;s happened — events you&apos;ve logged, status changes, and alerts. Most recent first.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wayly-teal-50 text-wayly-teal-700 text-xs font-medium" data-testid="timeline-current-state">
                    <Activity className="h-3.5 w-3.5" /> Current status: {tl.lifecycle_state || "—"}
                </div>
            </header>

            <ol className="space-y-3" data-testid="timeline-feed">
                {tl.items.length === 0 && (
                    <li className="text-sm text-muted-k" data-testid="timeline-empty">
                        Nothing logged yet. Use &ldquo;Log a scenario&rdquo; to start.
                    </li>
                )}
                {tl.items.map((it, i) => <TimelineItem key={i} item={it} />)}
            </ol>
        </div>
    );
}

function TimelineItem({ item }) {
    const date = item.at ? new Date(item.at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    if (item.type === "event") {
        const ev = item.data;
        const boundary = ev.advice_boundary || "SAFE_TO_EXPLAIN";
        return (
            <li className="rounded-2xl border border-wayly-neutral-200 bg-white p-4 wayly-card-shadow" data-testid="timeline-item-event">
                <div className="flex items-start gap-3">
                    <MessageSquare className="h-4 w-4 text-wayly-teal-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-primary-k">{ev.event_type.replaceAll("_", " ")}</span>
                            <span className="text-xs text-muted-k">{date}</span>
                        </div>
                        {ev.note && <div className="mt-1 text-sm text-muted-k">{ev.note}</div>}
                        {ev.proposed?.transition_status === "applied" && (
                            <div className="mt-1 text-xs text-wayly-sage-700">Status moved to {ev.proposed.lifecycle_transition}.</div>
                        )}
                        {ev.proposed?.transition_status === "blocked" && (
                            <div className="mt-1 text-xs text-wayly-clay-600">Status change was blocked — review timeline.</div>
                        )}
                        {boundary !== "SAFE_TO_EXPLAIN" && (ev.route_out_contacts || []).length > 0 && (
                            <ContactBlock boundary={boundary} contacts={ev.route_out_contacts} />
                        )}
                    </div>
                </div>
            </li>
        );
    }
    if (item.type === "state") {
        const s = item.data;
        return (
            <li className="rounded-2xl border border-wayly-neutral-200 bg-wayly-neutral-50 p-3 text-sm" data-testid="timeline-item-state">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-primary-k">
                        <span className="font-medium">{s.kind.replaceAll("_", " ")}</span>
                        {s.from_value && s.to_value && (
                            <span className="text-muted-k"> · {JSON.stringify(s.from_value)} → {JSON.stringify(s.to_value)}</span>
                        )}
                    </span>
                    <span className="text-xs text-muted-k">{date}</span>
                </div>
            </li>
        );
    }
    if (item.type === "alert") {
        const a = item.data;
        const isCrit = a.severity === "critical";
        const boundary = a.advice_boundary || "SAFE_TO_EXPLAIN";
        return (
            <li className={`rounded-2xl border p-4 ${isCrit
                ? "border-wayly-clay-300 bg-wayly-clay-50"
                : "border-wayly-neutral-200 bg-white"} wayly-card-shadow`} data-testid="timeline-item-alert">
                <div className="flex items-start gap-3">
                    {isCrit ? <ShieldAlert className="h-4 w-4 text-wayly-clay-600 mt-0.5" /> : <AlertTriangle className="h-4 w-4 text-wayly-clay-500 mt-0.5" />}
                    <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-primary-k">{a.title}</span>
                            <span className="text-xs text-muted-k">{date}</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-k">{a.body}</div>
                        {a.next_action_text && a.next_action_link && (
                            <a href={a.next_action_link} className="mt-2 inline-block text-sm font-medium text-wayly-clay-600 hover:underline">
                                {a.next_action_text} →
                            </a>
                        )}
                        {boundary !== "SAFE_TO_EXPLAIN" && (a.route_out_contacts || []).length > 0 && (
                            <ContactBlock boundary={boundary} contacts={a.route_out_contacts} />
                        )}
                    </div>
                </div>
            </li>
        );
    }
    return null;
}

function ContactBlock({ boundary, contacts }) {
    return (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${boundary === "ESCALATE"
            ? "border-wayly-clay-300 bg-wayly-clay-50"
            : "border-wayly-teal-200 bg-wayly-teal-50"}`}>
            <div className="text-xs uppercase tracking-wide font-semibold text-muted-k mb-1.5">
                {boundary === "ESCALATE" ? "Please contact straight away" : "Where to start"}
            </div>
            <ul className="space-y-1">
                {contacts.map((c, i) => (
                    <li key={i} className="text-sm">
                        {c.tel_link ? (
                            <a href={c.tel_link} className="inline-flex items-center gap-1.5 font-medium text-primary-k">
                                <Phone className="h-3.5 w-3.5" /> {c.label}{c.phone ? ` · ${c.phone}` : ""}
                            </a>
                        ) : (
                            <span className="font-medium text-primary-k">{c.label}</span>
                        )}
                        {c.blurb && <div className="text-xs text-muted-k">{c.blurb}</div>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
