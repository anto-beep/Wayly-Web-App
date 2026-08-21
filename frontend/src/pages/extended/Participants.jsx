/**
 * Participants module, Batch 3.
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
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";
import {
    Users, Plus, Star, Trash2, Copy, X, ArrowUpRight, RotateCcw, AlertTriangle,
    Mail as MailIcon, Crown, CheckCircle2, Edit3, Activity,
} from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";
import { FieldLabelText } from "@/components/RequiredHint";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

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

const EMPTY_EDIT_FORM = {
    first_name: "",
    last_name: "",
    preferred_name: "",
    dob: "",
    classification_level: "",
    pension_status: "",
    provider_name: "",
    statement_delivery: "",
    mac_reference_number: "",
    suburb: "",
    state: "",
    is_grandfathered_hcp: "",
    hcp_level: "",
    caregiver_relationship: "",
    caregiver_phone: "",
};

const PENSION_OPTIONS = [
    { v: "full_pension", label: "Full Age Pension" },
    { v: "part_pension", label: "Part Age Pension" },
    { v: "cshc", label: "Commonwealth Seniors Health Card" },
    { v: "self_funded", label: "Self-funded retiree" },
    { v: "unsure", label: "Not sure" },
];

const STATE_OPTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const STATEMENT_DELIVERY_OPTIONS = [
    { v: "email", label: "Email" },
    { v: "post", label: "Post" },
    { v: "portal", label: "Provider portal" },
    { v: "other", label: "Other" },
];

const CAREGIVER_RELATIONSHIP_OPTIONS = [
    { v: "daughter", label: "Daughter" },
    { v: "son", label: "Son" },
    { v: "spouse_partner", label: "Spouse or partner" },
    { v: "sibling", label: "Sibling" },
    { v: "grandchild", label: "Grandchild" },
    { v: "friend", label: "Friend" },
    { v: "paid_carer", label: "Paid carer" },
    { v: "power_of_attorney", label: "Power of attorney" },
    { v: "other", label: "Other" },
];

const HCP_OPTIONS = [
    { v: "yes", label: "Yes, they were on a Home Care Package" },
    { v: "no", label: "No" },
    { v: "unsure", label: "Not sure" },
];

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
    const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");
    const [shareTarget, setShareTarget] = useState(null);
    const isExpired = useExpiredTrial();

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

    // Cancel-URL rollback: Stripe Checkout's cancel_url points here with
    // ?cancelled=1. When the user bounces back without paying, cancel any
    // pending add-on so the participant we optimistically created doesn't
    // linger in the account count (BILLING-UI-1 v5 §4.1 rollback rule).
    const cancelUrlHandledRef = useRef(false);
    useEffect(() => {
        if (cancelUrlHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("cancelled") !== "1") return;
        cancelUrlHandledRef.current = true;
        (async () => {
            try {
                const { data } = await api.post("/billing/v2/cancel-pending-addon");
                if (data?.cancelled_count > 0) {
                    toast.success(`Add-on cancelled. ${data.cancelled_count > 1 ? `${data.cancelled_count} participants were` : "The participant was"} removed so you're not charged.`);
                } else {
                    toast.info("Add-on checkout cancelled.");
                }
            } catch { /* silent — nothing to roll back */ }
            // Clean the URL so refresh doesn't re-run the rollback.
            const url = new URL(window.location.href);
            url.searchParams.delete("cancelled");
            window.history.replaceState({}, "", url.pathname + (url.search || ""));
            await loadAll();
            await refresh();
        })();
    }, []);

    // Auto-heal: if the "Add one more person" signup intent lives in
    // localStorage but the second participant was never actually created
    // (e.g. legacy accounts predating the signup pre-create fix), create
    // the stub now. Idempotent by first_name match; the intent key is
    // cleared once fulfilled.
    useEffect(() => {
        if (loading || !active.length) return;
        let raw = null;
        try { raw = localStorage.getItem("wayly_second_participant_intent"); } catch { /* noop */ }
        if (!raw) return;
        let intent = null;
        try { intent = JSON.parse(raw); } catch { intent = null; }
        const wanted = (intent?.first_name || "").trim();
        if (!wanted) {
            try { localStorage.removeItem("wayly_second_participant_intent"); } catch { /* noop */ }
            return;
        }
        // Already present? Just clear the intent.
        const already = active.some((p) => (p.first_name || "").trim().toLowerCase() === wanted.toLowerCase());
        if (already) {
            try { localStorage.removeItem("wayly_second_participant_intent"); } catch { /* noop */ }
            return;
        }
        // Only auto-heal if the account has EXACTLY 1 active participant.
        // Adding one more brings us to Family's 2 without triggering an
        // upgrade or add-on charge.
        if (active.length !== 1) return;
        (async () => {
            try {
                await api.post("/v2/participants", {
                    first_name: wanted,
                    last_name: "",
                    statement_format: "unknown",
                    is_primary: false,
                });
                try { localStorage.removeItem("wayly_second_participant_intent"); } catch { /* noop */ }
                toast.success(`Added ${wanted} to your Family plan.`);
                await loadAll();
                await refresh();
            } catch { /* silent — user can add manually */ }
        })();
    }, [loading, active, loadAll, refresh]);

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
        if (!form.last_name.trim()) { toast.error("Last name is required."); return; }
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
            // BILLING-UI-1 v5 §4.1: reconcile Stripe subscription shape with
            // the new participant count. Fire-and-forget so a Stripe hiccup
            // doesn't block the UI; the daily reconciliation cron backs it
            // up. Legacy /v2/participants already handles the plan flip
            // internally, this is defence in depth against drift.
            api.post("/payments/sync-plan-to-participants").catch(() => {});
            if (data.plan_upgraded_to) toast.success(`Plan upgraded to ${data.plan_upgraded_to}`);
            else if (data.addon) toast.success(`Add-on subscription created · $24.50 per fortnight`);
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
                toast.success(`Removed. Plan downgrades to Solo on ${formatDate(data.plan_downgrade_scheduled.effective)}`);
            } else {
                toast.success("Participant removed. Data kept for 60 days.");
            }
            setRemoveTarget(null);
            setRemoveChoice("stay");
            await loadAll();
            await refresh();
            // Same defence-in-depth sync as on add.
            api.post("/payments/sync-plan-to-participants").catch(() => {});
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
                        Family plan covers 2, additional Participants are $24.50 per fortnight each.
                    </p>
                    {account && (() => {
                        // BILLING-UI-1 v5: display fortnightly totals derived
                        // from participant count, not the legacy monthly field
                        // returned by /account.
                        const activeCount = active.length;
                        const basePlan = account.base_plan;
                        const baseFortnight = basePlan === "FAMILY" ? 49.50 : 24.50;
                        const addonCount = Math.max(0, activeCount - (basePlan === "FAMILY" ? 2 : 1));
                        const fortnightTotal = baseFortnight + addonCount * 24.50;
                        return (
                            <div className="text-xs text-muted-k mt-2">
                                Current plan: <span className="font-medium text-primary-k">{basePlan}</span> · ${fortnightTotal.toFixed(2)} per fortnight
                                {addonCount > 0 && ` · ${addonCount} additional Participant${addonCount === 1 ? "" : "s"}`}
                            </div>
                        );
                    })()}
                </div>
                {!isExpired && (
                <button
                    type="button"
                    onClick={openAdd}
                    data-testid="participants-add-btn"
                    className="inline-flex items-center gap-2 bg-gold text-white font-semibold rounded-full px-4 py-2.5 text-sm hover:brightness-95"
                >
                    <Plus className="h-4 w-4" /> Add Participant
                </button>
                )}
            </div>

            {loading && <div className="text-sm text-muted-k">Loading…</div>}

            <div className="grid sm:grid-cols-2 gap-4">
                {active.map((p) => {
                    const planTag = !account ? "" :
                        account.base_plan === "SOLO" ? "Covered by Solo plan"
                        : (active.indexOf(p) < 2 ? "Covered by Family plan" : "Additional Participant · $24.50 per fortnight");
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
                                                Classification {p.classification} · {p.provider_name || ", "}
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
                                    {!isExpired && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            // Load the full participant profile so we can pre-fill every editable field
                                            // (the card summary only carries a handful).
                                            try {
                                                const { data } = await api.get(`/participants/${p.id}`);
                                                setEditTarget(data);
                                                setEditForm({
                                                    first_name: data.first_name || "",
                                                    last_name: data.last_name || "",
                                                    preferred_name: data.preferred_name || "",
                                                    dob: data.dob || data.date_of_birth || "",
                                                    classification_level: data.classification_level || data.classification || "",
                                                    pension_status: (data.pension_status && data.pension_status !== "unsure") ? data.pension_status : (data.pension_status || ""),
                                                    provider_name: data.provider_name || "",
                                                    statement_delivery: data.statement_delivery || data.statement_format || "",
                                                    mac_reference_number: data.mac_reference_number || "",
                                                    suburb: data.suburb || "",
                                                    state: data.state || "",
                                                    is_grandfathered_hcp: data.is_grandfathered_hcp || "",
                                                    hcp_level: data.hcp_level || "",
                                                    caregiver_relationship: data.caregiver_relationship || "",
                                                    caregiver_phone: data.caregiver_phone || "",
                                                });
                                                setEditError("");
                                            } catch (e) {
                                                // Fall back to the card-level fields if the fetch fails.
                                                setEditTarget(p);
                                                setEditForm({
                                                    ...EMPTY_EDIT_FORM,
                                                    first_name: p.first_name || "",
                                                    last_name: p.last_name || "",
                                                    classification_level: p.classification || "",
                                                    provider_name: p.provider_name || "",
                                                });
                                                setEditError("");
                                            }
                                        }}
                                        data-testid={`participant-edit-${p.id}`}
                                        className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                                    >
                                        <Edit3 className="h-3 w-3" /> Edit details
                                    </button>
                                    )}
                                    {!isExpired && (
                                    <button
                                        type="button"
                                        onClick={() => setShareTarget(p)}
                                        data-testid={`participant-share-${p.id}`}
                                        className="text-xs text-primary-k hover:underline inline-flex items-center gap-1"
                                    >
                                        <ArrowUpRight className="h-3 w-3" /> Share view
                                    </button>
                                    )}
                                    {!isExpired && !p.is_primary && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!window.confirm(`Set ${p.first_name} as the primary Participant?`)) return;
                                                try {
                                                    await api.post(`/participants/${p.id}/promote`);
                                                    toast.success(`${p.first_name} is now the primary Participant`);
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
                                    {!isExpired && !p.is_primary && (
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
                        Add your first Participant to get started.
                    </div>
                )}
            </div>

            {removed.length > 0 && (
                <section data-testid="participants-removed-section">
                    <h2 className="font-heading text-lg text-primary-k mt-6">Removed Participants</h2>
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
                                            Removed {p.removal_confirmed_at ? formatDate(p.removal_confirmed_at) : ", "}
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
                                {step === "preview" ? "Add a Participant" : step === "form" ? "Their details" : "All set"}
                            </h2>
                            <button onClick={closeAdd} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>

                        {step === "preview" && addPreview && (
                            <div className="p-5 space-y-4" data-testid="add-preview-step">
                                {addPreview.branch === "upgrade_required" && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-primary-k">Adding a Participant requires a paid plan.</p>
                                        <p className="text-sm text-muted-k">Upgrade to Solo ($24.50 per fortnight) for 1 Participant, or Family ($49.50 per fortnight) for 2 Participants and 3 Caregiver seats.</p>
                                        <div className="flex gap-2">
                                            <Link to="/pricing?plan=solo" className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="upgrade-solo">Upgrade to Solo</Link>
                                            <Link to="/pricing?plan=family" className="inline-flex items-center gap-1.5 bg-gold text-white font-semibold rounded-md px-4 py-2 text-sm hover:brightness-95" data-testid="upgrade-family">Upgrade to Family</Link>
                                        </div>
                                    </div>
                                )}
                                {addPreview.branch === "solo_to_family" && (
                                    <div className="space-y-3" data-testid="branch-solo-to-family">
                                        <p className="text-sm text-primary-k font-medium">Adding a second Participant upgrades your plan to Family.</p>
                                        <ul className="text-sm text-muted-k space-y-1 list-disc pl-5">
                                            <li>Plan: Solo $24.50 per fortnight → <strong className="text-primary-k">Family $49.50 per fortnight</strong></li>
                                            <li>Participants: 1 → 2</li>
                                            <li>Caregiver seats: 1 → 3</li>
                                            <li>All features remain the same</li>
                                        </ul>
                                        <p className="text-xs text-muted-k">You&apos;ll be charged the prorated difference for the rest of your current fortnight now, applied straight to your subscription. From your next charge, you&apos;ll be billed $49.50 per fortnight instead of $24.50.</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => setStep("form")} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="confirm-solo-to-family">
                                                Continue
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {(addPreview.branch === "family_addons" || addPreview.branch === "covered_by_family") && (
                                    <div className="space-y-3" data-testid="branch-family">
                                        <p className="text-sm text-primary-k">You can add as many Participants as you need. Each additional Participant is $24.50 per fortnight and cancels independently.</p>
                                        <label className="block text-xs text-muted-k">How many Participants to add?</label>
                                        <input
                                            type="number" min={1} max={10} value={extraCount}
                                            onChange={(e) => { const v = Math.max(1, Math.min(10, Number(e.target.value) || 1)); setExtraCount(v); refreshPreview(v); }}
                                            data-testid="extra-count-input"
                                            className="w-24 rounded-md border border-kindred px-3 py-2"
                                        />
                                        {(() => {
                                            const needed = Number(addPreview.addons_needed || 0);
                                            const addonFortnight = needed * 24.50;
                                            const totalFortnight = 49.50 + addonFortnight;
                                            return (
                                                <div className="bg-surface-2 border border-kindred rounded-lg p-3 text-sm space-y-1" data-testid="add-preview-summary">
                                                    <div>{needed} × $24.50 per fortnight = <strong>${addonFortnight.toFixed(2)} per fortnight</strong> added</div>
                                                    <div className="text-muted-k">Base Family plan: $49.50 per fortnight</div>
                                                    <div className="border-t border-kindred pt-1 mt-1 font-medium text-primary-k">New total: ${totalFortnight.toFixed(2)} per fortnight</div>
                                                    <div className="text-[11px] text-muted-k mt-1">Includes GST. Prorated for the rest of your current fortnight, then billed in full from your next charge.</div>
                                                </div>
                                            );
                                        })()}
                                        <button onClick={() => setStep("form")} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="confirm-family-add">
                                            Continue
                                        </button>
                                    </div>
                                )}
                                {addPreview.branch === "adviser_included" && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-primary-k">Your Adviser plan includes Participant management at no extra cost.</p>
                                        <button onClick={() => setStep("form")} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]">Continue</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === "form" && (
                            <div className="p-5 space-y-3" data-testid="add-form-step">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <FieldLabelText required>First name</FieldLabelText>
                                        <input required aria-required="true" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-first-name" />
                                    </div>
                                    <div>
                                        <FieldLabelText required>Last name</FieldLabelText>
                                        <input required aria-required="true" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-last-name" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <FieldLabelText optional>Date of birth</FieldLabelText>
                                        <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                                    </div>
                                    <div>
                                        <FieldLabelText optional>Classification</FieldLabelText>
                                        <select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="form-classification">
                                            <option value="">Not sure yet</option>
                                            {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <FieldLabelText optional>Provider</FieldLabelText>
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
                                        {saving ? "Adding…" : "Add Participant"}
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
                                    <div className="rounded-lg border border-sage/40 bg-sage/10 px-3 py-2.5 text-sm text-primary-k text-center" data-testid="addon-prorated-note">
                                        A $24.50 per fortnight add-on was added to your subscription. You&apos;ve been charged the prorated amount for the rest of this fortnight; the full amount applies from your next charge.
                                    </div>
                                )}
                                <button onClick={closeAdd} className="w-full bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="add-done-btn">Done</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* EDIT modal, full onboarding surface */}
            {editTarget && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="edit-participant-modal">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between shrink-0">
                            <h2 className="font-heading text-lg text-primary-k">Edit {editTarget.first_name}&apos;s details</h2>
                            <button onClick={() => setEditTarget(null)} className="text-muted-k hover:text-primary-k" data-testid="edit-close"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-5 space-y-5 overflow-y-auto">
                            {editError && (
                                <div className="rounded-md border border-terracotta/50 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" data-testid="edit-participant-error">
                                    {editError}
                                </div>
                            )}
                            <p className="text-xs text-muted-k">These are the same details the onboarding walk-through captures. Anything you change here flows through the rest of Wayly.</p>

                            <fieldset className="space-y-3">
                                <legend className="text-xs uppercase tracking-wider text-muted-k font-semibold">Identity</legend>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <FieldLabelText required>First name</FieldLabelText>
                                        <input required aria-required="true" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-first-name" />
                                    </div>
                                    <div>
                                        <FieldLabelText required>Last name</FieldLabelText>
                                        <input required aria-required="true" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-last-name" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-k">Preferred name</label>
                                        <input value={editForm.preferred_name} onChange={(e) => setEditForm({ ...editForm, preferred_name: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-preferred-name" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-k">Date of birth</label>
                                        <input type="date" value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-dob" />
                                    </div>
                                </div>
                            </fieldset>

                            <fieldset className="space-y-3">
                                <legend className="text-xs uppercase tracking-wider text-muted-k font-semibold">Program</legend>
                                <div>
                                    <label className="text-xs text-muted-k">Classification</label>
                                    <select value={editForm.classification_level || ""} onChange={(e) => setEditForm({ ...editForm, classification_level: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-classification">
                                        <option value="">Not sure yet</option>
                                        {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Pension status</label>
                                    <select value={editForm.pension_status} onChange={(e) => setEditForm({ ...editForm, pension_status: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-pension-status">
                                        <option value="">Choose one</option>
                                        {PENSION_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Was your parent on a Home Care Package before 12 Sep 2024?</label>
                                    <select value={editForm.is_grandfathered_hcp} onChange={(e) => setEditForm({ ...editForm, is_grandfathered_hcp: e.target.value, hcp_level: e.target.value !== "yes" ? "" : editForm.hcp_level })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-grandfathered">
                                        <option value="">Choose one</option>
                                        {HCP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                </div>
                                {editForm.is_grandfathered_hcp === "yes" && (
                                    <div>
                                        <label className="text-xs text-muted-k">HCP level</label>
                                        <select value={editForm.hcp_level || ""} onChange={(e) => setEditForm({ ...editForm, hcp_level: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-hcp-level">
                                            <option value="">Choose a level</option>
                                            {[1,2,3,4].map((n) => <option key={n} value={n}>Level {n}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs text-muted-k">Provider</label>
                                    <ProviderPicker
                                        value={editForm.provider_name}
                                        onChange={(v) => setEditForm({ ...editForm, provider_name: v })}
                                        existing={active.filter((p) => p.id !== editTarget.id).map((p) => p.provider_name).filter(Boolean)}
                                        testId="edit-provider"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Statement delivery</label>
                                    <select value={editForm.statement_delivery} onChange={(e) => setEditForm({ ...editForm, statement_delivery: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-statement-delivery">
                                        <option value="">Choose one</option>
                                        {STATEMENT_DELIVERY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">My Aged Care reference number</label>
                                    <input value={editForm.mac_reference_number} onChange={(e) => setEditForm({ ...editForm, mac_reference_number: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" placeholder="e.g. AC1234567" data-testid="edit-mac-ref" />
                                </div>
                            </fieldset>

                            <fieldset className="space-y-3">
                                <legend className="text-xs uppercase tracking-wider text-muted-k font-semibold">Location</legend>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted-k">Suburb</label>
                                        <input value={editForm.suburb} onChange={(e) => setEditForm({ ...editForm, suburb: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-suburb" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-k">State</label>
                                        <select value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-state">
                                            <option value="">Choose one</option>
                                            {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>

                            <fieldset className="space-y-3">
                                <legend className="text-xs uppercase tracking-wider text-muted-k font-semibold">Your relationship to them</legend>
                                <div>
                                    <label className="text-xs text-muted-k">Relationship</label>
                                    <select value={editForm.caregiver_relationship} onChange={(e) => setEditForm({ ...editForm, caregiver_relationship: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="edit-caregiver-relationship">
                                        <option value="">Choose one</option>
                                        {CAREGIVER_RELATIONSHIP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Your phone (for Participant to call)</label>
                                    <input type="tel" value={editForm.caregiver_phone} onChange={(e) => setEditForm({ ...editForm, caregiver_phone: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" placeholder="+61412345678" data-testid="edit-caregiver-phone" />
                                </div>
                            </fieldset>
                        </div>
                        <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2 shrink-0">
                            <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button
                                onClick={async () => {
                                    setEditError("");
                                    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
                                        setEditError("First name and last name are both required.");
                                        return;
                                    }
                                    setEditSaving(true);
                                    try {
                                        // Build a patch of every changed / non-empty field. The PATCH endpoint
                                        // uses exclude_unset so undefined values are ignored server-side.
                                        const patch = {
                                            first_name: editForm.first_name.trim(),
                                            last_name: editForm.last_name.trim(),
                                        };
                                        const optionalStrFields = [
                                            "preferred_name", "provider_name", "mac_reference_number",
                                            "suburb", "caregiver_phone",
                                        ];
                                        optionalStrFields.forEach((f) => {
                                            const v = (editForm[f] || "").trim();
                                            patch[f] = v || null;
                                        });
                                        if (editForm.dob) patch.dob = editForm.dob;
                                        if (editForm.classification_level) patch.classification_level = Number(editForm.classification_level);
                                        if (editForm.pension_status) patch.pension_status = editForm.pension_status;
                                        if (editForm.statement_delivery) patch.statement_delivery = editForm.statement_delivery;
                                        if (editForm.state) patch.state = editForm.state;
                                        if (editForm.is_grandfathered_hcp) patch.is_grandfathered_hcp = editForm.is_grandfathered_hcp;
                                        if (editForm.hcp_level) patch.hcp_level = Number(editForm.hcp_level);
                                        if (editForm.caregiver_relationship) patch.caregiver_relationship = editForm.caregiver_relationship;
                                        await api.patch(`/participants/${editTarget.id}`, patch);
                                        toast.success("Details saved.");
                                        setEditTarget(null);
                                        await loadAll();
                                        await refresh();
                                    } catch (e) {
                                        setEditError(extractErrorMessage(e, "Could not save details."));
                                    } finally { setEditSaving(false); }
                                }}
                                disabled={editSaving}
                                data-testid="edit-save-btn"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60"
                            >
                                {editSaving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SHARE modal */}
            {shareTarget && (
                <ShareLinkModal
                    participant={shareTarget}
                    onClose={() => setShareTarget(null)}
                />
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
                                    <p className="text-primary-k">You&apos;ll have 1 participant remaining. You can downgrade from Family to Solo and save $25 per fortnight.</p>
                                    <label className="flex gap-2 items-start"><input type="radio" name="rm" checked={removeChoice === "downgrade"} onChange={() => setRemoveChoice("downgrade")} data-testid="rm-downgrade" /> <span>Remove + downgrade to Solo at next billing date</span></label>
                                    <label className="flex gap-2 items-start"><input type="radio" name="rm" checked={removeChoice === "stay"} onChange={() => setRemoveChoice("stay")} data-testid="rm-stay" /> <span>Remove + stay on Family $49.50 per fortnight</span></label>
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

/* ----------------------------- Share Link modal --------------------------- */
function ShareLinkModal({ participant, onClose }) {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const [showRotateConfirm, setShowRotateConfirm] = useState(false);
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

    const load = useCallback(() => {
        api.get(`/participants/${participant.id}/share-link`)
            .then((r) => setState(r.data))
            .catch((e) => toast.error(extractErrorMessage(e, "Could not load share link")));
    }, [participant.id]);
    useEffect(() => { load(); }, [load]);

    const create = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/participants/${participant.id}/share-link`);
            setState(data);
            toast.success("Share link created.");
        } catch (e) { toast.error(extractErrorMessage(e, "Could not create link")); }
        finally { setBusy(false); }
    };
    const rotate = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/participants/${participant.id}/share-link/rotate`);
            setState(data);
            setShowRotateConfirm(false);
            toast.success("New link created. The old one no longer works.");
        } catch (e) { toast.error(extractErrorMessage(e, "Could not rotate link")); }
        finally { setBusy(false); }
    };
    const revoke = async () => {
        setBusy(true);
        try {
            await api.delete(`/participants/${participant.id}/share-link`);
            setState({ has_link: false });
            setShowRevokeConfirm(false);
            toast.success("Share link revoked.");
        } catch (e) { toast.error(extractErrorMessage(e, "Could not revoke")); }
        finally { setBusy(false); }
    };
    const copy = async () => {
        try { await navigator.clipboard.writeText(state.url); toast.success("Link copied."); }
        catch { toast.error("Could not copy. Long-press the link to copy it manually."); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="share-modal">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">
                <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                    <h2 className="font-heading text-lg text-primary-k">Share view with {participant.first_name}</h2>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k" data-testid="share-close"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-4 text-sm">
                    <div className="rounded-lg border border-sage/40 bg-sage/10 p-3 text-primary-k text-xs leading-relaxed">
                        <strong>How this works.</strong> The share link opens a big-text, read-only page that shows {participant.first_name}&apos;s care level, provider and your phone number. There is no login. Do not share the link publicly, anyone with it can open the page. You can rotate or revoke it any time.
                        <div className="mt-1.5 text-muted-k">You do not have to share this. Many caregivers keep the account entirely on their side.</div>
                    </div>
                    {!state ? (
                        <div className="text-muted-k">Loading…</div>
                    ) : state.has_link ? (
                        <div className="space-y-3" data-testid="share-active">
                            <div>
                                <div className="text-xs text-muted-k mb-1">Share this link with {participant.first_name}</div>
                                <div className="flex gap-2">
                                    <input readOnly value={state.url} className="flex-1 rounded-md border border-kindred bg-surface-2 px-3 py-2 text-xs font-mono" data-testid="share-url" onFocus={(e) => e.target.select()} />
                                    <button onClick={copy} className="bg-primary-k text-white rounded-md px-3 py-2 text-xs hover:bg-[#091D33]" data-testid="share-copy" aria-label="Copy link">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {(state.created_at || state.last_seen_at) && (
                                <div className="text-xs text-muted-k">
                                    {state.created_at && <>Created {formatDate(state.created_at)}. </>}
                                    {state.last_seen_at
                                        ? <>Last opened {new Date(state.last_seen_at).toLocaleString()}.</>
                                        : <>Never opened yet.</>}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-kindred">
                                {!showRotateConfirm && !showRevokeConfirm && (
                                    <>
                                        <button onClick={() => setShowRotateConfirm(true)} className="text-xs text-primary-k border border-kindred rounded-full px-3 py-1.5 hover:bg-surface-2" data-testid="share-rotate-open">
                                            <RotateCcw className="inline h-3 w-3 mr-1" /> Rotate link
                                        </button>
                                        <button onClick={() => setShowRevokeConfirm(true)} className="text-xs text-terracotta border border-terracotta/40 rounded-full px-3 py-1.5 hover:bg-terracotta/5" data-testid="share-revoke-open">
                                            <Trash2 className="inline h-3 w-3 mr-1" /> Revoke sharing
                                        </button>
                                    </>
                                )}
                                {showRotateConfirm && (
                                    <div className="w-full rounded-md border border-gold/40 bg-gold/5 p-3 text-primary-k">
                                        <p className="mb-2">Create a new link and stop the current one? {participant.first_name} will need the new link to keep opening the page.</p>
                                        <div className="flex gap-2">
                                            <button onClick={rotate} disabled={busy} className="text-xs bg-gold text-white rounded-full px-3 py-1.5 hover:brightness-95 disabled:opacity-50" data-testid="share-rotate-confirm">Yes, rotate</button>
                                            <button onClick={() => setShowRotateConfirm(false)} className="text-xs text-muted-k px-3 py-1.5">Cancel</button>
                                        </div>
                                    </div>
                                )}
                                {showRevokeConfirm && (
                                    <div className="w-full rounded-md border border-terracotta/40 bg-terracotta/5 p-3 text-primary-k">
                                        <p className="mb-2">Revoke sharing? The link will stop working immediately. You can create a new one later.</p>
                                        <div className="flex gap-2">
                                            <button onClick={revoke} disabled={busy} className="text-xs bg-terracotta text-white rounded-full px-3 py-1.5 hover:brightness-95 disabled:opacity-50" data-testid="share-revoke-confirm">Yes, revoke</button>
                                            <button onClick={() => setShowRevokeConfirm(false)} className="text-xs text-muted-k px-3 py-1.5">Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3" data-testid="share-inactive">
                            <div className="text-muted-k">Sharing is off. You are the only one who can see {participant.first_name}&apos;s Wayly view right now.</div>
                            <button onClick={create} disabled={busy} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-50" data-testid="share-create">
                                {busy ? "Creating…" : "Create shareable link"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
