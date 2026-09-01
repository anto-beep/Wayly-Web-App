/**
 * ATHM-1 v1 · Project workflow with side-by-side quote comparison
 * and trial-period countdown cards.
 * Route: /app/athm/projects
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { toast } from "sonner";
import {
    ChevronLeft, Plus, Wrench, Home, TimerReset, ArrowRight,
    CheckCircle2, AlertTriangle, Package, Hammer, ClipboardList, Trash2,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

const PROJECT_TYPES = {
    assistive_technology_only: { label: "Assistive Technology", icon: Wrench },
    home_modification_only: { label: "Home Modifications", icon: Hammer },
    combined_at_and_hm: { label: "Combined AT & HM", icon: Package },
};

const STATUS_STEPS = [
    "initiating", "ot_referral_needed", "ot_assessment_scheduled", "ot_assessment_complete",
    "quoting", "quote_review", "funding_confirmed", "purchasing_or_contracting",
    "installing_or_delivering", "trialling", "in_use", "completed",
    "declined", "cancelled",
];

function useParticipantId() {
    // Reactive: cascades to the active participant selected in the header.
    const { active } = useParticipants();
    return active?.id || null;
}

function daysBetween(iso) {
    if (!iso) return null;
    const end = new Date(iso).getTime();
    const now = Date.now();
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function TrialCountdown({ item }) {
    if (!item.trial_available || !item.trial_end_date) return null;
    const remaining = daysBetween(item.trial_end_date);
    const tone = remaining == null ? "bg-surface-2"
        : remaining <= 1 ? "bg-red-50 border-red-200 text-red-800"
        : remaining <= 3 ? "bg-amber-50 border-amber-200 text-amber-800"
        : remaining <= 7 ? "bg-sky-50 border-sky-200 text-sky-800"
        : "bg-emerald-50 border-emerald-200 text-emerald-800";
    return (
        <div className={`rounded-lg border p-3 flex items-center gap-3 ${tone}`} data-testid={`trial-countdown-${item.id}`}>
            <TimerReset className="w-5 h-5"/>
            <div className="flex-1">
                <p className="text-sm font-medium">{item.item_name} · trial ends {item.trial_end_date}</p>
                <p className="text-xs">
                    {remaining == null ? "" : remaining < 0 ? `Trial ended ${Math.abs(remaining)} day(s) ago, return window may be closed`
                        : remaining === 0 ? "Trial ends today"
                        : `${remaining} day(s) remaining to decide whether to keep or return`}
                </p>
            </div>
        </div>
    );
}

function QuoteComparison({ mod, onRefresh }) {
    const [supplier, setSupplier] = useState("");
    const [amount, setAmount] = useState("");
    const [details, setDetails] = useState("");
    const [busy, setBusy] = useState(false);
    const add = async () => {
        if (!supplier || !amount) { toast.error("Supplier and amount required"); return; }
        setBusy(true);
        try {
            await api.post(`/athm1/modifications/${mod.id}/quotes`, {
                supplier_name: supplier,
                quote_amount: Number(amount),
                quote_date: new Date().toISOString().slice(0, 10),
                quote_details_summary: details,
            });
            setSupplier(""); setAmount(""); setDetails("");
            onRefresh?.();
        } catch (e) {
            toast.error("Could not save quote");
        } finally { setBusy(false); }
    };
    const quotes = mod.quotes || [];
    const cheapest = mod.cheapest_quote_amount?.amount;
    const dearest = mod.most_expensive_quote_amount?.amount;
    const variance = mod.quote_variance_percentage;
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid={`mod-quote-block-${mod.id}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <p className="text-sm font-medium text-primary-k">{mod.modification_name}</p>
                    <p className="text-xs text-muted-k">{mod.location_in_home} · {mod.description}</p>
                </div>
                {variance != null && variance > 30 && (
                    <span className="text-[10px] uppercase tracking-wider inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-amber-800">
                        <AlertTriangle className="w-3 h-3"/> High variance {variance}%
                    </span>
                )}
            </div>

            {quotes.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-k border-b border-kindred">
                                <th className="py-2">Supplier</th>
                                <th>Amount (AUD)</th>
                                <th>Date</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quotes.map((q, i) => {
                                const amt = q.quote_amount?.amount;
                                const isLow = amt === cheapest;
                                const isHigh = amt === dearest;
                                return (
                                    <tr key={i} className="border-b border-kindred/50" data-testid={`mod-quote-row-${mod.id}-${i}`}>
                                        <td className="py-2">{q.supplier_name}</td>
                                        <td className={isLow ? "text-emerald-700 font-medium" : isHigh ? "text-red-700 font-medium" : ""}>
                                            ${amt?.toLocaleString?.() || amt} {isLow && "· cheapest"} {isHigh && quotes.length > 1 && "· dearest"}
                                        </td>
                                        <td>{q.quote_date}</td>
                                        <td className="text-xs text-muted-k">{q.quote_details_summary}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {quotes.length >= 2 && (
                        <p className="text-xs text-muted-k mt-2">
                            Variance ${(dearest - cheapest).toLocaleString()} ({variance}% between the cheapest and dearest quote).
                        </p>
                    )}
                </div>
            )}

            <div className="grid sm:grid-cols-4 gap-2">
                <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier"
                       data-testid={`mod-add-supplier-${mod.id}`}
                       className="px-3 py-2 text-sm border rounded"/>
                <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount"
                       type="number"
                       data-testid={`mod-add-amount-${mod.id}`}
                       className="px-3 py-2 text-sm border rounded"/>
                <input value={details} onChange={e => setDetails(e.target.value)} placeholder="Notes (optional)"
                       data-testid={`mod-add-notes-${mod.id}`}
                       className="px-3 py-2 text-sm border rounded sm:col-span-1"/>
                <button onClick={add} disabled={busy} data-testid={`mod-add-quote-${mod.id}`}
                        className="inline-flex items-center justify-center gap-1 bg-primary-k text-white rounded-full text-sm px-3">
                    <Plus className="w-4 h-4"/> Add quote
                </button>
            </div>
        </div>
    );
}

function ProjectDetail({ project, participantId, onClose, onRefresh }) {
    const [items, setItems] = useState([]);
    const [mods, setMods] = useState([]);
    const [referrals, setReferrals] = useState([]);
    const fileInputRef = React.useRef(null);
    const [uploadingReferral, setUploadingReferral] = useState(false);
    const [showItemForm, setShowItemForm] = useState(false);
    const [showModForm, setShowModForm] = useState(false);
    const [newItem, setNewItem] = useState({ item_category: "mobility_aid", item_name: "", item_description: "" });
    const [newMod, setNewMod] = useState({ modification_category: "bathroom", modification_name: "", location_in_home: "", description: "" });
    const [busy, setBusy] = useState(false);
    const [advancing, setAdvancing] = useState(false);

    const loadDetail = async () => {
        // items + modifications embedded through project.at_item_ids / hm_modification_ids
        // We fetch by IDs. Use one round-trip for each list.
        const its = await Promise.all((project.at_item_ids || []).map(id =>
            api.get(`/athm1/projects/${project.id}`).catch(() => null) // no direct endpoint yet, we'll pull from a placeholder
        ));
        // Simpler: refresh from lists. Since v1 doesn't ship a get-project endpoint,
        // we rely on the create response to seed the local list. Backend also
        // returns the current items/modifications by ID via /projects/{pid}/items GET.
        // Fall back to embedded ID arrays and query each.
    };

    // Simple approach: fetch items and modifications via dedicated GET endpoints if available.
    const refreshAll = async () => {
        try {
            const projRes = await api.get(`/athm1/participants/${participantId}/projects`);
            const p = (projRes.data.projects || []).find(pr => pr.id === project.id);
            if (p) {
                setItems(await Promise.all((p.at_item_ids || []).map(async id => {
                    const r = await api.get(`/athm1/items/${id}`).catch(() => null);
                    return r?.data?.item || null;
                })));
                setMods(await Promise.all((p.hm_modification_ids || []).map(async id => {
                    const r = await api.get(`/athm1/modifications/${id}`).catch(() => null);
                    return r?.data?.modification || null;
                })));
            }
            const refRes = await api.get(`/athm1/projects/${project.id}/ot-referrals`).catch(() => null);
            if (refRes?.data?.referrals) setReferrals(refRes.data.referrals);
        } catch { /* ignore */ }
    };

    const onReferralFilePicked = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingReferral(true);
        try {
            // Step 1: upload to Document Vault with ot_referral category.
            const form = new FormData();
            form.append("file", file);
            form.append("category", "ot_referral");
            form.append("title", file.name);
            const uploadRes = await api.post("/documents", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            const docId = uploadRes.data?.id;
            if (!docId) throw new Error("Upload response missing id");
            // Step 2: link the document to this project.
            const { data } = await api.post(`/athm1/projects/${project.id}/ot-referrals/attach`, {
                document_id: docId,
                notes: "",
            });
            setReferrals(data.referrals || []);
            toast.success("OT referral uploaded and attached");
        } catch (err) {
            toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Could not upload OT referral");
        } finally {
            setUploadingReferral(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const detachReferral = async (documentId) => {
        try {
            const { data } = await api.delete(`/athm1/projects/${project.id}/ot-referrals/${documentId}`);
            setReferrals(data.referrals || []);
            toast.success("Referral removed");
        } catch {
            toast.error("Could not remove referral");
        }
    };

    useEffect(() => { refreshAll(); }, [project.id]);

    const addItem = async () => {
        if (!newItem.item_name) { toast.error("Item name required"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/athm1/projects/${project.id}/items`, newItem);
            setItems(list => [...(list || []).filter(Boolean), data.item]);
            setNewItem({ item_category: "mobility_aid", item_name: "", item_description: "" });
            setShowItemForm(false);
        } catch { toast.error("Could not add item"); }
        finally { setBusy(false); }
    };

    const addMod = async () => {
        if (!newMod.modification_name || !newMod.location_in_home) { toast.error("Name and location required"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/athm1/projects/${project.id}/modifications`, newMod);
            setMods(list => [...(list || []).filter(Boolean), data.modification]);
            setNewMod({ modification_category: "bathroom", modification_name: "", location_in_home: "", description: "" });
            setShowModForm(false);
        } catch { toast.error("Could not add modification"); }
        finally { setBusy(false); }
    };

    const startTrial = async (itemId, days) => {
        try {
            await api.post(`/athm1/items/${itemId}/start-trial`, {
                trial_start_date: new Date().toISOString().slice(0, 10),
                trial_period_days: Number(days),
            });
            refreshAll();
            toast.success("Trial started, reminders scheduled at 7/3/1 days");
        } catch { toast.error("Could not start trial"); }
    };

    const advanceStatus = async () => {
        const idx = STATUS_STEPS.indexOf(project.status);
        const next = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 3)];
        if (!next) return;
        setAdvancing(true);
        try {
            await api.post(`/athm1/projects/${project.id}/advance-status`, { to_status: next });
            onRefresh?.();
        } catch { toast.error("Could not advance status"); }
        finally { setAdvancing(false); }
    };

    const trialItems = (items || []).filter(i => i && i.trial_available);

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-5" data-testid={`athm-project-detail-${project.id}`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">{PROJECT_TYPES[project.project_type]?.label}</p>
                    <h2 className="font-heading text-xl text-primary-k mt-1">{project.title}</h2>
                    <p className="text-xs text-muted-k mt-1">Status: {project.status?.replace(/_/g, " ")}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={advanceStatus} disabled={advancing} data-testid={`athm-advance-${project.id}`}
                            className="text-xs px-3 py-1.5 rounded-full border border-kindred hover:bg-surface-2">
                        Advance stage <ArrowRight className="inline w-3 h-3 ml-1"/>
                    </button>
                    <button onClick={onClose} className="text-xs text-muted-k">Close</button>
                </div>
            </div>

            {trialItems.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Trial countdown</p>
                    {trialItems.map(item => <TrialCountdown key={item.id} item={item}/>)}
                </div>
            )}

            {/* OT referral documents */}
            <div className="space-y-3" data-testid={`athm-ot-referrals-${project.id}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">OT Referral Documents ({referrals.length})</p>
                        <p className="text-[11px] text-muted-k">Attach any OT prescriptions, assessment reports, or referral letters that back this project. Files are stored securely in your Document Vault.</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                        onChange={onReferralFilePicked}
                        className="hidden"
                        data-testid={`athm-ot-referral-input-${project.id}`}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingReferral}
                        data-testid={`athm-ot-referral-upload-${project.id}`}
                        className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-k text-white disabled:opacity-50">
                        <Plus className="w-3 h-3"/> {uploadingReferral ? "Uploading," : "Upload Referral"}
                    </button>
                </div>
                {referrals.length === 0 ? (
                    <p className="text-xs text-muted-k italic">No OT referrals attached yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {referrals.map(r => (
                            <li key={r.document_id}
                                data-testid={`athm-ot-referral-row-${r.document_id}`}
                                className="rounded-lg border border-kindred p-3 flex items-center justify-between flex-wrap gap-2">
                                <div className="text-sm">
                                    <p className="text-primary-k">{r.filename}</p>
                                    <p className="text-[11px] text-muted-k">Attached {r.attached_at ? new Date(r.attached_at).toLocaleDateString() : ""}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <a href={`${process.env.REACT_APP_BACKEND_URL}/api/documents/${r.document_id}/download`}
                                       target="_blank" rel="noreferrer"
                                       className="text-xs text-primary-k hover:underline">Download</a>
                                    <button onClick={() => detachReferral(r.document_id)}
                                            data-testid={`athm-ot-referral-detach-${r.document_id}`}
                                            className="text-xs text-red-600 hover:underline">Remove</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Assistive Technology items ({(items || []).filter(Boolean).length})</p>
                    <button onClick={() => setShowItemForm(s => !s)} data-testid={`athm-add-item-toggle-${project.id}`}
                            className="text-xs inline-flex items-center gap-1 text-primary-k hover:underline">
                        <Plus className="w-3 h-3"/> Add item
                    </button>
                </div>
                {showItemForm && (
                    <div className="grid sm:grid-cols-4 gap-2">
                        <input placeholder="Category" value={newItem.item_category}
                               data-testid="athm-item-category"
                               onChange={e => setNewItem({ ...newItem, item_category: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <input placeholder="Item name" value={newItem.item_name}
                               data-testid="athm-item-name"
                               onChange={e => setNewItem({ ...newItem, item_name: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <input placeholder="Description" value={newItem.item_description}
                               data-testid="athm-item-description"
                               onChange={e => setNewItem({ ...newItem, item_description: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <button onClick={addItem} disabled={busy} data-testid="athm-item-save"
                                className="bg-primary-k text-white rounded-full text-sm px-3 py-1.5">
                            Save item
                        </button>
                    </div>
                )}
                {(items || []).filter(Boolean).map(it => (
                    <div key={it.id} className="rounded-lg border border-kindred p-3 flex items-center justify-between flex-wrap gap-2" data-testid={`athm-item-${it.id}`}>
                        <div>
                            <p className="text-sm text-primary-k">{it.item_name}</p>
                            <p className="text-xs text-muted-k">{it.item_category}{it.item_description ? ` · ${it.item_description}` : ""}</p>
                            {it.trial_end_date && <p className="text-[11px] text-muted-k mt-1">Trial ends {it.trial_end_date}</p>}
                        </div>
                        {!it.trial_available && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-k">Trial days</span>
                                <input type="number" min={1} max={90} defaultValue={30}
                                       data-testid={`athm-item-trial-days-${it.id}`}
                                       onKeyDown={e => { if (e.key === "Enter") startTrial(it.id, e.target.value); }}
                                       className="w-16 text-sm border rounded px-2 py-1"/>
                                <button onClick={(e) => startTrial(it.id, e.currentTarget.previousSibling.value)}
                                        data-testid={`athm-item-start-trial-${it.id}`}
                                        className="text-xs text-primary-k hover:underline">Start trial</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Home Modifications ({(mods || []).filter(Boolean).length})</p>
                    <button onClick={() => setShowModForm(s => !s)} data-testid={`athm-add-mod-toggle-${project.id}`}
                            className="text-xs inline-flex items-center gap-1 text-primary-k hover:underline">
                        <Plus className="w-3 h-3"/> Add modification
                    </button>
                </div>
                {showModForm && (
                    <div className="grid sm:grid-cols-4 gap-2">
                        <input placeholder="Category" value={newMod.modification_category}
                               data-testid="athm-mod-category"
                               onChange={e => setNewMod({ ...newMod, modification_category: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <input placeholder="Name (e.g. Walk-in shower)" value={newMod.modification_name}
                               data-testid="athm-mod-name"
                               onChange={e => setNewMod({ ...newMod, modification_name: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <input placeholder="Location (Bathroom)" value={newMod.location_in_home}
                               data-testid="athm-mod-location"
                               onChange={e => setNewMod({ ...newMod, location_in_home: e.target.value })}
                               className="px-3 py-2 text-sm border rounded"/>
                        <button onClick={addMod} disabled={busy} data-testid="athm-mod-save"
                                className="bg-primary-k text-white rounded-full text-sm px-3 py-1.5">
                            Save modification
                        </button>
                    </div>
                )}
                {(mods || []).filter(Boolean).map(m => (
                    <QuoteComparison key={m.id} mod={m} onRefresh={refreshAll}/>
                ))}
            </div>
        </div>
    );
}

function CreateProjectCard({ participantId, onCreated }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!form.title) { toast.error("Title required"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/athm1/participants/${participantId}/projects`, form);
            toast.success("Project created");
            setOpen(false);
            setForm({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
            onCreated?.(data.project);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not create project");
        } finally { setBusy(false); }
    };
    if (!open) {
        return (
            <button onClick={() => setOpen(true)} data-testid="athm-new-project"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm">
                <Plus className="w-4 h-4"/> New project
            </button>
        );
    }
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="athm-new-project-form">
            <p className="text-sm font-medium text-primary-k">Start a new AT / HM project</p>
            <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-xs text-muted-k">Type
                    <select value={form.project_type} onChange={e => setForm({ ...form, project_type: e.target.value })}
                            data-testid="athm-project-type"
                            className="mt-1 w-full px-3 py-2 text-sm border rounded">
                        {Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                </label>
                <label className="text-xs text-muted-k">Title
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                           data-testid="athm-project-title"
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k sm:col-span-2">Primary need
                    <input value={form.primary_need_summary} onChange={e => setForm({ ...form, primary_need_summary: e.target.value })}
                           data-testid="athm-project-need"
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k sm:col-span-2">Description
                    <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                              data-testid="athm-project-description"
                              className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
            </div>
            <div className="flex gap-2">
                <button onClick={submit} disabled={busy} data-testid="athm-project-save"
                        className="bg-primary-k text-white rounded-full text-sm px-4 py-1.5">Create</button>
                <button onClick={() => setOpen(false)} className="text-xs text-muted-k">Cancel</button>
            </div>
        </div>
    );
}

export default function AthmProjects() {
    const pid = useParticipantId();
    const [projects, setProjects] = useState([]);
    const [selected, setSelected] = useState(null);

    const refresh = async () => {
        if (!pid) return;
        try {
            const { data } = await api.get(`/athm1/participants/${pid}/projects`);
            setProjects(data.projects || []);
        } catch { /* ignore */ }
    };
    // Refetch and DROP any selected project when the active participant
    // switches, so we never accidentally show one participant's project card
    // while the header shows a different name.
    useEffect(() => {
        setProjects([]);
        setSelected(null);
        refresh();
    }, [pid]);

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6" data-testid="athm-projects-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4"/> Back
            </Link>
            <PageIntro
                eyebrow="Assistive Technology & Home Modifications"
                title="AT & HM Projects"
                description="Track every step of buying assistive technology or modifying the home, from OT referral through quotes, funding, delivery, and trial period. Nothing important slips through the cracks."
                whatItDoes="Groups related AT items and HM modifications into a single project. Compares supplier quotes side-by-side. Counts down each trial period so you never miss a return window."
                howToUse={[
                    "Start a new project (AT only, HM only, or combined).",
                    "Add items or modifications and log at least two quotes each.",
                    "Advance the project through OT assessment, quoting, funding, install, and trial.",
                    "When a trial starts, we schedule reminders at 7 / 3 / 1 days before the return deadline.",
                ]}
                whatYouGet={[
                    "A side-by-side view of every quote with cheapest and dearest highlighted.",
                    "A variance flag when quotes differ by more than 30%.",
                    "Trial countdown cards that turn amber then red as the return date approaches.",
                ]}
            >
                <div className="flex justify-end">
                    <CreateProjectCard participantId={pid} onCreated={() => refresh()}/>
                </div>
            </PageIntro>

            {projects.length === 0 && (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-8 text-center" data-testid="athm-empty">
                    <ClipboardList className="w-8 h-8 text-primary-k/30 mx-auto"/>
                    <p className="text-sm text-muted-k mt-3">No projects yet. Start one to track OT assessment, quotes, and trials.</p>
                </div>
            )}

            <div className="grid gap-3">
                {projects.map(p => {
                    const T = PROJECT_TYPES[p.project_type];
                    const Icon = T?.icon || Wrench;
                    return (
                        <button key={p.id} onClick={() => setSelected(p)}
                                data-testid={`athm-project-card-${p.id}`}
                                className="rounded-2xl border border-primary-k/10 bg-white p-4 text-left hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-primary-k/5"><Icon className="w-5 h-5 text-primary-k"/></div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-primary-k">{p.title}</p>
                                    <p className="text-xs text-muted-k">{T?.label} · {p.status?.replace(/_/g, " ")}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-primary-k/40"/>
                            </div>
                        </button>
                    );
                })}
            </div>

            {selected && (
                <ProjectDetail project={selected} participantId={pid}
                               onClose={() => setSelected(null)}
                               onRefresh={() => { refresh(); }}/>
            )}
        </div>
    );
}
