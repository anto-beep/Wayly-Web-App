/**
 * Care Plan Amendment Generator, builds a formal amendment letter for the
 * caregiver to send to their provider. Service options are drawn from the
 * Provider Price Checker service list; change types are selectable or custom.
 */
import React, { useEffect, useState, useCallback } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { FilePenLine, Plus, Trash2, Send, Copy, Mail, X, Pencil, FileText } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";
import { useAuth } from "@/context/AuthContext";
import VoiceInput from "@/components/VoiceInput";
import useInvalidateOnParticipantChange from "@/hooks/useInvalidateOnParticipantChange";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import ReadOnlyLock from "@/components/ReadOnlyLock";

const CUSTOM = "__custom__";
const EMPTY_ITEM = { service_name: "", change_type: "increase", reason: "", service_custom: false, change_custom: false };

// value → label. Values line up with the backend letter-verb map.
const CHANGE_OPTIONS = [
    ["add", "Add a New Service"],
    ["increase", "Increase Frequency / Hours"],
    ["decrease", "Decrease Frequency / Hours"],
    ["remove", "Remove a Service"],
    ["swap", "Swap One Service for Another"],
    ["change_provider", "Change Provider"],
    ["change_schedule", "Change Schedule / Timing"],
    ["pause", "Pause a Service"],
    ["resume", "Resume a Service"],
    ["update_goal", "Update a Goal"],
];
const CHANGE_KEYS = CHANGE_OPTIONS.map(([v]) => v);
const changeLabel = (v) => (CHANGE_OPTIONS.find(([k]) => k === v) || [null, null])[1] || titleCase(String(v || "").replace(/_/g, " "));

const ROLE_OPTIONS = [
    "Primary Caregiver", "Family Member", "Spouse or Partner", "Legal Guardian",
    "Power of Attorney", "Advocate", "Case Manager", "Support Coordinator", "Other",
];

const SMALL_WORDS = new Set(["a", "an", "and", "or", "the", "of", "for", "to", "in", "on", "at", "by", "with"]);
function titleCase(s) {
    return String(s || "")
        .toLowerCase()
        .split(/\s+/)
        .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ")
        .trim();
}

function Req() {
    return <span className="text-terracotta" aria-hidden="true"> *</span>;
}

export default function CarePlanAmendments() {
    const { user } = useAuth();
    const { items: participants, active } = useParticipants();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [serviceOptions, setServiceOptions] = useState([]);

    const [participantId, setParticipantId] = useState(active?.id || "");
    const [senderName, setSenderName] = useState(user?.name || "");
    const [senderRole, setSenderRole] = useState("Primary Caregiver");
    const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
    const [editingId, setEditingId] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [preview, setPreview] = useState(null);
    const isExpired = useExpiredTrial();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/amendments");
            setHistory(data.items || []);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load amendments"));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useInvalidateOnParticipantChange(() => { setHistory([]); setPreview(null); resetBuilder(); load(); });
    useEffect(() => { if (!participantId && active?.id) setParticipantId(active.id); }, [active, participantId]);

    // Pull the Provider Price Checker service list so Service becomes a dropdown.
    useEffect(() => {
        api.get("/ppc/services")
            .then(({ data }) => {
                const names = [...new Set((data?.services || []).map((r) => titleCase(r.service)).filter(Boolean))].sort();
                setServiceOptions(names);
            })
            .catch(() => setServiceOptions([]));
    }, []);

    const resetBuilder = () => {
        setItems([{ ...EMPTY_ITEM }]);
        setEditingId(null);
        setSenderRole("Primary Caregiver");
    };

    const setItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
    const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

    const cleanedItems = () =>
        items
            .map((it) => ({ service_name: (it.service_name || "").trim(), change_type: (it.change_type || "").trim(), reason: (it.reason || "").trim() }))
            .filter((it) => it.service_name && it.change_type && it.reason);

    const generate = async () => {
        const cleaned = cleanedItems();
        if (cleaned.length === 0) { toast.error("Add at least one change with a service, a change type and a reason."); return; }
        if (!senderName.trim()) { toast.error("Your name is required."); return; }
        setGenerating(true);
        try {
            if (editingId) {
                const { data } = await api.patch(`/amendments/${editingId}`, {
                    items: cleaned, sender_name: senderName.trim(), sender_role: senderRole.trim() || "Primary Caregiver",
                });
                setPreview(data);
                toast.success("Amendment letter updated");
            } else {
                const { data } = await api.post("/amendments/generate", {
                    participant_id: participantId, sender_name: senderName.trim(),
                    sender_role: senderRole.trim() || "Primary Caregiver", items: cleaned,
                });
                setPreview(data);
                toast.success("Amendment letter generated");
            }
            resetBuilder();
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not generate"));
        } finally { setGenerating(false); }
    };

    const saveDraft = async () => {
        if (!participantId) { toast.error("Choose who this is for first."); return; }
        setSavingDraft(true);
        try {
            const draftItems = items.map((it) => ({
                service_name: (it.service_name || "").trim(), change_type: (it.change_type || "").trim(), reason: (it.reason || "").trim(),
            }));
            const { data } = await api.post("/amendments/save-draft", {
                id: editingId || undefined, participant_id: participantId,
                sender_name: senderName.trim(), sender_role: senderRole.trim() || "Primary Caregiver", items: draftItems,
            });
            setEditingId(data.id);
            await load();
            toast.success("Draft saved");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save the draft"));
        } finally { setSavingDraft(false); }
    };

    const editRecord = (h) => {
        setEditingId(h.id);
        setParticipantId(h.participant_id || participantId);
        setSenderName(h.sender_name || user?.name || "");
        setSenderRole(titleCase(h.sender_role || "Primary Caregiver"));
        const loaded = (h.items || []).map((it) => ({
            service_name: it.service_name || "",
            change_type: it.change_type || "increase",
            reason: it.reason || "",
            service_custom: !!it.service_name && !serviceOptions.includes(it.service_name),
            change_custom: !!it.change_type && !CHANGE_KEYS.includes(it.change_type),
        }));
        setItems(loaded.length ? loaded : [{ ...EMPTY_ITEM }]);
        setPreview(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const deleteRecord = async (id) => {
        try {
            await api.delete(`/amendments/${id}`);
            if (editingId === id) resetBuilder();
            if (preview?.id === id) setPreview(null);
            await load();
            toast.success("Deleted");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not delete"));
        }
    };

    const copyLetter = (txt) => {
        try { navigator.clipboard.writeText(txt); toast.success("Letter copied to clipboard"); }
        catch { toast.error("Copy failed"); }
    };

    const mailLetter = (txt) => {
        const subject = "Request to amend the Support at Home care plan";
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt)}`;
    };

    const setStatus = async (id, status) => {
        try {
            await api.post(`/amendments/${id}/status`, { status });
            await load();
            if (preview?.id === id) setPreview({ ...preview, status });
            toast.success(`Marked as ${status}`);
        } catch (e) { toast.error("Could not update status"); }
    };

    return (
        <div className="space-y-6" data-testid="amendments-page">
            <div>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight flex items-center gap-2">
                    <FilePenLine className="h-6 w-6 text-gold" /> Care-Plan Changes
                </h1>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    A record of every change to the care plan, and what each change means for funding and services.
                </p>
            </div>

            {/* Intro */}
            <div className="rounded-2xl p-6 text-sm leading-relaxed text-primary-k max-w-3xl border border-[#0E4D52]/15" style={{ backgroundColor: "#EEF4F4" }} data-testid="amendments-intro">
                <p>
                    A care plan sets out the services a participant has been approved to receive under Support at Home, how often, and from which provider. It changes over time as needs change or a provider proposes a different mix of supports.
                </p>
                <p className="mt-3">
                    Use the builder below to request changes in writing. Each request is saved so you can track it, edit it, or come back to a draft later.
                </p>
            </div>

            {/* Builder */}
            <ReadOnlyLock testId="amendments-builder-lock" label="Reactivate to draft amendment letters" sub="You can still browse every past amendment below.">
            <div className="rounded-2xl p-5 space-y-4 border border-[#A5512B]/15" style={{ backgroundColor: "#FBF3EE" }} data-testid="amendment-builder">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="font-heading text-lg text-primary-k">{editingId ? "Edit Amendment Request" : "New Amendment Request"}</h2>
                    {editingId && (
                        <button type="button" onClick={resetBuilder} className="text-xs text-primary-k hover:underline inline-flex items-center gap-1" data-testid="amendment-cancel-edit">
                            <X className="h-3 w-3" /> Cancel Edit
                        </button>
                    )}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                        <label className="text-xs text-muted-k font-medium">For<Req /></label>
                        <select value={participantId} onChange={(e) => setParticipantId(e.target.value)} data-testid="amendment-participant" className="w-full mt-1 rounded-md border border-kindred bg-surface px-3 py-2">
                            {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-muted-k font-medium">Your Name<Req /></label>
                        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} data-testid="amendment-sender-name" className="w-full mt-1 rounded-md border border-kindred bg-surface px-3 py-2" />
                    </div>
                    <div>
                        <label className="text-xs text-muted-k font-medium">Your Role<Req /></label>
                        <select value={senderRole} onChange={(e) => setSenderRole(e.target.value)} data-testid="amendment-sender-role" className="w-full mt-1 rounded-md border border-kindred bg-surface px-3 py-2">
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    {items.map((it, idx) => {
                        const serviceSelectValue = it.service_custom ? CUSTOM : (serviceOptions.includes(it.service_name) ? it.service_name : (it.service_name ? CUSTOM : ""));
                        const changeSelectValue = it.change_custom ? CUSTOM : (CHANGE_KEYS.includes(it.change_type) ? it.change_type : (it.change_type ? CUSTOM : ""));
                        return (
                        <div key={idx} className="rounded-xl p-3 space-y-2 border border-kindred bg-surface" data-testid={`amendment-item-${idx}`}>
                            <div className="grid sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] text-muted-k font-medium">Service<Req /></label>
                                    <select
                                        value={serviceSelectValue}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === CUSTOM) setItem(idx, { service_custom: true, service_name: "" });
                                            else setItem(idx, { service_custom: false, service_name: v });
                                        }}
                                        className="w-full mt-1 rounded-md border border-kindred bg-surface px-3 py-1.5 text-sm"
                                        data-testid={`amendment-service-select-${idx}`}
                                    >
                                        <option value="">Choose a service…</option>
                                        {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                                        <option value={CUSTOM}>Other (type your own)</option>
                                    </select>
                                    {(it.service_custom || (it.service_name && !serviceOptions.includes(it.service_name))) && (
                                        <input
                                            value={it.service_name}
                                            onChange={(e) => setItem(idx, { service_name: e.target.value, service_custom: true })}
                                            placeholder="e.g. Domestic cleaning"
                                            className="w-full mt-1.5 rounded-md border border-kindred px-3 py-1.5 text-sm"
                                            data-testid={`amendment-service-${idx}`}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="text-[11px] text-muted-k font-medium">Change Type<Req /></label>
                                    <select
                                        value={changeSelectValue}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === CUSTOM) setItem(idx, { change_custom: true, change_type: "" });
                                            else setItem(idx, { change_custom: false, change_type: v });
                                        }}
                                        className="w-full mt-1 rounded-md border border-kindred bg-surface px-3 py-1.5 text-sm"
                                        data-testid={`amendment-change-${idx}`}
                                    >
                                        <option value="">Choose a change type…</option>
                                        {CHANGE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                        <option value={CUSTOM}>Add a New Change Type…</option>
                                    </select>
                                    {(it.change_custom || (it.change_type && !CHANGE_KEYS.includes(it.change_type))) && (
                                        <input
                                            value={it.change_type}
                                            onChange={(e) => setItem(idx, { change_type: e.target.value, change_custom: true })}
                                            placeholder="e.g. Change appointment day"
                                            className="w-full mt-1.5 rounded-md border border-kindred px-3 py-1.5 text-sm"
                                            data-testid={`amendment-change-custom-${idx}`}
                                        />
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] text-muted-k font-medium">Why This Change?<Req /></label>
                                    <VoiceInput onResult={(t) => setItem(idx, { reason: t })} testId={`amendment-dictate-${idx}`} label="Dictate" />
                                </div>
                                <textarea rows={2} value={it.reason} onChange={(e) => setItem(idx, { reason: e.target.value })} placeholder="e.g. After her fall in May, she cannot manage the heavy cleaning safely on her own." className="w-full rounded-md border border-kindred bg-surface px-3 py-1.5 text-sm resize-none" data-testid={`amendment-reason-${idx}`} />
                            </div>
                            {items.length > 1 && (
                                <button type="button" onClick={() => removeItem(idx)} className="text-xs text-terracotta hover:underline" data-testid={`amendment-remove-${idx}`}>
                                    <Trash2 className="h-3 w-3 inline mr-1" /> Remove This Change
                                </button>
                            )}
                        </div>
                        );
                    })}
                    <button type="button" onClick={addItem} disabled={items.length >= 10} data-testid="amendment-add-item" className="text-xs text-primary-k hover:underline inline-flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add Another Change
                    </button>
                </div>

                <p className="text-[11px] text-muted-k"><span className="text-terracotta">*</span> Required</p>
                <div className="flex justify-end gap-2 pt-2 border-t border-kindred">
                    <button onClick={saveDraft} disabled={savingDraft} data-testid="amendment-save-draft-btn" className="inline-flex items-center gap-1.5 bg-surface border border-kindred text-primary-k rounded-md px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-60">
                        <FileText className="h-3.5 w-3.5" /> {savingDraft ? "Saving…" : "Save as Draft"}
                    </button>
                    <button onClick={generate} disabled={generating} data-testid="amendment-generate-btn" className="bg-primary-k text-white rounded-md px-5 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60">
                        {generating ? "Generating…" : editingId ? "Update Letter" : "Generate Letter"}
                    </button>
                </div>
            </div>
            </ReadOnlyLock>

            {/* Preview modal */}
            {preview && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="amendment-preview-modal">
                    <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between sticky top-0 bg-white">
                            <h2 className="font-heading text-lg text-primary-k">Your Amendment Letter</h2>
                            <button onClick={() => setPreview(null)} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <pre className="p-5 text-sm whitespace-pre-wrap font-mono text-primary-k bg-surface-2" data-testid="amendment-preview-body">{preview.generated_letter || "This draft has no letter yet. Edit it and choose Generate Letter."}</pre>
                        <div className="px-5 py-3 border-t border-kindred flex gap-2 flex-wrap">
                            <button onClick={() => copyLetter(preview.generated_letter)} disabled={!preview.generated_letter} className="inline-flex items-center gap-1.5 bg-surface-2 border border-kindred text-primary-k rounded-md px-3 py-2 text-sm disabled:opacity-50" data-testid="amendment-copy-btn">
                                <Copy className="h-3.5 w-3.5" /> Copy
                            </button>
                            <button onClick={() => mailLetter(preview.generated_letter)} disabled={!preview.generated_letter} className="inline-flex items-center gap-1.5 bg-surface-2 border border-kindred text-primary-k rounded-md px-3 py-2 text-sm disabled:opacity-50" data-testid="amendment-mail-btn">
                                <Mail className="h-3.5 w-3.5" /> Open Email
                            </button>
                            {!isExpired && (
                            <button onClick={() => setStatus(preview.id, "sent")} className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-md px-3 py-2 text-sm hover:bg-[#091D33]" data-testid="amendment-mark-sent">
                                <Send className="h-3.5 w-3.5" /> Mark as Sent
                            </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* History */}
            <section data-testid="amendment-history">
                <h2 className="font-heading text-lg text-primary-k mb-3">Past Requests</h2>
                {loading && <div className="text-sm text-muted-k">Loading…</div>}
                {!loading && history.length === 0 && (
                    <div className="bg-surface-2 border border-dashed border-kindred rounded-2xl p-6 text-sm text-muted-k text-center">No amendments yet. Build one above to get started.</div>
                )}
                <div className="space-y-2">
                    {history.map((h) => {
                        const services = (h.items || []).map((it) => titleCase(it.service_name)).filter(Boolean).join(", ") || "Untitled request";
                        const changes = (h.items || []).map((it) => changeLabel(it.change_type)).filter(Boolean);
                        return (
                        <div key={h.id} className="bg-surface border border-kindred rounded-xl p-4 flex items-start justify-between gap-3" data-testid={`amendment-row-${h.id}`}>
                            <button type="button" onClick={() => setPreview(h)} className="min-w-0 text-left flex-1" data-testid={`amendment-view-${h.id}`}>
                                <div className="text-sm font-medium text-primary-k truncate">{services}</div>
                                <div className="text-[11px] text-muted-k mt-0.5">{new Date(h.created_at).toLocaleString("en-AU")} · to {titleCase(h.provider_name || "provider")}</div>
                                {changes.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                        {changes.slice(0, 4).map((c, i) => <span key={i} className="text-[10px] rounded-full px-2 py-0.5" style={{ backgroundColor: "#EEF4F4", color: "#0E4D52" }}>{c}</span>)}
                                    </div>
                                )}
                            </button>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${h.status === "sent" ? "bg-primary-k/10 text-primary-k" : h.status === "accepted" ? "bg-sage/15 text-sage" : "bg-surface-2 text-muted-k"}`}>{h.status}</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => editRecord(h)} className="text-xs text-primary-k hover:underline inline-flex items-center gap-1" data-testid={`amendment-edit-${h.id}`}>
                                        <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                    <button type="button" onClick={() => deleteRecord(h.id)} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1" data-testid={`amendment-delete-${h.id}`}>
                                        <Trash2 className="h-3 w-3" /> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
