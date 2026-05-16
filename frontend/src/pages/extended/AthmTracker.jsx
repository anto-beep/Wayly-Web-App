import React, { useEffect, useState } from "react";
import { Wrench, Plus, Trash2 } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch, safeDelete } from "./_shared";

const STATUS = ["proposed", "approved", "ordered", "installed", "declined"];

export default function AthmTracker() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ kind: "AT", name: "", status: "proposed", cost_aud: "", supplier: "", notes: "" });

    const refresh = async () => {
        const data = await safeGet("/athm");
        if (data) setItems(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.name) return;
        const body = { ...form, cost_aud: form.cost_aud ? Number(form.cost_aud) : null };
        const created = await safePost("/athm", body, "Added");
        if (created) {
            setForm({ kind: "AT", name: "", status: "proposed", cost_aud: "", supplier: "", notes: "" });
            refresh();
        }
    };
    const setStatus = async (item, status) => {
        await safePatch(`/athm/${item.id}`, { ...item, status }, "Updated");
        refresh();
    };
    const del = async (item) => {
        if (await safeDelete(`/athm/${item.id}`, "Removed")) refresh();
    };

    return (
        <PageShell
            testid="athm-page"
            overline="AT & HM tracker"
            title="Assistive Technology and Home Modifications"
            description="Walkers, ramps, shower rails, hoists — track approval, supplier, cost, and install status for every item."
        >
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-6 gap-3" data-testid="athm-form">
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="athm-form-kind" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                    <option value="AT">Assistive Tech</option>
                    <option value="HM">Home Mod</option>
                </select>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item (e.g. walker)" data-testid="athm-form-name" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <input type="number" min="0" value={form.cost_aud} onChange={(e) => setForm({ ...form, cost_aud: e.target.value })} placeholder="Cost (AUD)" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <button type="submit" data-testid="athm-form-submit" className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a]"><Plus className="h-4 w-4" /> Add</button>
            </form>
            {items.length === 0 ? (
                <EmptyCard icon={Wrench} title="No AT/HM items yet" body="Start by adding a walker frame or grab rail to track approval and cost." />
            ) : (
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="athm-list">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr><th className="text-left px-5 py-3 font-medium">Kind</th><th className="text-left px-4 py-3 font-medium">Item</th><th className="text-left px-4 py-3 font-medium">Supplier</th><th className="text-right px-4 py-3 font-medium">Cost</th><th className="text-left px-4 py-3 font-medium">Status</th><th className="text-right px-5 py-3 font-medium"></th></tr>
                        </thead>
                        <tbody>
                            {items.map((it) => (
                                <tr key={it.id} data-testid={`athm-row-${it.id}`} className="border-t border-kindred">
                                    <td className="px-5 py-3 text-primary-k font-medium">{it.kind}</td>
                                    <td className="px-4 py-3 text-primary-k">{it.name}</td>
                                    <td className="px-4 py-3 text-muted-k">{it.supplier || "—"}</td>
                                    <td className="px-4 py-3 text-primary-k tabular-nums text-right">{it.cost_aud ? `$${Number(it.cost_aud).toLocaleString()}` : "—"}</td>
                                    <td className="px-4 py-3">
                                        <select value={it.status} onChange={(e) => setStatus(it, e.target.value)} data-testid={`athm-status-${it.id}`} className="rounded-md border border-kindred bg-surface px-2 py-1 text-xs">
                                            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <button type="button" onClick={() => del(it)} data-testid={`athm-del-${it.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
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
