import React, { useEffect, useState } from "react";
import { Share2, Plus, Trash2 } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch, safeDelete, formatDate } from "./_shared";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import ReadOnlyLock from "@/components/ReadOnlyLock";

const STATUS = ["open", "in_progress", "completed", "declined"];
const KINDS = ["GP", "specialist", "allied_health", "support_service", "other"];

export default function Referrals() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ referred_to: "", kind: "specialist", contact: "", reason: "", status: "open", referred_at: new Date().toISOString().slice(0, 16) });
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        const data = await safeGet("/referrals");
        if (data) setItems(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.referred_to) return;
        const body = { ...form, referred_at: new Date(form.referred_at).toISOString() };
        const created = await safePost("/referrals", body, "Referral added");
        if (created) {
            setForm({ referred_to: "", kind: "specialist", contact: "", reason: "", status: "open", referred_at: new Date().toISOString().slice(0, 16) });
            refresh();
        }
    };
    const update = async (it, status) => {
        await safePatch(`/referrals/${it.id}`, { ...it, status }, "Updated");
        refresh();
    };
    const del = async (it) => {
        if (await safeDelete(`/referrals/${it.id}`, "Removed")) refresh();
    };

    return (
        <PageShell
            testid="ref-page"
            overline="Referrals"
            title="GP, allied health, and specialist referrals"
            description="Keep track of who referred whom, when, and what came of it, invaluable when a new GP asks for history."
        >
            <ReadOnlyLock testId="ref-form-lock" label="Subscribe to log new referrals" sub="All previously logged referrals stay visible below.">
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-6 gap-3" data-testid="ref-form">
                <input required value={form.referred_to} onChange={(e) => setForm({ ...form, referred_to: e.target.value })} placeholder="Referred to (e.g. Dr Lee)" data-testid="ref-form-to" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="ref-form-kind" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                    {KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
                </select>
                <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone / email" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <input type="datetime-local" value={form.referred_at} onChange={(e) => setForm({ ...form, referred_at: e.target.value })} className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <button type="submit" data-testid="ref-form-submit" className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#091D33]"><Plus className="h-4 w-4" /> Add</button>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" rows={2} className="sm:col-span-6 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
            </form>
            </ReadOnlyLock>
            {items.length === 0 ? (
                <EmptyCard icon={Share2} title="No referrals yet" body="Track every clinical and support-service referral so you don't lose visibility." />
            ) : (
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="ref-list">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr><th className="text-left px-5 py-3 font-medium">Date</th><th className="text-left px-4 py-3 font-medium">To</th><th className="text-left px-4 py-3 font-medium">Kind</th><th className="text-left px-4 py-3 font-medium">Reason</th><th className="text-left px-4 py-3 font-medium">Status</th><th className="text-right px-5 py-3 font-medium"></th></tr>
                        </thead>
                        <tbody>
                            {items.map((r) => (
                                <tr key={r.id} data-testid={`ref-row-${r.id}`} className="border-t border-kindred">
                                    <td className="px-5 py-3 text-primary-k font-medium tabular-nums">{formatDate(r.referred_at)}</td>
                                    <td className="px-4 py-3 text-primary-k">{r.referred_to}</td>
                                    <td className="px-4 py-3 text-muted-k capitalize">{(r.kind || "").replace("_", " ")}</td>
                                    <td className="px-4 py-3 text-muted-k max-w-xs truncate">{r.reason || ", "}</td>
                                    <td className="px-4 py-3">
                                        {isExpired ? (
                                            <span className="text-xs text-muted-k capitalize">{(r.status || "").replace("_", " ")}</span>
                                        ) : (
                                        <select value={r.status} onChange={(e) => update(r, e.target.value)} data-testid={`ref-status-${r.id}`} className="rounded-md border border-kindred bg-surface px-2 py-1 text-xs">
                                            {STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                                        </select>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {!isExpired && (
                                        <button type="button" onClick={() => del(r)} data-testid={`ref-del-${r.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
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
