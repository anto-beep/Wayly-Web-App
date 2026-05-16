import React, { useEffect, useState } from "react";
import { Calendar as CalIcon, Plus, Trash2 } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safeDelete, formatDate } from "./_shared";

export default function VisitCalendar() {
    const [visits, setVisits] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ title: "", starts_at: "", duration_minutes: 60, provider: "", location: "", kind: "appointment", notes: "" });

    const refresh = async () => {
        const data = await safeGet("/visits");
        if (data) setVisits(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.title || !form.starts_at) return;
        const iso = new Date(form.starts_at).toISOString();
        const created = await safePost("/visits", { ...form, starts_at: iso, duration_minutes: Number(form.duration_minutes) }, "Visit added");
        if (created) {
            setForm({ title: "", starts_at: "", duration_minutes: 60, provider: "", location: "", kind: "appointment", notes: "" });
            setShowAdd(false);
            refresh();
        }
    };

    const del = async (v) => {
        if (!window.confirm(`Delete "${v.title}"?`)) return;
        if (await safeDelete(`/visits/${v.id}`, "Visit removed")) refresh();
    };

    return (
        <PageShell
            testid="visits-page"
            overline="Visit calendar"
            title="Upcoming appointments & home visits"
            description="Track GP appointments, allied-health visits, ACAT reviews, and provider home visits in one place."
            actions={<button type="button" data-testid="visits-add-btn" onClick={() => setShowAdd((s) => !s)} className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#16294a]"><Plus className="h-4 w-4" /> Add visit</button>}
        >
            {showAdd && (
                <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-2 gap-3" data-testid="visits-add-form">
                    <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title (e.g. GP — annual review)" data-testid="visits-form-title" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input required type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} data-testid="visits-form-when" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input type="number" min="5" max="720" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="Duration (min)" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        <option value="appointment">Appointment</option>
                        <option value="home_visit">Home visit</option>
                        <option value="telehealth">Telehealth</option>
                        <option value="assessment">Assessment</option>
                        <option value="other">Other</option>
                    </select>
                    <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Provider (Dr Smith)" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={2} className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <div className="sm:col-span-2 flex gap-3">
                        <button type="submit" data-testid="visits-form-submit" className="bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a]">Save</button>
                        <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-muted-k">Cancel</button>
                    </div>
                </form>
            )}
            {visits.length === 0 ? (
                <EmptyCard icon={CalIcon} title="No visits yet" body="Add your first appointment with the button above." />
            ) : (
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="visits-list">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">When</th>
                                <th className="text-left px-4 py-3 font-medium">Title</th>
                                <th className="text-left px-4 py-3 font-medium">Provider</th>
                                <th className="text-left px-4 py-3 font-medium">Kind</th>
                                <th className="text-right px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visits.map((v) => (
                                <tr key={v.id} data-testid={`visits-row-${v.id}`} className="border-t border-kindred">
                                    <td className="px-5 py-3 text-primary-k font-medium tabular-nums">{formatDate(v.starts_at)}</td>
                                    <td className="px-4 py-3 text-primary-k">{v.title}</td>
                                    <td className="px-4 py-3 text-muted-k">{v.provider || "—"}</td>
                                    <td className="px-4 py-3 text-muted-k capitalize">{(v.kind || "").replace("_", " ")}</td>
                                    <td className="px-5 py-3 text-right">
                                        <button type="button" onClick={() => del(v)} data-testid={`visits-del-${v.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </PageShell>
    );
}
