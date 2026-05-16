import React, { useEffect, useState } from "react";
import { Repeat, CheckCircle2, Circle } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch } from "./_shared";

const STAGES = ["considering", "comparing", "notice_given", "transition", "complete"];

const CHECKLIST_LABELS = {
    compared_services: "Compared services side-by-side",
    compared_prices: "Compared per-service prices",
    checked_unspent_funds: "Confirmed unspent funds carry across",
    given_notice_to_current: "Given notice to current provider",
    signed_new_agreement: "Signed agreement with new provider",
    transferred_care_plan: "Transferred care plan and goals",
    confirmed_first_visit: "Confirmed first visit with new provider",
};

export default function ProviderSwitch() {
    const [row, setRow] = useState(null);
    const [form, setForm] = useState({ current_provider: "", target_provider: "", reason: "" });

    const refresh = async () => {
        const data = await safeGet("/provider-switch");
        setRow(data);
    };
    useEffect(() => { refresh(); }, []);

    const start = async (e) => {
        e.preventDefault();
        if (!form.current_provider) return;
        const created = await safePost("/provider-switch", form, "Switch started");
        if (created) refresh();
    };
    const updateStage = async (newStage) => {
        const idx = STAGES.indexOf(newStage);
        if (idx < 0) return;
        await safePatch(`/provider-switch/${row.id}`, { stage: newStage }, `Stage: ${newStage.replace("_", " ")}`);
        refresh();
    };
    const toggleItem = async (key) => {
        const next = { ...row.checklist, [key]: !row.checklist?.[key] };
        await safePatch(`/provider-switch/${row.id}`, { checklist: next });
        refresh();
    };

    return (
        <PageShell
            testid="switch-page"
            overline="Provider switching"
            title="A guided path to changing providers"
            description="The Support at Home program lets participants change providers with 30-days notice. We track every step so nothing falls through the cracks."
        >
            {!row ? (
                <form onSubmit={start} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-2 gap-3" data-testid="switch-form">
                    <input required value={form.current_provider} onChange={(e) => setForm({ ...form, current_provider: e.target.value })} placeholder="Current provider" data-testid="switch-form-current" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input value={form.target_provider} onChange={(e) => setForm({ ...form, target_provider: e.target.value })} placeholder="Target provider (optional)" data-testid="switch-form-target" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why switching?" rows={2} className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <div className="sm:col-span-2">
                        <button type="submit" data-testid="switch-form-submit" className="bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a]">Start switching workflow</button>
                    </div>
                </form>
            ) : (
                <>
                    <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="switch-detail">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-muted-k">Switching from → to</div>
                                <div className="font-heading text-xl text-primary-k mt-0.5">{row.current_provider} → {row.target_provider || "TBC"}</div>
                                {row.reason && <p className="text-sm text-muted-k mt-2 max-w-xl">{row.reason}</p>}
                            </div>
                            <Repeat className="h-6 w-6 text-gold" />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2" data-testid="switch-stages">
                            {STAGES.map((s, i) => (
                                <button key={s} type="button" onClick={() => updateStage(s)} data-testid={`switch-stage-${s}`} className={`text-xs rounded-full px-3 py-1.5 border ${row.stage === s ? "bg-primary-k text-white border-primary-k" : "bg-surface text-primary-k border-kindred hover:bg-surface-2"}`}>
                                    {i + 1}. {s.replace("_", " ")}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="switch-checklist">
                        <h3 className="font-heading text-lg text-primary-k">Switching checklist</h3>
                        <ul className="mt-3 space-y-2">
                            {Object.keys(CHECKLIST_LABELS).map((k) => {
                                const done = row.checklist?.[k];
                                return (
                                    <li key={k}>
                                        <button type="button" onClick={() => toggleItem(k)} data-testid={`switch-check-${k}`} className="w-full text-left flex items-start gap-3 py-1.5 group">
                                            {done ? <CheckCircle2 className="h-5 w-5 text-sage flex-shrink-0" /> : <Circle className="h-5 w-5 text-muted-k flex-shrink-0 group-hover:text-primary-k" />}
                                            <span className={`text-sm ${done ? "text-muted-k line-through" : "text-primary-k"}`}>{CHECKLIST_LABELS[k]}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </>
            )}
        </PageShell>
    );
}
