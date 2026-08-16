/**
 * ParticipantTimeline, Dec 2026 Refit §10 redesign.
 *
 * Calm, scannable, plain-English timeline grouped by month. Each event answers
 * four implicit questions:
 *   1. What happened?      → Title Case event title
 *   2. When?               → Large date column / month header
 *   3. What does it mean?  → One/two-sentence plain-English summary
 *   4. What should I do?   → Optional "Tell Me More" expander
 *
 * Routes:
 *   - /app/timeline                 → active participant
 *   - /app/participants/:id/timeline → pinned to that participant
 *
 * Backend API: GET /api/scenario/participants/{pid}/timeline?limit=80
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, ChevronDown, ChevronUp, FileText, RefreshCw, ClipboardList, DollarSign, Building2, Sparkles, Bell } from "lucide-react";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import { humanizeMonths } from "@/lib/formatDate";

// ---- Filter chips (Title Case per brief §10) ----
const FILTERS = [
    { key: "all",            label: "All" },
    { key: "statements",     label: "Statements" },
    { key: "care_plan",      label: "Care Plan Changes" },
    { key: "reassessments",  label: "Reassessments" },
    { key: "contributions",  label: "Contribution Changes" },
    { key: "providers",      label: "Provider Changes" },
];

// Substring/keyword match against an item's normalized signature.
function categoryMatches(item, filterKey) {
    if (filterKey === "all") return true;
    const sig = signatureFor(item).toLowerCase();
    switch (filterKey) {
        case "statements":     return sig.includes("statement") || sig.includes("invoice");
        case "care_plan":      return sig.includes("care_plan") || sig.includes("careplan") || sig.includes("care plan");
        case "reassessments":  return sig.includes("reassessment") || sig.includes("classification");
        case "contributions":  return sig.includes("contribution") || sig.includes("means_test") || sig.includes("means test");
        case "providers":      return sig.includes("provider");
        default:               return true;
    }
}

function signatureFor(item) {
    if (!item || !item.data) return "";
    if (item.type === "event")  return `${item.data.event_type || ""} ${item.data.note || ""}`;
    if (item.type === "state")  return `${item.data.kind || ""}`;
    if (item.type === "alert")  return `${item.data.title || ""} ${item.data.body || ""}`;
    return "";
}

function prettyTitle(raw) {
    if (!raw) return "Event";
    // UI-2 Rule 2.4, the previous \b\w regex matched every word-boundary,
    // including the letter AFTER an apostrophe, so "Month's" became "Month'S"
    // and "Hasn't" became "Hasn'T". Skip letters that are immediately after
    // an apostrophe or a curly-quote.
    return raw
        .toString()
        .replaceAll("_", " ")
        .replace(/(?<![’'])\b\w/g, (c) => c.toUpperCase());
}

function monthKey(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString("en-AU", { month: "long", year: "numeric" });
}

function dateLabel(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return { day: ", ", month: ", " };
    return {
        day: d.toLocaleString("en-AU", { day: "numeric" }),
        month: d.toLocaleString("en-AU", { month: "short" }),
    };
}

function iconFor(item) {
    const sig = signatureFor(item).toLowerCase();
    if (sig.includes("statement"))                          return FileText;
    if (sig.includes("care_plan") || sig.includes("care plan")) return ClipboardList;
    if (sig.includes("reassessment") || sig.includes("classification")) return RefreshCw;
    if (sig.includes("contribution") || sig.includes("means")) return DollarSign;
    if (sig.includes("provider"))                           return Building2;
    if (item?.type === "alert")                             return Bell;
    return Sparkles;
}

// Plain-English meaning copy bank. Falls back to item.note / item.body / a calm default.
function meaningFor(item) {
    if (!item || !item.data) return "Nothing to act on right now.";
    if (item.type === "event") {
        if (item.data.note) return item.data.note;
        const t = signatureFor(item).toLowerCase();
        if (t.includes("statement"))    return "A new monthly statement was logged. Open it any time from Statements.";
        if (t.includes("care_plan"))    return "Your care plan was updated. Open it to see what changed.";
        if (t.includes("reassessment")) return "A reassessment was recorded. This can change your quarterly budget.";
        if (t.includes("provider"))     return "A change with your provider was noted.";
        if (t.includes("contribution")) return "Your contribution amount changed. Check the new figure on your next statement.";
    }
    if (item.type === "alert") return humanizeMonths(item.data.body) || "Something needs a quick look.";
    if (item.type === "state") return "A small change to your status was recorded automatically.";
    return "Nothing to act on right now.";
}

function nextActionFor(item) {
    if (item?.type === "alert" && item.data?.next_action_text && item.data?.next_action_link) {
        return { label: item.data.next_action_text, href: item.data.next_action_link };
    }
    return null;
}

export default function ParticipantTimeline() {
    const { id: pidFromRoute } = useParams();
    const isExpired = useExpiredTrial();
    const [tl, setTl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [filter, setFilter] = useState("all");
    const [visibleCount, setVisibleCount] = useState(20);
    const sentinelRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
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
                if (!pid) { setErrored(true); setLoading(false); return; }
                const r = await api.get(`/scenario/participants/${pid}/timeline?limit=80`);
                if (!cancelled) { setTl(r.data); setLoading(false); }
            } catch (_e) {
                if (!cancelled) { setErrored(true); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [pidFromRoute]);

    // Infinite scroll: bump visibleCount when the sentinel enters the viewport.
    useEffect(() => {
        if (!sentinelRef.current) return;
        const el = sentinelRef.current;
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setVisibleCount((c) => Math.min(c + 20, (tl?.items?.length || 0)));
            }
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [tl?.items?.length]);

    const filteredItems = useMemo(() => {
        const all = tl?.items || [];
        return all.filter((it) => categoryMatches(it, filter));
    }, [tl?.items, filter]);

    const groups = useMemo(() => {
        const sliced = filteredItems.slice(0, visibleCount);
        const map = new Map();
        for (const it of sliced) {
            const k = monthKey(it.at);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(it);
        }
        return Array.from(map.entries()); // preserves insertion order
    }, [filteredItems, visibleCount]);

    const hasMore = filteredItems.length > visibleCount;

    return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-24 sm:pb-16 relative" data-testid="timeline-page">
            {/* ---- Header strip ---- */}
            <header className="mb-6 sm:mb-8">
                {pidFromRoute && (
                    <Link
                        to="/app/participants"
                        className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k mb-3"
                        data-testid="timeline-back-link"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" /> All Participants
                    </Link>
                )}
                <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight" data-testid="timeline-h1">
                    Your Timeline
                </h1>
                <p className="mt-2 text-sm sm:text-base text-muted-k leading-relaxed max-w-2xl">
                    A calm record of everything that has happened with your Support at Home, most recent first. Tap any event for the plain-English detail.
                </p>
            </header>

            {/* ---- Filter chips (Phase 3.2.4 = 9.8a wrapping chip grid) ---- */}
            <div className="mb-6" data-testid="timeline-filters">
                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((f) => {
                        const selected = filter === f.key;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => { setFilter(f.key); setVisibleCount(20); }}
                                data-testid={`timeline-filter-${f.key}`}
                                data-selected={selected}
                                aria-pressed={selected}
                                className={`rounded-full text-xs sm:text-sm font-medium px-4 py-2 transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k ${
                                    selected
                                        ? "bg-primary-k text-white border-primary-k"
                                        : "bg-surface text-primary-k border-kindred hover:border-primary-k/40"
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---- Body ---- */}
            {loading && <TimelineSkeleton />}

            {!loading && errored && (
                <div className="rounded-2xl bg-surface p-6 text-sm text-muted-k border border-kindred" data-testid="timeline-error">
                    Something went wrong loading your timeline. Try refreshing the page in a moment.
                </div>
            )}

            {!loading && !errored && filteredItems.length === 0 && (
                <EmptyState filterActive={filter !== "all"} onClearFilter={() => setFilter("all")} />
            )}

            {!loading && !errored && groups.length > 0 && (
                <div className="space-y-10" data-testid="timeline-feed">
                    {groups.map(([month, items]) => {
                        const slug = month.toLowerCase().replace(/\s+/g, "-");
                        return (
                            <section key={month} aria-labelledby={`timeline-month-${slug}`} data-testid={`timeline-month-${slug}`}>
                                <h2
                                    id={`timeline-month-${slug}`}
                                    className="font-heading text-lg text-primary-k/70 tracking-tight mb-4"
                                >
                                    {month}
                                </h2>
                                <ol className="space-y-4">
                                    {items.map((it, i) => <EventCard key={`${month}-${i}`} item={it} />)}
                                </ol>
                            </section>
                        );
                    })}
                    {hasMore && (
                        <div ref={sentinelRef} className="h-12 flex items-center justify-center text-xs text-muted-k" data-testid="timeline-load-more">
                            Loading older months…
                        </div>
                    )}
                </div>
            )}

            {/* ---- Sticky "Add Event" CTA (§10.2 bullet 6), Clay fill, white label. ---- */}
            <Link
                to="/app/scenario/new"
                data-testid="timeline-add-event"
                aria-disabled={isExpired ? "true" : undefined}
                onClick={(e) => { if (isExpired) e.preventDefault(); }}
                className={`fixed right-4 bottom-20 sm:right-8 sm:bottom-8 z-30 inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-sm shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-wayly-clay-500 ${isExpired ? "bg-wayly-clay-500/60 text-white/80 cursor-not-allowed" : "bg-wayly-clay-500 text-white hover:brightness-95"}`}
            >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Event
            </Link>
        </div>
    );
}

function EventCard({ item }) {
    const [open, setOpen] = useState(false);
    const Icon = iconFor(item);
    const { day, month } = dateLabel(item.at);
    const title = prettyTitle(item.type === "alert"
        ? humanizeMonths(item.data?.title)
        : (item.data?.event_type || item.data?.kind || "Update"));
    const meaning = meaningFor(item);
    const action = nextActionFor(item);
    const detail = (item.type === "event" && item.data?.proposed)
        ? `Status transition: ${item.data.proposed.lifecycle_transition || ""} (${item.data.proposed.transition_status || ""}).`
        : null;

    return (
        <li
            className="rounded-2xl border border-kindred bg-surface p-4 sm:p-5"
            data-testid="timeline-event-card"
        >
            <div className="flex gap-4">
                {/* Large date column */}
                <div className="flex flex-col items-center justify-start w-12 sm:w-14 flex-none pt-0.5" aria-hidden="true">
                    <span className="text-[10px] uppercase tracking-wider text-muted-k">{month}</span>
                    <span className="font-heading text-2xl sm:text-3xl text-primary-k leading-none mt-0.5">{day}</span>
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                        <Icon className="h-4 w-4 text-primary-k/60 mt-0.5 flex-none" aria-hidden="true" />
                        <h3 className="font-heading text-base sm:text-lg text-primary-k tracking-tight">
                            {title}
                        </h3>
                    </div>
                    <p className="mt-2 text-sm sm:text-base text-muted-k leading-relaxed">
                        {meaning}
                    </p>

                    {(detail || action) && (
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            data-testid="timeline-tell-me-more"
                            aria-expanded={open}
                            className="mt-3 inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-primary-k hover:underline focus:outline-none focus-visible:underline"
                        >
                            {open ? "Hide Detail" : "Tell Me More"}
                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                    )}

                    {open && (
                        <div className="mt-3 text-sm text-muted-k space-y-2" data-testid="timeline-detail">
                            {detail && <p>{detail}</p>}
                            {action && (
                                <p>
                                    What to do next:{" "}
                                    <a href={action.href} className="font-semibold text-primary-k underline">
                                        {action.label}
                                    </a>
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

function TimelineSkeleton() {
    // Calm shimmer, not an aggressive spinner. CSS-only via the existing kindred bg.
    return (
        <div className="space-y-8" data-testid="timeline-skeleton" aria-hidden="true">
            {[0, 1].map((g) => (
                <div key={g} className="space-y-4">
                    <div className="h-5 w-32 rounded bg-kindred animate-pulse" />
                    {[0, 1, 2].map((c) => (
                        <div key={c} className="rounded-2xl border border-kindred bg-surface p-5 flex gap-4">
                            <div className="w-12 sm:w-14 flex-none space-y-2">
                                <div className="h-3 w-8 rounded bg-kindred animate-pulse" />
                                <div className="h-6 w-10 rounded bg-kindred animate-pulse" />
                            </div>
                            <div className="flex-1 space-y-3">
                                <div className="h-4 w-3/4 rounded bg-kindred animate-pulse" />
                                <div className="h-3 w-full rounded bg-kindred animate-pulse" />
                                <div className="h-3 w-5/6 rounded bg-kindred animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function EmptyState({ filterActive, onClearFilter }) {
    if (filterActive) {
        return (
            <div className="rounded-2xl bg-surface border border-kindred px-6 py-10 text-center" data-testid="timeline-empty-filtered">
                <h2 className="font-heading text-xl text-primary-k">Nothing in this view yet</h2>
                <p className="mt-2 text-sm text-muted-k max-w-md mx-auto">
                    You have not had this kind of event recently. Try another filter, or come back when something changes.
                </p>
                <button
                    type="button"
                    onClick={onClearFilter}
                    className="mt-4 inline-flex items-center text-sm font-semibold text-primary-k underline"
                    data-testid="timeline-empty-clear-filter"
                >
                    Show All Events
                </button>
            </div>
        );
    }
    return (
        <div className="rounded-2xl bg-surface border border-kindred px-6 py-12 text-center" data-testid="timeline-empty">
            <h2 className="font-heading text-2xl text-primary-k">Nothing Here Yet</h2>
            <p className="mt-3 text-sm sm:text-base text-muted-k max-w-md mx-auto leading-relaxed">
                As things happen with your Support at Home, like a new statement, a care plan change, or a reassessment, they will appear here as a clear, plain-English timeline. There is nothing you need to do right now.
            </p>
        </div>
    );
}
