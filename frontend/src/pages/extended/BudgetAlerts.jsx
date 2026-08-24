import React, { useEffect, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch, safeDelete } from "./_shared";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import ReadOnlyLock from "@/components/ReadOnlyLock";

export default function BudgetAlerts() {
    const [alerts, setAlerts] = useState([]);
    const [form, setForm] = useState({ stream: "all", threshold_pct: 80, notify_email: true, active: true });
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        const data = await safeGet("/budget-alerts");
        if (data) setAlerts(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        const created = await safePost("/budget-alerts", { ...form, threshold_pct: Number(form.threshold_pct) }, "Alert added");
        if (created) refresh();
    };
    const toggle = async (a) => {
        await safePatch(`/budget-alerts/${a.id}`, { ...a, active: !a.active }, "Updated");
        refresh();
    };
    const del = async (a) => {
        if (await safeDelete(`/budget-alerts/${a.id}`, "Alert removed")) refresh();
    };

    return (
        <PageShell
            testid="budget-alerts-page"
            overline="Budget alerts"
            title="Get notified before you overspend"
            description="Set per-stream thresholds, we will email you (and surface a notification) when your spend approaches the limit."
        >
            <ReadOnlyLock testId="alerts-form-lock" label="Subscribe to add or change budget alerts" sub="Existing alerts keep firing, you just can't add or edit them on an expired trial.">
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-5 gap-3 items-end" data-testid="alerts-form">
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">Stream</span>
                    <select value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} data-testid="alerts-form-stream" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        <option value="all">All streams</option>
                        <option value="Clinical">Clinical</option>
                        <option value="Independence">Independence</option>
                        <option value="Everyday Living">Everyday Living</option>
                        <option value="lifetime">Lifetime cap</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Threshold %</span>
                    <input type="number" min="10" max="100" value={form.threshold_pct} onChange={(e) => setForm({ ...form, threshold_pct: e.target.value })} data-testid="alerts-form-threshold" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-muted-k">
                    <input type="checkbox" checked={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.checked })} /> Email me
                </label>
                <button type="submit" data-testid="alerts-form-submit" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#091D33]"><Plus className="h-4 w-4" /> Add</button>
            </form>
            </ReadOnlyLock>
            {alerts.length === 0 ? (
                <EmptyCard icon={Bell} title="No alerts configured" body="Most caregivers set a 70% lifetime-cap and an 85% quarterly alert as their first two." />
            ) : (
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="alerts-list">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr><th className="text-left px-5 py-3 font-medium">Stream</th><th className="text-left px-4 py-3 font-medium">Threshold</th><th className="text-left px-4 py-3 font-medium">Status</th><th className="text-right px-5 py-3 font-medium">Actions</th></tr>
                        </thead>
                        <tbody>
                            {alerts.map((a) => (
                                <tr key={a.id} data-testid={`alerts-row-${a.id}`} className="border-t border-kindred">
                                    <td className="px-5 py-3 text-primary-k font-medium">{a.stream}</td>
                                    <td className="px-4 py-3 text-primary-k tabular-nums">{a.threshold_pct}%</td>
                                    <td className="px-4 py-3">
                                        {isExpired ? (
                                            <span className={`text-xs rounded-full px-2.5 py-0.5 ${a.active ? "bg-sage/20 text-primary-k" : "bg-surface-2 text-muted-k"}`}>{a.active ? "Active" : "Paused"}</span>
                                        ) : (
                                        <button type="button" onClick={() => toggle(a)} data-testid={`alerts-toggle-${a.id}`} className={`text-xs rounded-full px-2.5 py-0.5 ${a.active ? "bg-sage/20 text-primary-k" : "bg-surface-2 text-muted-k"}`}>
                                            {a.active ? "Active" : "Paused"}
                                        </button>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {!isExpired && (
                                        <button type="button" onClick={() => del(a)} data-testid={`alerts-del-${a.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                                        )}
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
