/**
 * Visit Calendar, UI-1 §3 rebuild + Jun 2026 Google-Calendar-style refit.
 *
 *   Click a day     → add an appointment / reminder / entry (prefilled date).
 *   Click an event  → view, edit, cancel, restore, archive, or delete it.
 *   "All entries"   → a searchable, filterable list with the same actions.
 *
 * Upcoming entries can be edited, cancelled, or deleted. Past entries can be
 * edited or archived (never hard-deleted by the user).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enAU } from "date-fns/locale";
import { Plus, X, Pencil, Archive, Ban, Trash2, RefreshCw, Search, Clock, MapPin, CalendarDays } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch, safeDelete } from "./_shared";
import { formatDateTime } from "@/lib/formatDate";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

const locales = { "en-AU": enAU };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }), // Monday
    getDay,
    locales,
});

// Expanded taxonomy — the calendar is now a full day-planner, not only a
// clinical-appointment log. Each entry has a distinct, calm colour.
const KIND_OPTIONS = [
    { value: "appointment", label: "Appointment", color: "#0E4D52" },
    { value: "gp", label: "GP Appointment", color: "#12707A" },
    { value: "specialist", label: "Specialist", color: "#2E6E83" },
    { value: "allied_health", label: "Allied Health (Physio / OT)", color: "#4E6E54" },
    { value: "nurse", label: "Nursing Visit", color: "#6B8F71" },
    { value: "home_visit", label: "Home Support Visit", color: "#7C9A7F" },
    { value: "telehealth", label: "Telehealth", color: "#3F7CAC" },
    { value: "assessment", label: "Assessment / Review", color: "#A5512B" },
    { value: "social_support", label: "Social Support", color: "#C2683D" },
    { value: "transport", label: "Transport", color: "#8A6D3B" },
    { value: "respite", label: "Respite", color: "#9A5B8C" },
    { value: "medication", label: "Medication", color: "#B4553F" },
    { value: "reminder", label: "Reminder", color: "#D08A3E" },
    { value: "personal", label: "Personal Entry", color: "#6E6459" },
    { value: "other", label: "Other", color: "#7A6450" },
];
const KIND_COLOR = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.color]));
const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map((o) => [o.value, o.label]));

// Duration presets + a "Custom…" escape hatch (any 5–720 min value).
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
const durationLabel = (m) => {
    if (m % 60 === 0) return `${m / 60} hr${m / 60 > 1 ? "s" : ""}`;
    if (m > 60) return `${Math.floor(m / 60)} hr ${m % 60} min`;
    return `${m} min`;
};

const isPast = (dt) => new Date(dt).getTime() < Date.now();

const CAL_CSS = `
.wayly-calendar-wrapper .rbc-toolbar button{border-radius:9999px;border:1px solid #E4DED2;color:#0E4D52;font-weight:500;padding:6px 14px;transition:all .15s ease}
.wayly-calendar-wrapper .rbc-toolbar button:hover{background:#0E4D52;color:#fff;border-color:#0E4D52}
.wayly-calendar-wrapper .rbc-toolbar button.rbc-active{background:#0E4D52;color:#fff;border-color:#0E4D52;box-shadow:none}
.wayly-calendar-wrapper .rbc-toolbar-label{font-family:var(--font-heading,serif);font-size:1.25rem;color:#0E2A47;font-weight:600}
.wayly-calendar-wrapper .rbc-header{padding:10px 4px;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6F6A60;border-color:#EFE9DD}
.wayly-calendar-wrapper .rbc-month-view,.wayly-calendar-wrapper .rbc-time-view{border-color:#EFE9DD;border-radius:14px;overflow:hidden}
.wayly-calendar-wrapper .rbc-day-bg+.rbc-day-bg,.wayly-calendar-wrapper .rbc-month-row+.rbc-month-row{border-color:#F1ECE1}
.wayly-calendar-wrapper .rbc-off-range-bg{background:#FBF9F4}
.wayly-calendar-wrapper .rbc-today{background:#E7F1EE}
.wayly-calendar-wrapper .rbc-date-cell{padding:6px 8px;font-size:13px}
.wayly-calendar-wrapper .rbc-event{border-radius:6px!important;box-shadow:0 1px 2px rgba(14,42,71,.12)}
.wayly-calendar-wrapper .rbc-event:focus{outline:2px solid #0E4D52}
.wayly-calendar-wrapper .rbc-show-more{color:#0E4D52;font-weight:600}
`;

export default function VisitCalendar() {
    const [visits, setVisits] = useState([]);
    const [view, setView] = useState(Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState(null);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("upcoming");
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        const data = await safeGet("/visits");
        if (data) setVisits(data);
    };
    useEffect(() => { refresh(); }, []);

    const events = useMemo(() => visits.map((v) => {
        const start = new Date(v.starts_at);
        const end = new Date(start.getTime() + (v.duration_minutes || 60) * 60000);
        return { id: v.id, title: v.title, start, end, resource: v, allDay: !!v.all_day };
    }), [visits]);

    const eventStyle = (event) => {
        const v = event.resource;
        const isCancelled = v.status === "cancelled";
        const isArchived = v.status === "archived";
        return {
            style: {
                backgroundColor: isCancelled ? "#9CA3AF" : (KIND_COLOR[v.kind] || KIND_COLOR.other),
                opacity: isArchived ? 0.55 : (isCancelled ? 0.45 : 1),
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                padding: "1px 6px",
                textDecoration: isCancelled ? "line-through" : "none",
            },
        };
    };

    const blankDraft = (when) => ({
        id: null,
        title: "",
        kind: "appointment",
        provider: "",
        location: "",
        notes: "",
        duration_minutes: 60,
        durationMode: "60",
        all_day: false,
        starts_at_input: toLocalInput(when || new Date()),
        status: "active",
    });

    const openNew = (slot) => {
        setDraft(blankDraft(slot?.start || new Date()));
        setCreating(true);
        setEditing(false);
        setSelected(null);
        scrollToForm();
    };

    const openEvent = (event) => {
        setSelected(event.resource);
        setEditing(false);
        setCreating(false);
    };

    const editVisit = (v) => {
        const dm = v.duration_minutes || 60;
        setSelected(v);
        setDraft({
            id: v.id,
            title: v.title,
            kind: v.kind || "appointment",
            provider: v.provider || "",
            location: v.location || "",
            notes: v.notes || "",
            duration_minutes: dm,
            durationMode: DURATION_PRESETS.includes(dm) ? String(dm) : "custom",
            all_day: !!v.all_day,
            starts_at_input: toLocalInput(new Date(v.starts_at)),
            status: v.status || "active",
        });
        setEditing(true);
        setCreating(false);
        scrollToForm();
    };

    const saveDraft = async (e) => {
        e?.preventDefault?.();
        if (!draft.title || !draft.starts_at_input) return;
        const payload = {
            title: draft.title,
            starts_at: new Date(draft.starts_at_input).toISOString(),
            duration_minutes: Number(draft.duration_minutes) || 60,
            all_day: !!draft.all_day,
            location: draft.location || null,
            provider: draft.provider || null,
            notes: draft.notes || null,
            kind: draft.kind,
            status: draft.status || "active",
        };
        if (draft.id) {
            const r = await safePatch(`/visits/${draft.id}`, payload, "Entry updated");
            if (r) { setSelected(r); setEditing(false); setDraft(null); refresh(); }
        } else {
            const r = await safePost("/visits", payload, "Entry added");
            if (r) { setCreating(false); setDraft(null); refresh(); }
        }
    };

    const setStatusFor = async (v, status, successMsg) => {
        const r = await safePatch(`/visits/${v.id}`, {
            title: v.title, starts_at: v.starts_at, duration_minutes: v.duration_minutes,
            all_day: !!v.all_day, location: v.location || null, provider: v.provider || null,
            notes: v.notes || null, kind: v.kind, status,
        }, successMsg);
        if (r) { if (selected && selected.id === v.id) setSelected(r); refresh(); }
    };

    const deleteVisit = async (v) => {
        if (!window.confirm(`Delete "${v.title}" permanently? This cannot be undone.`)) return;
        if (await safeDelete(`/visits/${v.id}`, "Entry removed")) {
            if (selected && selected.id === v.id) setSelected(null);
            refresh();
        }
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return visits
            .filter((v) => {
                if (statusFilter === "upcoming") return v.status === "active" && !isPast(v.starts_at);
                if (statusFilter === "past") return isPast(v.starts_at) || v.status === "archived";
                if (statusFilter === "cancelled") return v.status === "cancelled";
                return true; // all
            })
            .filter((v) => !q || `${v.title} ${v.provider || ""} ${v.location || ""} ${KIND_LABEL[v.kind] || ""}`.toLowerCase().includes(q))
            .sort((a, b) => (a.starts_at < b.starts_at ? (statusFilter === "past" ? 1 : -1) : (statusFilter === "past" ? -1 : 1)));
    }, [visits, query, statusFilter]);

    return (
        <PageShell
            testid="visits-page"
            overline="Calendar"
            title="Calendar & Appointments"
            description="Everything in one place — appointments, home visits, telehealth, reminders and personal entries. Click any day to add something, or click an entry to view, edit, cancel or archive it."
            actions={isExpired ? null : <button type="button" data-testid="visits-add-btn" onClick={() => openNew()} className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#091D33] transition-colors"><Plus className="h-4 w-4" /> Add entry</button>}
        >
            <style>{CAL_CSS}</style>

            {visits.length === 0 ? (
                <EmptyCard
                    title="Nothing on the calendar yet"
                    body="Add a GP appointment, allied-health visit, ACAT review, transport, a medication reminder, or any personal entry. Click a day on the calendar to get started."
                />
            ) : null}

            <div className="bg-surface border border-kindred rounded-2xl p-4 shadow-sm wayly-calendar-wrapper" data-testid="visits-calendar">
                <Calendar
                    localizer={localizer}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    onView={setView}
                    views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                    date={date}
                    onNavigate={setDate}
                    selectable={!isExpired}
                    onSelectSlot={isExpired ? undefined : openNew}
                    onSelectEvent={openEvent}
                    eventPropGetter={eventStyle}
                    popup
                    style={{ minHeight: 620 }}
                    messages={{
                        next: "Next", previous: "Back", today: "Today",
                        month: "Month", week: "Week", agenda: "List",
                        noEventsInRange: "No entries in this range.",
                    }}
                />
            </div>

            {/* Create / edit form — tinted so it stands out from the white calendar (#4) */}
            {(creating || editing) && draft && !isExpired && (
                <DraftForm
                    draft={draft}
                    setDraft={setDraft}
                    isEdit={editing}
                    onSave={saveDraft}
                    onCancel={() => { setCreating(false); setEditing(false); setDraft(null); }}
                />
            )}

            {/* Selected event details — tinted panel (#4) */}
            {selected && !editing && !creating && (
                <aside data-testid="visits-detail" className="rounded-2xl border border-[#D9E4DE] bg-gradient-to-br from-[#EEF5F1] to-[#F4EFE6] p-6 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white rounded-full px-2.5 py-1" style={{ backgroundColor: KIND_COLOR[selected.kind] || KIND_COLOR.other }}>
                                {KIND_LABEL[selected.kind] || selected.kind}{selected.status !== "active" ? ` · ${selected.status}` : ""}
                            </span>
                            <h3 className="font-heading text-xl text-primary-k mt-2">{selected.title}</h3>
                            <div className="text-sm text-muted-k mt-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {selected.all_day ? new Date(selected.starts_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) + " · All day" : `${formatDateTime(selected.starts_at)} · ${durationLabel(selected.duration_minutes || 60)}`}</div>
                            {selected.provider && <div className="text-sm text-primary-k mt-1"><strong>Provider:</strong> {selected.provider}</div>}
                            {selected.location && <div className="text-sm text-primary-k mt-0.5 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {selected.location}</div>}
                            {selected.notes && <p className="text-sm text-primary-k mt-2 whitespace-pre-wrap">{selected.notes}</p>}
                        </div>
                        <button type="button" onClick={() => setSelected(null)} className="text-muted-k hover:text-primary-k" data-testid="visits-detail-close" aria-label="Close"><X className="h-4 w-4" /></button>
                    </div>

                    <div className="pt-3 border-t border-[#D9E4DE] flex flex-wrap items-center gap-2">
                        {isExpired ? (
                            <p className="text-xs text-muted-k italic">Reactivate to edit, cancel, archive or delete entries.</p>
                        ) : (<>
                            <button type="button" onClick={() => editVisit(selected)} data-testid="visits-detail-edit" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-kindred bg-surface px-3 py-1.5 hover:border-primary-k"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                            {!isPast(selected.starts_at) && selected.status === "active" && (
                                <button type="button" onClick={() => setStatusFor(selected, "cancelled", "Entry cancelled")} data-testid="visits-detail-cancel" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-clay/40 text-clay bg-surface px-3 py-1.5 hover:bg-clay hover:text-white"><Ban className="h-3.5 w-3.5" /> Cancel</button>
                            )}
                            {selected.status === "cancelled" && (
                                <button type="button" onClick={() => setStatusFor(selected, "active", "Entry restored")} data-testid="visits-detail-restore" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-sage/40 text-primary-k bg-surface px-3 py-1.5 hover:bg-sage hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> Restore</button>
                            )}
                            {isPast(selected.starts_at) && selected.status !== "archived" && (
                                <button type="button" onClick={() => setStatusFor(selected, "archived", "Moved to archive")} data-testid="visits-detail-archive" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-kindred bg-surface px-3 py-1.5 hover:border-primary-k"><Archive className="h-3.5 w-3.5" /> Archive</button>
                            )}
                            {selected.status === "archived" && (
                                <button type="button" onClick={() => setStatusFor(selected, "active", "Restored")} data-testid="visits-detail-unarchive" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-kindred bg-surface px-3 py-1.5 hover:border-primary-k"><RefreshCw className="h-3.5 w-3.5" /> Restore</button>
                            )}
                            <button type="button" onClick={() => deleteVisit(selected)} data-testid="visits-detail-delete" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-terracotta/40 text-terracotta bg-surface px-3 py-1.5 hover:bg-terracotta hover:text-white ml-auto"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        </>)}
                    </div>
                </aside>
            )}

            {/* All entries list (#6) */}
            {visits.length > 0 && (
                <section className="rounded-2xl border border-kindred bg-surface p-5 shadow-sm" data-testid="visits-list">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h3 className="font-heading text-lg text-primary-k flex items-center gap-2"><CalendarDays className="h-4 w-4" /> All entries</h3>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="h-3.5 w-3.5 text-muted-k absolute left-3 top-1/2 -translate-y-1/2" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries" data-testid="visits-list-search" className="rounded-full border border-kindred bg-surface pl-8 pr-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 ring-primary-k" />
                            </div>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="visits-list-filter" className="rounded-full border border-kindred bg-surface px-3 py-1.5 text-sm">
                                <option value="upcoming">Upcoming</option>
                                <option value="past">Past &amp; archived</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    </div>
                    {filtered.length === 0 ? (
                        <p className="text-sm text-muted-k py-6 text-center">No entries match this view.</p>
                    ) : (
                        <ul className="divide-y divide-kindred">
                            {filtered.map((v) => (
                                <li key={v.id} data-testid={`visits-list-row-${v.id}`} className={`flex items-center gap-3 py-3 ${v.status !== "active" ? "opacity-60" : ""}`}>
                                    <span className="h-9 w-1.5 rounded-full flex-none" style={{ backgroundColor: v.status === "cancelled" ? "#9CA3AF" : (KIND_COLOR[v.kind] || KIND_COLOR.other) }} />
                                    <button type="button" onClick={() => openEvent({ resource: v })} className="flex-1 min-w-0 text-left">
                                        <div className="text-sm font-medium text-primary-k truncate">{v.title}{v.status === "cancelled" ? " · cancelled" : v.status === "archived" ? " · archived" : ""}</div>
                                        <div className="text-xs text-muted-k truncate">{KIND_LABEL[v.kind] || v.kind} · {v.all_day ? new Date(v.starts_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " · All day" : formatDateTime(v.starts_at)}{v.provider ? ` · ${v.provider}` : ""}</div>
                                    </button>
                                    {!isExpired && (
                                        <div className="flex items-center gap-1 flex-none">
                                            <button type="button" onClick={() => editVisit(v)} data-testid={`visits-list-edit-${v.id}`} aria-label="Edit" className="p-1.5 rounded-lg text-muted-k hover:text-primary-k hover:bg-surface-2"><Pencil className="h-4 w-4" /></button>
                                            {v.status === "cancelled"
                                                ? <button type="button" onClick={() => setStatusFor(v, "active", "Entry restored")} data-testid={`visits-list-restore-${v.id}`} aria-label="Restore" className="p-1.5 rounded-lg text-muted-k hover:text-sage hover:bg-surface-2"><RefreshCw className="h-4 w-4" /></button>
                                                : <button type="button" onClick={() => setStatusFor(v, "cancelled", "Entry cancelled")} data-testid={`visits-list-cancel-${v.id}`} aria-label="Cancel" className="p-1.5 rounded-lg text-muted-k hover:text-clay hover:bg-surface-2"><Ban className="h-4 w-4" /></button>}
                                            <button type="button" onClick={() => deleteVisit(v)} data-testid={`visits-list-delete-${v.id}`} aria-label="Delete" className="p-1.5 rounded-lg text-muted-k hover:text-terracotta hover:bg-surface-2"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </PageShell>
    );
}

function RequiredMark() {
    return <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-terracotta">Required</span>;
}
function OptionalMark() {
    return <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-k">Optional</span>;
}

function DraftForm({ draft, setDraft, isEdit, onSave, onCancel }) {
    const onDurationMode = (mode) => {
        if (mode === "custom") setDraft({ ...draft, durationMode: "custom" });
        else setDraft({ ...draft, durationMode: mode, duration_minutes: Number(mode) });
    };
    return (
        <form id="visits-form-anchor" data-testid="visits-form" onSubmit={onSave} className="rounded-2xl border border-[#D9E4DE] bg-gradient-to-br from-[#EEF5F1] to-[#F4EFE6] p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
                <h3 className="font-heading text-xl text-primary-k">{isEdit ? "Edit entry" : "Add entry"}</h3>
                <button type="button" onClick={onCancel} className="text-muted-k hover:text-primary-k" data-testid="visits-form-close" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">What is it?<RequiredMark /></span>
                    <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="visits-form-title" placeholder="e.g. GP appointment, physio, medication reminder" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Type<RequiredMark /></span>
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} data-testid="visits-form-kind" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">When<RequiredMark /></span>
                    <input type="datetime-local" required value={draft.starts_at_input} onChange={(e) => setDraft({ ...draft, starts_at_input: e.target.value })} data-testid="visits-form-when" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Duration<RequiredMark /></span>
                    <select value={draft.durationMode} onChange={(e) => onDurationMode(e.target.value)} data-testid="visits-form-duration" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        {DURATION_PRESETS.map((m) => <option key={m} value={String(m)}>{durationLabel(m)}</option>)}
                        <option value="custom">Custom…</option>
                    </select>
                </label>
                {draft.durationMode === "custom" && (
                    <label className="block">
                        <span className="text-xs text-muted-k">Custom minutes<RequiredMark /></span>
                        <input type="number" min="5" max="720" value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} data-testid="visits-form-duration-custom" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    </label>
                )}
                <label className="block">
                    <span className="text-xs text-muted-k">Provider or person<OptionalMark /></span>
                    <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} data-testid="visits-form-provider" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">Where<OptionalMark /></span>
                    <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} data-testid="visits-form-location" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">Notes<OptionalMark /></span>
                    <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} data-testid="visits-form-notes" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
            </div>
            <div className="pt-3 border-t border-[#D9E4DE] flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg border border-kindred bg-surface px-4 py-2 text-sm text-primary-k hover:bg-surface-2">Cancel</button>
                <button type="submit" data-testid="visits-form-submit" className="rounded-lg bg-primary-k px-5 py-2 text-sm font-semibold text-white hover:bg-[#091D33]">{isEdit ? "Save changes" : "Add to calendar"}</button>
            </div>
        </form>
    );
}

function scrollToForm() {
    setTimeout(() => {
        const el = document.getElementById("visits-form-anchor");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
}

function toLocalInput(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
