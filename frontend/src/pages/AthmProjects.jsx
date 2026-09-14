/**
 * ATHM-1 v1 · Project workflow with side-by-side quote comparison
 * and trial-period countdown cards.
 * Route: /app/athm/projects
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { RequiredBadge } from "@/components/RequiredHint";
import { toast } from "sonner";
import {
    ChevronLeft, Plus, Wrench, Home, TimerReset, ArrowRight,
    CheckCircle2, AlertTriangle, Package, Hammer, ClipboardList, Trash2,
    Upload, Mail, Search,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

const PROJECT_TYPES = {
    assistive_technology_only: { label: "Assistive Technology", icon: Wrench, tone: { bg: "#EAF3F3", chip: "#0E4D52" } },
    home_modification_only: { label: "Home Modifications", icon: Hammer, tone: { bg: "#FBF3EE", chip: "#A5512B" } },
    combined_at_and_hm: { label: "Combined AT & HM", icon: Package, tone: { bg: "#EEF3EE", chip: "#425F47" } },
};

// Common Support at Home AT item categories (user can also type their own).
const AT_CATEGORIES = [
    { v: "mobility_aid", label: "Mobility Aid (Walker, Wheelchair, Scooter)" },
    { v: "transfer_aid", label: "Transfer Aid (Hoist, Slide Sheet, Transfer Board)" },
    { v: "bathing_toileting_aid", label: "Bathing & Toileting Aid (Shower Stool, Raised Seat)" },
    { v: "personal_safety", label: "Personal Safety (Personal Alarm, Fall Sensor)" },
    { v: "continence_aid", label: "Continence Aid" },
    { v: "pressure_care", label: "Pressure Care (Cushions, Mattress Overlay)" },
    { v: "bed_and_mattress", label: "Bed & Mattress (Adjustable Bed)" },
    { v: "communication_aid", label: "Communication Aid" },
    { v: "vision_hearing_aid", label: "Vision or Hearing Aid" },
    { v: "daily_living_aid", label: "Daily Living Aid (Dressing, Eating, Reaching)" },
];
// Common home modification categories.
const HM_CATEGORIES = [
    { v: "bathroom", label: "Bathroom (Grab Rails, Walk-in Shower, Non-slip)" },
    { v: "access_ramp", label: "Access Ramp" },
    { v: "handrails", label: "Handrails (Internal or External)" },
    { v: "stairs", label: "Stair Modification or Stairlift" },
    { v: "door_widening", label: "Door Widening for Wheelchair Access" },
    { v: "kitchen", label: "Kitchen Modification" },
    { v: "flooring", label: "Flooring or Trip-Hazard Removal" },
    { v: "lighting", label: "Lighting or Sensor Lights" },
    { v: "toilet", label: "Toilet Modification (Raised, Rails)" },
    { v: "external_access", label: "External Access (Paths, Entry, Threshold Ramps)" },
];
// Primary needs each carry a sensible default description the user can edit.
const PRIMARY_NEEDS = [
    { v: "reduce_falls_risk", label: "Reduce falls risk", desc: "The main goal is to reduce the risk of falls at home and keep the participant moving about safely." },
    { v: "improve_bathing_safety", label: "Improve bathing safety", desc: "The main goal is to make showering and bathing safer and easier, with less risk of slips." },
    { v: "support_mobility", label: "Support mobility around the home", desc: "The main goal is to help the participant move around the home more safely and independently." },
    { v: "safe_access", label: "Enable safe access and entry", desc: "The main goal is to make getting in and out of the home safe, including steps and thresholds." },
    { v: "support_transfers", label: "Support safe transfers", desc: "The main goal is to make transfers (bed, chair, toilet) safer for the participant and carer." },
    { v: "daily_independence", label: "Improve independence with daily tasks", desc: "The main goal is to help the participant carry out daily tasks more independently." },
    { v: "after_hospital", label: "Support recovery after hospital", desc: "The main goal is to support a safe recovery at home after a recent hospital stay." },
    { v: "continence_support", label: "Continence support", desc: "The main goal is to support continence needs with the right equipment." },
    { v: "sensory_support", label: "Communication or sensory support", desc: "The main goal is to support communication, vision or hearing needs." },
];

const STATUS_STEPS = [
    "initiating", "ot_referral_needed", "ot_assessment_scheduled", "ot_assessment_complete",
    "quoting", "quote_review", "funding_confirmed", "purchasing_or_contracting",
    "installing_or_delivering", "trialling", "in_use", "completed",
    "declined", "cancelled",
];

// Explicit "Required" badge (shared app-wide style) so every field is clearly labelled.
const Req = () => <RequiredBadge className="ml-1 align-middle" />;

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

            {quotes.length === 1 && (
                <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 flex items-start gap-2.5" data-testid={`mod-one-quote-nudge-${mod.id}`}>
                    <AlertTriangle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                    <p className="text-xs text-primary-k">You&apos;ve added <strong>one quote</strong> so far. Add at least one more so you can compare prices side by side before you decide.</p>
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
    const [draftingLetter, setDraftingLetter] = useState(false);
    const navigate = useNavigate();
    const { active } = useParticipants();

    // Draft a provider / My Aged Care letter carrying this project's context.
    const draftLetter = async () => {
        setDraftingLetter(true);
        try {
            const needTxt = project.primary_need_summary || project.description || "";
            const itemNames = (items || []).filter(Boolean).map((i) => i.item_name).join(", ");
            const modNames = (mods || []).filter(Boolean).map((m) => m.modification_name).join(", ");
            const detailBits = [needTxt, itemNames ? `Equipment: ${itemNames}.` : "", modNames ? `Home modifications: ${modNames}.` : ""].filter(Boolean).join(" ");
            const findings = [{
                title: `Assistive technology and home modification request — ${project.title}`,
                detail: detailBits || `A request relating to the ${PROJECT_TYPES[project.project_type]?.label || "AT/HM"} project "${project.title}".`,
                suggested_question: "Please confirm the next step to progress this under Support at Home, including any OT assessment and funding approval.",
                addressee_primary: "provider",
            }];
            const { data } = await api.post("/care-plans/letter-from-findings", {
                findings, addressee: "provider",
                provider_name: active?.provider || null,
                participant_id: participantId || null,
                source_tool: "athm",
            });
            if (data?.editor_path) navigate(data.editor_path);
            else if (data?.entry_id) navigate(`/tools/letters-and-follow-ups/${data.entry_id}`);
        } catch {
            toast.error("Could not start the letter.");
        } finally { setDraftingLetter(false); }
    };

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
                <div className="flex gap-2 flex-wrap">
                    <button onClick={draftLetter} disabled={draftingLetter} data-testid={`athm-draft-letter-${project.id}`}
                            className="text-xs px-3 py-1.5 rounded-full border border-kindred hover:bg-surface-2 inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {draftingLetter ? "Starting…" : "Draft a Letter"}
                    </button>
                    <button onClick={advanceStatus} disabled={advancing} data-testid={`athm-advance-${project.id}`}
                            className="text-xs px-3 py-1.5 rounded-full border border-kindred hover:bg-surface-2">
                        Advance Stage <ArrowRight className="inline w-3 h-3 ml-1"/>
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
                    <div className="rounded-xl border border-kindred bg-surface-2/40 p-3 space-y-2" data-testid="athm-item-form">
                        <p className="text-[11px] text-muted-k">Fields showing a Required label must be completed.</p>
                        <div className="grid sm:grid-cols-2 gap-2 items-end">
                            <label className="text-[11px] text-muted-k font-medium">Category <Req/>
                                <select value={AT_CATEGORIES.some(c => c.v === newItem.item_category) ? newItem.item_category : "__custom__"}
                                        data-testid="athm-item-category"
                                        onChange={e => setNewItem({ ...newItem, item_category: e.target.value === "__custom__" ? "" : e.target.value })}
                                        className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white">
                                    {AT_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                                    <option value="__custom__">Other (type your own)</option>
                                </select>
                            </label>
                            {!AT_CATEGORIES.some(c => c.v === newItem.item_category) && (
                                <input placeholder="Type the category" value={newItem.item_category}
                                       data-testid="athm-item-category-custom"
                                       onChange={e => setNewItem({ ...newItem, item_category: e.target.value })}
                                       className="px-3 py-2 text-sm border rounded"/>
                            )}
                            <label className="text-[11px] text-muted-k font-medium">Item name <Req/>
                                <input placeholder="e.g. Rollator walker" value={newItem.item_name}
                                       data-testid="athm-item-name"
                                       onChange={e => setNewItem({ ...newItem, item_name: e.target.value })}
                                       className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                            </label>
                            <label className="text-[11px] text-muted-k font-medium sm:col-span-2">Description
                                <input placeholder="Optional detail" value={newItem.item_description}
                                       data-testid="athm-item-description"
                                       onChange={e => setNewItem({ ...newItem, item_description: e.target.value })}
                                       className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                            </label>
                        </div>
                        <button onClick={addItem} disabled={busy} data-testid="athm-item-save"
                                className="bg-primary-k text-white rounded-full text-sm px-4 py-1.5">
                            Save Item
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
                    <div className="rounded-xl border border-kindred bg-surface-2/40 p-3 space-y-2" data-testid="athm-mod-form">
                        <p className="text-[11px] text-muted-k">Fields showing a Required label must be completed.</p>
                        <div className="grid sm:grid-cols-2 gap-2 items-end">
                            <label className="text-[11px] text-muted-k font-medium">Category <Req/>
                                <select value={HM_CATEGORIES.some(c => c.v === newMod.modification_category) ? newMod.modification_category : "__custom__"}
                                        data-testid="athm-mod-category"
                                        onChange={e => setNewMod({ ...newMod, modification_category: e.target.value === "__custom__" ? "" : e.target.value })}
                                        className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white">
                                    {HM_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                                    <option value="__custom__">Other (type your own)</option>
                                </select>
                            </label>
                            {!HM_CATEGORIES.some(c => c.v === newMod.modification_category) && (
                                <input placeholder="Type the category" value={newMod.modification_category}
                                       data-testid="athm-mod-category-custom"
                                       onChange={e => setNewMod({ ...newMod, modification_category: e.target.value })}
                                       className="px-3 py-2 text-sm border rounded"/>
                            )}
                            <label className="text-[11px] text-muted-k font-medium">Name <Req/>
                                <input placeholder="e.g. Walk-in shower" value={newMod.modification_name}
                                       data-testid="athm-mod-name"
                                       onChange={e => setNewMod({ ...newMod, modification_name: e.target.value })}
                                       className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                            </label>
                            <label className="text-[11px] text-muted-k font-medium">Location in home <Req/>
                                <input placeholder="e.g. Bathroom" value={newMod.location_in_home}
                                       data-testid="athm-mod-location"
                                       onChange={e => setNewMod({ ...newMod, location_in_home: e.target.value })}
                                       className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                            </label>
                            <label className="text-[11px] text-muted-k font-medium">Description
                                <input placeholder="Optional detail" value={newMod.description}
                                       data-testid="athm-mod-description"
                                       onChange={e => setNewMod({ ...newMod, description: e.target.value })}
                                       className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                            </label>
                        </div>
                        <button onClick={addMod} disabled={busy} data-testid="athm-mod-save"
                                className="bg-primary-k text-white rounded-full text-sm px-4 py-1.5">
                            Save Modification
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
    const [needKey, setNeedKey] = useState("");
    const [files, setFiles] = useState([]);
    const fileRef = React.useRef(null);
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setForm({ project_type: "combined_at_and_hm", title: "", description: "", primary_need_summary: "" });
        setNeedKey(""); setFiles([]);
    };

    // Picking a primary need seeds an editable default description.
    const onNeedChange = (key) => {
        setNeedKey(key);
        const found = PRIMARY_NEEDS.find(n => n.v === key);
        if (found) setForm(f => ({ ...f, primary_need_summary: found.desc }));
    };

    const onPickFiles = (e) => {
        const picked = Array.from(e.target.files || []);
        if (picked.length) setFiles(list => [...list, ...picked]);
        if (fileRef.current) fileRef.current.value = "";
    };

    const submit = async () => {
        if (!form.title.trim()) { toast.error("Project title is required"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/athm1/participants/${participantId}/projects`, form);
            const project = data.project;
            // Upload any invoices / documents chosen during creation, then attach them to the project.
            for (const file of files) {
                try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("category", "ot_referral");
                    fd.append("title", file.name);
                    const up = await api.post("/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    if (up.data?.id) {
                        await api.post(`/athm1/projects/${project.id}/ot-referrals/attach`, { document_id: up.data.id, notes: "" });
                    }
                } catch { /* keep going, a failed upload shouldn't block project creation */ }
            }
            toast.success(files.length ? `Project created with ${files.length} document(s)` : "Project created");
            setOpen(false);
            reset();
            onCreated?.(project);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not create project");
        } finally { setBusy(false); }
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} data-testid="athm-new-project"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm">
                <Plus className="w-4 h-4"/> New Project
            </button>
        );
    }
    return (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/40 overflow-y-auto"
             onClick={() => !busy && setOpen(false)} data-testid="athm-new-project-overlay">
            <div onClick={e => e.stopPropagation()}
                 className="w-full max-w-2xl my-8 rounded-2xl bg-white shadow-xl overflow-hidden" data-testid="athm-new-project-form">
                <div className="bg-primary-k px-6 py-5 text-white">
                    <p className="text-xs uppercase tracking-wide text-white/70">Assistive Technology & Home Modifications</p>
                    <h2 className="font-heading text-2xl mt-1">New Project</h2>
                    <p className="text-sm text-white/80 mt-1">Set up the project, then add items, quotes, and documents. Fields showing a Required label must be completed.</p>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="rounded-xl bg-[#EAF3F3] p-4">
                        <label className="text-xs font-medium text-primary-k block">Project type <Req/>
                            <select value={form.project_type} onChange={e => setForm({ ...form, project_type: e.target.value })}
                                    data-testid="athm-project-type"
                                    className="mt-1 w-full px-3 py-2.5 text-sm border rounded-lg bg-white">
                                {Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </label>
                    </div>

                    <label className="text-xs font-medium text-primary-k block">Project title <Req/>
                        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                               data-testid="athm-project-title" placeholder="e.g. Bathroom safety upgrade for Mum"
                               className="mt-1 w-full px-3 py-2.5 text-sm border rounded-lg"/>
                    </label>

                    <div className="rounded-xl bg-[#FBF3EE] p-4 space-y-2">
                        <label className="text-xs font-medium text-primary-k block">Primary need
                            <select value={needKey} onChange={e => onNeedChange(e.target.value)}
                                    data-testid="athm-project-need-select"
                                    className="mt-1 w-full px-3 py-2.5 text-sm border rounded-lg bg-white">
                                <option value="">Choose a need to pre-fill (optional)</option>
                                {PRIMARY_NEEDS.map(n => <option key={n.v} value={n.v}>{n.label}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-medium text-primary-k block">Need summary (you can edit this)
                            <textarea rows={2} value={form.primary_need_summary} onChange={e => setForm({ ...form, primary_need_summary: e.target.value })}
                                      data-testid="athm-project-need"
                                      className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"/>
                        </label>
                    </div>

                    <label className="text-xs font-medium text-primary-k block">Description
                        <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                  data-testid="athm-project-description" placeholder="Any extra context"
                                  className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"/>
                    </label>

                    <div className="rounded-xl bg-[#EEF3EE] p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-medium text-primary-k">Invoices & documents</p>
                                <p className="text-[11px] text-muted-k">Attach quotes, invoices, or an OT referral now. You can add more later.</p>
                            </div>
                            <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                                   onChange={onPickFiles} className="hidden" data-testid="athm-project-file-input"/>
                            <button type="button" onClick={() => fileRef.current?.click()} data-testid="athm-project-file-pick"
                                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary-k/30 text-primary-k hover:bg-white">
                                <Upload className="w-3 h-3"/> Add file
                            </button>
                        </div>
                        {files.length > 0 && (
                            <ul className="space-y-1" data-testid="athm-project-file-list">
                                {files.map((f, i) => (
                                    <li key={i} className="text-xs flex items-center justify-between bg-white rounded-lg px-3 py-1.5">
                                        <span className="text-primary-k truncate">{f.name}</span>
                                        <button type="button" onClick={() => setFiles(list => list.filter((_, j) => j !== i))}
                                                className="text-red-600 ml-2" data-testid={`athm-project-file-remove-${i}`}>Remove</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-kindred bg-surface-2/40">
                    <button onClick={() => { setOpen(false); reset(); }} disabled={busy} className="text-sm px-4 py-2 rounded-full border border-kindred text-muted-k">Cancel</button>
                    <button onClick={submit} disabled={busy} data-testid="athm-project-save"
                            className="bg-primary-k text-white rounded-full text-sm px-6 py-2 disabled:opacity-50">
                        {busy ? "Creating…" : "Create Project"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AthmProjects() {
    const pid = useParticipantId();
    const [projects, setProjects] = useState([]);
    const [selected, setSelected] = useState(null);
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("active");

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

            {projects.length > 0 && (() => {
                const CLOSED = new Set(["completed", "in_use", "declined", "cancelled"]);
                const filtered = projects.filter(p => {
                    const typeOk = typeFilter === "all" || p.project_type === typeFilter;
                    const isClosed = CLOSED.has(p.status);
                    const statusOk = statusFilter === "all" || (statusFilter === "active" ? !isClosed : isClosed);
                    return typeOk && statusOk;
                });
                const typeChips = [
                    { v: "all", label: "All types" },
                    ...Object.entries(PROJECT_TYPES).map(([k, v]) => ({ v: k, label: v.label })),
                ];
                const statusChips = [
                    { v: "active", label: "In progress" },
                    { v: "closed", label: "Completed / closed" },
                    { v: "all", label: "All" },
                ];
                return (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2" data-testid="athm-type-filter">
                            {typeChips.map(c => (
                                <button key={c.v} onClick={() => setTypeFilter(c.v)} data-testid={`athm-filter-type-${c.v}`}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${typeFilter === c.v ? "bg-primary-k text-white border-primary-k" : "border-kindred text-muted-k hover:text-primary-k"}`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2" data-testid="athm-status-filter">
                            {statusChips.map(c => (
                                <button key={c.v} onClick={() => setStatusFilter(c.v)} data-testid={`athm-filter-status-${c.v}`}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === c.v ? "bg-gold text-white border-gold" : "border-kindred text-muted-k hover:text-primary-k"}`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>

                        {filtered.length === 0 ? (
                            <p className="text-sm text-muted-k italic" data-testid="athm-filter-empty">No projects match this filter.</p>
                        ) : (
                            <div className="grid gap-3">
                                {filtered.map(p => {
                                    const T = PROJECT_TYPES[p.project_type];
                                    const Icon = T?.icon || Wrench;
                                    const tone = T?.tone || { bg: "#EAF3F3", chip: "#0E4D52" };
                                    const isClosed = CLOSED.has(p.status);
                                    return (
                                        <button key={p.id} onClick={() => setSelected(p)}
                                                data-testid={`athm-project-card-${p.id}`}
                                                className="rounded-2xl p-4 text-left transition-shadow hover:shadow-md"
                                                style={{ backgroundColor: tone.bg }}>
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-full bg-white/70"><Icon className="w-5 h-5" style={{ color: tone.chip }}/></div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-primary-k truncate">{p.title}</p>
                                                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                                        <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: tone.chip }}>{T?.label}</span>
                                                        <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${isClosed ? "bg-primary-k/10 text-primary-k/70" : "bg-emerald-100 text-emerald-800"}`}>{p.status?.replace(/_/g, " ")}</span>
                                                    </div>
                                                </div>
                                                <ArrowRight className="w-4 h-4 text-primary-k/40"/>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })()}

            {selected && (
                <ProjectDetail project={selected} participantId={pid}
                               onClose={() => setSelected(null)}
                               onRefresh={() => { refresh(); }}/>
            )}
        </div>
    );
}
