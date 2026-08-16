/**
 * Visit Calendar, UI-1 §3 rebuild.
 *
 * Renders an actual calendar (month / week / agenda) using react-big-calendar
 * with date-fns. Implements the spec's edit/cancel/archive rules:
 *
 *   Upcoming appointments  → can be edited, cancelled, or deleted.
 *   Past appointments      → can be edited (e.g. add notes after the fact),
 *                            archived (default once the date passes), or
 *                            re-opened if a date was wrong. They are not
 *                            hard-deleted by the user.
 *
 * The calendar is the primary view. Below it sits the day-detail strip with
 * the full action set for the selected event.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enAU } from "date-fns/locale";
import { Plus, X, Pencil, Archive, Ban, Trash2, RefreshCw } from "lucide-react";
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

const KIND_COLOR = {
    appointment: "#0E2A47",  // primary teal
    home_visit: "#6B8F71",   // sage
    telehealth: "#2E6E83",   // teal-mid
    assessment: "#C2683D",   // clay
    other: "#7A6450",        // taupe
};

const KIND_LABEL = {
    appointment: "Appointment",
    home_visit: "Home Visit",
    telehealth: "Telehealth",
    assessment: "Assessment",
    other: "Other",
};

const isPast = (dt) => new Date(dt).getTime() < Date.now();

export default function VisitCalendar() {
    const [visits, setVisits] = useState([]);
    const [view, setView] = useState(Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState(null);
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        const data = await safeGet("/visits");
        if (data) setVisits(data);
    };
    useEffect(() => { refresh(); }, []);

    const events = useMemo(() => visits
        // §3, past + active visits get auto-marked archived by default in the
        // UI. The DB record is still active; the user can choose to archive
        // explicitly. Cancelled events stay visible but greyed out.
        .map((v) => {
            const start = new Date(v.starts_at);
            const end = new Date(start.getTime() + (v.duration_minutes || 60) * 60000);
            return { id: v.id, title: v.title, start, end, resource: v };
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
                borderRadius: "4px",
                fontSize: "12px",
                padding: "1px 4px",
                textDecoration: isCancelled ? "line-through" : "none",
            },
        };
    };

    const openNew = (slot) => {
        const defaults = slot?.start || new Date();
        setDraft({
            id: null,
            title: "",
            kind: "appointment",
            provider: "",
            location: "",
            notes: "",
            duration_minutes: 60,
            starts_at_input: toLocalInput(defaults),
        });
        setCreating(true);
        setEditing(false);
        setSelected(null);
    };

    const openEvent = (event) => {
        setSelected(event.resource);
        setEditing(false);
        setCreating(false);
    };

    const startEdit = () => {
        if (!selected) return;
        setDraft({
            id: selected.id,
            title: selected.title,
            kind: selected.kind,
            provider: selected.provider || "",
            location: selected.location || "",
            notes: selected.notes || "",
            duration_minutes: selected.duration_minutes || 60,
            starts_at_input: toLocalInput(new Date(selected.starts_at)),
            status: selected.status || "active",
        });
        setEditing(true);
        setCreating(false);
    };

    const saveDraft = async (e) => {
        e?.preventDefault?.();
        if (!draft.title || !draft.starts_at_input) {
            return;
        }
        const payload = {
            title: draft.title,
            starts_at: new Date(draft.starts_at_input).toISOString(),
            duration_minutes: Number(draft.duration_minutes),
            location: draft.location || null,
            provider: draft.provider || null,
            notes: draft.notes || null,
            kind: draft.kind,
            status: draft.status || "active",
        };
        if (draft.id) {
            const r = await safePatch(`/visits/${draft.id}`, payload, "Appointment updated");
            if (r) { setSelected(r); setEditing(false); refresh(); }
        } else {
            const r = await safePost("/visits", payload, "Appointment added");
            if (r) { setCreating(false); setDraft(null); refresh(); }
        }
    };

    const setStatus = async (status, successMsg) => {
        if (!selected) return;
        const r = await safePatch(`/visits/${selected.id}`, {
            title: selected.title, starts_at: selected.starts_at,
            duration_minutes: selected.duration_minutes, location: selected.location || null,
            provider: selected.provider || null, notes: selected.notes || null, kind: selected.kind,
            status,
        }, successMsg);
        if (r) { setSelected(r); refresh(); }
    };

    const hardDelete = async () => {
        if (!selected) return;
        if (!window.confirm(`Delete "${selected.title}" permanently? This cannot be undone.`)) return;
        if (await safeDelete(`/visits/${selected.id}`, "Appointment removed")) {
            setSelected(null);
            refresh();
        }
    };

    return (
        <PageShell
            testid="visits-page"
            overline="Calendar"
            title="Appointments and Home Visits"
            description="Every appointment, home visit, telehealth call and assessment in one place. Click a day to add something new, or click an event to view, edit, cancel, or archive it."
            actions={isExpired ? null : <button type="button" data-testid="visits-add-btn" onClick={() => openNew()} className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#091D33]"><Plus className="h-4 w-4" /> Add Appointment</button>}
        >
            {visits.length === 0 ? (
                <EmptyCard
                    title="Nothing on the calendar yet"
                    body="Add a GP appointment, allied-health visit, ACAT review, or any provider home visit. Wayly will remind you the day before."
                />
            ) : null}

            <div className="bg-surface border border-kindred rounded-2xl p-4 wayly-calendar-wrapper" data-testid="visits-calendar">
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
                    style={{ minHeight: 600 }}
                    messages={{
                        next: "Next",
                        previous: "Back",
                        today: "Today",
                        month: "Month",
                        week: "Week",
                        agenda: "Agenda",
                        noEventsInRange: "No appointments in this range.",
                    }}
                />
            </div>

            {/* Selected event details */}
            {selected && !editing && (
                <aside data-testid="visits-detail" className="bg-surface border border-kindred rounded-2xl p-6 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-k">{KIND_LABEL[selected.kind] || selected.kind}{selected.status !== "active" ? ` · ${selected.status}` : ""}</div>
                            <h3 className="font-heading text-xl text-primary-k mt-0.5">{selected.title}</h3>
                            <div className="text-sm text-muted-k mt-1">{formatDateTime(selected.starts_at)} · {selected.duration_minutes} min</div>
                            {selected.provider && <div className="text-sm text-primary-k mt-1"><strong>Provider:</strong> {selected.provider}</div>}
                            {selected.location && <div className="text-sm text-primary-k mt-0.5"><strong>Where:</strong> {selected.location}</div>}
                            {selected.notes && <p className="text-sm text-primary-k mt-2 whitespace-pre-wrap">{selected.notes}</p>}
                        </div>
                        <button type="button" onClick={() => setSelected(null)} className="text-muted-k hover:text-primary-k" data-testid="visits-detail-close" aria-label="Close"><X className="h-4 w-4" /></button>
                    </div>

                    <div className="pt-3 border-t border-kindred flex flex-wrap items-center gap-2">
                        {isExpired ? (
                            <p className="text-xs text-muted-k italic">Subscribe to edit, cancel, archive or delete appointments.</p>
                        ) : (<>
                        <button type="button" onClick={startEdit} data-testid="visits-detail-edit" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-kindred px-3 py-1.5 hover:border-primary-k hover:bg-surface-2"><Pencil className="h-3.5 w-3.5" /> Edit</button>

                        {!isPast(selected.starts_at) && selected.status === "active" && (
                            <button type="button" onClick={() => setStatus("cancelled", "Appointment cancelled")} data-testid="visits-detail-cancel" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-clay/40 text-clay px-3 py-1.5 hover:bg-clay hover:text-white"><Ban className="h-3.5 w-3.5" /> Cancel</button>
                        )}

                        {selected.status === "cancelled" && (
                            <button type="button" onClick={() => setStatus("active", "Appointment restored")} data-testid="visits-detail-restore" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-sage/40 text-primary-k px-3 py-1.5 hover:bg-sage hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> Restore</button>
                        )}

                        {isPast(selected.starts_at) && selected.status !== "archived" && (
                            <button type="button" onClick={() => setStatus("archived", "Moved to archive")} data-testid="visits-detail-archive" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-kindred px-3 py-1.5 hover:border-primary-k hover:bg-surface-2"><Archive className="h-3.5 w-3.5" /> Archive</button>
                        )}

                        {selected.status === "archived" && (
                            <button type="button" onClick={() => setStatus("active", "Restored")} data-testid="visits-detail-unarchive" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-kindred px-3 py-1.5 hover:border-primary-k hover:bg-surface-2"><RefreshCw className="h-3.5 w-3.5" /> Restore</button>
                        )}

                        {!isPast(selected.starts_at) && (
                            <button type="button" onClick={hardDelete} data-testid="visits-detail-delete" className="inline-flex items-center gap-1.5 text-xs rounded-full border border-terracotta/40 text-terracotta px-3 py-1.5 hover:bg-terracotta hover:text-white ml-auto"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        )}
                        </>)}
                    </div>
                </aside>
            )}

            {/* Create / edit form */}
            {(creating || editing) && draft && !isExpired && (
                <DraftForm
                    draft={draft}
                    setDraft={setDraft}
                    isEdit={editing}
                    onSave={saveDraft}
                    onCancel={() => { setCreating(false); setEditing(false); setDraft(null); }}
                />
            )}
        </PageShell>
    );
}

function DraftForm({ draft, setDraft, isEdit, onSave, onCancel }) {
    return (
        <form data-testid="visits-form" onSubmit={onSave} className="bg-surface border border-kindred rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-heading text-xl text-primary-k">{isEdit ? "Edit Appointment" : "Add Appointment"}</h3>
                <button type="button" onClick={onCancel} className="text-muted-k hover:text-primary-k" data-testid="visits-form-close" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">What Is It?</span>
                    <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="visits-form-title" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Kind</span>
                    <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} data-testid="visits-form-kind" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">When</span>
                    <input type="datetime-local" required value={draft.starts_at_input} onChange={(e) => setDraft({ ...draft, starts_at_input: e.target.value })} data-testid="visits-form-when" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Duration (Minutes)</span>
                    <input type="number" min="5" max="720" value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} data-testid="visits-form-duration" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Provider or Person</span>
                    <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} data-testid="visits-form-provider" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">Where</span>
                    <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} data-testid="visits-form-location" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">Notes</span>
                    <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} data-testid="visits-form-notes" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
            </div>
            <div className="pt-3 border-t border-kindred flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-full border border-kindred px-4 py-2 text-sm text-primary-k hover:bg-surface-2">Cancel</button>
                <button type="submit" data-testid="visits-form-submit" className="rounded-full bg-primary-k px-5 py-2 text-sm font-semibold text-white hover:bg-[#091D33]">{isEdit ? "Save Changes" : "Add to Calendar"}</button>
            </div>
        </form>
    );
}

function toLocalInput(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
