import React, { useEffect, useState } from "react";
import { Mail, Plus, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safeDelete, formatDate } from "./_shared";

export default function Correspondence() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ direction: "in", channel: "email", counterparty: "", subject: "", body_summary: "", occurred_at: new Date().toISOString().slice(0, 16) });

    const refresh = async () => {
        const data = await safeGet("/correspondence");
        if (data) setItems(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.counterparty || !form.subject) return;
        const body = { ...form, occurred_at: new Date(form.occurred_at).toISOString() };
        const created = await safePost("/correspondence", body, "Logged");
        if (created) {
            setForm({ direction: "in", channel: "email", counterparty: "", subject: "", body_summary: "", occurred_at: new Date().toISOString().slice(0, 16) });
            refresh();
        }
    };
    const del = async (c) => {
        if (await safeDelete(`/correspondence/${c.id}`, "Removed")) refresh();
    };

    return (
        <PageShell
            testid="corr-page"
            overline="Correspondence tracker"
            title="A complete record of every conversation"
            description="Log letters, emails, phone calls, and SMS in one timeline so nothing slips between the cracks during a complaint or review."
        >
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-6 gap-3" data-testid="corr-form">
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} data-testid="corr-form-direction" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                    <option value="in">Inbound</option>
                    <option value="out">Outbound</option>
                </select>
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} data-testid="corr-form-channel" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                    <option value="email">Email</option>
                    <option value="letter">Letter</option>
                    <option value="phone">Phone</option>
                    <option value="sms">SMS</option>
                    <option value="in_person">In person</option>
                </select>
                <input required value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="From / to (e.g. My Aged Care)" data-testid="corr-form-counterparty" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" data-testid="corr-form-subject" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <input required type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} data-testid="corr-form-when" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <textarea value={form.body_summary} onChange={(e) => setForm({ ...form, body_summary: e.target.value })} placeholder="Summary or notes" rows={2} className="sm:col-span-3 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <button type="submit" data-testid="corr-form-submit" className="sm:col-span-1 inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a]"><Plus className="h-4 w-4" /> Log</button>
            </form>
            {items.length === 0 ? (
                <EmptyCard icon={Mail} title="No correspondence logged" body="Add your first call or letter — your future self will thank you when a review comes up." />
            ) : (
                <div className="space-y-3" data-testid="corr-list">
                    {items.map((c) => (
                        <article key={c.id} data-testid={`corr-row-${c.id}`} className="bg-surface border border-kindred rounded-xl p-4 flex items-start gap-3">
                            {c.direction === "in" ? <ArrowDownLeft className="h-5 w-5 text-sage flex-shrink-0 mt-0.5" /> : <ArrowUpRight className="h-5 w-5 text-gold flex-shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="font-medium text-primary-k">{c.subject}</h3>
                                    <span className="text-xs text-muted-k tabular-nums">{formatDate(c.occurred_at)}</span>
                                </div>
                                <div className="text-xs text-muted-k mt-1 capitalize">{c.channel} · {c.direction === "in" ? "from" : "to"} {c.counterparty}</div>
                                {c.body_summary && <p className="text-sm text-muted-k mt-2 leading-relaxed">{c.body_summary}</p>}
                            </div>
                            <button type="button" onClick={() => del(c)} data-testid={`corr-del-${c.id}`} className="text-xs text-terra hover:underline self-start"><Trash2 className="h-3.5 w-3.5" /></button>
                        </article>
                    ))}
                </div>
            )}
        </PageShell>
    );
}
