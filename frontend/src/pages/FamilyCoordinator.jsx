/**
 * FC-2 v1 · Family Coordinator hub.
 * Route: /app/participants/:id/coordinator
 *
 * Tabbed hub for household coordination: Tasks, Calendar, Messages,
 * Participant Voice (flagship), Incidents, plus a one-click handover pack PDF.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import PageIntro from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ListChecks, CalendarDays, MessagesSquare, Heart, AlertTriangle, Download,
    Plus, Check, X, Trash2, ShieldAlert, Loader2, CheckCircle2,
} from "lucide-react";

const TABS = [
    ["tasks", "Tasks", ListChecks],
    ["calendar", "Calendar", CalendarDays],
    ["voice", "Their Voice", Heart],
    ["messages", "Messages", MessagesSquare],
    ["incidents", "Issues", AlertTriangle],
];

const VOICE_CATEGORIES = [
    ["preferences_care_style", "Care style"],
    ["preferences_daily_routine", "Daily routine"],
    ["preferences_communication", "Communication"],
    ["wishes_future", "Wishes for the future"],
    ["feedback_on_care_quality", "Feedback on care"],
    ["concerns_or_worries", "Concerns or worries"],
    ["values_and_dignity", "Values and dignity"],
    ["other", "Something else"],
];
const VISIBILITY = [
    ["shared_with_household", "Everyone in the household"],
    ["private_to_participant", "Private to me"],
];

const fmt = (v) => { try { return new Date(v).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return String(v || "").slice(0, 16); } };

/* ------------------------------ Tasks ------------------------------ */
function TasksTab({ pid }) {
    const [tasks, setTasks] = useState([]);
    const [title, setTitle] = useState("");
    const [due, setDue] = useState("");
    const [loading, setLoading] = useState(true);
    const load = useCallback(async () => {
        setLoading(true);
        try { const { data } = await api.get(`/fc2/participants/${pid}/tasks`); setTasks(data.tasks || []); }
        finally { setLoading(false); }
    }, [pid]);
    useEffect(() => { load(); }, [load]);
    const add = async () => {
        if (!title.trim()) return;
        await api.post(`/fc2/participants/${pid}/tasks`, { title: title.trim(), due_date: due || null });
        setTitle(""); setDue(""); load();
    };
    const complete = async (t) => { await api.post(`/fc2/tasks/${t.id}/complete`, {}); load(); };
    const cancel = async (t) => { await api.post(`/fc2/tasks/${t.id}/cancel`, { cancellation_reason: "no longer needed" }); load(); };
    return (
        <div className="space-y-3" data-testid="fc2-tasks">
            <div className="flex flex-wrap gap-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task, e.g. Pick up scripts" data-testid="fc2-task-title" className="flex-1 min-w-[200px]" />
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} data-testid="fc2-task-due" className="w-auto" />
                <Button onClick={add} data-testid="fc2-task-add"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            {loading ? <div className="h-20 animate-pulse rounded-xl bg-primary-k/5" />
                : tasks.length === 0 ? <p className="text-sm text-muted-k" data-testid="fc2-tasks-empty">No tasks yet. Add the first thing that needs doing.</p>
                    : tasks.map((t) => (
                        <div key={t.id} className={`flex items-center gap-3 rounded-xl border border-primary-k/10 p-3 ${t.status === "done" ? "opacity-60" : ""}`} data-testid={`fc2-task-${t.id}`}>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm text-primary-k ${t.status === "done" ? "line-through" : ""}`}>{t.title}</p>
                                {t.due_date && <p className="text-[11px] text-muted-k">Due {t.due_date}</p>}
                            </div>
                            {t.status !== "done" && t.status !== "cancelled" && (
                                <>
                                    <button onClick={() => complete(t)} className="text-emerald-700" data-testid={`fc2-task-done-${t.id}`}><Check className="w-4 h-4" /></button>
                                    <button onClick={() => cancel(t)} className="text-muted-k hover:text-red-600" data-testid={`fc2-task-cancel-${t.id}`}><X className="w-4 h-4" /></button>
                                </>
                            )}
                            {t.status === "done" && <span className="text-[11px] text-emerald-700">Done</span>}
                            {t.status === "cancelled" && <span className="text-[11px] text-muted-k">Cancelled</span>}
                        </div>
                    ))}
        </div>
    );
}

/* ------------------------------ Calendar ------------------------------ */
function CalendarTab({ pid }) {
    const [entries, setEntries] = useState([]);
    const [title, setTitle] = useState("");
    const [start, setStart] = useState("");
    const [provider, setProvider] = useState("");
    const load = useCallback(async () => {
        const { data } = await api.get(`/fc2/participants/${pid}/calendar`);
        setEntries(data.entries || []);
    }, [pid]);
    useEffect(() => { load(); }, [load]);
    const add = async () => {
        if (!title.trim() || !start) { toast.error("Add a title and a date/time."); return; }
        await api.post(`/fc2/participants/${pid}/calendar`, { title: title.trim(), start_datetime: new Date(start).toISOString(), provider_name: provider || null });
        setTitle(""); setStart(""); setProvider(""); load();
    };
    const confirm = async (e, status) => {
        await api.post(`/fc2/calendar-entries/${e.id}/confirm-attendance`, { attendance_status: status });
        if (status === "disputed") toast.success("Reported. A case has been opened.");
        load();
    };
    return (
        <div className="space-y-3" data-testid="fc2-calendar">
            <div className="flex flex-wrap gap-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Service or appointment" data-testid="fc2-cal-title" className="flex-1 min-w-[160px]" />
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} data-testid="fc2-cal-start" className="w-auto" />
                <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Provider" data-testid="fc2-cal-provider" className="w-32" />
                <Button onClick={add} data-testid="fc2-cal-add"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            {entries.length === 0 ? <p className="text-sm text-muted-k" data-testid="fc2-calendar-empty">No calendar entries yet.</p>
                : entries.map((e) => (
                    <div key={e.id} className="rounded-xl border border-primary-k/10 p-3" data-testid={`fc2-cal-${e.id}`}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm text-primary-k font-medium">{fmt(e.start_datetime)}</p>
                                <p className="text-sm text-primary-k">{e.title}{e.provider_name ? ` · ${e.provider_name}` : ""}</p>
                            </div>
                            <span className="text-[11px] text-muted-k shrink-0">{e.attendance_status?.replace(/_/g, " ")}</span>
                        </div>
                        {e.attendance_status === "expected" && (
                            <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={() => confirm(e, "confirmed_present")} data-testid={`fc2-cal-present-${e.id}`}><CheckCircle2 className="w-4 h-4 mr-1" />Happened</Button>
                                <Button size="sm" variant="outline" onClick={() => confirm(e, "confirmed_missed")} data-testid={`fc2-cal-missed-${e.id}`}>Missed</Button>
                                <Button size="sm" variant="outline" onClick={() => confirm(e, "disputed")} data-testid={`fc2-cal-dispute-${e.id}`}><AlertTriangle className="w-4 h-4 mr-1" />Dispute</Button>
                            </div>
                        )}
                        {e.case_id && <Link to={`/app/participants/${pid}/cases/${e.case_id}`} className="text-xs text-primary-k underline mt-1 inline-block">View case</Link>}
                    </div>
                ))}
        </div>
    );
}

/* ------------------------------ Voice ------------------------------ */
function VoiceTab({ pid }) {
    const [notes, setNotes] = useState([]);
    const [category, setCategory] = useState("preferences_daily_routine");
    const [visibility, setVisibility] = useState("shared_with_household");
    const [content, setContent] = useState("");
    const [crisis, setCrisis] = useState(null);
    const load = useCallback(async () => {
        const { data } = await api.get(`/fc2/participants/${pid}/voice-notes`);
        setNotes(data.voice_notes || []);
    }, [pid]);
    useEffect(() => { load(); }, [load]);
    const add = async () => {
        if (!content.trim()) return;
        const { data } = await api.post(`/fc2/participants/${pid}/voice-notes`, { category, content: content.trim(), visibility });
        if (data.crisis_resources) setCrisis(data.crisis_resources);
        setContent(""); load();
    };
    const del = async (n) => { await api.delete(`/fc2/voice-notes/${n.id}`); load(); };
    return (
        <div className="space-y-3" data-testid="fc2-voice">
            <div className="rounded-xl border border-clay/20 bg-clay/5 p-4 space-y-3">
                <p className="text-sm text-primary-k">This is a space for <b>what matters to you</b>. Record your preferences, wishes and concerns in your own words.</p>
                <div className="flex flex-wrap gap-2">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="fc2-voice-category" className="rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                        {VOICE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)} data-testid="fc2-voice-visibility" className="rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                        {VISIBILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} data-testid="fc2-voice-content" className="w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm min-h-[80px]" placeholder="In your own words..." />
                <Button onClick={add} data-testid="fc2-voice-add"><Plus className="w-4 h-4 mr-1" />Record this</Button>
            </div>

            {crisis && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4" data-testid="fc2-crisis">
                    <p className="text-sm font-medium text-red-800 flex items-center gap-2"><ShieldAlert className="w-4 h-4" />You don't have to face this alone</p>
                    <ul className="mt-2 space-y-1">
                        {crisis.map((r) => <li key={r.name} className="text-sm text-red-700"><b>{r.name}</b>: {r.phone} — {r.note}</li>)}
                    </ul>
                    <button onClick={() => setCrisis(null)} className="text-xs text-red-700 underline mt-2">Close</button>
                </div>
            )}

            {notes.length === 0 ? <p className="text-sm text-muted-k" data-testid="fc2-voice-empty">Nothing recorded yet.</p>
                : notes.map((n) => (
                    <div key={n.id} className="rounded-xl border border-primary-k/10 p-3" data-testid={`fc2-voice-${n.id}`}>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-clay">{(VOICE_CATEGORIES.find(c => c[0] === n.category) || [, n.category])[1]}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-k">{n.visibility === "private_to_participant" ? "Private" : "Shared"}</span>
                                {n.is_mine !== false && <button onClick={() => del(n)} className="text-muted-k hover:text-red-600" data-testid={`fc2-voice-del-${n.id}`}><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                        </div>
                        <p className="text-sm text-primary-k mt-1">{n.content}</p>
                    </div>
                ))}
        </div>
    );
}

/* ------------------------------ Messages ------------------------------ */
function MessagesTab({ pid }) {
    const [msgs, setMsgs] = useState([]);
    const [text, setText] = useState("");
    const load = useCallback(async () => {
        const { data } = await api.get(`/fc2/participants/${pid}/messages`);
        setMsgs(data.messages || []);
    }, [pid]);
    useEffect(() => { load(); }, [load]);
    const send = async () => {
        if (!text.trim()) return;
        await api.post(`/fc2/participants/${pid}/messages`, { content: text.trim() });
        setText(""); load();
    };
    const del = async (m) => { await api.delete(`/fc2/messages/${m.id}`); load(); };
    return (
        <div className="space-y-3" data-testid="fc2-messages">
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {msgs.length === 0 ? <p className="text-sm text-muted-k" data-testid="fc2-messages-empty">No messages yet. Start the conversation.</p>
                    : msgs.map((m) => (
                        <div key={m.id} className={`rounded-xl p-3 ${m.is_mine ? "bg-primary-k/5 ml-8" : "bg-surface-2 mr-8"}`} data-testid={`fc2-msg-${m.id}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-k">{m.author_name || (m.is_mine ? "You" : "Household")}  ·  {fmt(m.created_at)}</span>
                                {m.is_mine && !m.deleted && <button onClick={() => del(m)} className="text-muted-k hover:text-red-600" data-testid={`fc2-msg-del-${m.id}`}><Trash2 className="w-3 h-3" /></button>}
                            </div>
                            <p className={`text-sm mt-0.5 ${m.deleted ? "italic text-muted-k" : "text-primary-k"}`}>{m.content}</p>
                        </div>
                    ))}
            </div>
            <div className="flex gap-2">
                <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a message to the household" data-testid="fc2-msg-input" className="flex-1" />
                <Button onClick={send} data-testid="fc2-msg-send">Send</Button>
            </div>
        </div>
    );
}

/* ------------------------------ Incidents ------------------------------ */
function IncidentsTab({ pid }) {
    const [items, setItems] = useState([]);
    useEffect(() => { api.get(`/fc2/participants/${pid}/incident-log`).then(({ data }) => setItems(data.incidents || [])).catch(() => { }); }, [pid]);
    return (
        <div className="space-y-2" data-testid="fc2-incidents">
            {items.length === 0 ? <p className="text-sm text-muted-k" data-testid="fc2-incidents-empty">No open issues. That's good news.</p>
                : items.map((i) => (
                    <Link to={i.url || "#"} key={`${i.source_tool}-${i.id}`} className="block rounded-xl border border-primary-k/10 p-3 hover:bg-surface-2" data-testid={`fc2-incident-${i.id}`}>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-primary-k">{i.summary}</p>
                            <span className="text-[10px] uppercase tracking-wider text-muted-k">{i.source_tool}</span>
                        </div>
                        <p className="text-[11px] text-muted-k">{i.status} · {fmt(i.timestamp)}</p>
                    </Link>
                ))}
        </div>
    );
}

export default function FamilyCoordinator() {
    const { id: pid } = useParams();
    const [tab, setTab] = useState("tasks");
    const [downloading, setDownloading] = useState(false);

    const downloadHandover = async () => {
        setDownloading(true);
        try {
            const res = await api.post(`/fc2/participants/${pid}/handover-pack`, { purpose: "primary_caregiver_absence" }, { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a"); a.href = url; a.download = `family-handover-${pid.slice(0, 8)}.pdf`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch { toast.error("Could not generate the handover pack."); }
        finally { setDownloading(false); }
    };

    return (
        <div className="max-w-3xl space-y-6" data-testid="family-coordinator-page">
            <PageIntro
                eyebrow="Family coordinator"
                title="Coordinator"
                description="Keep the whole household on the same page. Share tasks, track the calendar, message each other, and capture what matters most to the person you care for."
                whatItDoes="One place to coordinate the household around a participant and generate a handover pack when the main carer is away."
                howToUse={["Add tasks and share them with the household", "Confirm visits on the calendar", "Record the participant's own preferences and wishes"]}
                whatYouGet={["A coordinated household", "A one-click handover pack PDF"]}
            >
                <Button size="sm" variant="outline" onClick={downloadHandover} disabled={downloading} data-testid="fc2-handover-btn" className="mt-3">
                    {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                    Handover pack PDF
                </Button>
            </PageIntro>

            <div className="flex flex-wrap gap-1 border-b border-primary-k/10" data-testid="fc2-tabs">
                {TABS.map(([v, l, Icon]) => (
                    <button key={v} onClick={() => setTab(v)} data-testid={`fc2-tab-${v}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${tab === v ? "border-primary-k text-primary-k font-medium" : "border-transparent text-muted-k hover:text-primary-k"}`}>
                        <Icon className="w-4 h-4" />{l}
                    </button>
                ))}
            </div>

            {tab === "tasks" && <TasksTab pid={pid} />}
            {tab === "calendar" && <CalendarTab pid={pid} />}
            {tab === "voice" && <VoiceTab pid={pid} />}
            {tab === "messages" && <MessagesTab pid={pid} />}
            {tab === "incidents" && <IncidentsTab pid={pid} />}
        </div>
    );
}
