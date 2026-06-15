/**
 * Participants module — Batch 3.
 *
 * Add flow branches by current plan:
 *  - FREE → upgrade modal
 *  - SOLO → "Upgrade to Family + add participant" confirm modal
 *  - FAMILY → "How many to add?" multi-add modal with live cost preview
 *
 * Remove flow:
 *  - Removing #2 on Family offers Solo downgrade
 *  - Removing add-on (#3+) cancels at end of billing period
 *  - Data retained 60 days; restore / export / hard-delete actions surfaced
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import {
    Users, Plus, Star, Trash2, Copy, X, ArrowUpRight, RotateCcw, AlertTriangle,
    Mail as MailIcon, Crown, CheckCircle2, Edit3, Activity,
} from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

const COLOR_SWATCHES = ["#0E2A47", "#2BC4D6", "#7C9B82", "#C76B5A", "#5F4E76"];

function ProviderPicker({ value, onChange, existing, testId }) {
    // Deduplicate and surface previously-used providers from sibling participants.
    const uniq = Array.from(new Set((existing || []).filter(Boolean)));
    const [mode, setMode] = useState(uniq.length > 0 && (!value || uniq.includes(value)) ? "pick" : "type");
    if (uniq.length === 0) {
        return <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid={testId} />;
    }
    return (
        <div className="mt-1 space-y-2">
            {mode === "pick" ? (
                <>
                    <select
                        value={uniq.includes(value) ? value : ""}
                        onChange={(e) => onChange(e.target.value)}
                        data-testid={`${testId}-select`}
                        className="w-full rounded-md border border-kindred px-3 py-2"
                    >
                        <option value="">Choose a provider</option>
                        {uniq.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => { setMode("type"); onChange(""); }}
                        className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                        data-testid={`${testId}-add-new`}
                    >
                        <Plus className="h-3 w-3" /> Add a different provider
                    </button>
                </>
            ) : (
                <>
                    <input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Provider name"
                        autoFocus
                        data-testid={testId}
                        className="w-full rounded-md border border-kindred px-3 py-2"
                    />
                    <button
                        type="button"
                        onClick={() => setMode("pick")}
                        className="text-xs text-primary-k hover:underline"
                    >
                        ← Pick from {uniq.length === 1 ? "the existing provider" : "existing providers"}
                    </button>
                </>
            )}
        </div>
    );
}

const EMPTY_FORM = {
    first_name: "", last_name: "", date_of_birth: "",
    classification: "", provider_name: "", statement_format: "unknown",
};

export default function ParticipantsPage() {
    const { refresh, account } = useParticipants();
    const [active, setActive] = useState([]);
    const [removed, setRemoved] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showAddModal, setShowAddModal] = useState(false);
    const [addPreview, setAddPreview] = useState(null);
    const [extraCount, setExtraCount] = useState(1);
    const [form, setForm] = useState(EMPTY_FORM);
    const [step, setStep] = useState("preview"); // preview | form | done
    const [saving, setSaving] = useState(false);
    const [lastAdded, setLastAdded] = useState(null);

    const [removeTarget, setRemoveTarget] = useState(null);
    const [removeChoice, setRemoveChoice] = useState("stay"); // stay | downgrade
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({ first_name: "", last_name: "", classification: "", provider_name: "" });
    const [editSaving, setEditSaving] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/v2/participants?include_removed=true");
            const all = data.items || [];
            setActive(all.filter((p) => p.status === "ACTIVE"));
            setRemoved(all.filter((p) => p.status === "PENDING_REMOVAL" || p.status === "REMOVED"));
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load participants"));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const openAdd = async () => {
        setForm(EMPTY_FORM);
        setStep("preview");
        setExtraCount(1);
        try {
            const { data } = await api.post(`/v2/participants/preview?count=1`);
            setAddPreview(data);
            setShowAddModal(true);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not preview"));
        }
    };

    const refreshPreview = async (count) => {
        try {
            const { data } = await api.post(`/v2/participants/preview?count=${count}`);
            setAddPreview(data);
        } catch { /* ignore */ }
    };

    const submitAdd = async () => {
        if (!form.first_name.trim()) { toast.error("First name is required."); return; }
        setSaving(true);
        try {
            const payload = {
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                date_of_birth: form.date_of_birth || null,
                classification: form.classification ? Number(form.classification) : null,
                provider_name: form.provider_name.trim() || null,
                statement_format: form.statement_format,
            };
            const { data } = await api.post("/v2/participants", payload);
            setLastAdded(data);
            setStep("done");
            await loadAll();
            await refresh();
            if (data.plan_upgraded_to) toast.success(`Plan upgraded to ${data.plan_upgraded_to}`);
            else if (data.addon) toast.success(`Add-on subscription created · $19/mo`);
            else toast.success("Participant added");
        } catch (e) {
            const err = e?.response?.data?.detail;
            if (err?.error === "upgrade_required") {
                toast.error(err.message || "Upgrade required");
            } else {
                toast.error(extractErrorMessage(e, "Could not add"));
            }
        } finally { setSaving(false); }
    };

    const closeAdd = () => {
        setShowAddModal(false);
        setStep("preview");
        setLastAdded(null);
        setForm(EMPTY_FORM);
    };

    const confirmRemove = async () => {
        if (!removeTarget) return;
        try {
            const { data } = await api.delete(`/v2/participants/${removeTarget.id}`, {
                data: { downgrade: removeChoice === "downgrade" },
            });
            if (data.plan_downgrade_scheduled) {
                toast.success(`Removed. Plan downgrades to Solo on ${new Date(data.plan_downgrade_scheduled.effective).toLocaleDateString()}`);
            } else {
                toast.success("Participant removed. Data kept for 60 days.");
            }
            setRemoveTarget(null);
            setRemoveChoice("stay");
            await loadAll();
            await refresh();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not remove"));
        }
    };

    const restore = async (p) => {
        try {
            await api.post(`/v2/participants/${p.id}/restore`);
            toast.success(`${p.first_name} restored`);
            await loadAll();
            await refresh();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not restore"));
        }
    };

    const hardDelete = async (p) => {
        const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();
        const typed = window.prompt(`Type "${fullName}" to permanently delete all of their data. This cannot be undone.`);
        if (!typed) return;
        try {
            await api.post(`/v2/participants/${p.id}/hard-delete`, { confirm_full_name: typed });
            toast.success("All data permanently deleted.");
            await loadAll();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not delete"));
        }
    };

    const copyEmail = (email) => { try { navigator.clipboard.writeText(email); toast.success("Copied"); } catch { /* ignore */ } };

    return (
        <div className="space-y-6" data-testid="participants-page">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="font-heading text-3xl text-primary-k tracking-tight">
                        Participants <span className="text-muted-k text-base font-sans">· {active.length} active</span>
                    </h1>
                    <p className="text-sm text-muted-k mt-1 max-w-2xl">
                        Up to {account?.participants_max || 10} per account. Family plan covers 2 — additional participants are $19/month each.
                    </p>
                    {account && (
                        <div className="text-xs text-muted-k mt-2">
                            Current plan: <span className="font-medium text-primary-k">{account.base_plan}</span> · ${account.monthly_total.toFixed(0)}/month total
                            {account.addon_count > 0 && ` · ${account.addon_count} add-on${account.addon_count === 1 ? "" : "s"}`}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={openAdd}
                    data-testid="participants-add-btn"
                    className="inline-flex items-center gap-2 bg-gold text-white font-semibold rounded-full px-4 py-2.5 text-sm hover:brightness-95"
                >
                    <Plus className="h-4 w-4" /> Add participant
                </button>
            </div>

            {loading && <div className="text-sm text-muted-k">Loading…</div>}

            <div className="grid sm:grid-cols-2 gap-4">
                {active.map((p) => {
                    const planTag = !account ? "" :
                        account.base_plan === "SOLO" ? "Covered by Solo plan"
                        : (active.indexOf(p) < 2 ? "Covered by Family plan" : "Add-on · $19/month");
                    const color = COLOR_SWATCHES[p.color_index % 5];
                    return (
                        <div key={p.id} className="bg-surface border border-kindred rounded-2xl overflow-hidden" data-testid={`participant-card-${p.id}`}>
                            <div className="h-1" style={{ background: color }} />
                            <div className="p-5 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-heading text-xl text-primary-k truncate flex items-center gap-1.5">
                                            {p.first_name} {p.last_name}
                                            {p.is_primary && (
                                                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-gold/15 text-gold px-1.5 py-0.5 rounded">
                                                    <Star className="h-2.5 w-2.5 fill-gold" /> primary
                                                </span>
                                            )}
                                        </div>
                                        {p.classification && (
                                            <div className="text-xs text-muted-k mt-1">
                                                Classification {p.classification} · {p.provider_name || "—"}
                                            </div>
                                        )}
                                        <div className="text-[11px] text-gold mt-2">{planTag}</div>
                                    </div>
                                </div>
                                {p.household_email && (
                                    <div className="bg-surface-2 border border-kindred rounded-lg p-2.5 flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex items-center gap-1.5 text-xs text-primary-k truncate">
                                            <MailIcon className="h-3.5 w-3.5 flex-none text-muted-k" />
                                            <span className="font-mono truncate">{p.household_email}</span>
                                        </div>
                                        <button onClick={() => copyEmail(p.household_email)} title="Copy" className="text-muted-k hover:text-primary-k flex-none" data-testid={`participant-copy-email-${p.id}`}>
                                            <Copy className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2 pt-1 items-center flex-wrap">
                                    <Link
                                        to={`/app/participants/${p.id}/timeline`}
                                        data-testid={`participant-timeline-${p.id}`}
                                        className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                                    >
                                        <Activity className="h-3 w-3" /> Timeline
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => { setEditTarget(p); setEditForm({ first_name: p.first_name || "", last_name: p.last_name || "", classification: p.classification || "", provider_name: p.provider_name || "" }); }}
                                        data-testid={`participant-edit-${p.id}`}
                                        className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                                    >
                                        <Edit3 className="h-3 w-3" /> Edit details
                                    </button>
                                    {!p.is_primary && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!window.confirm(`Set ${p.first_name} as the primary participant?`)) return;
                                                try {
                                                    await api.post(`/participants/${p.id}/promote`);
                                                    toast.success(`${p.first_name} is now the primary participant`);
                                                    await loadAll();
                                                    await refresh();
                                                } catch (e) {
                                                    toast.error(extractErrorMessage(e, "Could not promote"));
                                                }
                                            }}
                                            data-testid={`participant-promote-${p.id}`}
                                            className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                                        >
                                            <Crown className="h-3 w-3" /> Make primary
                                        </button>
                                    )}
                                    {!p.is_primary && (
                                        <button onClick={() => setRemoveTarget(p)} data-testid={`participant-remove-${p.id}`} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1">
                                            <Trash2 className="h-3 w-3" /> Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {active.length === 0 && !loading && (
                    <div className="col-span-full bg-surface-2 border border-dashed border-kindred rounded-2xl p-6 text-center text-sm text-muted-k">
                        <Users className="h-6 w-6 mx-auto mb-2" />
                        Add your first participant to get started.
                    </div>
                )}
            </div>

            {removed.length > 0 && (
                <section data-testid="participants-removed-section">
                    <h2 className="font-heading text-lg text-primary-k mt-6">Removed participants</h2>
                    <p className="text-xs text-muted-k mb-3">Data kept for 60 days from removal. Restore anytime within that window.</p>
                    <div className="space-y-2">
                        {removed.map((p) => {
                            const purgeAt = p.data_purge_scheduled_at ? new Date(p.data_purge_scheduled_at) : null;
                            const days = purgeAt ? Math.max(0, Math.ceil((purgeAt - new Date()) / 86400000)) : 0;
                            return (
                                <div key={p.id} className="bg-surface-2 border border-kindred rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`removed-${p.id}`}>
                                    <div>
                                        <div className="font-medium text-primary-k">{p.first_name} {p.last_name}</div>
                                        <div className="text-[11px] text-muted-k">
                                            Removed {p.removal_confirmed_at ? new Date(p.removal_confirmed_at).toLocaleDateString() : "—"}
                                            {purgeAt && ` · Auto-deletes in ${days} days`}
                                            {p.status === "REMOVED" && p.data_purged_at && " · Data purged"}
                                        </div>
                                    </div>
                                    {p.status === "PENDING_REMOVAL" && (
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => restore(p)} className="inline-flex items-center gap-1 text-xs bg-sage/15 text-sage border border-sage/40 rounded-md px-3 py-1.5 hover:bg-sage/25" data-testid={`restore-${p.id}`}>
                                                <RotateCcw className="h-3 w-3" /> Restore
                                            </button>
                                            <button onClick={() => hardDelete(p)} className="inline-flex items-center gap-1 text-xs bg-terracotta/10 text-terracotta border border-terracotta/40 rounded-md px-3 py-1.5 hover:bg-terracotta/20" data-testid={`hard-delete-${p.id}`}>
                                                <AlertTriangle className="h-3 w-3" /> Delete now
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ADD modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="add-participant-modal">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between sticky top-0 bg-white">
                            <h2 className="font-heading text-lg text-primary-k">
                                {step === "preview" ? "Add a participant" : step === "form" ? "Their details" : "All set"}
                            </h2>
                            <button onClick={closeAdd} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>

                        {step === "preview" && addPreview && (
                            <div className="p-5 space-y-4" data-testid="add-preview-step">
                                {addPreview.branch === "upgrade_required" && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-primary-k">Adding a participant requires a paid plan.</p>
                                        <p className="text-sm text-muted-k">Upgrade to Solo ($19/mo) for 1 participant, or Family ($39/mo) for 2 participants and 3 caregiver seats.</p>
                                        <div className="flex gap-2">
                                            <Link to="/pricing?plan=solo" className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="upgrade-solo">Upgrade to Solo</Link>
                                            <Link to="/pricing?plan=family" className="inline-flex items-center gap-1.5 bg-gold text-white font-semibold rounded-md px-4 py-2 text-sm hover:brightness-95" data-testid="upgrade-family">Upgrade to Family</Link>
                                        </div>
                                    </div>
                                )}
                                {addPreview.branch === "solo_to_family" && (
                                    <div className="space-y-3" data-testid="branch-solo-to-family">
                                        <p className="text-sm text-primary-k font-medium">Adding a second participant upgrades your plan to Family.</p>
                                        <ul className="text-sm text-muted-k space-y-1 list-disc pl-5">
                                            <li>Plan: Solo $19/month → <strong className="text-primary-k">Family $39/month</strong></li>
                                            <li>Participants: 1 → 2</li>
                                            <li>Caregiver seats: 1 → 3</li>
                                            <li>All features remain the same</li>
                                        </ul>
                                        <p className="text-xs text-muted-k">The $20/mo difference is charged at your next billing date. Your current billing cycle is not affected.</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={async () => {
                                                try {
                                                    const { data } = await api.post("/billing/v2/upgrade-checkout", {
                                                        target_plan: "FAMILY",
                                                        origin_url: window.location.origin,
                                                        delta_only: true,
                                                    });
                                                    if (data.url) { window.location.href = data.url; return; }
                                                    if (data.instant_upgrade) setStep("form");
                                                } catch (e) {
                                                    const msg = extractErrorMessage(e, "Could not start checkout");
                                                    if (msg.includes("Billing unavailable")) setStep("form"); // fall back to immediate add
                                                    else toast.error(msg);
                                                }
                                            }} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="confirm-solo-to-family">
                                                Pay $20 & upgrade now
                                            </button>
                                            <button onClick={() => setStep("form")} className="text-sm text-muted-k hover:text-primary-k" data-testid="skip-checkout-solo-to-family">
                                                Skip checkout (test mode)
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {(addPreview.branch === "family_addons" || addPreview.branch === "covered_by_family") && (
                                    <div className="space-y-3" data-testid="branch-family">
                                        <p className="text-sm text-primary-k">You can add as many participants as you need. Each one is $19/month and cancels independently.</p>
                                        <label className="block text-xs text-muted-k">How many participants to add?</label>
                                        <input
                                            type="number" min={1} max={10} value={extraCount}
                                            onChange={(e) => { const v = Math.max(1, Math.min(10, Number(e.target.value) || 1)); setExtraCount(v); refreshPreview(v); }}
                                            data-testid="extra-count-input"
                                            className="w-24 rounded-md border border-kindred px-3 py-2"
                                        />
                                        <div className="bg-surface-2 border border-kindred rounded-lg p-3 text-sm space-y-1">
                                            <div>{addPreview.addons_needed} × $19/month = <strong>${addPreview.addon_monthly_total.toFixed(0)}/month</strong> added</div>
                                            <div className="text-muted-k">Base Family plan: $39/month</div>
                                            <div className="border-t border-kindred pt-1 mt-1 font-medium text-primary-k">New total: ${addPreview.new_monthly_total.toFixed(0)}/month</div>
                                        </div>
                                        <button onClick={() => setStep("form")} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="confirm-family-add">
                                            Continue
                                        </button>
                                    </div>
                                )}
                                {addPreview.branch === "adviser_included" && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-primary-k">Your Adviser plan includes participant management at no extra cost.</p>
                                        <button onClick={() => setStep("form")} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]">Continue</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === "form" && (
                            <div className="p-5 space-y-3" data-testid="add-form-step">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-k">First name</label>
                                        <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-first-name" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-k">Last name</label>
                                        <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-last-name" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-k">Date of birth (optional)</label>
                                        <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-k">Classification</label>
                                        <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-classification">
                                            <option value="">Not sure yet</option>
                                            {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Provider</label>
                                    <ProviderPicker
                                        value={form.provider_name}
                                        onChange={(v) => setForm({ ...form, provider_name: v })}
                                        existing={active.map((p) => p.provider_name).filter(Boolean)}
                                        testId="form-provider"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Statement delivery</label>
                                    <select value={form.statement_format} onChange={(e) => setForm({ ...form, statement_format: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2">
                                        <option value="unknown">Not sure yet</option>
                                        <option value="email">Email PDF</option>
                                        <option value="portal">Provider portal</option>
                                        <option value="paper">Paper</option>
                                    </select>
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-kindred">
                                    <button onClick={closeAdd} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                                    <button onClick={submitAdd} disabled={saving} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60" data-testid="form-submit-add">
                                        {saving ? "Adding…" : "Add participant"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === "done" && lastAdded?.participant && (
                            <div className="p-5 space-y-3" data-testid="add-done-step">
                                <CheckCircle2 className="h-10 w-10 text-sage mx-auto" />
                                <p className="text-center font-heading text-lg text-primary-k">
                                    {lastAdded.participant.first_name} added!
                                </p>
                                <div className="bg-surface-2 border border-kindred rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-k">Their forwarding email</div>
                                    <div className="mt-1 font-mono text-sm break-all">{lastAdded.participant.household_email}</div>
                                    <button onClick={() => copyEmail(lastAdded.participant.household_email)} className="mt-2 text-xs text-primary-k underline">Copy</button>
                                </div>
                                <p className="text-sm text-muted-k text-center">Forward their monthly statements here and Wayly will decode them automatically.</p>
                                {lastAdded.addon?.id && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { data } = await api.post("/billing/v2/addon-checkout", {
                                                    addon_id: lastAdded.addon.id,
                                                    origin_url: window.location.origin,
                                                });
                                                if (data.url) { window.location.href = data.url; return; }
                                                if (data.already_paid) toast.info("Add-on already paid");
                                            } catch (e) {
                                                toast.error(extractErrorMessage(e, "Could not start add-on checkout"));
                                            }
                                        }}
                                        className="w-full bg-gold text-white font-semibold rounded-md px-4 py-2 text-sm hover:brightness-95"
                                        data-testid="pay-addon-btn"
                                    >
                                        Pay $19/mo add-on now
                                    </button>
                                )}
                                <button onClick={closeAdd} className="w-full bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]">Done</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* EDIT modal */}
            {editTarget && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="edit-participant-modal">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                            <h2 className="font-heading text-lg text-primary-k">Edit {editTarget.first_name}</h2>
                            <button onClick={() => setEditTarget(null)} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-muted-k">First name</label>
                                    <input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-first-name" />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Last name</label>
                                    <input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-last-name" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Classification</label>
                                <select value={editForm.classification} onChange={(e) => setEditForm({ ...editForm, classification: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-classification">
                                    <option value="">Not sure yet</option>
                                    {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Provider</label>
                                <ProviderPicker
                                    value={editForm.provider_name}
                                    onChange={(v) => setEditForm({ ...editForm, provider_name: v })}
                                    existing={active.filter((p) => p.id !== editTarget.id).map((p) => p.provider_name).filter(Boolean)}
                                    testId="edit-provider"
                                />
                            </div>
                        </div>
                        <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2">
                            <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button
                                onClick={async () => {
                                    if (!editForm.first_name.trim()) { toast.error("First name is required"); return; }
                                    setEditSaving(true);
                                    try {
                                        await api.patch(`/v2/participants/${editTarget.id}`, {
                                            first_name: editForm.first_name.trim(),
                                            last_name: editForm.last_name.trim(),
                                            classification: editForm.classification ? Number(editForm.classification) : undefined,
                                            provider_name: editForm.provider_name.trim() || undefined,
                                        });
                                        toast.success("Saved");
                                        setEditTarget(null);
                                        await loadAll();
                                        await refresh();
                                    } catch (e) {
                                        toast.error(extractErrorMessage(e, "Could not save"));
                                    } finally { setEditSaving(false); }
                                }}
                                disabled={editSaving}
                                data-testid="edit-save-btn"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60"
                            >
                                {editSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* REMOVE modal */}
            {removeTarget && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="remove-participant-modal">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                            <h2 className="font-heading text-lg text-primary-k">Remove {removeTarget.first_name}?</h2>
                            <button onClick={() => setRemoveTarget(null)} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-5 space-y-3 text-sm">
                            {account?.base_plan === "FAMILY" && active.length === 2 ? (
                                <>
                                    <p className="text-primary-k">You'll have 1 participant remaining. You can downgrade from Family to Solo and save $20/month.</p>
                                    <label className="flex gap-2 items-start"><input type="radio" name="rm" checked={removeChoice === "downgrade"} onChange={() => setRemoveChoice("downgrade")} data-testid="rm-downgrade" /> <span>Remove + downgrade to Solo at next billing date</span></label>
                                    <label className="flex gap-2 items-start"><input type="radio" name="rm" checked={removeChoice === "stay"} onChange={() => setRemoveChoice("stay")} data-testid="rm-stay" /> <span>Remove + stay on Family $39/month</span></label>
                                </>
                            ) : (
                                <p className="text-primary-k">Their data is kept for 60 days. You can restore them or export their data anytime within that window.</p>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2">
                            <button onClick={() => setRemoveTarget(null)} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button onClick={confirmRemove} className="bg-terracotta text-white rounded-md px-4 py-2 text-sm hover:brightness-95" data-testid="confirm-remove">Confirm removal</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
